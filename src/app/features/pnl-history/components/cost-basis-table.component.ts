import { Component, Input, OnInit, OnChanges, SimpleChanges, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  PnlService,
  CostBasisLot,
  PaginatedCostBasisLots,
} from '../../../core/services/pnl.service';
import { ExchangeLogoComponent } from '../../../shared/components/exchange-logo/exchange-logo.component';
import { LogoLoaderComponent } from '../../../shared/components/logo-loader/logo-loader.component';

@Component({
  selector: 'app-cost-basis-table',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    DecimalPipe,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatTooltipModule,
    MatCheckboxModule,
    ExchangeLogoComponent,
    LogoLoaderComponent,
  ],
  template: `
    <div class="table-controls">
      <mat-checkbox [(ngModel)]="showEmpty" (change)="onShowEmptyChange()">
        Mostrar lotes consumidos
      </mat-checkbox>
    </div>

    @if (loading()) {
      <div class="table-loading">
        <app-logo-loader [size]="80" text="Cargando lotes de costo..."></app-logo-loader>
      </div>
    } @else if (data().length === 0) {
      <div class="empty-state">
        <mat-icon>inventory_2</mat-icon>
        <h3>Sin Lotes de Costo</h3>
        <p>No hay lotes de compra registrados</p>
      </div>
    } @else {
      <div class="table-container">
        <table mat-table [dataSource]="data()" class="lots-table">
          <!-- Date Column -->
          <ng-container matColumnDef="acquiredAt">
            <th mat-header-cell *matHeaderCellDef>Fecha Adquisición</th>
            <td mat-cell *matCellDef="let row">
              <div class="date-cell">
                <span class="date">{{ formatDate(row.acquiredAt) }}</span>
                <span class="time">{{ formatTime(row.acquiredAt) }}</span>
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

          <!-- Source Column -->
          <ng-container matColumnDef="source">
            <th mat-header-cell *matHeaderCellDef>Fuente</th>
            <td mat-cell *matCellDef="let row">
              <span class="source-badge" [class]="row.source">
                {{ getSourceLabel(row.source) }}
              </span>
            </td>
          </ng-container>

          <!-- Original Amount Column -->
          <ng-container matColumnDef="originalAmount">
            <th mat-header-cell *matHeaderCellDef>Cantidad Original</th>
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
          [pageSizeOptions]="[10, 20, 50, 100]"
          (page)="onPageChange($event)"
          showFirstLastButtons>
        </mat-paginator>
      </div>
    }
  `,
  styles: [`
    .table-controls {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 16px;
    }

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

    .lots-table {
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

    .source-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
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
      gap: 6px;
    }

    .remaining-cell mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--color-success);
    }

    .consumed {
      color: var(--text-tertiary);
    }

    .consumed-row {
      opacity: 0.6;
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
export class CostBasisTableComponent implements OnInit, OnChanges {
  @Input() assets: string[] = [];
  @Input() exchanges: string[] = [];

  displayedColumns = ['acquiredAt', 'asset', 'exchange', 'source', 'originalAmount', 'remainingAmount', 'costPerUnit', 'totalCost'];

  loading = signal(true);
  data = signal<CostBasisLot[]>([]);
  total = signal(0);
  currentPage = signal(1);
  pageSize = 20;
  showEmpty = false;

  constructor(private pnlService: PnlService) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['assets'] || changes['exchanges']) {
      this.currentPage.set(1);
      this.loadData();
    }
  }

  loadData(): void {
    this.loading.set(true);
    this.pnlService.getCostBasisLots({
      page: this.currentPage(),
      limit: this.pageSize,
      assets: this.assets.length > 0 ? this.assets : undefined,
      exchanges: this.exchanges.length > 0 ? this.exchanges : undefined,
      showEmpty: this.showEmpty,
    }).subscribe({
      next: (response) => {
        this.data.set(response.data);
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

  onShowEmptyChange(): void {
    this.currentPage.set(1);
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

  getSourceLabel(source: string): string {
    const labels: Record<string, string> = {
      trade: 'Trade',
      deposit: 'Depósito',
      interest: 'Interés',
    };
    return labels[source] || source;
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
