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

@Injectable({
  providedIn: 'root',
})
export class ChartService {
  constructor(private api: ApiService) {}

  getChartData(timeframe: ChartTimeframe = '24h'): Observable<ChartDataResponse> {
    return this.api.get<ChartDataResponse>('/snapshots/chart-data', { timeframe });
  }
}
