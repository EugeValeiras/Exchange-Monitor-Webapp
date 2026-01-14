import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  PnlService,
  PnlSummaryResponse,
  AssetPnl,
} from '../../../core/services/pnl.service';
import { LogoLoaderComponent } from '../../../shared/components/logo-loader/logo-loader.component';

@Component({
  selector: 'app-pnl-summary',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    MatCardModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    LogoLoaderComponent,
  ],
  template: `
    <div class="pnl-section">
      <div class="section-header">
        <h2>Profit & Loss (FIFO)</h2>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <app-logo-loader [size]="56" [showText]="false"></app-logo-loader>
        </div>
      } @else if (error()) {
        <div class="error-container">
          <mat-icon>error_outline</mat-icon>
          <p>{{ error() }}</p>
        </div>
      } @else if (hasData()) {
        <div class="pnl-cards">
          <!-- Total P&L Card -->
          <div class="pnl-card total" [class.positive]="totalPnl() >= 0" [class.negative]="totalPnl() < 0">
            <div class="pnl-card-header">
              <span class="pnl-label">P&L Total</span>
              <mat-icon>{{ totalPnl() >= 0 ? 'trending_up' : 'trending_down' }}</mat-icon>
            </div>
            <span class="pnl-value">
              {{ totalPnl() >= 0 ? '+' : '' }}{{ totalPnl() | currency:'USD':'symbol':'1.2-2' }}
            </span>
          </div>

          <!-- Realized P&L Card -->
          <div class="pnl-card" [class.positive]="realizedPnl() >= 0" [class.negative]="realizedPnl() < 0">
            <div class="pnl-card-header">
              <span class="pnl-label">Realizado</span>
              <mat-icon matTooltip="Ganancias/pérdidas de ventas completadas">check_circle</mat-icon>
            </div>
            <span class="pnl-value">
              {{ realizedPnl() >= 0 ? '+' : '' }}{{ realizedPnl() | currency:'USD':'symbol':'1.2-2' }}
            </span>
            <span class="pnl-hint">Ventas completadas</span>
          </div>

          <!-- Unrealized P&L Card -->
          <div class="pnl-card" [class.positive]="unrealizedPnl() >= 0" [class.negative]="unrealizedPnl() < 0">
            <div class="pnl-card-header">
              <span class="pnl-label">No realizado</span>
              <mat-icon matTooltip="Ganancias/pérdidas de posiciones abiertas">schedule</mat-icon>
            </div>
            <span class="pnl-value">
              {{ unrealizedPnl() >= 0 ? '+' : '' }}{{ unrealizedPnl() | currency:'USD':'symbol':'1.2-2' }}
            </span>
            <span class="pnl-hint">Posiciones abiertas</span>
          </div>
        </div>

        <!-- Period Breakdown -->
        @if (periodBreakdown(); as breakdown) {
          <div class="period-breakdown">
            <div class="period-item" [class.positive]="breakdown.today >= 0" [class.negative]="breakdown.today < 0">
              <span class="period-label">Hoy</span>
              <span class="period-value">{{ breakdown.today >= 0 ? '+' : '' }}{{ breakdown.today | currency:'USD':'symbol':'1.2-2' }}</span>
            </div>
            <div class="period-item" [class.positive]="breakdown.thisWeek >= 0" [class.negative]="breakdown.thisWeek < 0">
              <span class="period-label">Esta semana</span>
              <span class="period-value">{{ breakdown.thisWeek >= 0 ? '+' : '' }}{{ breakdown.thisWeek | currency:'USD':'symbol':'1.2-2' }}</span>
            </div>
            <div class="period-item" [class.positive]="breakdown.thisMonth >= 0" [class.negative]="breakdown.thisMonth < 0">
              <span class="period-label">Este mes</span>
              <span class="period-value">{{ breakdown.thisMonth >= 0 ? '+' : '' }}{{ breakdown.thisMonth | currency:'USD':'symbol':'1.2-2' }}</span>
            </div>
            <div class="period-item" [class.positive]="breakdown.thisYear >= 0" [class.negative]="breakdown.thisYear < 0">
              <span class="period-label">Este año</span>
              <span class="period-value">{{ breakdown.thisYear >= 0 ? '+' : '' }}{{ breakdown.thisYear | currency:'USD':'symbol':'1.2-2' }}</span>
            </div>
          </div>
        }

        <!-- Asset Breakdown Table -->
        @if (assetBreakdown().length > 0) {
          <div class="asset-breakdown">
            <h3>P&L por Activo</h3>
            <div class="table-container">
              <table mat-table [dataSource]="assetBreakdown()">
                <ng-container matColumnDef="asset">
                  <th mat-header-cell *matHeaderCellDef>Activo</th>
                  <td mat-cell *matCellDef="let row">
                    <div class="asset-cell">
                      <img [src]="getAssetLogo(row.asset)" [alt]="row.asset" class="asset-logo" (error)="onLogoError($event)">
                      <span>{{ row.asset }}</span>
                    </div>
                  </td>
                </ng-container>

                <ng-container matColumnDef="realized">
                  <th mat-header-cell *matHeaderCellDef>Realizado</th>
                  <td mat-cell *matCellDef="let row" [class.positive]="row.realizedPnl >= 0" [class.negative]="row.realizedPnl < 0">
                    {{ row.realizedPnl >= 0 ? '+' : '' }}{{ row.realizedPnl | currency:'USD':'symbol':'1.2-2' }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="unrealized">
                  <th mat-header-cell *matHeaderCellDef>No realizado</th>
                  <td mat-cell *matCellDef="let row" [class.positive]="row.unrealizedPnl >= 0" [class.negative]="row.unrealizedPnl < 0">
                    {{ row.unrealizedPnl >= 0 ? '+' : '' }}{{ row.unrealizedPnl | currency:'USD':'symbol':'1.2-2' }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="total">
                  <th mat-header-cell *matHeaderCellDef>Total</th>
                  <td mat-cell *matCellDef="let row" [class.positive]="(row.realizedPnl + row.unrealizedPnl) >= 0" [class.negative]="(row.realizedPnl + row.unrealizedPnl) < 0">
                    <strong>{{ (row.realizedPnl + row.unrealizedPnl) >= 0 ? '+' : '' }}{{ row.realizedPnl + row.unrealizedPnl | currency:'USD':'symbol':'1.2-2' }}</strong>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>
            </div>
          </div>
        }
      } @else {
        <div class="empty-container">
          <mat-icon>analytics</mat-icon>
          <p>No hay datos de P&L disponibles</p>
          <p class="hint">Sincroniza tus transacciones para ver el análisis de ganancias</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .pnl-section {
      margin-bottom: 32px;
    }

    .section-header {
      margin-bottom: 16px;
    }

    .section-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 48px;
    }

    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      color: var(--color-error);
    }

    .error-container mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      margin-bottom: 8px;
    }

    .pnl-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }

    .pnl-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
    }

    .pnl-card.total {
      background: var(--bg-elevated);
    }

    .pnl-card.positive .pnl-value {
      color: var(--color-success);
    }

    .pnl-card.negative .pnl-value {
      color: var(--color-error);
    }

    .pnl-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .pnl-label {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .pnl-card-header mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--text-tertiary);
    }

    .pnl-card.positive .pnl-card-header mat-icon {
      color: var(--color-success);
    }

    .pnl-card.negative .pnl-card-header mat-icon {
      color: var(--color-error);
    }

    .pnl-value {
      font-size: 24px;
      font-weight: 700;
      font-family: 'SF Mono', monospace;
      color: var(--text-primary);
    }

    .pnl-card.total .pnl-value {
      font-size: 28px;
    }

    .pnl-hint {
      font-size: 12px;
      color: var(--text-tertiary);
      margin-top: 4px;
    }

    .period-breakdown {
      display: flex;
      gap: 16px;
      padding: 16px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      margin-bottom: 20px;
      overflow-x: auto;
    }

    .period-item {
      display: flex;
      flex-direction: column;
      min-width: 100px;
    }

    .period-label {
      font-size: 12px;
      color: var(--text-tertiary);
      margin-bottom: 4px;
    }

    .period-value {
      font-size: 14px;
      font-weight: 600;
      font-family: 'SF Mono', monospace;
    }

    .period-item.positive .period-value {
      color: var(--color-success);
    }

    .period-item.negative .period-value {
      color: var(--color-error);
    }

    .asset-breakdown {
      margin-top: 20px;
    }

    .asset-breakdown h3 {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      margin: 0 0 12px 0;
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
      gap: 8px;
    }

    .asset-logo {
      width: 24px;
      height: 24px;
      border-radius: 50%;
    }

    .positive {
      color: var(--color-success) !important;
    }

    .negative {
      color: var(--color-error) !important;
    }

    .empty-container {
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

    .empty-container mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-container p {
      margin: 0;
    }

    .empty-container .hint {
      font-size: 13px;
      margin-top: 8px;
      opacity: 0.7;
    }
  `],
})
export class PnlSummaryComponent implements OnInit {
  loading = signal(true);
  error = signal('');
  private pnlData = signal<PnlSummaryResponse | null>(null);

