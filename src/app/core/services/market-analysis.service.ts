import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export type MarketExchange = 'binance' | 'kraken';
export type MarketTimeframe = '15m' | '1h' | '4h' | '1d';

export interface OhlcCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OhlcResponse {
  exchange: MarketExchange;
  symbol: string;
  timeframe: MarketTimeframe;
  candles: OhlcCandle[];
}

export interface IndicatorPoint {
  timestamp: number;
  value: number | null;
}

export interface MacdPoint {
  timestamp: number;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

export interface BollingerPoint {
  timestamp: number;
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export interface RsiDivergence {
  type: 'bullish' | 'bearish';
  startIndex: number;
  endIndex: number;
  startTimestamp: number;
  endTimestamp: number;
  startPrice: number;
  endPrice: number;
  startRsi: number;
  endRsi: number;
}

export interface IndicatorsResponse {
  exchange: MarketExchange;
  symbol: string;
  timeframe: MarketTimeframe;
  candles: OhlcCandle[];
  rsi: IndicatorPoint[];
  macd: MacdPoint[];
  sma20: IndicatorPoint[];
  sma50: IndicatorPoint[];
  ema20: IndicatorPoint[];
  bollinger: BollingerPoint[];
  rsiDivergences: RsiDivergence[];
}

export interface SummaryRow {
  symbol: string;
  price: number;
  pctChange1h: number | null;
  pctChange24h: number | null;
  pctChange7d: number | null;
  pctChange30d: number | null;
  volume24h: number;
  sparkline: number[];
  error?: string | null;
}

export interface SummaryResponse {
  exchange: MarketExchange;
  rows: SummaryRow[];
  generatedAt: number;
}

@Injectable({ providedIn: 'root' })
export class MarketAnalysisService {
  constructor(private api: ApiService) {}

  getOhlc(
    exchange: MarketExchange,
    symbol: string,
    timeframe: MarketTimeframe,
    limit?: number,
  ): Observable<OhlcResponse> {
    const params: Record<string, string | number> = { exchange, symbol, timeframe };
    if (limit) params['limit'] = limit;
    return this.api.get<OhlcResponse>('/market-analysis/ohlc', params);
  }

  getIndicators(
    exchange: MarketExchange,
    symbol: string,
    timeframe: MarketTimeframe,
  ): Observable<IndicatorsResponse> {
    return this.api.get<IndicatorsResponse>('/market-analysis/indicators', {
      exchange,
      symbol,
      timeframe,
    });
  }

  getSummary(exchange: MarketExchange): Observable<SummaryResponse> {
    return this.api.get<SummaryResponse>('/market-analysis/summary', { exchange });
  }
}
