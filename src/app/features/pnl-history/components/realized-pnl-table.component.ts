import { Component, Input, OnInit, OnChanges, SimpleChanges, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  PnlService,
  RealizedPnlItem,
  PaginatedRealizedPnl,
} from '../../../core/services/pnl.service';
import { ExchangeLogoComponent } from '../../../shared/components/exchange-logo/exchange-logo.component';
import { LogoLoaderComponent } from '../../../shared/components/logo-loader/logo-loader.component';

@Component({
  selector: 'app-realized-pnl-table',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    DecimalPipe,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatTooltipModule,
    ExchangeLogoComponent,
    LogoLoaderComponent,
  ],
  template: `
    @if (loading()) {
      <div class="table-loading">
        <app-logo-loader [size]="80" text="Cargando P&L realizado..."></app-logo-loader>
      </div>
    } @else if (data().length === 0) {
      <div class="empty-state">
        <mat-icon>trending_up</mat-icon>
        <h3>Sin P&L Realizado</h3>
        <p>No hay operaciones de venta registradas</p>
      </div>
    } @else {
      <div class="table-container">
        <table mat-table [dataSource]="data()" class="realized-table">
          <!-- Date Column -->
          <ng-container matColumnDef="realizedAt">
            <th mat-header-cell *matHeaderCellDef>Fecha</th>
            <td mat-cell *matCellDef="let row">
              <div class="date-cell">
                <span class="date">{{ formatDate(row.realizedAt) }}</span>
                <span class="time">{{ formatTime(row.realizedAt) }}</span>
              </div>
            </td>
          </ng-container>

          <!-- Asset Column -->
          <ng-container matColumnDef="asset">
            <th mat-header-cell *matHeaderCellDef>Asset</th>
            <td mat-cell *matCellDef="let row">
              <div class="asset-cell">
                <img [src]="getAssetLogo(row.asset)" [alt]="row.asset" class="asset-logo" (error)="onLogoError($event, row.asset)">
                <span>{{ row.asset }}</span>
              </div>
            </td>
          </ng-container>

          <!-- Exchange Column -->
          <ng-container matColumnDef="exchange">
            <th mat-header-cell *matHeaderCellDef>Exchange</th>
            <td mat-cell *matCellDef="let row">
              <div class="exchange-cell">
                <app-exchange-logo [exchange]="row.exchange" [size]="20"></app-exchange-logo>
                <span>{{ getExchangeLabel(row.exchange) }}</span>
              </div>
            </td>
          </ng-container>

          <!-- Amount Column -->
          <ng-container matColumnDef="amount">
            <th mat-header-cell *matHeaderCellDef>Cantidad</th>
            <td mat-cell *matCellDef="let row">
              {{ row.amount | number:'1.2-8' }}
            </td>
          </ng-container>

          <!-- Buy Price Column -->
          <ng-container matColumnDef="buyPrice">
            <th mat-header-cell *matHeaderCellDef>Precio Compra</th>
            <td mat-cell *matCellDef="let row">
              {{ row.buyPrice | currency:'USD':'symbol':'1.2-4' }}
            </td>
          </ng-container>

          <!-- Sell Price Column -->
          <ng-container matColumnDef="sellPrice">
            <th mat-header-cell *matHeaderCellDef>Precio Venta</th>
            <td mat-cell *matCellDef="let row">
              {{ row.sellPrice | currency:'USD':'symbol':'1.2-4' }}
            </td>
          </ng-container>

          <!-- P&L Column -->
          <ng-container matColumnDef="realizedPnl">
            <th mat-header-cell *matHeaderCellDef>P&L</th>
            <td mat-cell *matCellDef="let row" [class.positive]="row.realizedPnl >= 0" [class.negative]="row.realizedPnl < 0">
              <div class="pnl-cell">
                <span class="pnl-value">{{ row.realizedPnl >= 0 ? '+' : '' }}{{ row.realizedPnl | currency:'USD':'symbol':'1.2-2' }}</span>
                <span class="pnl-percent" [class.positive]="row.pnlPercent >= 0" [class.negative]="row.pnlPercent < 0">
                  ({{ row.pnlPercent >= 0 ? '+' : '' }}{{ row.pnlPercent | number:'1.1-1' }}%)
                </span>
              </div>
            </td>
          </ng-container>

          <!-- Holding Period Column -->
          <ng-container matColumnDef="holdingPeriod">
            <th mat-header-cell *matHeaderCellDef>Holding</th>
            <td mat-cell *matCellDef="let row">
              <span class="holding-period">{{ row.holdingPeriod }}</span>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>

        <mat-paginator
          [length]="total()"
          [pageSize]="pageSize"
          [pageIndex]="currentPage() - 1"
          [pageSizeOptions]="[10, 20, 50, 100]"
          (page)="onPageChange($event)"
          showFirstLastButtons>
        </mat-paginator>
      </div>
    }
  `,
  styles: [`
    .table-loading {
      display: flex;
      justify-content: center;
      padding: 48px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      color: var(--text-secondary);
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-state h3 {
      margin: 0 0 8px;
      font-size: 18px;
    }

    .empty-state p {
      margin: 0;
      font-size: 14px;
      opacity: 0.7;
    }

    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
    }

    .realized-table {
      width: 100%;
    }

    .date-cell {
      display: flex;
      flex-direction: column;
    }

    .date-cell .date {
      font-weight: 500;
    }

    .date-cell .time {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .asset-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .asset-logo {
      width: 24px;
      height: 24px;
      border-radius: 50%;
    }

    .exchange-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pnl-cell {
      display: flex;
      flex-direction: column;
    }

    .pnl-value {
      font-weight: 600;
      font-family: 'SF Mono', monospace;
    }

    .pnl-percent {
      font-size: 12px;
      font-family: 'SF Mono', monospace;
    }

    .positive {
      color: var(--color-success) !important;
    }

    .negative {
      color: var(--color-error) !important;
    }

    .holding-period {
      font-size: 13px;
      color: var(--text-secondary);
    }

    /* Table styling */
    ::ng-deep .mat-mdc-header-cell {
      background: var(--bg-elevated);
      font-weight: 600;
      color: var(--text-secondary);
    }

    ::ng-deep .mat-mdc-row:hover {
      background: var(--bg-elevated);
    }
  `],
})
export class RealizedPnlTableComponent implements OnInit, OnChanges {
  @Input() startDate?: string;
  @Input() endDate?: string;
  @Input() assets: string[] = [];
  @Input() exchanges: string[] = [];

