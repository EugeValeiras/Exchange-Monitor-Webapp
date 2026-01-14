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
}
