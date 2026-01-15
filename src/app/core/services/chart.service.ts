import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export type ChartTimeframe = '24h' | '7d' | '1m' | '1y';

export interface ChartDataResponse {
  labels: string[];
  data: number[];
  changeUsd: number;
  changePercent: number;
  timeframe: string;
}

export interface AssetChartData {
  asset: string;
  data: number[];
  changeUsd: number;
  changePercent: number;
}

export interface ChartDataByAssetResponse {
  labels: string[];
  totalData: number[];
  assetData: AssetChartData[];
  availableAssets: string[];
  changeUsd: number;
  changePercent: number;
  timeframe: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChartService {
  constructor(private api: ApiService) {}

  getChartData(timeframe: ChartTimeframe = '24h'): Observable<ChartDataResponse> {
    return this.api.get<ChartDataResponse>('/snapshots/chart-data', { timeframe });
  }

  getChartDataByAsset(
    timeframe: '24h' | '7d' = '24h',
    assets?: string[]
  ): Observable<ChartDataByAssetResponse> {
    const params: Record<string, string> = { timeframe };
    if (assets && assets.length > 0) {
      params['assets'] = assets.join(',');
    }
    return this.api.get<ChartDataByAssetResponse>('/snapshots/chart-data-by-asset', params);
  }

  rebuildHistory(): Observable<{ message: string; snapshotsCreated: number }> {
    return this.api.post<{ message: string; snapshotsCreated: number }>('/snapshots/rebuild-history', {});
  }
}
