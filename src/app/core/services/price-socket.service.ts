import { Injectable, OnDestroy, signal, computed } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: Date;
  source?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  binance: boolean;
  kraken: boolean;
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

    // Initial prices on connect
    this.socket.on('prices:initial', (prices: PriceUpdate[]) => {
      console.log('[PriceSocket] Received initial prices:', prices.length);
      const priceMap = new Map<string, PriceUpdate>();
      prices.forEach((p) => priceMap.set(p.symbol, p));
      this._prices.set(priceMap);
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
      (tick: { symbol: string; price: number; timestamp: string }) => {
        this._prices.update((prices) => {
          const newMap = new Map(prices);
          const existing = newMap.get(tick.symbol);
          newMap.set(tick.symbol, {
            symbol: tick.symbol,
            price: tick.price,
            timestamp: new Date(tick.timestamp),
            source: existing?.source,
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
    // Try common pairs
    const pairs = [`${asset}/USDT`, `${asset}/USD`];
    for (const pair of pairs) {
      const price = this._prices().get(pair);
      if (price) {
        return price.price;
      }
    }
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
