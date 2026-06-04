import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export type RawExchange = 'binance' | 'kraken' | 'coinbase';
export type RawSource = 'public' | 'authenticated';

export interface RawTicker {
  exchange: RawExchange;
  symbol: string;
  timestamp: string;
  datetime: string | null;
  last: number | null;
  close: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  bid: number | null;
  ask: number | null;
  bidVolume: number | null;
  askVolume: number | null;
  vwap: number | null;
  baseVolume: number | null;
  quoteVolume: number | null;
  change: number | null;
  percentage: number | null;
  source: RawSource;
  info: unknown;
}

export interface RawOrderbook {
  exchange: RawExchange;
  symbol: string;
  timestamp: string;
  datetime: string | null;
  nonce: number | null;
  bids: number[][];
  asks: number[][];
  source: RawSource;
}

@Injectable({ providedIn: 'root' })
export class RawPricesService {
  constructor(private api: ApiService) {}

  getTicker(exchange: RawExchange, symbol: string, asMe = false): Observable<RawTicker> {
    const params: Record<string, string> = { symbol };
    if (asMe) params['asMe'] = 'true';
    return this.api.get<RawTicker>(`/prices/raw/${exchange}`, params);
  }

  getOrderbook(
    exchange: RawExchange,
    symbol: string,
    depth = 20,
    asMe = false,
  ): Observable<RawOrderbook> {
    const params: Record<string, string | number> = { symbol, depth };
    if (asMe) params['asMe'] = 'true';
    return this.api.get<RawOrderbook>(`/prices/raw/${exchange}/orderbook`, params);
  }
}
