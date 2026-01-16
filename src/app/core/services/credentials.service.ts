import { Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

export enum ExchangeType {
  KRAKEN = 'kraken',
  BINANCE = 'binance',
  NEXO_PRO = 'nexo-pro',
  NEXO_MANUAL = 'nexo-manual'
}

export interface ExchangeCredential {
  id: string;
  exchange: ExchangeType;
  label: string;
  isActive: boolean;
  lastSyncAt?: string;
  lastError?: string;
  symbols: string[];
  createdAt: string;
  updatedAt: string;
}

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

export interface CreateCredentialRequest {
  exchange: ExchangeType;
  label: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface UpdateCredentialRequest {
  label?: string;
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  isActive?: boolean;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
}

@Injectable({
  providedIn: 'root'
})
export class CredentialsService {
  private credentialsSignal = signal<ExchangeCredential[]>([]);

  credentials = this.credentialsSignal.asReadonly();

  constructor(private api: ApiService) {}

  loadCredentials(): Observable<ExchangeCredential[]> {
    return this.api.get<ExchangeCredential[]>('/credentials').pipe(
      tap(credentials => this.credentialsSignal.set(credentials))
    );
  }

  getCredential(id: string): Observable<ExchangeCredential> {
    return this.api.get<ExchangeCredential>(`/credentials/${id}`);
  }

  createCredential(data: CreateCredentialRequest): Observable<ExchangeCredential> {
    return this.api.post<ExchangeCredential>('/credentials', data).pipe(
      tap(credential => {
        this.credentialsSignal.update(creds => [...creds, credential]);
      })
    );
  }

  updateCredential(id: string, data: UpdateCredentialRequest): Observable<ExchangeCredential> {
    return this.api.patch<ExchangeCredential>(`/credentials/${id}`, data).pipe(
      tap(updated => {
        this.credentialsSignal.update(creds =>
          creds.map(c => c.id === id ? updated : c)
        );
      })
    );
  }

  deleteCredential(id: string): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/credentials/${id}`).pipe(
      tap(() => {
        this.credentialsSignal.update(creds => creds.filter(c => c.id !== id));
      })
    );
  }

  testConnection(id: string): Observable<TestConnectionResponse> {
    return this.api.post<TestConnectionResponse>(`/credentials/${id}/test`, {});
  }

  importCsv(credentialId: string, file: File): Observable<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.postFormData<ImportResult>(`/imports/nexo-csv/${credentialId}`, formData);
  }

  syncTransactions(credentialId: string): Observable<{ synced: number; message: string }> {
    return this.api.post<{ synced: number; message: string }>(
      `/transactions/sync/${credentialId}`,
      {}
    );
  }

  getAvailableSymbols(exchange: ExchangeType, search?: string): Observable<AvailableSymbolsResponse> {
    const searchParam = search ? `?search=${encodeURIComponent(search)}` : '';
    return this.api.get<AvailableSymbolsResponse>(`/credentials/symbols/${exchange}${searchParam}`);
  }

  updateSymbols(credentialId: string, symbols: string[]): Observable<ExchangeCredential> {
    return this.api.patch<ExchangeCredential>(`/credentials/${credentialId}/symbols`, { symbols }).pipe(
      tap(updated => {
        this.credentialsSignal.update(creds =>
          creds.map(c => c.id === credentialId ? updated : c)
        );
      })
    );
  }

  getExchangeIcon(exchange: ExchangeType): string {
    const icons: Record<ExchangeType, string> = {
      [ExchangeType.BINANCE]: 'currency_bitcoin',
      [ExchangeType.KRAKEN]: 'waves',
      [ExchangeType.NEXO_PRO]: 'account_balance',
      [ExchangeType.NEXO_MANUAL]: 'upload_file'
    };
    return icons[exchange] || 'business';
  }

  getExchangeLabel(exchange: ExchangeType): string {
    const labels: Record<ExchangeType, string> = {
      [ExchangeType.BINANCE]: 'Binance',
      [ExchangeType.KRAKEN]: 'Kraken',
      [ExchangeType.NEXO_PRO]: 'Nexo Pro',
      [ExchangeType.NEXO_MANUAL]: 'Nexo'
    };
    return labels[exchange] || exchange;
  }
}
