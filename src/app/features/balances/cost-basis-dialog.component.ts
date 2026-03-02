import { Component, Inject, OnInit, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PnlService, CostBasisLot } from '../../core/services/pnl.service';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';
import { LogoLoaderComponent } from '../../shared/components/logo-loader/logo-loader.component';

export interface CostBasisDialogData {
  asset: string;
  avgCostPerUnit: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  totalCostBasis: number;
}

@Component({
  selector: 'app-cost-basis-dialog',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    DecimalPipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatPaginatorModule,
    MatTooltipModule,
    ExchangeLogoComponent,
    LogoLoaderComponent,
  ],
  template: `
    <div class="dialog-header">
      <div class="header-left">
        <img [src]="getAssetLogo(data.asset)" [alt]="data.asset" class="asset-logo" (error)="onLogoError($event)">
        <div class="header-text">
          <h2>{{ data.asset }}</h2>
          <span class="subtitle">Detalle de Costo Base</span>
        </div>
      </div>
      <button mat-icon-button (click)="onClose()">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-dialog-content>
      <!-- Summary Cards -->
      <div class="summary-grid">
        <div class="summary-card">
          <span class="card-label">Costo Promedio</span>
          <span class="card-value">{{ data.avgCostPerUnit | currency:'USD':'symbol':'1.2-4' }}</span>
        </div>
        <div class="summary-card">
          <span class="card-label">Precio Actual</span>
          <span class="card-value">{{ data.currentPrice | currency:'USD':'symbol':'1.2-4' }}</span>
        </div>
        <div class="summary-card">
          <span class="card-label">Costo Total</span>
          <span class="card-value">{{ data.totalCostBasis | currency:'USD':'symbol':'1.2-2' }}</span>
        </div>
        <div class="summary-card">
          <span class="card-label">P&L No Realizado</span>
          <span class="card-value" [class.positive]="data.unrealizedPnl >= 0" [class.negative]="data.unrealizedPnl < 0">
            {{ data.unrealizedPnl >= 0 ? '+' : '' }}{{ data.unrealizedPnl | currency:'USD':'symbol':'1.2-2' }}
            <span class="pnl-percent">({{ data.unrealizedPnlPercent >= 0 ? '+' : '' }}{{ data.unrealizedPnlPercent | number:'1.2-2' }}%)</span>
          </span>
        </div>
      </div>

      <!-- Lots Table -->
      @if (loading()) {
        <div class="table-loading">
          <app-logo-loader [size]="60" text="Cargando lotes..."></app-logo-loader>
        </div>
      } @else if (lots().length === 0) {
        <div class="empty-state">
          <mat-icon>inventory_2</mat-icon>
          <p>No hay lotes de costo registrados</p>
        </div>
      } @else {
        <div class="table-container">
          <table mat-table [dataSource]="lots()">
            <!-- Date Column -->
            <ng-container matColumnDef="acquiredAt">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let row">
                <div class="date-cell">
                  <span class="date">{{ formatDate(row.acquiredAt) }}</span>
                  <span class="time">{{ formatTime(row.acquiredAt) }}</span>
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

            <!-- Source Column -->
            <ng-container matColumnDef="source">
              <th mat-header-cell *matHeaderCellDef>Fuente</th>
              <td mat-cell *matCellDef="let row">
                <span class="source-badge" [class]="row.source">
                  {{ getSourceLabel(row.source) }}
                </span>
              </td>
            </ng-container>

            <!-- Amount Column -->
            <ng-container matColumnDef="originalAmount">
              <th mat-header-cell *matHeaderCellDef>Cantidad</th>
              <td mat-cell *matCellDef="let row">
                {{ row.originalAmount | number:'1.2-8' }}
              </td>
            </ng-container>

            <!-- Remaining Amount Column -->
            <ng-container matColumnDef="remainingAmount">
              <th mat-header-cell *matHeaderCellDef>Restante</th>
              <td mat-cell *matCellDef="let row" [class.consumed]="row.remainingAmount === 0">
                <div class="remaining-cell">
                  <span>{{ row.remainingAmount | number:'1.2-8' }}</span>
                  @if (row.remainingAmount === 0) {
                    <mat-icon matTooltip="Lote completamente consumido">check_circle</mat-icon>
                  }
                </div>
              </td>
            </ng-container>

            <!-- Cost Per Unit Column -->
            <ng-container matColumnDef="costPerUnit">
              <th mat-header-cell *matHeaderCellDef>Costo/Unidad</th>
              <td mat-cell *matCellDef="let row">
                {{ row.costPerUnit | currency:'USD':'symbol':'1.2-6' }}
              </td>
            </ng-container>

            <!-- Total Cost Column -->
            <ng-container matColumnDef="totalCost">
              <th mat-header-cell *matHeaderCellDef>Costo Total</th>
              <td mat-cell *matCellDef="let row">
                {{ row.totalCost | currency:'USD':'symbol':'1.2-2' }}
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;" [class.consumed-row]="row.remainingAmount === 0"></tr>
          </table>

          <mat-paginator
            [length]="total()"
            [pageSize]="pageSize"
            [pageIndex]="currentPage() - 1"
            [pageSizeOptions]="[10, 20, 50]"
            (page)="onPageChange($event)"
            showFirstLastButtons>
          </mat-paginator>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onClose()">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px 12px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .asset-logo {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: contain;
    }

    .header-text h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .subtitle {
      font-size: 13px;
      color: var(--text-secondary);
    }

    mat-dialog-content {
      padding: 0 24px;
      max-height: 60vh;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }

    .summary-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .card-label {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .card-value {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .card-value.positive {
      color: var(--color-success);
    }

    .card-value.negative {
      color: var(--color-error);
    }

    .pnl-percent {
      font-size: 12px;
      font-weight: 500;
      opacity: 0.8;
    }

    .table-loading {
      display: flex;
      justify-content: center;
      padding: 40px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px;
      color: var(--text-secondary);
    }

    .empty-state mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
    }

    table {
      width: 100%;
    }

    .date-cell {
      display: flex;
      flex-direction: column;
    }

    .date-cell .date {
      font-weight: 500;
      font-size: 13px;
    }

    .date-cell .time {
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .exchange-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }

    .source-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      text-transform: capitalize;
    }

    .source-badge.trade {
      background: rgba(33, 150, 243, 0.15);
      color: #2196F3;
    }

    .source-badge.deposit {
      background: rgba(76, 175, 80, 0.15);
      color: #4CAF50;
    }

    .source-badge.interest {
      background: rgba(255, 193, 7, 0.15);
      color: #FFC107;
    }

    .remaining-cell {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .remaining-cell mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: var(--color-success);
    }

    .consumed {
      color: var(--text-tertiary);
    }

    .consumed-row {
      opacity: 0.5;
    }

    ::ng-deep .mat-mdc-header-cell {
      background: var(--bg-elevated);
      font-weight: 600;
      font-size: 12px;
      color: var(--text-secondary);
    }

    ::ng-deep .mat-mdc-row:hover {
      background: var(--bg-elevated);
    }

    ::ng-deep .mat-mdc-cell {
      font-size: 13px;
    }
  `],
})
export class CostBasisDialogComponent implements OnInit {
  displayedColumns = ['acquiredAt', 'exchange', 'source', 'originalAmount', 'remainingAmount', 'costPerUnit', 'totalCost'];

