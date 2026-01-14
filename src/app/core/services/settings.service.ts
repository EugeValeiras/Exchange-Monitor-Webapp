import { Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

export interface AvailableSymbol {
  symbol: string;
  base: string;
  quote: string;
}

export interface AvailableSymbolsResponse {
  exchange: string;
  symbols: AvailableSymbol[];
  total: number;
  cachedAt: string;
}

export interface PricingSymbolsResponse {
  symbols: string[];
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private symbolsSignal = signal<string[]>([]);

  symbols = this.symbolsSignal.asReadonly();

  constructor(private api: ApiService) {}

  loadSymbols(): Observable<PricingSymbolsResponse> {
    return this.api.get<PricingSymbolsResponse>('/settings/symbols').pipe(
      tap(response => this.symbolsSignal.set(response.symbols))
    );
  }

  updateSymbols(symbols: string[]): Observable<PricingSymbolsResponse> {
    return this.api.put<PricingSymbolsResponse>('/settings/symbols', { symbols }).pipe(
      tap(response => this.symbolsSignal.set(response.symbols))
    );
  }

  getAvailableSymbols(exchange: string, search?: string): Observable<AvailableSymbolsResponse> {
    const searchParam = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.api.get<AvailableSymbolsResponse>(`/settings/symbols/available/${exchange}${searchParam}`);
  }

  getConfiguredAssets(): Set<string> {
    const symbols = this.symbolsSignal();
    const assets = new Set<string>();
    for (const symbol of symbols) {
      const base = symbol.split('/')[0];
      assets.add(base);
    }
    return assets;
  }
}
