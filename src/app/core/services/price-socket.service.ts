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

  // Public readonly signals
  readonly prices = this._prices.asReadonly();
  readonly connectionStatus = this._connectionStatus.asReadonly();
  readonly isConnected = computed(() => this._connectionStatus().connected);

  constructor(private authService: AuthService) {}

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
          newMap.set(p.symbol, {
            ...p,
            timestamp: new Date(p.timestamp),
          });
        });
        return newMap;
      });
    });

    // Individual price updates
    this.socket.on('price:update', (price: PriceUpdate) => {
      this._prices.update((prices) => {
        const newMap = new Map(prices);
        newMap.set(price.symbol, {
          ...price,
          timestamp: new Date(price.timestamp),
        });
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