  loading = signal(true);
  lots = signal<CostBasisLot[]>([]);
  total = signal(0);
  currentPage = signal(1);
  pageSize = 20;

  constructor(
    private dialogRef: MatDialogRef<CostBasisDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CostBasisDialogData,
    private pnlService: PnlService,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.pnlService.getCostBasisLots({
      page: this.currentPage(),
      limit: this.pageSize,
      assets: [this.data.asset],
      showEmpty: true,
    }).subscribe({
      next: (response) => {
        this.lots.set(response.data);
        this.total.set(response.total);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading cost basis lots:', err);
        this.loading.set(false);
      },
    });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.pageSize = event.pageSize;
    this.loadData();
  }

  onClose(): void {
    this.dialogRef.close();
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
    let normalized = asset.toLowerCase();
    if (normalized.startsWith('ld') && normalized.length > 2) {
      normalized = normalized.substring(2);
    }
    return `/${normalized}.svg`;
  }

  onLogoError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.asset-fallback')) {
      const fallback = document.createElement('div');
      fallback.className = 'asset-fallback';
      fallback.textContent = this.data.asset.substring(0, 2).toUpperCase();
      fallback.style.cssText = 'width: 40px; height: 40px; border-radius: 50%; background: var(--brand-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px;';
      parent.insertBefore(fallback, img);
    }
  }

  getExchangeLabel(exchange: string): string {
    const labels: Record<string, string> = {
      binance: 'Binance',
      'binance-futures': 'Binance Futures',
      kraken: 'Kraken',
      nexo: 'Nexo',
      'nexo-pro': 'Nexo Pro',
      'nexo-manual': 'Nexo',
      bitso: 'Bitso',
    };
    return labels[exchange] || exchange;
  }

  getSourceLabel(source: string): string {
    const labels: Record<string, string> = {
      trade: 'Trade',
      deposit: 'Deposito',
      interest: 'Interes',
    };
    return labels[source] || source;
  }
}
