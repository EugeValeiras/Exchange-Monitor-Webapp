import { Injectable, OnDestroy, signal, computed } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface ExchangePrice {
  exchange: string;
  price: number;
  change24h?: number;
}

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: Date;
  source?: string;
  change24h?: number;
  high24h?: number;
  low24h?: number;
  prices?: ExchangePrice[];
}

export interface ConnectionStatus {
  connected: boolean;
  binance: boolean;
  kraken: boolean;
}

export interface PriceResult {
  price: number;
  pair: string; // e.g., "BTC/USDT" or "BTC/USD"
}

export interface MultiExchangePriceResult {
  averagePrice: number;
  prices: { exchange: string; price: number; pair: string; change24h?: number }[];
  pair: string;
  change24h?: number;
}


@Injectable({
  providedIn: 'root',
})
export class PriceSocketService implements OnDestroy {
  private socket: Socket | null = null;

  // Signals for reactive state
  private _prices = signal<Map<string, PriceUpdate>>(new Map());
  private _connectionStatus = signal<ConnectionStatus>({
    connected: false,
    binance: false,
    kraken: false,
  });

  // Persistent cache for exchange prices (never cleared)
  private exchangePricesCache = new Map<string, Map<string, ExchangePrice>>();

  // Public readonly signals
  readonly prices = this._prices.asReadonly();
  readonly connectionStatus = this._connectionStatus.asReadonly();
  readonly isConnected = computed(() => this._connectionStatus().connected);

  constructor(private authService: AuthService) {}

  /**
   * Merge a new price update with existing data, preserving exchange prices
   */
  private mergePriceUpdate(newPrice: PriceUpdate, existing?: PriceUpdate): PriceUpdate {
    const symbol = newPrice.symbol;

    // Get or create the exchange prices cache for this symbol
    if (!this.exchangePricesCache.has(symbol)) {
      this.exchangePricesCache.set(symbol, new Map());
    }
    const symbolCache = this.exchangePricesCache.get(symbol)!;

    // Update cache with new exchange prices
    if (newPrice.prices && newPrice.prices.length > 0) {
      for (const ep of newPrice.prices) {
        symbolCache.set(ep.exchange, {
          exchange: ep.exchange,
          price: ep.price,
          change24h: ep.change24h,
        });
      }
    } else if (newPrice.source) {
      // Single source update
      symbolCache.set(newPrice.source, {
        exchange: newPrice.source,
        price: newPrice.price,
        change24h: newPrice.change24h,
      });
    }

    // Also preserve existing exchange prices in cache
    if (existing?.prices) {
      for (const ep of existing.prices) {
        if (!symbolCache.has(ep.exchange)) {
          symbolCache.set(ep.exchange, ep);
        }
      }
    }

    // Build merged prices array from cache
    const mergedPrices = Array.from(symbolCache.values());

    return {
      symbol,
      price: newPrice.price,
      timestamp: new Date(newPrice.timestamp),
      source: newPrice.source || existing?.source,
      change24h: newPrice.change24h ?? existing?.change24h,
      high24h: newPrice.high24h ?? existing?.high24h,
      low24h: newPrice.low24h ?? existing?.low24h,
      prices: mergedPrices,
    };
  }

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const token = this.authService.getToken();
    // WebSocket URL is the base URL without /api
    const wsUrl = environment.apiUrl.replace('/api', '');

