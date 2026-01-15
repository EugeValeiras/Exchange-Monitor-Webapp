import { Component, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  TransactionsService,
  Transaction,
  TransactionStats,
  TransactionFilter,
  TransactionType,
  ExchangeType
} from '../../core/services/transactions.service';
import { PnlService, PnlSummaryResponse } from '../../core/services/pnl.service';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';
import { LogoLoaderComponent } from '../../shared/components/logo-loader/logo-loader.component';

interface ExchangeStat {
  exchange: string;
  count: number;
  label: string;
}

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTooltipModule,
    ExchangeLogoComponent,
    LogoLoaderComponent
  ],
  template: `
    <div class="transactions-container">
      <div class="page-header">
        <div class="header-content">
          <h1>Transacciones</h1>
          <p>Historial de todas tus operaciones en exchanges</p>
        </div>
        <div class="header-actions">
          <mat-form-field appearance="outline" class="date-range-field">
            <mat-date-range-input [rangePicker]="rangePicker">
              <input matStartDate [(ngModel)]="startDate" placeholder="Desde" (dateChange)="onDateChange()">
              <input matEndDate [(ngModel)]="endDate" placeholder="Hasta" (dateChange)="onDateChange()">
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="rangePicker"></mat-datepicker-toggle>
            <mat-date-range-picker #rangePicker></mat-date-range-picker>
          </mat-form-field>
          <button
            mat-stroked-button
            class="recalculate-btn"
            (click)="recalculatePnl()"
            [disabled]="recalculating"
            matTooltip="Recalcular P&L desde el historial de transacciones (FIFO)">
            <mat-icon [class.spinning]="recalculating">{{ recalculating ? 'sync' : 'refresh' }}</mat-icon>
            {{ recalculating ? 'Recalculando...' : 'Recalcular P&L' }}
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="stats-grid" [class.filtered]="hasActiveFilters()" [class.single]="hasActiveFilters() && selectedTypes.size > 0 && !selectedTypes.has('interest')">
        <!-- Total Transactions Card -->
        <div class="stat-card">
          <div class="stat-icon total" [class.skeleton-icon]="loading">
            @if (loading) {
              <div class="skeleton-pulse icon-pulse"></div>
            } @else {
              <mat-icon>receipt_long</mat-icon>
            }
          </div>
          <div class="stat-info">
            @if (loading) {
              <span class="skeleton-value skeleton-pulse"></span>
              <span class="skeleton-label skeleton-pulse"></span>
            } @else {
              <span class="stat-value">{{ stats?.totalTransactions | number }}</span>
              <span class="stat-label">Total Transacciones</span>
            }
          </div>
        </div>

        <!-- Interest Card -->
        @if (selectedTypes.size === 0 || selectedTypes.has('interest')) {
          <div class="stat-card interest-card">
            <div class="stat-icon interest" [class.skeleton-icon]="loading">
              @if (loading) {
                <div class="skeleton-pulse icon-pulse"></div>
              } @else {
                <mat-icon>percent</mat-icon>
              }
            </div>
            <div class="stat-info">
              @if (loading) {
                <span class="skeleton-value skeleton-pulse"></span>
                <span class="skeleton-label skeleton-pulse"></span>
              } @else {
                <span class="stat-value">{{ stats?.totalInterestUsd | currency:'USD':'symbol':'1.2-2' }}</span>
                <span class="stat-label">Intereses Ganados</span>
              }
            </div>
          </div>
        }

        <!-- P&L Cards (only when no filters) -->
        @if (!hasActiveFilters()) {
          <div class="stat-card pnl-card" [class.positive]="pnlSummary && pnlSummary.totalPnl >= 0" [class.negative]="pnlSummary && pnlSummary.totalPnl < 0">
            <div class="stat-icon pnl" [class.skeleton-icon]="loading" [class.positive]="!loading && pnlSummary && pnlSummary.totalPnl >= 0" [class.negative]="!loading && pnlSummary && pnlSummary.totalPnl < 0">
              @if (loading) {
                <div class="skeleton-pulse icon-pulse"></div>
              } @else {
                <mat-icon>{{ pnlSummary && pnlSummary.totalPnl >= 0 ? 'trending_up' : 'trending_down' }}</mat-icon>
              }
            </div>
            <div class="stat-info">
              @if (loading || pnlLoading) {
                <span class="skeleton-value skeleton-pulse"></span>
                <span class="skeleton-label skeleton-pulse"></span>
              } @else if (pnlSummary) {
                <span class="stat-value" [class.positive]="pnlSummary.totalPnl >= 0" [class.negative]="pnlSummary.totalPnl < 0">
                  {{ pnlSummary.totalPnl >= 0 ? '+' : '' }}{{ pnlSummary.totalPnl | currency:'USD':'symbol':'1.2-2' }}
                </span>
                <span class="stat-label">P&L Total</span>
              } @else {
                <span class="stat-value">$0.00</span>
                <span class="stat-label">P&L Total</span>
              }
            </div>
          </div>

        }
      </div>

      <!-- Filters -->
      <div class="filters-wrapper">
        <!-- Skeleton Filters (only on initial load) -->
        <div class="filters-container filters-skeleton" [class.hidden]="!initialLoading">
          <div class="filter-section">
            <span class="filter-label">Tipo</span>
            <div class="skeleton-chips">
              @for (i of [1, 2, 3, 4]; track i) {
                <div class="skeleton-chip skeleton-pulse"></div>
              }
            </div>
          </div>
          <div class="filter-section">
            <span class="filter-label">Exchange</span>
            <div class="skeleton-chips">
              @for (i of [1, 2]; track i) {
                <div class="skeleton-chip skeleton-pulse"></div>
              }
            </div>
          </div>
          <div class="filter-section assets-section">
            <span class="filter-label">Assets</span>
            <div class="skeleton-chips">
              @for (i of [1, 2, 3, 4, 5]; track i) {
                <div class="skeleton-chip skeleton-pulse"></div>
              }
            </div>
          </div>
        </div>
        <!-- Real Filters (shown after initial load) -->
        <div class="filters-container filters-real" [class.hidden]="initialLoading">
          <div class="filter-section">
            <span class="filter-label">Tipo</span>
            <div class="type-chips-container">
              <mat-chip-listbox multiple (change)="onTypeFilterChange($event)" class="type-chips type-chips-row">
                <mat-chip-option value="deposit" [selected]="selectedTypes.has('deposit')" class="type-chip deposit">
                  <mat-icon>arrow_downward</mat-icon>
                  Depósito
                </mat-chip-option>
                <mat-chip-option value="withdrawal" [selected]="selectedTypes.has('withdrawal')" class="type-chip withdrawal">
                  <mat-icon>arrow_upward</mat-icon>
                  Retiro
                </mat-chip-option>
                <mat-chip-option value="trade" [selected]="selectedTypes.has('trade')" class="type-chip trade">
                  <mat-icon>swap_horiz</mat-icon>
                  Trade
                </mat-chip-option>
              </mat-chip-listbox>
              <mat-chip-listbox multiple (change)="onTypeFilterChange($event)" class="type-chips type-chips-row">
                <mat-chip-option value="interest" [selected]="selectedTypes.has('interest')" class="type-chip interest">
                  <mat-icon>percent</mat-icon>
                  Interés
                </mat-chip-option>
                <mat-chip-option value="fee" [selected]="selectedTypes.has('fee')" class="type-chip fee">
                  <mat-icon>toll</mat-icon>
                  Comisión
                </mat-chip-option>
              </mat-chip-listbox>
            </div>
          </div>

          @if (exchangeStats.length > 0) {
            <div class="filter-section">
              <span class="filter-label">Exchange</span>
              <mat-chip-listbox multiple (change)="onExchangeFilterChange($event)" class="exchange-chips">
                @for (ex of exchangeStats; track ex.exchange) {
                  <mat-chip-option [value]="ex.exchange" [selected]="selectedExchanges.has(ex.exchange)" class="exchange-chip">
                    <app-exchange-logo [exchange]="ex.exchange" [size]="18"></app-exchange-logo>
                    {{ ex.label }}
                    <span class="exchange-count">{{ ex.count }}</span>
                  </mat-chip-option>
                }
              </mat-chip-listbox>
            </div>
          }

          <div class="filter-section assets-section">
            <span class="filter-label">Assets</span>
            <div class="asset-chips-container" [class.expanded]="assetsExpanded">
              <mat-chip-listbox multiple (change)="onAssetFilterChange($event)" class="asset-chips">
                @for (asset of visibleAssets; track asset.name) {
                  <mat-chip-option [value]="asset.name" [selected]="selectedAssets.has(asset.name)" class="asset-chip">
                    <img [src]="getAssetLogo(asset.name)" [alt]="asset.name" class="asset-chip-logo" (error)="onAssetLogoError($event, asset.name)">
                    {{ asset.name }}
                    <span class="asset-count">{{ asset.count }}</span>
                  </mat-chip-option>
                }
              </mat-chip-listbox>
              @if (hiddenAssetsCount > 0) {
                <button class="show-more-assets" (click)="toggleAssetsExpanded()">
                  @if (assetsExpanded) {
                    <mat-icon>expand_less</mat-icon>
                    Menos
                  } @else {
                    <mat-icon>expand_more</mat-icon>
                    +{{ hiddenAssetsCount }}
                  }
                </button>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Table -->
      @if (loading) {
        <div class="table-container table-loading">
          <app-logo-loader [size]="100" text="Cargando transacciones..."></app-logo-loader>
        </div>
      } @else if (transactions.length === 0) {
        <div class="empty-container">
          <div class="empty-icon">
            <mat-icon>receipt_long</mat-icon>
          </div>
          <h2>No hay transacciones</h2>
          <p>Las transacciones aparecerán aquí cuando sincronices tus exchanges</p>
        </div>
      } @else {
        <div class="table-container">
          <table mat-table [dataSource]="transactions" class="transactions-table">
            <!-- Date Column -->
            <ng-container matColumnDef="timestamp">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let tx">
                <div class="date-cell">
                  <span class="date">{{ formatDate(tx.timestamp) }}</span>
                  <span class="time">{{ formatTime(tx.timestamp) }}</span>
                </div>
              </td>
            </ng-container>

            <!-- Exchange Column -->
            <ng-container matColumnDef="exchange">
              <th mat-header-cell *matHeaderCellDef>Exchange</th>
              <td mat-cell *matCellDef="let tx">
                <div class="exchange-cell">
                  <app-exchange-logo [exchange]="tx.exchange" [size]="24"></app-exchange-logo>
                  <span>{{ getExchangeLabel(tx.exchange) }}</span>
                </div>
              </td>
            </ng-container>

            <!-- Type Column -->
            <ng-container matColumnDef="type">
              <th mat-header-cell *matHeaderCellDef>Tipo</th>
              <td mat-cell *matCellDef="let tx">
                <div class="type-badge" [class]="tx.type">
                  <mat-icon>{{ getTypeIcon(tx.type) }}</mat-icon>
                  {{ getTypeLabel(tx.type) }}
                </div>
              </td>
            </ng-container>

            <!-- Asset Column -->
            <ng-container matColumnDef="asset">
              <th mat-header-cell *matHeaderCellDef>Asset</th>
              <td mat-cell *matCellDef="let tx">
                <div class="asset-cell">
                  @if (tx.type === 'trade' && tx.pair) {
                    <div class="pair-logos">
                      <img
                        [src]="getAssetLogo(tx.asset)"
                        [alt]="tx.asset"
                        class="pair-logo primary"
                        (error)="onAssetLogoError($event, tx.asset)">
                      <img
                        [src]="getAssetLogo(getQuoteAsset(tx.pair))"
                        [alt]="getQuoteAsset(tx.pair)"
                        class="pair-logo secondary"
                        (error)="onAssetLogoError($event, getQuoteAsset(tx.pair))">
                    </div>
                  } @else {
                    <img
                      [src]="getAssetLogo(tx.asset)"
                      [alt]="tx.asset"
                      class="asset-logo"
                      (error)="onAssetLogoError($event, tx.asset)">
                  }
                  <div class="asset-info">
                    <span class="asset-name">{{ tx.asset }}</span>
                    @if (tx.pair) {
                      <span class="pair-info">{{ tx.pair }}</span>
                    }
                  </div>
                </div>
              </td>
            </ng-container>

            <!-- Amount Column -->
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef>Cantidad</th>
              <td mat-cell *matCellDef="let tx">
                <div class="amount-cell" [class.buy]="tx.side === 'buy' || tx.type === 'deposit' || tx.type === 'interest'" [class.sell]="tx.side === 'sell' || tx.type === 'withdrawal' || tx.type === 'fee'">
                  <span class="amount">
                    {{ tx.side === 'sell' || tx.type === 'withdrawal' || tx.type === 'fee' ? '-' : '+' }}{{ tx.amount | number:'1.2-8' }}
                  </span>
                  <span class="asset">{{ tx.asset }}</span>
                </div>
              </td>
            </ng-container>

            <!-- Price Column -->
            <ng-container matColumnDef="price">
              <th mat-header-cell *matHeaderCellDef>Precio</th>
              <td mat-cell *matCellDef="let tx">
                @if (tx.price) {
                  <div class="price-cell">
                    <span class="price">{{ tx.price | number:'1.2-8' }}</span>
                    <span class="price-asset">{{ tx.priceAsset }}</span>
                  </div>
                } @else {
                  <span class="no-price">-</span>
                }
              </td>
            </ng-container>

            <!-- Fee Column -->
            <ng-container matColumnDef="fee">
              <th mat-header-cell *matHeaderCellDef>Fee</th>
              <td mat-cell *matCellDef="let tx">
                @if (tx.fee) {
                  <div class="fee-cell">
                    <span class="fee-amount">{{ tx.fee | number:'1.2-8' }}</span>
                    <img
                      [src]="getAssetLogo(tx.feeAsset)"
                      [alt]="tx.feeAsset"
                      class="fee-asset-logo"
                      (error)="onAssetLogoError($event, tx.feeAsset)"
                      [matTooltip]="tx.feeAsset">
                  </div>
                } @else {
                  <span class="no-fee">-</span>
                }
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>

          <mat-paginator
            [length]="totalItems"
            [pageSize]="pageSize"
            [pageIndex]="currentPage - 1"
            [pageSizeOptions]="[10, 20, 50, 100]"
            (page)="onPageChange($event)"
            showFirstLastButtons>
          </mat-paginator>
        </div>
      }
    </div>
  `,
  styleUrl: './transactions.component.scss'
})
export class TransactionsComponent implements OnInit {
  transactions: Transaction[] = [];
  stats: TransactionStats | null = null;
  loading = true;
  initialLoading = true;

