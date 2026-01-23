import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

export type Timeframe = '1h' | '6h' | '12h' | '24h' | '7d' | '30d';

export interface PriceHistoryItem {
  symbol: string;
  exchange: string;
  price: number;
  change24h?: number;
  timestamp: Date;
}

export interface PriceHistoryResponse {
  symbol: string;
  history: PriceHistoryItem[];
  count: number;
}

export interface ChartDataPoint {
  time: number;
  price: number;
  change24h?: number;
}

export interface PriceHistoryChartResponse {
  symbol: string;
  timeframe: Timeframe;
  data: ChartDataPoint[];
  exchange?: string;
  from: Date;
  to: Date;
}

export interface PriceHistoryStats {
  totalRecords: number;
  byExchange: Record<string, number>;
  bySymbol: Record<string, number>;
  oldestRecord: Date | null;
  newestRecord: Date | null;
}

@Injectable({ providedIn: 'root' })
export class PriceHistoryService {
  private api = inject(ApiService);

  getHistory(
    symbol: string,
    options?: {
      from?: string;
      to?: string;
      exchange?: string;
      limit?: number;
    }
  ): Observable<PriceHistoryResponse> {
    const params: Record<string, string | number> = { symbol };
    if (options?.from) params['from'] = options.from;
    if (options?.to) params['to'] = options.to;
    if (options?.exchange) params['exchange'] = options.exchange;
    if (options?.limit) params['limit'] = options.limit;

    return this.api.get<PriceHistoryResponse>('/prices/history', params);
  }

  getChartData(
    symbol: string,
    timeframe: Timeframe,
    exchange?: string
  ): Observable<PriceHistoryChartResponse> {
    const params: Record<string, string> = { symbol, timeframe };
    if (exchange) params['exchange'] = exchange;

    return this.api.get<PriceHistoryChartResponse>('/prices/history/chart', params);
  }

  getStats(): Observable<PriceHistoryStats> {
    return this.api.get<PriceHistoryStats>('/prices/history/stats');
  }
}
