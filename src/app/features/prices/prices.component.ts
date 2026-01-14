import { Component, OnInit, OnDestroy, computed, effect, ViewChild, AfterViewInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { RouterLink } from '@angular/router';
import { PriceSocketService, PriceUpdate, ExchangePrice } from '../../core/services/price-socket.service';
import { SettingsService } from '../../core/services/settings.service';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';

interface PriceRow {
  symbol: string;
  asset: string;
  quote: string;
  price: number;
  change24h: number | null;
  high24h?: number;
  low24h?: number;
  source: string;
  lastUpdated: Date;
}

interface ExchangeStat {
  exchange: string;
  label: string;
  count: number;
}

interface AssetStat {
  name: string;
  count: number;
}

interface QuoteStat {
  name: string;
  count: number;
}

@Component({
  selector: 'app-prices',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    DecimalPipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatChipsModule,
    ExchangeLogoComponent
  ],
  template: `
    <div class="prices-content">
      <!-- Connection Status -->
      <div class="indicators-row">
        @if (priceSocket.isConnected()) {
          <div class="realtime-indicator connected">
            <span class="pulse"></span>
            <span>Precios en tiempo real</span>
          </div>
        } @else {
          <div class="realtime-indicator disconnected">
            <mat-icon>wifi_off</mat-icon>
            <span>Conectando...</span>
          </div>
        }

        <div class="exchange-status">
          <span class="status-item" [class.active]="connectionStatus().binance">
            <img src="/binance.svg" alt="Binance" class="exchange-mini">
            Binance
          </span>
          <span class="status-item" [class.active]="connectionStatus().kraken">
            <img src="/kraken.svg" alt="Kraken" class="exchange-mini">
            Kraken
          </span>
        </div>
      </div>


      <!-- Filters -->
      @if (pricesCount() > 0) {
        <div class="filters-container">
          <!-- Exchange Filter -->
          <div class="filter-section">
            <span class="filter-label">Exchange</span>
            <mat-chip-listbox multiple (change)="onExchangeFilterChange($event)" class="exchange-chips">
              @for (ex of exchangeStats; track ex.exchange) {
                <mat-chip-option [value]="ex.exchange" [selected]="selectedExchanges.has(ex.exchange)" class="exchange-chip">
                  <app-exchange-logo [exchange]="ex.exchange" [size]="18"></app-exchange-logo>
                  {{ ex.label }}
                  <span class="chip-count">{{ ex.count }}</span>
                </mat-chip-option>
              }
            </mat-chip-listbox>
          </div>

          <div class="filter-divider"></div>

          <!-- Asset Filter -->
          <div class="filter-section">
            <span class="filter-label">Activos</span>
            <div class="asset-chips-container">
              <mat-chip-listbox multiple (change)="onAssetFilterChange($event)" class="asset-chips">
                @for (asset of assetStats; track asset.name) {
                  <mat-chip-option [value]="asset.name" [selected]="selectedAssets.has(asset.name)" class="asset-chip">
                    <img [src]="getAssetLogo(asset.name)" [alt]="asset.name" class="asset-chip-logo" (error)="onChipLogoError($event, asset.name)">
                    {{ asset.name }}
                  </mat-chip-option>
                }
              </mat-chip-listbox>
            </div>
          </div>

          <div class="filter-divider"></div>

          <!-- Quote Currency Filter -->
          <div class="filter-section">
            <span class="filter-label">Moneda</span>
            <div class="quote-chips-container">
              <mat-chip-listbox multiple (change)="onQuoteFilterChange($event)" class="quote-chips">
                @for (quote of quoteStats; track quote.name) {
                  <mat-chip-option [value]="quote.name" [selected]="selectedQuotes.has(quote.name)" class="quote-chip">
                    <img [src]="getAssetLogo(quote.name)" [alt]="quote.name" class="quote-chip-logo" (error)="onChipLogoError($event, quote.name)">
                    {{ quote.name }}
                  </mat-chip-option>
                }
              </mat-chip-listbox>
            </div>
          </div>

          @if (hasActiveFilters()) {
            <button mat-button class="clear-filters-btn" (click)="clearFilters()">
              <mat-icon>clear</mat-icon>
              Limpiar filtros
            </button>
          }
        </div>
      }

      <!-- Prices Table -->
      <div class="section">
        @if (pricesCount() === 0) {
          <div class="empty-state">
            <mat-icon>show_chart</mat-icon>
            <p>No hay pares de precios configurados</p>
            <a mat-raised-button color="primary" routerLink="/settings/symbols">
              Configurar Pares
            </a>
          </div>
        } @else {
          <div class="table-container">
            <table mat-table [dataSource]="dataSource" matSort>
              <!-- Asset Column -->
              <ng-container matColumnDef="asset">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>Activo</th>
                <td mat-cell *matCellDef="let row">
                  <div class="asset-cell">
                    <div class="pair-logos">
                      <img [src]="getAssetLogo(row.asset)" [alt]="row.asset" class="pair-logo primary" (error)="onLogoError($event, row.asset)">
                      <img [src]="getAssetLogo(row.quote)" [alt]="row.quote" class="pair-logo secondary" (error)="onLogoError($event, row.quote)">
                    </div>
                    <div class="asset-info">
                      <span class="asset-name">{{ row.asset }}</span>
                      <span class="asset-pair">{{ row.symbol }}</span>
                    </div>
                  </div>
                </td>
              </ng-container>

              <!-- Price Column -->
              <ng-container matColumnDef="price">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>Precio</th>
                <td mat-cell *matCellDef="let row">
                  <span class="price-cell">{{ row.price | currency:'USD':'symbol':'1.2-6' }}</span>
                </td>
              </ng-container>

              <!-- 24h Change Column -->
              <ng-container matColumnDef="change24h">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>Cambio 24h</th>
                <td mat-cell *matCellDef="let row">
                  <span class="change-cell" [class.positive]="row.change24h > 0" [class.negative]="row.change24h < 0">
                    @if (row.change24h !== null) {
                      <mat-icon>{{ row.change24h > 0 ? 'arrow_drop_up' : row.change24h < 0 ? 'arrow_drop_down' : 'remove' }}</mat-icon>
                      {{ row.change24h | number:'1.2-2' }}%
                    } @else {
                      <span class="no-data">--</span>
                    }
                  </span>
                </td>
              </ng-container>

              <!-- High/Low Column -->
              <ng-container matColumnDef="range24h">
                <th mat-header-cell *matHeaderCellDef>Rango 24h</th>
                <td mat-cell *matCellDef="let row">
                  <div class="range-cell">
                    @if (row.low24h && row.high24h) {
                      <span class="range-low">{{ row.low24h | currency:'USD':'symbol':'1.2-4' }}</span>
                      <span class="range-separator">-</span>
                      <span class="range-high">{{ row.high24h | currency:'USD':'symbol':'1.2-4' }}</span>
                    } @else {
                      <span class="no-data">--</span>
                    }
                  </div>
                </td>
              </ng-container>

              <!-- Source Column -->
              <ng-container matColumnDef="source">
                <th mat-header-cell *matHeaderCellDef>Fuente</th>
                <td mat-cell *matCellDef="let row">
                  <img [src]="'/' + row.source + '.svg'" [alt]="row.source" class="source-logo" [matTooltip]="row.source | titlecase">
                </td>
              </ng-container>

              <!-- Last Updated Column -->
              <ng-container matColumnDef="lastUpdated">
                <th mat-header-cell *matHeaderCellDef mat-sort-header>Actualizado</th>
                <td mat-cell *matCellDef="let row">
                  <span class="last-updated" [class.stale]="isStale(row.lastUpdated)">
                    {{ formatLastUpdated(row.lastUpdated) }}
                  </span>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
            </table>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .prices-content {
      padding: 24px;
    }

    .indicators-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .realtime-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
    }

    .realtime-indicator.connected {
      background: rgba(14, 203, 129, 0.1);
      color: var(--color-success);
    }

    .realtime-indicator.disconnected {
      background: rgba(255, 152, 0, 0.1);
      color: #ff9800;
    }

    .realtime-indicator mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-success);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }

    .exchange-status {
      display: flex;
      gap: 16px;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-tertiary);
      opacity: 0.5;
    }

    .status-item.active {
      opacity: 1;
      color: var(--text-secondary);
    }

    .exchange-mini {
      width: 16px;
      height: 16px;
    }

    /* Filters */
    .filters-container {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      align-items: flex-start;
      margin-bottom: 24px;
      padding: 16px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
    }

    .filter-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .filter-divider {
      width: 1px;
      align-self: stretch;
      background: var(--border-color);
      margin: 0 8px;
    }

    .filter-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .exchange-chips, .asset-chips, .quote-chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .asset-chips-container, .quote-chips-container {
      max-width: 600px;
      overflow-x: auto;
    }

    ::ng-deep .exchange-chip, ::ng-deep .asset-chip, ::ng-deep .quote-chip {
      --mdc-chip-elevated-container-color: var(--bg-tertiary) !important;
      --mdc-chip-label-text-color: var(--text-primary) !important;
      --mdc-chip-elevated-selected-container-color: var(--bg-tertiary) !important;
      border: 2px solid transparent;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;

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
        border-color: var(--brand-primary) !important;
        box-shadow: 0 0 8px rgba(240, 185, 11, 0.3);
      }

      .mdc-evolution-chip__text-label {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      app-exchange-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: 4px;
      }

      .chip-count {
        font-size: 11px;
        color: var(--text-tertiary);
        margin-left: 4px;
      }

      .asset-chip-logo, .quote-chip-logo {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        object-fit: contain;
        margin-left: 4px;
      }
    }

    .clear-filters-btn {
      color: var(--text-secondary);
      margin-top: auto;
    }

    .section {
      margin-bottom: 32px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .section-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .filter-field {
      width: 200px;
    }

    ::ng-deep .filter-field .mat-mdc-text-field-wrapper {
      padding: 0 12px !important;
    }

    ::ng-deep .filter-field .mat-mdc-form-field-infix {
      padding: 8px 0 !important;
      min-height: 36px !important;
    }

    ::ng-deep .filter-field input {
      font-size: 14px;
    }

    ::ng-deep .filter-field .mat-mdc-form-field-icon-prefix {
      padding-right: 8px;
      color: var(--text-tertiary);
    }

    .empty-state {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 60px;
      text-align: center;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--text-tertiary);
      margin-bottom: 16px;
    }

    .empty-state p {
      color: var(--text-secondary);
      margin-bottom: 24px;
    }

    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
    }

    table {
      width: 100%;
    }

    .asset-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .pair-logos {
      position: relative;
      width: 40px;
      height: 40px;
      flex-shrink: 0;
    }

    .pair-logo {
      border-radius: 50%;
      object-fit: contain;
      position: absolute;
    }

    .pair-logo.primary {
      width: 36px;
      height: 36px;
      left: 0;
      top: 0;
      z-index: 1;
    }

    .pair-logo.secondary {
      width: 18px;
      height: 18px;
      right: -2px;
      bottom: -2px;
      z-index: 2;
      border: 2px solid var(--bg-card);
      background: var(--bg-card);
    }

    .asset-info {
      display: flex;
      flex-direction: column;
    }

    .asset-name {
      font-weight: 600;
      color: var(--text-primary);
    }

    .asset-pair {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .price-cell {
      font-weight: 700;
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
      color: var(--text-primary);
    }

    .change-cell {
      display: flex;
      align-items: center;
      font-weight: 600;
    }

    .change-cell.positive {
      color: var(--color-success);
    }

    .change-cell.negative {
      color: var(--color-error);
    }

    .change-cell mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .range-cell {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    }

    .range-low {
      color: var(--color-error);
    }

    .range-high {
      color: var(--color-success);
    }

    .range-separator {
      color: var(--text-tertiary);
    }

    .source-logo {
      width: 24px;
      height: 24px;
      border-radius: 6px;
    }

    .no-data {
      color: var(--text-tertiary);
    }

    .last-updated {
      font-size: 12px;
      color: var(--color-success);
      font-weight: 500;
    }

    .last-updated.stale {
      color: var(--text-tertiary);
    }
  `]
})
export class PricesComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild(MatSort) sort!: MatSort;

  priceSocket = inject(PriceSocketService);
  private settingsService = inject(SettingsService);

  displayedColumns = ['asset', 'price', 'change24h', 'range24h', 'source', 'lastUpdated'];
  dataSource = new MatTableDataSource<PriceRow>([]);

  connectionStatus = this.priceSocket.connectionStatus;

  // All prices data - merged map to persist prices
  private pricesMap = new Map<string, PriceRow>();
  allPrices: PriceRow[] = [];

  // Filter state
  selectedExchanges = new Set<string>();
  selectedAssets = new Set<string>();
  selectedQuotes = new Set<string>();
  textFilter = '';

  // Stats for filters
  exchangeStats: ExchangeStat[] = [];
  assetStats: AssetStat[] = [];
  quoteStats: QuoteStat[] = [];

  pricesCount = computed(() => this.priceSocket.prices().size);

  constructor() {
    effect(() => {
      const prices = this.priceSocket.prices();
      this.updatePricesData(prices);
    });
  }

  ngOnInit(): void {
    this.priceSocket.connect();
    this.loadConfiguredSymbols();
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
  }

  ngOnDestroy(): void {
    // Don't disconnect - shared service
  }

  private loadConfiguredSymbols(): void {
    this.settingsService.loadAllSymbols().subscribe({
      next: (response) => {
        const allSymbols: string[] = [];
        Object.values(response.symbolsByExchange || {}).forEach(symbols => {
          allSymbols.push(...symbols);
        });
        this.priceSocket.subscribe(allSymbols);
      }
    });
  }

  private updatePricesData(prices: Map<string, PriceUpdate>): void {
    // Merge new prices into existing map (don't remove old ones)
    // Use symbol:exchange as key to show separate rows per exchange
    prices.forEach((price, symbol) => {
      const [asset, quote] = symbol.split('/');

      // If we have multiple exchange prices, expand them into separate rows
      if (price.prices && price.prices.length > 0) {
        price.prices.forEach((exchangePrice) => {
          const key = `${symbol}:${exchangePrice.exchange}`;
          const existingRow = this.pricesMap.get(key);

          const newRow: PriceRow = {
            symbol,
            asset,
            quote,
            price: exchangePrice.price,
            change24h: exchangePrice.change24h ?? existingRow?.change24h ?? null,
            high24h: price.high24h ?? existingRow?.high24h,
            low24h: price.low24h ?? existingRow?.low24h,
            source: exchangePrice.exchange,
            lastUpdated: price.timestamp
          };

          this.pricesMap.set(key, newRow);
        });
      } else {
        // Fallback: single price without exchange breakdown
        const source = price.source || 'binance';
        const key = `${symbol}:${source}`;
        const existingRow = this.pricesMap.get(key);

        const newRow: PriceRow = {
          symbol,
          asset,
          quote,
          price: price.price,
          change24h: price.change24h ?? existingRow?.change24h ?? null,
          high24h: price.high24h ?? existingRow?.high24h,
          low24h: price.low24h ?? existingRow?.low24h,
          source,
          lastUpdated: price.timestamp
        };

        this.pricesMap.set(key, newRow);
      }
    });

    // Convert map to sorted array (sort by asset, then by exchange)
    this.allPrices = Array.from(this.pricesMap.values())
      .sort((a, b) => {
        const assetCompare = a.asset.localeCompare(b.asset);
        if (assetCompare !== 0) return assetCompare;
        return a.source.localeCompare(b.source);
      });

    this.updateFilterStats();
    this.applyFilters();
  }

  private updateFilterStats(): void {
    // Exchange stats
    const exchangeCounts = new Map<string, number>();
    this.allPrices.forEach(p => {
      exchangeCounts.set(p.source, (exchangeCounts.get(p.source) || 0) + 1);
    });

    this.exchangeStats = Array.from(exchangeCounts.entries()).map(([exchange, count]) => ({
      exchange,
      label: this.getExchangeLabel(exchange),
      count
    }));

    // Asset stats
    const assetCounts = new Map<string, number>();
    this.allPrices.forEach(p => {
      assetCounts.set(p.asset, (assetCounts.get(p.asset) || 0) + 1);
    });

    this.assetStats = Array.from(assetCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Quote currency stats
    const quoteCounts = new Map<string, number>();
    this.allPrices.forEach(p => {
      quoteCounts.set(p.quote, (quoteCounts.get(p.quote) || 0) + 1);
    });

    this.quoteStats = Array.from(quoteCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private getExchangeLabel(exchange: string): string {
    const labels: Record<string, string> = {
      'binance': 'Binance',
      'kraken': 'Kraken'
    };
    return labels[exchange] || exchange;
  }

  applyFilters(): void {
    let filtered = [...this.allPrices];

    // Filter by exchange
    if (this.selectedExchanges.size > 0) {
      filtered = filtered.filter(p => this.selectedExchanges.has(p.source));
    }

    // Filter by asset
    if (this.selectedAssets.size > 0) {
      filtered = filtered.filter(p => this.selectedAssets.has(p.asset));
    }

    // Filter by quote currency
    if (this.selectedQuotes.size > 0) {
      filtered = filtered.filter(p => this.selectedQuotes.has(p.quote));
    }

    // Filter by text
    if (this.textFilter) {
      const filter = this.textFilter.toLowerCase();
      filtered = filtered.filter(p =>
        p.asset.toLowerCase().includes(filter) ||
        p.symbol.toLowerCase().includes(filter) ||
        p.quote.toLowerCase().includes(filter)
      );
    }

    this.dataSource.data = filtered;
  }

  applyTextFilter(event: Event): void {
    this.textFilter = (event.target as HTMLInputElement).value.trim();
    this.applyFilters();
  }

  onExchangeFilterChange(event: { value: string[] }): void {
    this.selectedExchanges.clear();
    if (event.value) {
      event.value.forEach(exchange => this.selectedExchanges.add(exchange));
    }
    this.applyFilters();
  }

  onAssetFilterChange(event: { value: string[] }): void {
    this.selectedAssets.clear();
    if (event.value) {
      event.value.forEach(asset => this.selectedAssets.add(asset));
    }
    this.applyFilters();
  }

  onQuoteFilterChange(event: { value: string[] }): void {
    this.selectedQuotes.clear();
    if (event.value) {
      event.value.forEach(quote => this.selectedQuotes.add(quote));
    }
    this.applyFilters();
  }

  hasActiveFilters(): boolean {
    return this.selectedExchanges.size > 0 || this.selectedAssets.size > 0 || this.selectedQuotes.size > 0;
  }

  clearFilters(): void {
    this.selectedExchanges.clear();
    this.selectedAssets.clear();
    this.selectedQuotes.clear();
    this.applyFilters();
  }

  getAssetLogo(asset: string): string {
    let normalized = asset.toLowerCase();
    if (normalized.startsWith('ld') && normalized.length > 2) {
      normalized = normalized.substring(2);
    }
    return `/${normalized}.svg`;
  }

  onLogoError(event: Event, asset: string): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.asset-fallback')) {
      const fallback = document.createElement('div');
      fallback.className = 'asset-fallback';
      fallback.textContent = asset.substring(0, 2);
      fallback.style.cssText = `
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--brand-primary);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 12px;
      `;
      parent.insertBefore(fallback, img);
    }
  }

  onChipLogoError(event: Event, asset: string): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }

  formatLastUpdated(date: Date): string {
    if (!date) return '--';
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const seconds = Math.floor(diff / 1000);

    if (seconds < 5) return 'Ahora';
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    return new Date(date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }

  isStale(date: Date): boolean {
    if (!date) return true;
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    return diff > 60000; // More than 1 minute
  }
}
