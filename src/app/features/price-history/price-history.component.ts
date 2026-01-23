import { Component, OnInit, OnDestroy, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatRippleModule } from '@angular/material/core';
import { SettingsService } from '../../core/services/settings.service';
import { PriceSocketService } from '../../core/services/price-socket.service';
import { Timeframe } from './price-history.service';
import { PriceHistoryChartComponent } from './components/price-history-chart.component';
import { SymbolSelectorDialogComponent } from '../../shared/components/symbol-selector-dialog/symbol-selector-dialog.component';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';

interface TimeframeOption {
  value: Timeframe;
  label: string;
}

@Component({
  selector: 'app-price-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    MatRippleModule,
    PriceHistoryChartComponent,
    ExchangeLogoComponent,
  ],
  template: `
    <div class="price-history-container">
      <div class="page-header">
        <div class="header-content">
          <h1>Historico de Precios</h1>
          <p>Analiza la evolucion de precios en el tiempo</p>
        </div>
      </div>

      <!-- Filters Section -->
      <div class="filters-section">
        <!-- Symbol Selector Button -->
        <div class="filter-group">
          <span class="filter-label">Simbolo</span>
          <button
            class="symbol-selector-btn"
            matRipple
            (click)="openSymbolSelector()">
            <div class="symbol-btn-content">
              <img
                [src]="getAssetLogo(selectedSymbol())"
                [alt]="getDisplaySymbol()"
                class="symbol-btn-logo"
                (error)="onLogoError($event)">
              <div class="symbol-btn-info">
                <span class="symbol-btn-name">{{ getDisplaySymbol() }}</span>
                @if (currentPrice()) {
                  <span class="symbol-btn-price">
                    {{ formatPrice(currentPrice()!) }}
                    @if (currentChange() !== undefined) {
                      <span
                        class="symbol-btn-change"
                        [class.positive]="currentChange()! >= 0"
                        [class.negative]="currentChange()! < 0">
                        {{ currentChange()! >= 0 ? '+' : '' }}{{ currentChange() | number:'1.2-2' }}%
                      </span>
                    }
                  </span>
                }
              </div>
            </div>
            <mat-icon class="symbol-btn-arrow">expand_more</mat-icon>
          </button>
        </div>

        <!-- Timeframe Selector -->
        <div class="filter-group">
          <span class="filter-label">Periodo</span>
          <mat-button-toggle-group
            [value]="selectedTimeframe()"
            (change)="onTimeframeChange($event.value)"
            class="timeframe-toggle">
            @for (tf of timeframes; track tf.value) {
              <mat-button-toggle [value]="tf.value">{{ tf.label }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
        </div>

        <!-- Exchange Filter -->
        <div class="filter-group">
          <span class="filter-label">Exchange</span>
          <mat-chip-listbox class="exchange-chips" (change)="onExchangeChange($event.value)">
            <mat-chip-option value="" [selected]="!selectedExchange()" class="exchange-chip">
              Todos
            </mat-chip-option>
            <mat-chip-option value="binance" [selected]="selectedExchange() === 'binance'" class="exchange-chip">
              <app-exchange-logo exchange="binance" [size]="18"></app-exchange-logo>
              Binance
            </mat-chip-option>
            <mat-chip-option value="kraken" [selected]="selectedExchange() === 'kraken'" class="exchange-chip">
              <app-exchange-logo exchange="kraken" [size]="18"></app-exchange-logo>
              Kraken
            </mat-chip-option>
          </mat-chip-listbox>
        </div>
      </div>

      <!-- Chart Section -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>
            <div class="chart-title">
              <img [src]="getAssetLogo(selectedSymbol())" [alt]="getDisplaySymbol()" class="title-logo" (error)="onLogoError($event)">
              {{ getDisplaySymbol() }}
              <span class="timeframe-badge">{{ getTimeframeLabel() }}</span>
              @if (selectedExchange()) {
                <span class="exchange-badge">{{ selectedExchange() }}</span>
              }
            </div>
          </mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <app-price-history-chart
            [symbol]="selectedSymbol()"
            [timeframe]="selectedTimeframe()"
            [exchange]="selectedExchange()">
          </app-price-history-chart>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .price-history-container {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }

    .header-content h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .header-content p {
      margin: 4px 0 0;
      color: var(--text-secondary);
      font-size: 14px;
    }

    .filters-section {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding: 20px 24px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .filter-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Symbol Selector Button */
    .symbol-selector-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-width: 280px;
      padding: 12px 16px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--brand-accent);
        background: var(--bg-tertiary);
      }

      &:active {
        transform: scale(0.99);
      }
    }

    .symbol-btn-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .symbol-btn-logo {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--bg-tertiary);
    }

    .symbol-btn-info {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }

    .symbol-btn-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .symbol-btn-price {
      font-size: 13px;
      color: var(--text-secondary);
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .symbol-btn-change {
      font-size: 12px;
      font-weight: 500;

      &.positive {
        color: var(--color-success);
      }

      &.negative {
        color: var(--color-error);
      }
    }

    .symbol-btn-arrow {
      color: var(--text-tertiary);
      transition: transform 0.2s ease;
    }

    .symbol-selector-btn:hover .symbol-btn-arrow {
      color: var(--text-secondary);
    }

    .title-logo {
      width: 24px;
      height: 24px;
      border-radius: 50%;
    }

    .timeframe-toggle {
      background: var(--bg-elevated);
      border-radius: 10px;
      border: 1px solid var(--border-color);
      padding: 3px;

      ::ng-deep .mat-button-toggle {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        border: none !important;
        background: transparent;
        border-radius: 7px;
        transition: all 0.2s ease;
      }

      ::ng-deep .mat-button-toggle-appearance-standard {
        background: transparent;
        color: var(--text-tertiary);
      }

      ::ng-deep .mat-button-toggle + .mat-button-toggle {
        border-left: none !important;
      }

      ::ng-deep .mat-button-toggle:hover:not(.mat-button-toggle-checked) {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }

      ::ng-deep .mat-button-toggle-checked {
        background: var(--brand-accent) !important;
        color: var(--bg-primary) !important;
        border-radius: 7px;
        box-shadow: 0 2px 8px rgba(0, 188, 212, 0.3);
      }

      ::ng-deep .mat-button-toggle-checked .mat-button-toggle-label-content {
        color: var(--bg-primary) !important;
      }

      ::ng-deep .mat-button-toggle-focus-overlay {
        display: none !important;
      }

      ::ng-deep .mat-pseudo-checkbox {
        display: none !important;
        width: 0 !important;
        margin: 0 !important;
      }

      ::ng-deep .mat-button-toggle-button {
        padding: 0 14px;
        height: 32px;
      }

      ::ng-deep .mat-button-toggle-label-content {
        line-height: 32px;
        margin-left: 0 !important;
        padding-left: 0 !important;
      }
    }

    .exchange-chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    ::ng-deep .exchange-chip {
      --mdc-chip-elevated-container-color: var(--bg-tertiary) !important;
      --mdc-chip-label-text-color: var(--text-primary) !important;
      --mdc-chip-elevated-selected-container-color: var(--bg-tertiary) !important;
      border: 2px solid transparent;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      padding-left: 4px !important;

      .mdc-evolution-chip__checkmark,
      .mat-mdc-chip-graphic {
        display: none !important;
        width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      &.mat-mdc-chip-selected .mdc-evolution-chip__graphic {
        width: 0 !important;
        padding: 0 !important;
      }

      &.mat-mdc-chip-selected {
        border-color: var(--brand-accent);
        box-shadow: 0 0 8px rgba(0, 188, 212, 0.4);
      }

      .mdc-evolution-chip__text-label {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .mdc-evolution-chip__action--primary {
        padding-left: 12px !important;
      }
    }

    .chart-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
    }

    mat-card-header {
      margin-bottom: 16px;
    }

    .chart-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .timeframe-badge, .exchange-badge {
      font-size: 12px;
      font-weight: 500;
      padding: 4px 10px;
      border-radius: 6px;
      text-transform: uppercase;
    }

    .timeframe-badge {
      background: var(--brand-accent);
      color: var(--bg-primary);
    }

    .exchange-badge {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
    }

    @media (max-width: 768px) {
      .price-history-container {
        padding: 16px;
      }

      .filters-section {
        flex-direction: column;
        gap: 16px;
      }

      .filter-group {
        width: 100%;
      }

      .symbol-selector-btn {
        width: 100%;
        min-width: unset;
      }

      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `],
})
export class PriceHistoryComponent implements OnInit, OnDestroy {
  private dialog = inject(MatDialog);
  private settingsService = inject(SettingsService);
  private priceSocketService = inject(PriceSocketService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  selectedSymbol = signal('BTC/USDT');
  selectedTimeframe = signal<Timeframe>('24h');
  selectedExchange = signal<string | undefined>(undefined);
  currentPrice = signal<number | undefined>(undefined);
  currentChange = signal<number | undefined>(undefined);

  private priceUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private skipNextUrlUpdate = false;

  constructor() {
    // Update URL when filters change
    effect(() => {
      const symbol = this.selectedSymbol();
      const timeframe = this.selectedTimeframe();
      const exchange = this.selectedExchange();

      if (this.skipNextUrlUpdate) {
        this.skipNextUrlUpdate = false;
        return;
      }

      this.updateQueryParams();
    });
  }

  timeframes: TimeframeOption[] = [
    { value: '1h', label: '1H' },
    { value: '6h', label: '6H' },
    { value: '12h', label: '12H' },
    { value: '24h', label: '24H' },
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
    { value: '90d', label: '90D' },
    { value: '180d', label: '180D' },
  ];

  ngOnInit(): void {
    this.settingsService.loadAllSymbols().subscribe();
    this.priceSocketService.connect();

    // Read initial state from query params
    this.loadFromQueryParams();

    this.updateCurrentPrice();

    // Update price every second
    this.priceUpdateInterval = setInterval(() => this.updateCurrentPrice(), 1000);
  }

  private loadFromQueryParams(): void {
    const params = this.route.snapshot.queryParams;

    this.skipNextUrlUpdate = true;

    if (params['symbol']) {
      this.selectedSymbol.set(params['symbol']);
    }
    if (params['timeframe'] && this.isValidTimeframe(params['timeframe'])) {
      this.selectedTimeframe.set(params['timeframe'] as Timeframe);
    }
    if (params['exchange']) {
      this.selectedExchange.set(params['exchange']);
    }
  }

  private isValidTimeframe(value: string): boolean {
    return this.timeframes.some(tf => tf.value === value);
  }

  private updateQueryParams(): void {
    const queryParams: Record<string, string | undefined> = {
      symbol: this.selectedSymbol(),
      timeframe: this.selectedTimeframe(),
      exchange: this.selectedExchange() || undefined,
    };

    // Remove undefined values
    Object.keys(queryParams).forEach(key => {
      if (queryParams[key] === undefined) {
        delete queryParams[key];
      }
    });

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  ngOnDestroy(): void {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
    }
  }

  private updateCurrentPrice(): void {
    const priceData = this.priceSocketService.getPrice(this.selectedSymbol());
    this.currentPrice.set(priceData?.price);
    this.currentChange.set(priceData?.change24h);
  }

  openSymbolSelector(): void {
    const dialogRef = this.dialog.open(SymbolSelectorDialogComponent, {
      panelClass: 'symbol-selector-dialog',
      autoFocus: false,
    });

    dialogRef.afterClosed().subscribe((symbol: string | undefined) => {
      if (symbol) {
        this.selectedSymbol.set(symbol);
        this.updateCurrentPrice();
      }
    });
  }

  onTimeframeChange(timeframe: Timeframe): void {
    this.selectedTimeframe.set(timeframe);
  }

  onExchangeChange(exchange: string | undefined): void {
    this.selectedExchange.set(exchange || undefined);
  }

  getTimeframeLabel(): string {
    const tf = this.timeframes.find(t => t.value === this.selectedTimeframe());
    return tf ? tf.label : '';
  }

  getDisplaySymbol(): string {
    return this.selectedSymbol().replace(/:USDT$/, '');
  }

  getAssetLogo(symbol: string): string {
    if (!symbol) return '';
    // Clean futures symbol suffix before extracting base
    const cleanSymbol = symbol.replace(/:USDT$/, '');
    const base = cleanSymbol.split('/')[0]?.toLowerCase() || '';
    return `/${base}.svg`;
  }

  formatPrice(price: number): string {
    if (price >= 1000) {
      return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (price >= 1) {
      return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    } else {
      return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
    }
  }

  onLogoError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