  // PNL data
  pnlSummary: PnlSummaryResponse | null = null;
  pnlLoading = true;
  recalculating = false;

  displayedColumns = ['timestamp', 'exchange', 'type', 'asset', 'amount', 'price', 'fee'];

  // Pagination
  totalItems = 0;
  currentPage = 1;
  pageSize = 20;

  // Filters
  filter: TransactionFilter = {};
  startDate: Date | null = null;
  endDate: Date | null = null;
  selectedTypes = new Set<string>();
  selectedAssets = new Set<string>();
  assetList: { name: string; count: number }[] = [];
  assetsExpanded = false;
  readonly maxVisibleAssets = 9;

  // Exchange filtering
  selectedExchanges = new Set<string>();
  exchangeStats: ExchangeStat[] = [];

  constructor(
    private transactionsService: TransactionsService,
    private pnlService: PnlService
  ) {}

  ngOnInit(): void {
    this.initialLoading = true;
    this.loadStats();
    this.loadTransactions();
    this.loadPnlSummary();
  }

  loadPnlSummary(): void {
    this.pnlLoading = true;
    this.pnlService.getSummary().subscribe({
      next: (data) => {
        this.pnlSummary = data;
        this.pnlLoading = false;
      },
      error: (err) => {
        console.error('Error loading PNL summary:', err);
        this.pnlLoading = false;
      }
    });
  }

