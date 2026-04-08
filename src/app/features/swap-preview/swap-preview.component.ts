import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { ConsolidatedBalanceService } from '../../core/services/consolidated-balance.service';
import { PriceSocketService } from '../../core/services/price-socket.service';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';

interface SwapExchangeResult {
  exchange: string;
  exchangeLabel: string;
  rate: number;
  takerFeeRate: number;
  makerFeeRate: number;
  feeAmount: number;
  grossAmount: number;
  netAmount: number;
  pair: string;
  route: string[] | null;
  isBest: boolean;
}

interface SwapPreviewResponse {
  from: string;
  to: string;
  amount: number;
  results: SwapExchangeResult[];
}

const COMMON_ASSETS = [
  'BTC', 'ETH', 'USDT', 'USD', 'BNB', 'SOL', 'XRP', 'ADA',
  'DOGE', 'DOT', 'MATIC', 'LINK', 'AVAX', 'ATOM', 'UNI', 'LTC',
];

@Component({
  selector: 'app-swap-preview',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    DecimalPipe,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatMenuModule,
    MatDialogModule,
    MatSnackBarModule,
    ExchangeLogoComponent,
  ],
  template: `
    <div class="swap-content">
      <!-- Input Section -->
      <div class="swap-form-card">
        <div class="swap-form">
          <div class="pair-group">
            <div class="asset-select">
              <label class="field-label">De</label>
              <button class="asset-picker" [matMenuTriggerFor]="fromMenu">
                <img [src]="getAssetLogo(fromAsset)" [alt]="fromAsset" class="picker-logo" (error)="onLogoError($event)">
                <span class="picker-symbol">{{ fromAsset }}</span>
                <mat-icon class="picker-arrow">expand_more</mat-icon>
              </button>
              <mat-menu #fromMenu="matMenu" class="asset-menu">
                @for (asset of assets; track asset) {
                  <button mat-menu-item (click)="fromAsset = asset; onInputChange()">
                    <div class="option-row">
                      <img [src]="getAssetLogo(asset)" [alt]="asset" class="option-logo" (error)="onLogoError($event)">
                      {{ asset }}
                    </div>
                  </button>
                }
              </mat-menu>
            </div>

            <button class="flip-btn" (click)="flipAssets()" matTooltip="Invertir">
              <mat-icon>swap_horiz</mat-icon>
            </button>

            <div class="asset-select">
              <label class="field-label">A</label>
              <button class="asset-picker" [matMenuTriggerFor]="toMenu">
                <img [src]="getAssetLogo(toAsset)" [alt]="toAsset" class="picker-logo" (error)="onLogoError($event)">
                <span class="picker-symbol">{{ toAsset }}</span>
                <mat-icon class="picker-arrow">expand_more</mat-icon>
              </button>
              <mat-menu #toMenu="matMenu" class="asset-menu">
                @for (asset of assets; track asset) {
                  <button mat-menu-item (click)="toAsset = asset; onInputChange()">
                    <div class="option-row">
                      <img [src]="getAssetLogo(asset)" [alt]="asset" class="option-logo" (error)="onLogoError($event)">
                      {{ asset }}
                    </div>
                  </button>
                }
              </mat-menu>
            </div>
          </div>

          <div class="amount-group">
            <label class="field-label">Cantidad</label>
            <div class="amount-input-wrap">
              <input type="number" [(ngModel)]="amount" (ngModelChange)="onInputChange()" min="0" step="any" class="amount-input" placeholder="0.00">
              <span class="amount-suffix">{{ fromAsset }}</span>
            </div>
          </div>

          <button class="refresh-btn" (click)="refresh()" [disabled]="loading()" matTooltip="Actualizar precios">
            <mat-icon [class.spinning]="loading()">refresh</mat-icon>
          </button>
        </div>
      </div>

      <!-- Results -->
      @if (loading()) {
        <div class="results-grid">
          @for (i of [1, 2]; track i) {
            <div class="result-card skeleton-card">
              <div class="result-header">
                <div class="skeleton-logo skeleton-pulse"></div>
                <div class="skeleton-text skeleton-pulse" style="width: 80px; height: 18px;"></div>
              </div>
              <div class="skeleton-text skeleton-pulse" style="width: 140px; height: 32px; margin: 16px 0;"></div>
              <div class="skeleton-text skeleton-pulse" style="width: 100px; height: 14px;"></div>
              <div class="skeleton-text skeleton-pulse" style="width: 120px; height: 14px; margin-top: 8px;"></div>
            </div>
          }
        </div>
      } @else if (error()) {
        <div class="error-state">
          <mat-icon>error_outline</mat-icon>
          <p>{{ error() }}</p>
        </div>
      } @else if (results().length > 0) {
        <div class="results-grid">
          @for (result of results(); track result.exchange) {
            <div class="result-card" [class.best]="result.isBest">
              @if (result.isBest) {
                <div class="best-badge">Mejor precio</div>
              }
              <div class="result-header">
                <app-exchange-logo [exchange]="result.exchange" [size]="36"></app-exchange-logo>
                <div class="header-info">
                  <span class="exchange-name">{{ result.exchangeLabel }}</span>
                  <span class="exchange-balance" [class.insufficient]="getExchangeBalance(result.exchange) < amount">
                    Saldo: {{ formatAmount(getExchangeBalance(result.exchange)) }} {{ fromAsset }}
                  </span>
                </div>
              </div>

              <div class="result-net">
                <div class="net-main">
                  <span class="net-label">Recibirías</span>
                  <div class="net-amounts">
                    <span class="net-value">{{ formatAmount(result.netAmount) }}</span>
                    <span class="net-asset">{{ toAsset }}</span>
                  </div>
                </div>
                <span class="net-usd">≈ {{ getNetAmountUsd(result) | currency:'USD':'symbol':'1.2-2' }}</span>
              </div>

              <div class="result-details">
                <div class="detail-row">
                  <span class="detail-label">Precio</span>
                  <span class="detail-value">{{ formatPrice(result.rate) }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Bruto</span>
                  <span class="detail-value">{{ formatAmount(result.grossAmount) }} {{ toAsset }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Comisión</span>
                  <span class="detail-value fee">
                    {{ (result.takerFeeRate * 100) | number:'1.2-2' }}%
                    <span class="fee-amount">({{ formatAmount(result.feeAmount) }} {{ toAsset }})</span>
                  </span>
                </div>
                @if (result.route) {
                  <div class="detail-row">
                    <span class="detail-label">Ruta</span>
                    <span class="detail-value route">{{ result.pair }}</span>
                  </div>
                } @else {
                  <div class="detail-row">
                    <span class="detail-label">Par</span>
                    <span class="detail-value">{{ result.pair }}</span>
                  </div>
                }
              </div>

              @if (result.isBest && secondResult()) {
                <div class="diff-row positive">
                  +{{ formatAmount(result.netAmount - secondResult()!.netAmount) }} {{ toAsset }} vs segundo
                </div>
              }
              @if (!result.isBest && bestResult()) {
                <div class="diff-row negative">
                  {{ formatAmount(result.netAmount - bestResult()!.netAmount) }} {{ toAsset }} vs mejor
                </div>
              }

              @if (!result.route) {
                <button
                  mat-raised-button
                  class="execute-btn"
                  [class.best]="result.isBest"
                  [disabled]="executing()"
                  (click)="confirmExecute(result)">
                  @if (executing() && executingExchange() === result.exchange) {
                    <mat-spinner diameter="18"></mat-spinner>
                  } @else {
                    <mat-icon>swap_horiz</mat-icon>
                  }
                  Ejecutar
                </button>
              }
            </div>
          }
        </div>
      } @else if (hasSearched()) {
        <div class="empty-state">
          <mat-icon>search_off</mat-icon>
          <p>No se encontraron pares disponibles para {{ fromAsset }} → {{ toAsset }}</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .swap-content {
      padding: 24px;
      max-width: 900px;
      margin: 0 auto;
    }

    .swap-form-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 20px 24px;
      margin-bottom: 28px;
    }

    .swap-form {
      display: flex;
      align-items: flex-end;
      gap: 16px;
    }

    .field-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-tertiary);
      margin-bottom: 6px;
    }

    .pair-group {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }

    .asset-select {
      display: flex;
      flex-direction: column;
    }

    .asset-picker {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
      color: var(--text-primary);
      min-width: 110px;
    }

    .asset-picker:hover {
      border-color: var(--brand-accent);
      background: var(--bg-tertiary);
    }

    .picker-logo {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      object-fit: contain;
    }

    .picker-symbol {
      font-size: 15px;
      font-weight: 700;
      flex: 1;
    }

    .picker-arrow {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--text-tertiary);
    }

    .flip-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 1px solid var(--border-color);
      background: var(--bg-elevated);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
      margin-bottom: 2px;
    }

    .flip-btn:hover {
      color: var(--brand-accent);
      border-color: var(--brand-accent);
      transform: rotate(180deg);
    }

    .flip-btn mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .amount-group {
      flex: 1;
      min-width: 150px;
    }

    .amount-input-wrap {
      display: flex;
      align-items: center;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 0 12px;
      transition: border-color 0.15s ease;
    }

    .amount-input-wrap:focus-within {
      border-color: var(--brand-accent);
    }

    .amount-input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
      padding: 9px 0;
      width: 100%;
    }

    .amount-input::placeholder {
      color: var(--text-tertiary);
    }

    .amount-suffix {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-tertiary);
      padding-left: 8px;
      white-space: nowrap;
    }

    .refresh-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      border-radius: 10px;
      border: 1px solid var(--border-color);
      background: var(--bg-elevated);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;
      flex-shrink: 0;
      margin-bottom: 1px;
    }

    .refresh-btn:hover:not(:disabled) {
      color: var(--brand-accent);
      border-color: var(--brand-accent);
    }

    .refresh-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .refresh-btn mat-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
    }

    .refresh-btn mat-icon.spinning {
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      100% { transform: rotate(360deg); }
    }

    .option-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .option-logo {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      object-fit: contain;
    }

    /* Results */
    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 20px;
    }

    .result-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 24px;
      position: relative;
      transition: border-color 0.2s ease;
    }

    .result-card.best {
      border-color: var(--brand-accent);
      box-shadow: 0 0 20px rgba(0, 188, 212, 0.15);
    }

    .best-badge {
      position: absolute;
      top: -10px;
      right: 16px;
      background: var(--brand-accent);
      color: #000;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .result-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }

    .header-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .exchange-name {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .exchange-balance {
      font-size: 12px;
      color: var(--text-secondary);
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    }

    .exchange-balance.insufficient {
      color: var(--color-error);
    }

    .result-net {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 20px;
      padding: 16px;
      background: var(--bg-elevated);
      border-radius: 10px;
    }

    .net-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .net-amounts {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .net-usd {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-tertiary);
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    }

    .net-label {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .net-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text-primary);
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    }

    .result-card.best .net-value {
      color: var(--brand-accent);
    }

    .net-asset {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .result-details {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .detail-label {
      font-size: 13px;
      color: var(--text-tertiary);
    }

    .detail-value {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    }

    .detail-value.fee {
      color: var(--color-error);
    }

    .fee-amount {
      color: var(--text-tertiary);
      font-weight: 400;
    }

    .detail-value.route {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .diff-row {
      margin-top: 16px;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
      text-align: center;
    }

    .diff-row.positive {
      background: rgba(0, 188, 212, 0.1);
      color: var(--brand-accent);
    }

    .diff-row.negative {
      background: rgba(246, 70, 93, 0.1);
      color: var(--color-error);
    }

    .execute-btn {
      margin-top: 20px;
      width: 100%;
      background: var(--bg-elevated);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .execute-btn.best {
      background: var(--brand-accent);
      color: #000;
      border: none;
    }

    .execute-btn:disabled {
      opacity: 0.5;
    }

    /* Empty & Error States */
    .empty-state,
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      color: var(--text-secondary);
      text-align: center;
    }

    .empty-state mat-icon,
    .error-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--text-tertiary);
      margin-bottom: 12px;
    }

    .error-state mat-icon {
      color: var(--color-error);
    }

    /* Skeleton */
    .skeleton-pulse {
      background: linear-gradient(
        90deg,
        var(--bg-tertiary) 0%,
        var(--bg-elevated) 50%,
        var(--bg-tertiary) 100%
      );
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s infinite;
    }

    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .skeleton-text {
      display: block;
      border-radius: 4px;
    }

    .skeleton-logo {
      width: 36px;
      height: 36px;
      border-radius: 10px;
    }

    .skeleton-card {
      pointer-events: none;
    }

    /* Responsive */
    @media (max-width: 600px) {
      .swap-form {
        flex-wrap: wrap;
      }

      .pair-group {
        width: 100%;
        justify-content: center;
      }

      .amount-group {
        width: 100%;
      }

      .results-grid {
        grid-template-columns: 1fr;
      }

      .net-value {
        font-size: 22px;
      }
    }
  `],
})
export class SwapPreviewComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<void>();

  assets: string[] = [...COMMON_ASSETS];
  fromAsset = 'BTC';
  toAsset = 'USDT';
  amount = 1;

  loading = signal(false);
  error = signal('');
  results = signal<SwapExchangeResult[]>([]);
  hasSearched = signal(false);

  executing = signal(false);
  executingExchange = signal('');

  bestResult = computed(() => {
    const r = this.results();
    return r.find((x) => x.isBest) || null;
  });

  secondResult = computed(() => {
    const r = this.results();
    return r.length > 1 ? r.find((x) => !x.isBest) || null : null;
  });

  constructor(
    private api: ApiService,
    private balanceService: ConsolidatedBalanceService,
    private priceSocket: PriceSocketService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit() {
    this.searchSubject
      .pipe(debounceTime(400), takeUntil(this.destroy$))
      .subscribe(() => this.fetchPreview());

    // Load user's balance assets and merge with defaults
    this.balanceService.initialize();
    const balance = this.balanceService.balance();
    if (balance) {
      this.mergeUserAssets(balance.byAsset.map((a) => a.asset));
    }
    // Also react to future balance loads
    this.api.get<{ byAsset: { asset: string }[] }>('/balances').subscribe({
      next: (data) => {
        this.mergeUserAssets(data.byAsset.map((a) => a.asset));
      },
    });

    // Initial fetch
    this.fetchPreview();
  }

  private mergeUserAssets(userAssets: string[]): void {
    const set = new Set(this.assets);
    for (const asset of userAssets) {
      set.add(asset);
    }
    this.assets = Array.from(set).sort();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInputChange() {
    if (this.fromAsset && this.toAsset && this.amount > 0) {
      this.searchSubject.next();
    }
  }

  flipAssets() {
    const temp = this.fromAsset;
    this.fromAsset = this.toAsset;
    this.toAsset = temp;
    this.onInputChange();
  }

  refresh() {
    this.fetchPreview();
  }

  private fetchPreview() {
    if (!this.fromAsset || !this.toAsset || this.amount <= 0) return;
    if (this.fromAsset === this.toAsset) return;

    this.loading.set(true);
    this.error.set('');

    const params = `from=${this.fromAsset}&to=${this.toAsset}&amount=${this.amount}`;
    this.api.get<SwapPreviewResponse>(`/prices/swap-preview?${params}`).subscribe({
      next: (response) => {
        this.results.set(response.results);
        this.hasSearched.set(true);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Error al obtener preview');
        this.loading.set(false);
        this.hasSearched.set(true);
      },
    });
  }

  confirmExecute(result: SwapExchangeResult): void {
    const netFormatted = this.formatAmount(result.netAmount);
    const confirmed = window.confirm(
      `¿Ejecutar swap en ${result.exchangeLabel}?\n\n` +
      `Vender: ${this.amount} ${this.fromAsset}\n` +
      `Recibir: ~${netFormatted} ${this.toAsset}\n` +
      `Comisión: ${(result.takerFeeRate * 100).toFixed(2)}%\n\n` +
      `⚠ Orden a mercado — el precio final puede variar.`
    );
    if (confirmed) {
      this.executeSwap(result);
    }
  }

  private executeSwap(result: SwapExchangeResult): void {
    this.executing.set(true);
    this.executingExchange.set(result.exchange);

    this.api.post<any>('/prices/swap-execute', {
      from: this.fromAsset,
      to: this.toAsset,
      amount: this.amount,
      exchange: result.exchange,
    }).subscribe({
      next: (res) => {
        this.executing.set(false);
        this.executingExchange.set('');
        const filled = res.filled || res.amount || 0;
        const price = res.price || 0;
        this.snackBar.open(
          `Swap ejecutado en ${result.exchangeLabel} — ${filled} ${res.side === 'sell' ? this.fromAsset : this.toAsset} @ ${this.formatPrice(price)}`,
          'OK',
          { duration: 8000 },
        );
        // Refresh preview
        this.fetchPreview();
      },
      error: (err) => {
        this.executing.set(false);
        this.executingExchange.set('');
        this.snackBar.open(
          `Error: ${err.error?.message || 'No se pudo ejecutar el swap'}`,
          'Cerrar',
          { duration: 8000 },
        );
      },
    });
  }

  getNetAmountUsd(result: SwapExchangeResult): number {
    const to = this.toAsset;
    // If target is already USD/USDT, netAmount IS the USD value
    if (to === 'USDT' || to === 'USD') {
      return result.netAmount;
    }
    // Otherwise, get the USD price of the target asset
    const price = this.priceSocket.getPriceByAsset(to);
    return price ? result.netAmount * price : 0;
  }

  getExchangeBalance(exchange: string): number {
    const balance = this.balanceService.balance();
    if (!balance) return 0;

    const asset = balance.byAsset.find((a) => a.asset === this.fromAsset);
    if (!asset?.exchangeBreakdown) return 0;

    const breakdown = asset.exchangeBreakdown.find((b) => b.exchange === exchange);
    return breakdown?.total || 0;
  }

  formatAmount(value: number): string {
    if (Math.abs(value) >= 1) {
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });
    } else if (Math.abs(value) >= 0.0001) {
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6,
      });
    } else {
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 6,
        maximumFractionDigits: 8,
      });
    }
  }

  formatPrice(value: number): string {
    if (value >= 1) {
      return '$' + value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });
    }
    return '$' + value.toLocaleString('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 8,
    });
  }

  getAssetLogo(asset: string): string {
    return `/${asset.toLowerCase()}.svg`;
  }

  onLogoError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
