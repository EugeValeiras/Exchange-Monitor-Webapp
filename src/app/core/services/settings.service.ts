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

// Response for all symbols grouped by exchange
export interface AllSymbolsResponse {
  symbolsByExchange: Record<string, string[]>;
}

// Response for single exchange symbols
export interface ExchangeSymbolsResponse {
  exchange: string;
  symbols: string[];
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  // Signals per exchange
  private binanceSymbolsSignal = signal<string[]>([]);
  private krakenSymbolsSignal = signal<string[]>([]);

  binanceSymbols = this.binanceSymbolsSignal.asReadonly();
  krakenSymbols = this.krakenSymbolsSignal.asReadonly();

  constructor(private api: ApiService) {}

  /**
   * Load all symbols grouped by exchange
   */
  loadAllSymbols(): Observable<AllSymbolsResponse> {
    return this.api.get<AllSymbolsResponse>('/settings/symbols').pipe(
      tap(response => {
        this.binanceSymbolsSignal.set(response.symbolsByExchange?.['binance'] || []);
        this.krakenSymbolsSignal.set(response.symbolsByExchange?.['kraken'] || []);
      })
    );
  }

  /**
   * Get symbols for a specific exchange
   */
  getExchangeSymbols(exchange: string): Observable<ExchangeSymbolsResponse> {
    return this.api.get<ExchangeSymbolsResponse>(`/settings/symbols/${exchange}`);
  }

  /**
   * Update symbols for a specific exchange
   */
  updateExchangeSymbols(exchange: string, symbols: string[]): Observable<ExchangeSymbolsResponse> {
    return this.api.put<ExchangeSymbolsResponse>(`/settings/symbols/${exchange}`, { symbols }).pipe(
      tap(response => {
        if (exchange === 'binance') {
          this.binanceSymbolsSignal.set(response.symbols);
        } else if (exchange === 'kraken') {
          this.krakenSymbolsSignal.set(response.symbols);
        }
      })
    );
  }

  /**
   * Get available symbols for an exchange (for search)
   */
  getAvailableSymbols(exchange: string, search?: string): Observable<AvailableSymbolsResponse> {
    const searchParam = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.api.get<AvailableSymbolsResponse>(`/settings/symbols/available/${exchange}${searchParam}`);
  }

  /**
   * Get all configured base assets (from all exchanges)
   */
  getConfiguredAssets(): Set<string> {
    const assets = new Set<string>();

    // From Binance
    for (const symbol of this.binanceSymbolsSignal()) {
      const base = symbol.split('/')[0];
      assets.add(base);
    }

    // From Kraken
    for (const symbol of this.krakenSymbolsSignal()) {
      const base = symbol.split('/')[0];
      assets.add(base);
    }

    return assets;
  }

  /**
   * Get configured assets for a specific exchange
   */
  getConfiguredAssetsForExchange(exchange: string): Set<string> {
    const assets = new Set<string>();
    const symbols = exchange === 'binance' ? this.binanceSymbolsSignal() : this.krakenSymbolsSignal();

    for (const symbol of symbols) {
      const base = symbol.split('/')[0];
      assets.add(base);
    }

    return assets;
  }
}
