import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export type TransactionType = 'deposit' | 'withdrawal' | 'trade' | 'interest' | 'fee';
export type ExchangeType = 'binance' | 'kraken' | 'coinbase' | 'nexo-pro' | 'nexo-manual';

export interface Transaction {
  id: string;
  exchange: string;
  externalId: string;
  type: TransactionType;
  asset: string;
  amount: number;
  fee?: number;
  feeAsset?: string;
  price?: number;
  priceAsset?: string;
  pair?: string;
  side?: 'buy' | 'sell';
  timestamp: string;
}

export interface PaginatedTransactions {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TransactionStats {
  totalTransactions: number;
  byType: Record<string, number>;
  byExchange: Record<string, number>;
  byAsset: Record<string, number>;
  totalInterestUsd: number;
}

export interface TransactionFilter {
  page?: number;
  limit?: number;
  exchange?: ExchangeType;
  type?: TransactionType;
  types?: TransactionType[];
  asset?: string;
  assets?: string[];
  /** Trading pair. USD-family quotes are interchangeable: BTC/USDT also matches BTC/USD */
  pair?: string;
  startDate?: string;
  endDate?: string;
}

/** A single trade of a pair, as drawn on the candlestick chart */
export interface PairTrade {
  id: string;
  exchange: string;
  pair: string;
  side: 'buy' | 'sell';
  /** Base asset amount, always positive */
  amount: number;
  price: number;
  total: number;
  fee?: number;
  feeAsset?: string;
  timestamp: string;
}

/** Position resulting from every trade of the pair, not just the visible ones */
export interface PairPosition {
  netAmount: number;
  /** Weighted moving average cost of the open position. 0 when flat */
  avgEntryPrice: number;
  costBasis: number;
  realizedPnl: number;
  totalBought: number;
  totalSold: number;
  tradeCount: number;
}

export interface PairTrades {
  pair: string;
  matchedPairs: string[];
  trades: PairTrade[];
  position: PairPosition;
  outsideRange: number;
}

@Injectable({
  providedIn: 'root'
})
export class TransactionsService {
  constructor(private api: ApiService) {}

  getTransactions(filter: TransactionFilter = {}): Observable<PaginatedTransactions> {
    const params = new URLSearchParams();

    if (filter.page) params.set('page', filter.page.toString());
    if (filter.limit) params.set('limit', filter.limit.toString());
    if (filter.exchange) params.set('exchange', filter.exchange);
    if (filter.type) params.set('type', filter.type);
    if (filter.types && filter.types.length > 0) {
      params.set('types', filter.types.join(','));
    }
    if (filter.assets && filter.assets.length > 0) {
      params.set('assets', filter.assets.join(','));
    } else if (filter.asset) {
      params.set('asset', filter.asset);
    }
    if (filter.pair) params.set('pair', filter.pair);
    if (filter.startDate) params.set('startDate', filter.startDate);
    if (filter.endDate) params.set('endDate', filter.endDate);

    const queryString = params.toString();
    const url = queryString ? `/transactions?${queryString}` : '/transactions';

    return this.api.get<PaginatedTransactions>(url);
  }

  /**
   * Trades of a single pair plus the resulting position, for the "my trades"
   * layer on the candlestick chart. `from`/`to` are epoch ms and only narrow
   * the returned trades: the position always covers the full history.
   */
  getTradesByPair(pair: string, from?: number, to?: number): Observable<PairTrades> {
    const params = new URLSearchParams({ pair });
    if (from !== undefined) params.set('from', Math.floor(from).toString());
    if (to !== undefined) params.set('to', Math.ceil(to).toString());

    return this.api.get<PairTrades>(`/transactions/by-pair?${params.toString()}`);
  }

  getStats(filter?: {
    exchange?: string;
    startDate?: string;
    endDate?: string;
    types?: string[];
    assets?: string[];
  }): Observable<TransactionStats> {
    const params = new URLSearchParams();
    if (filter?.exchange) params.set('exchange', filter.exchange);
    if (filter?.startDate) params.set('startDate', filter.startDate);
    if (filter?.endDate) params.set('endDate', filter.endDate);
    if (filter?.types && filter.types.length > 0) {
      params.set('types', filter.types.join(','));
    }
    if (filter?.assets && filter.assets.length > 0) {
      params.set('assets', filter.assets.join(','));
    }

    const queryString = params.toString();
    const url = queryString ? `/transactions/stats?${queryString}` : '/transactions/stats';
    return this.api.get<TransactionStats>(url);
  }

  getTypeLabel(type: TransactionType): string {
    const labels: Record<TransactionType, string> = {
      deposit: 'Depósito',
      withdrawal: 'Retiro',
      trade: 'Trade',
      interest: 'Interés',
      fee: 'Comisión'
    };
    return labels[type] || type;
  }

  getTypeIcon(type: TransactionType): string {
    const icons: Record<TransactionType, string> = {
      deposit: 'arrow_downward',
      withdrawal: 'arrow_upward',
      trade: 'swap_horiz',
      interest: 'percent',
      fee: 'toll'
    };
    return icons[type] || 'receipt';
  }

  getExchangeLabel(exchange: string): string {
    const labels: Record<string, string> = {
      binance: 'Binance',
      'binance-futures': 'Binance Futures',
      kraken: 'Kraken',
      coinbase: 'Coinbase',
      'nexo-pro': 'Nexo Pro',
      'nexo-manual': 'Nexo'
    };
    return labels[exchange] || exchange;
  }

  exportToExcel(filter: TransactionFilter = {}): void {
    const params = new URLSearchParams();

    if (filter.exchange) params.set('exchange', filter.exchange);
    if (filter.types && filter.types.length > 0) {
      params.set('types', filter.types.join(','));
    }
    if (filter.assets && filter.assets.length > 0) {
      params.set('assets', filter.assets.join(','));
    }
    if (filter.startDate) params.set('startDate', filter.startDate);
    if (filter.endDate) params.set('endDate', filter.endDate);

    const queryString = params.toString();
    const url = queryString
      ? `/transactions/export?${queryString}`
      : '/transactions/export';

    // Download file via the API service
    this.api.downloadFile(url, `transacciones_${new Date().toISOString().split('T')[0]}.xlsx`);
  }
}
