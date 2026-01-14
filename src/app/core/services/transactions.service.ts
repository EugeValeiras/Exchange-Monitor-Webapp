import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export type TransactionType = 'deposit' | 'withdrawal' | 'trade' | 'interest';
export type ExchangeType = 'binance' | 'kraken' | 'nexo-pro' | 'nexo-manual';

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
  startDate?: string;
  endDate?: string;
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
    if (filter.startDate) params.set('startDate', filter.startDate);
    if (filter.endDate) params.set('endDate', filter.endDate);

    const queryString = params.toString();
    const url = queryString ? `/transactions?${queryString}` : '/transactions';

    return this.api.get<PaginatedTransactions>(url);
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
      interest: 'Interés'
    };
    return labels[type] || type;
  }

  getTypeIcon(type: TransactionType): string {
    const icons: Record<TransactionType, string> = {
      deposit: 'arrow_downward',
      withdrawal: 'arrow_upward',
      trade: 'swap_horiz',
      interest: 'percent'
    };
    return icons[type] || 'receipt';
  }

  getExchangeLabel(exchange: string): string {
    const labels: Record<string, string> = {
      binance: 'Binance',
      kraken: 'Kraken',
      'nexo-pro': 'Nexo Pro',
      'nexo-manual': 'Nexo Manual'
    };
    return labels[exchange] || exchange;
  }
}