    this.socket = io(`${wsUrl}/prices`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[PriceSocket] Connected');
      this._connectionStatus.update((s) => ({ ...s, connected: true }));
    });

    this.socket.on('disconnect', () => {
      console.log('[PriceSocket] Disconnected');
      this._connectionStatus.update((s) => ({ ...s, connected: false }));
    });

    this.socket.on('connect_error', (error) => {
      console.error('[PriceSocket] Connection error:', error.message);
    });

    // Initial prices on connect - merge with existing
    this.socket.on('prices:initial', (prices: PriceUpdate[]) => {
      console.log('[PriceSocket] Received initial prices:', prices.length);
      this._prices.update((existing) => {
        const newMap = new Map(existing);
        prices.forEach((p) => {
          const merged = this.mergePriceUpdate(p, newMap.get(p.symbol));
          newMap.set(p.symbol, merged);
        });
        return newMap;
      });
    });

    // Individual price updates
    this.socket.on('price:update', (price: PriceUpdate) => {
      this._prices.update((prices) => {
        const newMap = new Map(prices);
        const merged = this.mergePriceUpdate(price, newMap.get(price.symbol));
        newMap.set(price.symbol, merged);
        return newMap;
      });
    });

    // Price ticks (lightweight updates)
    this.socket.on(
      'price:tick',
      (tick: { symbol: string; price: number; timestamp: string; change24h?: number }) => {
        this._prices.update((prices) => {
          const newMap = new Map(prices);
          const existing = newMap.get(tick.symbol);
          newMap.set(tick.symbol, {
            symbol: tick.symbol,
            price: tick.price,
            timestamp: new Date(tick.timestamp),
            source: existing?.source,
            change24h: tick.change24h ?? existing?.change24h,
            high24h: existing?.high24h,
            low24h: existing?.low24h,
            prices: existing?.prices, // Preserve exchange prices
          });
          return newMap;
        });
      }
    );

    // Connection status from backend
    this.socket.on(
      'connection:status',
      (status: { binance: boolean; kraken: boolean }) => {
        console.log('[PriceSocket] Exchange status:', status);
        this._connectionStatus.update((s) => ({
          ...s,
          binance: status.binance,
          kraken: status.kraken,
        }));
      }
    );

    // Pong response
    this.socket.on('pong', () => {
      // Heartbeat received
    });
  }

  subscribe(symbols: string[]): void {
    if (this.socket?.connected && symbols.length > 0) {
      console.log('[PriceSocket] Subscribing to:', symbols);
      this.socket.emit('subscribe', symbols);
    }
  }

  unsubscribe(symbols: string[]): void {
    if (this.socket?.connected && symbols.length > 0) {
      this.socket.emit('unsubscribe', symbols);
    }
  }

  getPrice(symbol: string): PriceUpdate | undefined {
    return this._prices().get(symbol);
  }

  getPriceByAsset(asset: string): number | undefined {
    return this.getPriceByAssetWithPair(asset)?.price;
  }

  getPriceByAssetWithPair(asset: string): PriceResult | undefined {
    // Try USDT first, then USD (treated as equivalent)
    const usdtPair = `${asset}/USDT`;
    let price = this._prices().get(usdtPair);
    if (price) return { price: price.price, pair: usdtPair };

    const usdPair = `${asset}/USD`;
    price = this._prices().get(usdPair);
    if (price) return { price: price.price, pair: usdPair };

    return undefined;
  }

  /**
   * Get prices from all exchanges for an asset.
   * If all active exchanges have prices, returns their average.
   */
  getMultiExchangePrice(asset: string): MultiExchangePriceResult | undefined {
    const connectionStatus = this._connectionStatus();
    const activeExchanges: string[] = [];
    if (connectionStatus.binance) activeExchanges.push('binance');
    if (connectionStatus.kraken) activeExchanges.push('kraken');

    if (activeExchanges.length === 0) {
      // Fallback to simple price lookup
      const simple = this.getPriceByAssetWithPair(asset);
      if (simple) {
        const priceData = this._prices().get(simple.pair);
        return {
          averagePrice: simple.price,
          prices: [{ exchange: 'unknown', price: simple.price, pair: simple.pair, change24h: priceData?.change24h }],
          pair: simple.pair,
          change24h: priceData?.change24h
        };
      }
      return undefined;
    }

    const prices = this._prices();
    const exchangePrices: { exchange: string; price: number; pair: string; change24h?: number }[] = [];

    // Collect prices from all exchanges
    // Check both USDT and USD pairs
    const pairs = [`${asset}/USDT`, `${asset}/USD`];

    for (const [key, priceData] of prices.entries()) {
      // Key format is now "symbol:exchange" from prices component, but in service it's just symbol
      // Check if this is a matching pair
      const symbol = priceData.symbol || key;
      if (!pairs.includes(symbol)) continue;

      // Check if this price has exchange breakdown
      if (priceData.prices && priceData.prices.length > 0) {
        for (const ep of priceData.prices) {
          if (activeExchanges.includes(ep.exchange)) {
            exchangePrices.push({
              exchange: ep.exchange,
              price: ep.price,
              pair: symbol,
              change24h: ep.change24h
            });
          }
        }
      } else if (priceData.source && activeExchanges.includes(priceData.source)) {
        exchangePrices.push({
          exchange: priceData.source,
          price: priceData.price,
          pair: symbol,
          change24h: priceData.change24h
        });
      }
    }

    if (exchangePrices.length === 0) {
      // Fallback to simple lookup
      const simple = this.getPriceByAssetWithPair(asset);
      if (simple) {
        const priceData = this._prices().get(simple.pair);
        return {
          averagePrice: simple.price,
          prices: [{ exchange: 'unknown', price: simple.price, pair: simple.pair, change24h: priceData?.change24h }],
          pair: simple.pair,
          change24h: priceData?.change24h
        };
      }
      return undefined;
    }

    // Deduplicate by exchange (keep latest)
    const uniqueByExchange = new Map<string, { exchange: string; price: number; pair: string; change24h?: number }>();
    for (const ep of exchangePrices) {
      uniqueByExchange.set(ep.exchange, ep);
    }
    const uniquePrices = Array.from(uniqueByExchange.values());

    // Calculate average price
    const total = uniquePrices.reduce((sum, p) => sum + p.price, 0);
    const averagePrice = total / uniquePrices.length;

    // Calculate average change24h (only from prices that have it)
    const pricesWithChange = uniquePrices.filter(p => p.change24h !== undefined && p.change24h !== null);
    const avgChange24h = pricesWithChange.length > 0
      ? pricesWithChange.reduce((sum, p) => sum + (p.change24h || 0), 0) / pricesWithChange.length
      : undefined;

    // Use USDT pair preference for display
    const preferredPair = uniquePrices.find(p => p.pair.endsWith('/USDT'))?.pair
      || uniquePrices[0]?.pair
      || `${asset}/USDT`;

    return {
      averagePrice,
      prices: uniquePrices,
      pair: preferredPair,
      change24h: avgChange24h
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this._connectionStatus.set({
        connected: false,
        binance: false,
        kraken: false,
      });
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