  recalculatePnl(): void {
    this.recalculating = true;
    this.pnlService.recalculate().subscribe({
      next: (result) => {
        console.log('PNL recalculation complete:', result.message);
        this.recalculating = false;
        // Reload PNL summary after recalculation
        this.loadPnlSummary();
      },
      error: (err) => {
        console.error('Error recalculating PNL:', err);
        this.recalculating = false;
      }
    });
  }

  loadStats(): void {
    // Build filter for stats
    const statsFilter: {
      exchange?: string;
      startDate?: string;
      endDate?: string;
      types?: string[];
      assets?: string[];
    } = {};

    if (this.selectedExchanges.size === 1) {
      statsFilter.exchange = Array.from(this.selectedExchanges)[0];
    }
    if (this.startDate) {
      statsFilter.startDate = this.formatDateForApi(this.startDate);
    }
    if (this.endDate) {
      statsFilter.endDate = this.formatDateForApi(this.endDate);
    }
    if (this.selectedTypes.size > 0) {
      statsFilter.types = Array.from(this.selectedTypes);
    }
    if (this.selectedAssets.size > 0) {
      statsFilter.assets = Array.from(this.selectedAssets);
    }

    this.transactionsService.getStats(statsFilter).subscribe({
      next: (stats) => {
        this.stats = stats;
        // Only build filter lists on initial load
        if (this.initialLoading) {
          this.buildExchangeStats();
          this.buildAssetList();
          this.initialLoading = false;
        }
      },
      error: (err) => {
        console.error('Error loading stats:', err);
        this.initialLoading = false;
      }
    });
  }

