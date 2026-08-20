import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface PaperBalance {
  free: number;
  locked: number;
}

export interface PaperAccount {
  id: string;
  name: string;
  initialBalance: number;
  feeRate: number;
  slippageBps: number;
  balances: Record<string, PaperBalance>;
  equity: number;
  totalPnl: number;
  totalPnlPct: number;
  createdAt: string;
}

export interface PaperPosition {
  asset: string;
  amount: number;
  avgEntryPrice: number;
  currentPrice: number;
  valueUsd: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  realizedPnl: number;
}

export interface EquityCurvePoint {
  timestamp: string;
  equity: number;
}

export interface PaperPerformance {
  initialBalance: number;
  equity: number;
  totalPnl: number;
  totalPnlPct: number;
  realizedPnl: number;
  unrealizedPnl: number;
  feesPaid: number;
  totalTrades: number;
  winRate: number | null;
  maxDrawdownPct: number;
  openOrders: number;
  equityCurve: EquityCurvePoint[];
}

export type PaperOrderStatus = 'open' | 'filled' | 'canceled' | 'rejected';

export interface PaperOrder {
  id: string;
  accountId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  status: PaperOrderStatus;
  amount: number;
  quoteAmount?: number;
  limitPrice?: number;
  stopPrice?: number;
  requestedPrice: number;
  filledPrice?: number;
  filledAt?: string;
  fee?: number;
  feeAsset?: string;
  note?: string;
  realizedPnl?: number;
  createdAt: string;
}

export interface PaginatedOrders {
  data: PaperOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreatePaperAccountDto {
  name?: string;
  initialBalance?: number;
  feeRate?: number;
  slippageBps?: number;
}

@Injectable({
  providedIn: 'root',
})
export class PaperTradingService {
  constructor(private api: ApiService) {}

  getAccounts(): Observable<PaperAccount[]> {
    return this.api.get<PaperAccount[]>('/paper-trading/accounts');
  }

  getAccount(id: string): Observable<PaperAccount> {
    return this.api.get<PaperAccount>(`/paper-trading/accounts/${id}`);
  }

  createAccount(dto: CreatePaperAccountDto = {}): Observable<PaperAccount> {
    return this.api.post<PaperAccount>('/paper-trading/accounts', dto);
  }

  resetAccount(id: string): Observable<PaperAccount> {
    return this.api.post<PaperAccount>(`/paper-trading/accounts/${id}/reset`, {});
  }

  deleteAccount(id: string): Observable<void> {
    return this.api.delete<void>(`/paper-trading/accounts/${id}`);
  }

  getPositions(id: string): Observable<PaperPosition[]> {
    return this.api.get<PaperPosition[]>(`/paper-trading/accounts/${id}/positions`);
  }

  getPerformance(id: string): Observable<PaperPerformance> {
    return this.api.get<PaperPerformance>(`/paper-trading/accounts/${id}/performance`);
  }

  getTrades(id: string, page = 1, limit = 20): Observable<PaginatedOrders> {
    return this.api.get<PaginatedOrders>(`/paper-trading/accounts/${id}/trades`, { page, limit });
  }

  getOrders(filter: {
    accountId?: string;
    status?: PaperOrderStatus;
    symbol?: string;
    page?: number;
    limit?: number;
  } = {}): Observable<PaginatedOrders> {
    const params: Record<string, string | number> = {};
    if (filter.accountId) params['accountId'] = filter.accountId;
    if (filter.status) params['status'] = filter.status;
    if (filter.symbol) params['symbol'] = filter.symbol;
    if (filter.page) params['page'] = filter.page;
    if (filter.limit) params['limit'] = filter.limit;
    return this.api.get<PaginatedOrders>('/paper-trading/orders', params);
  }

  cancelOrder(id: string): Observable<void> {
    return this.api.delete<void>(`/paper-trading/orders/${id}`);
  }
}
