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
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
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
    ExchangeLogoComponent,
  ],
  template: `
    <div class="swap-content">
      <!-- Input Section -->
      <div class="swap-form-card">
        <div class="swap-form">
          <mat-form-field appearance="outline" class="asset-field">
            <mat-label>De</mat-label>
            <mat-select [(ngModel)]="fromAsset" (selectionChange)="onInputChange()">
              @for (asset of assets; track asset) {
                <mat-option [value]="asset">
                  <div class="option-row">
                    <img [src]="getAssetLogo(asset)" [alt]="asset" class="option-logo" (error)="onLogoError($event)">
                    {{ asset }}
                  </div>
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          <button mat-icon-button class="swap-btn" (click)="flipAssets()" matTooltip="Invertir">
            <mat-icon>swap_horiz</mat-icon>
          </button>

          <mat-form-field appearance="outline" class="asset-field">
            <mat-label>A</mat-label>
            <mat-select [(ngModel)]="toAsset" (selectionChange)="onInputChange()">
              @for (asset of assets; track asset) {
                <mat-option [value]="asset">
                  <div class="option-row">
                    <img [src]="getAssetLogo(asset)" [alt]="asset" class="option-logo" (error)="onLogoError($event)">
                    {{ asset }}
                  </div>
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="amount-field">
            <mat-label>Cantidad</mat-label>
            <input matInput type="number" [(ngModel)]="amount" (ngModelChange)="onInputChange()" min="0" step="any">
            <span matSuffix class="amount-suffix">{{ fromAsset }}</span>
          </mat-form-field>
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
                <span class="exchange-name">{{ result.exchangeLabel }}</span>
              </div>

              <div class="result-net">
                <span class="net-label">Recibirías</span>
                <span class="net-value">{{ formatAmount(result.netAmount) }}</span>
                <span class="net-asset">{{ toAsset }}</span>
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

              @if (!result.isBest && bestResult()) {
                <div class="diff-row negative">
                  {{ formatAmount(result.netAmount - bestResult()!.netAmount) }} {{ toAsset }} vs mejor
                </div>
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
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 32px;
    }

    .swap-form {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .asset-field {
      flex: 1;
      min-width: 140px;
    }

    .amount-field {
      flex: 1.2;
      min-width: 160px;
    }

    .amount-suffix {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      padding-right: 4px;
    }

    .swap-btn {
      color: var(--text-secondary);
      transition: all 0.2s ease;
      margin-top: -16px;
    }

    .swap-btn:hover {
      color: var(--brand-primary);
      transform: rotate(180deg);
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
      border-color: var(--brand-primary);
      box-shadow: 0 0 20px rgba(240, 185, 11, 0.15);
    }

    .best-badge {
      position: absolute;
      top: -10px;
      right: 16px;
      background: var(--brand-primary);
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

    .exchange-name {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .result-net {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 20px;
      padding: 16px;
      background: var(--bg-elevated);
      border-radius: 10px;
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
      color: var(--brand-primary);
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

    .diff-row.negative {
      background: rgba(246, 70, 93, 0.1);
      color: var(--color-error);
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
        flex-direction: column;
      }

      .asset-field,
      .amount-field {
        width: 100%;
      }

      .swap-btn {
        transform: rotate(90deg);
        margin-top: 0;
      }

      .swap-btn:hover {
        transform: rotate(270deg);
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

  assets = COMMON_ASSETS;
  fromAsset = 'BTC';
  toAsset = 'USDT';
  amount = 1;

  loading = signal(false);
  error = signal('');
  results = signal<SwapExchangeResult[]>([]);
  hasSearched = signal(false);

  bestResult = computed(() => {
    const r = this.results();
    return r.find((x) => x.isBest) || null;
  });

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.searchSubject
      .pipe(debounceTime(400), takeUntil(this.destroy$))
      .subscribe(() => this.fetchPreview());

    // Initial fetch
    this.fetchPreview();
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