  private buildAssetList(): void {
    if (!this.stats?.byAsset) return;

    this.assetList = Object.entries(this.stats.byAsset)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  private buildExchangeStats(): void {
    if (!this.stats?.byExchange) return;

    this.exchangeStats = Object.entries(this.stats.byExchange).map(([exchange, count]) => ({
      exchange,
      count,
      label: this.getExchangeLabel(exchange),
    }));
  }

  loadTransactions(): void {
    this.loading = true;
    const params: TransactionFilter = {
      ...this.filter,
      page: this.currentPage,
      limit: this.pageSize
    };

    this.transactionsService.getTransactions(params).subscribe({
      next: (response) => {
        this.transactions = response.data;
        this.totalItems = response.total;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading transactions:', err);
        this.loading = false;
      }
    });
  }

  applyFilters(): void {
    this.currentPage = 1;

    // Handle type filtering
    if (this.selectedTypes.size > 0) {
      this.filter.types = Array.from(this.selectedTypes) as TransactionType[];
      delete this.filter.type;
    } else {
      delete this.filter.types;
      delete this.filter.type;
    }

    // Handle asset filtering
    if (this.selectedAssets.size > 0) {
      this.filter.assets = Array.from(this.selectedAssets);
      delete this.filter.asset;
    } else {
      delete this.filter.assets;
      delete this.filter.asset;
    }

    // Handle exchange filtering based on selected exchanges (include mode)
    if (this.selectedExchanges.size > 0) {
      // If only one exchange selected, filter by that one
      if (this.selectedExchanges.size === 1) {
        this.filter.exchange = Array.from(this.selectedExchanges)[0] as ExchangeType;
      } else {
        // Multiple exchanges selected - for now just use the first one
        // TODO: Backend should support multiple exchanges filter
        delete this.filter.exchange;
      }
    } else {
      delete this.filter.exchange;
    }

    this.loadStats();
    this.loadTransactions();
  }

  clearFilters(): void {
    this.filter = {};
    this.startDate = null;
    this.endDate = null;
    this.selectedTypes.clear();
    this.selectedAssets.clear();
    this.selectedExchanges.clear();
    this.currentPage = 1;
    this.loadStats();
    this.loadTransactions();
  }

  hasActiveFilters(): boolean {
    return this.selectedTypes.size > 0 ||
      this.selectedAssets.size > 0 ||
      !!this.startDate ||
      !!this.endDate ||
      this.selectedExchanges.size > 0;
  }

  onTypeFilterChange(event: { value: string[] }): void {
    this.selectedTypes.clear();
    if (event.value) {
      event.value.forEach(type => this.selectedTypes.add(type));
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

  get visibleAssets(): { name: string; count: number }[] {
    if (this.assetsExpanded) {
      return this.assetList;
    }
    return this.assetList.slice(0, this.maxVisibleAssets);
  }

  get hiddenAssetsCount(): number {
    return Math.max(0, this.assetList.length - this.maxVisibleAssets);
  }

  toggleAssetsExpanded(): void {
    this.assetsExpanded = !this.assetsExpanded;
  }

  onExchangeFilterChange(event: { value: string[] }): void {
    this.selectedExchanges.clear();
    if (event.value) {
      event.value.forEach(exchange => this.selectedExchanges.add(exchange));
    }
    this.applyFilters();
  }

  onDateChange(): void {
    this.filter.startDate = this.startDate ? this.formatDateForApi(this.startDate) : undefined;
    this.filter.endDate = this.endDate ? this.formatDateForApi(this.endDate) : undefined;
    this.applyFilters();
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadTransactions();
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDateForApi(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  getTypeLabel(type: TransactionType): string {
    return this.transactionsService.getTypeLabel(type);
  }

  getTypeIcon(type: TransactionType): string {
    return this.transactionsService.getTypeIcon(type);
  }

  getExchangeLabel(exchange: string): string {
    return this.transactionsService.getExchangeLabel(exchange);
  }

  getAssetLogo(asset: string): string {
    if (!asset) return '';
    let normalized = asset.toLowerCase();
    // Handle Binance locked staking assets (e.g., LDBTC -> btc)
    if (normalized.startsWith('ld') && normalized.length > 2) {
      normalized = normalized.substring(2);
    }
    return `/${normalized}.svg`;
  }

  getQuoteAsset(pair: string): string {
    if (!pair) return '';
    const parts = pair.split('/');
    return parts.length > 1 ? parts[1] : '';
  }

  onAssetLogoError(event: Event, asset: string): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.asset-fallback')) {
      const fallback = document.createElement('div');
      fallback.className = 'asset-fallback';
      fallback.textContent = asset.substring(0, 2).toUpperCase();
      parent.insertBefore(fallback, img);
    }
  }
}
