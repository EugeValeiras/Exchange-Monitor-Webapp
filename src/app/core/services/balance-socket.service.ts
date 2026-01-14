import { Injectable, OnDestroy, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface AssetBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  priceUsd?: number;
  valueUsd?: number;
  exchanges?: string[];
  exchangeBreakdown?: { exchange: string; total: number }[];
}

export interface ExchangeBalance {
  exchange: string;
  label: string;
  credentialId: string;
  balances: AssetBalance[];
  totalValueUsd: number;
}

export interface ConsolidatedBalance {
  byAsset: AssetBalance[];
  byExchange: ExchangeBalance[];
  totalValueUsd: number;
  lastUpdated: Date;
  isCached?: boolean;
  isSyncing?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class BalanceSocketService implements OnDestroy {
  private socket: Socket | null = null;

  private _isConnected = signal<boolean>(false);

  readonly isConnected = this._isConnected.asReadonly();

  // Use Subject instead of signal for one-time events
  readonly balanceUpdated$ = new Subject<ConsolidatedBalance>();

  constructor(private authService: AuthService) {}

  connect(userId: string): void {
    if (this.socket?.connected) {
      return;
    }

    const token = this.authService.getToken();
    const wsUrl = environment.apiUrl.replace('http', 'ws').replace('/api', '');

    this.socket = io(`${wsUrl}/balances`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventHandlers(userId);
  }

  private setupEventHandlers(userId: string): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[BalanceSocket] Connected');
      this._isConnected.set(true);
      // Join room for this user
      this.socket?.emit('join', userId);
    });

    this.socket.on('disconnect', () => {
      console.log('[BalanceSocket] Disconnected');
      this._isConnected.set(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[BalanceSocket] Connection error:', error.message);
    });

    this.socket.on('joined', (data: { userId: string }) => {
      console.log('[BalanceSocket] Joined room for user:', data.userId);
    });

    this.socket.on('balance:updated', (data: ConsolidatedBalance) => {
      console.log('[BalanceSocket] Balance updated received');
      this.balanceUpdated$.next({
        ...data,
        lastUpdated: new Date(data.lastUpdated),
      });
    });

    this.socket.on('pong', () => {
      // Heartbeat received
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this._isConnected.set(false);
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.balanceUpdated$.complete();
  }
}