  displayedColumns = ['asset', 'realized', 'unrealized', 'total'];

  hasData = computed(() => {
    const data = this.pnlData();
    return data !== null && (data.totalRealizedPnl !== 0 || data.totalUnrealizedPnl !== 0 || data.byAsset.length > 0);
  });

  totalPnl = computed(() => this.pnlData()?.totalPnl ?? 0);
  realizedPnl = computed(() => this.pnlData()?.totalRealizedPnl ?? 0);
  unrealizedPnl = computed(() => this.pnlData()?.totalUnrealizedPnl ?? 0);
  periodBreakdown = computed(() => this.pnlData()?.periodBreakdown ?? null);
  assetBreakdown = computed(() => {
    const data = this.pnlData();
    if (!data) return [];
    // Filter out assets with no P&L and sort by total P&L
    return data.byAsset
      .filter(a => a.realizedPnl !== 0 || a.unrealizedPnl !== 0)
      .sort((a, b) => Math.abs(b.realizedPnl + b.unrealizedPnl) - Math.abs(a.realizedPnl + a.unrealizedPnl));
  });

  constructor(private pnlService: PnlService) {}

  ngOnInit(): void {
    this.loadPnlData();
  }

  private loadPnlData(): void {
    this.loading.set(true);
    this.error.set('');

    this.pnlService.getSummary().subscribe({
      next: (data) => {
        this.pnlData.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading P&L data:', err);
        this.error.set(err.error?.message || 'Error al cargar datos de P&L');
        this.loading.set(false);
      },
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
  }
}
