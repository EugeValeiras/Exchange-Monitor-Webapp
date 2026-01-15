import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface AssetPnl {
  asset: string;
  realizedPnl: number;
  unrealizedPnl: number;
  totalCostBasis: number;
  currentValue: number;
  totalAmount: number;
}

export interface PeriodBreakdown {
  today: number;
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
  allTime: number;
}

export interface PnlSummaryResponse {
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalPnl: number;
  byAsset: AssetPnl[];
  periodBreakdown: PeriodBreakdown;
}

export interface UnrealizedPnlPosition {
  asset: string;
  amount: number;
  costBasis: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

export interface UnrealizedPnlResponse {
  totalUnrealizedPnl: number;
  positions: UnrealizedPnlPosition[];
}

export interface RealizedPnlItem {
  id: string;
  asset: string;
  amount: number;
  proceeds: number;
  costBasis: number;
  realizedPnl: number;
  realizedAt: Date;
  exchange: string;
  buyPrice: number;
  sellPrice: number;
  pnlPercent: number;
  holdingPeriod: string;
}

export interface PaginatedRealizedPnl {
  data: RealizedPnlItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CostBasisLot {
  id: string;
  asset: string;
  exchange: string;
  source: string;
  acquiredAt: Date;
  originalAmount: number;
  remainingAmount: number;
  costPerUnit: number;
  totalCost: number;
}

export interface PaginatedCostBasisLots {
  data: CostBasisLot[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PnlEvolutionData {
  labels: string[];
  data: number[];
  timeframe: string;
}

export interface PnlFilters {
  assets: string[];
  exchanges: string[];
}

export interface RealizedPnlFilter {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  assets?: string[];
  exchanges?: string[];
}

export interface CostBasisLotsFilter {
  page?: number;
  limit?: number;
  assets?: string[];
  exchanges?: string[];
  showEmpty?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PnlService {
  constructor(private api: ApiService) {}

  getSummary(): Observable<PnlSummaryResponse> {
    return this.api.get<PnlSummaryResponse>('/pnl/summary');
  }

  getUnrealizedPnl(): Observable<UnrealizedPnlResponse> {
    return this.api.get<UnrealizedPnlResponse>('/pnl/unrealized');
  }

  getRealizedPnl(startDate?: string, endDate?: string): Observable<RealizedPnlItem[]> {
    const params: Record<string, string> = {};
    if (startDate) params['startDate'] = startDate;
    if (endDate) params['endDate'] = endDate;
    return this.api.get<RealizedPnlItem[]>('/pnl/realized', params);
  }

  recalculate(): Observable<{ processed: number; message: string }> {
    return this.api.post<{ processed: number; message: string }>('/pnl/recalculate', {});
  }

  getRealizedPnlPaginated(filter: RealizedPnlFilter = {}): Observable<PaginatedRealizedPnl> {
    const params: Record<string, string> = {};
    if (filter.page) params['page'] = filter.page.toString();
    if (filter.limit) params['limit'] = filter.limit.toString();
    if (filter.startDate) params['startDate'] = filter.startDate;
    if (filter.endDate) params['endDate'] = filter.endDate;
    if (filter.assets?.length) params['assets'] = filter.assets.join(',');
    if (filter.exchanges?.length) params['exchanges'] = filter.exchanges.join(',');
    return this.api.get<PaginatedRealizedPnl>('/pnl/realized/paginated', params);
  }

  getCostBasisLots(filter: CostBasisLotsFilter = {}): Observable<PaginatedCostBasisLots> {
    const params: Record<string, string> = {};
    if (filter.page) params['page'] = filter.page.toString();
    if (filter.limit) params['limit'] = filter.limit.toString();
    if (filter.assets?.length) params['assets'] = filter.assets.join(',');
    if (filter.exchanges?.length) params['exchanges'] = filter.exchanges.join(',');
    if (filter.showEmpty !== undefined) params['showEmpty'] = filter.showEmpty.toString();
    return this.api.get<PaginatedCostBasisLots>('/pnl/lots', params);
  }

  getPnlEvolution(timeframe: string = '1y'): Observable<PnlEvolutionData> {
    return this.api.get<PnlEvolutionData>('/pnl/evolution', { timeframe });
  }

  getFilters(): Observable<PnlFilters> {
    return this.api.get<PnlFilters>('/pnl/filters');
  }

  exportPnl(): Observable<Blob> {
    return this.api.getBlob('/pnl/export');
  }
}