  displayedColumns = ['realizedAt', 'asset', 'exchange', 'amount', 'buyPrice', 'sellPrice', 'realizedPnl', 'holdingPeriod'];

  loading = signal(true);
  data = signal<RealizedPnlItem[]>([]);
  total = signal(0);
  currentPage = signal(1);
  pageSize = 20;

  constructor(private pnlService: PnlService) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['startDate'] || changes['endDate'] || changes['assets'] || changes['exchanges']) {
      this.currentPage.set(1);
      this.loadData();
    }
  }

  loadData(): void {
    this.loading.set(true);
    this.pnlService.getRealizedPnlPaginated({
      page: this.currentPage(),
      limit: this.pageSize,
      startDate: this.startDate,
      endDate: this.endDate,
      assets: this.assets.length > 0 ? this.assets : undefined,
      exchanges: this.exchanges.length > 0 ? this.exchanges : undefined,
    }).subscribe({
      next: (response) => {
        this.data.set(response.data);
        this.total.set(response.total);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading realized PNL:', err);
        this.loading.set(false);
      },
    });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.pageSize = event.pageSize;
    this.loadData();
  }

  formatDate(dateString: string | Date): string {
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  formatTime(dateString: string | Date): string {
    return new Date(dateString).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getAssetLogo(asset: string): string {
    if (!asset) return '';
    let normalized = asset.toLowerCase();
    if (normalized.startsWith('ld') && normalized.length > 2) {
      normalized = normalized.substring(2);
    }
    return `/${normalized}.svg`;
  }

  getExchangeLabel(exchange: string): string {
    const labels: Record<string, string> = {
      binance: 'Binance',
      kraken: 'Kraken',
      nexo: 'Nexo',
      bitso: 'Bitso',
    };
    return labels[exchange] || exchange;
  }

  onLogoError(event: Event, asset: string): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.asset-fallback')) {
      const fallback = document.createElement('div');
      fallback.className = 'asset-fallback';
      fallback.textContent = asset.substring(0, 2).toUpperCase();
      fallback.style.cssText = 'width: 24px; height: 24px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600;';
      parent.insertBefore(fallback, img);
    }
  }
}
