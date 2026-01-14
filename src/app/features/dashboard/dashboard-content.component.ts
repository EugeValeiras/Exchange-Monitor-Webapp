import { Component, OnInit, OnDestroy, signal, DestroyRef, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { BalanceSocketService } from '../../core/services/balance-socket.service';
import { BalanceChartComponent } from './components/balance-chart.component';
import { PnlSummaryComponent } from './components/pnl-summary.component';

interface ConsolidatedBalance {
  totalValueUsd: number;
  byExchange: { exchange: string; totalValueUsd: number }[];
  byAsset: { asset: string }[];
}

@Component({
  selector: 'app-dashboard-content',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    BalanceChartComponent,
    PnlSummaryComponent
  ],
  template: `
    <div class="dashboard-content">
      @if (!loading() && !hasExchanges()) {
        <div class="empty-container">
          <div class="empty-icon">
            <mat-icon>dashboard</mat-icon>
          </div>
          <h2>Bienvenido a Exchange Monitor</h2>
          <p>Conecta tu primer exchange para comenzar a ver tu portfolio</p>
          <a mat-raised-button color="primary" routerLink="/exchanges">
            <mat-icon>add</mat-icon>
            Agregar Exchange
          </a>
        </div>
      } @else {
        <!-- Quick Stats Row -->
        <div class="quick-stats">
          <div class="quick-stat-card primary">
            <a class="stat-content" routerLink="/balances">
              <div class="stat-header">
                @if (loading()) {
                  <span class="skeleton-text skeleton-pulse" style="width: 100px; height: 14px;"></span>
                } @else {
                  <span class="stat-label">Balance Total</span>
                }
                <mat-icon>account_balance_wallet</mat-icon>
              </div>
              @if (loading()) {
                <span class="skeleton-text skeleton-pulse stat-value-skeleton"></span>
                <span class="skeleton-text skeleton-pulse" style="width: 140px; height: 13px;"></span>
              } @else {
                <span class="stat-value">{{ totalValue() | currency:'USD':'symbol':'1.2-2' }}</span>
                <span class="stat-hint">
                  {{ exchangeCount() }} exchange{{ exchangeCount() !== 1 ? 's' : '' }} ·
                  {{ assetCount() }} activo{{ assetCount() !== 1 ? 's' : '' }}
                </span>
              }
            </a>
            <div class="quick-actions">
              @if (loading()) {
                @for (i of [1, 2, 3, 4, 5]; track i) {
                  <div class="quick-action skeleton">
                    <div class="skeleton-icon skeleton-pulse"></div>
                  </div>
                }
              } @else {
                <a class="quick-action" routerLink="/balances" matTooltip="Balances">
                  <mat-icon>account_balance_wallet</mat-icon>
                </a>
                <a class="quick-action" routerLink="/prices" matTooltip="Precios">
                  <mat-icon>show_chart</mat-icon>
                </a>
                <a class="quick-action" routerLink="/transactions" matTooltip="Transacciones">
                  <mat-icon>swap_horiz</mat-icon>
                </a>
                <a class="quick-action" routerLink="/exchanges" matTooltip="Exchanges">
                  <mat-icon>currency_exchange</mat-icon>
                </a>
                <a class="quick-action" routerLink="/settings" matTooltip="Configuración">
                  <mat-icon>settings</mat-icon>
                </a>
              }
            </div>
          </div>
        </div>

        <!-- Balance History Chart -->
        <app-balance-chart></app-balance-chart>

        <!-- P&L Summary -->
        <app-pnl-summary></app-pnl-summary>
      }
    </div>
  `,
  styles: [`
    .dashboard-content {
      padding: 24px;
    }

    .empty-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px;
      text-align: center;
    }

    .empty-icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: var(--bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
    }

    .empty-icon mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: var(--text-tertiary);
    }

    .empty-container h2 {
      margin: 0 0 8px 0;
      color: var(--text-primary);
    }

    .empty-container p {
      margin: 0 0 24px 0;
      color: var(--text-secondary);
    }

    .quick-stats {
      margin-bottom: 24px;
    }

    .quick-stat-card {
      display: flex;
      align-items: center;
      background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
      border-radius: 16px;
      padding: 24px;
      text-decoration: none;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .quick-stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }

    .quick-stat-card .stat-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      text-decoration: none;
      color: inherit;
    }

    .quick-stat-card .stat-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .quick-stat-card .stat-label {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.8);
    }

    .quick-stat-card .stat-header mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--brand-accent);
    }

    .quick-stat-card .stat-value {
      font-size: 36px;
      font-weight: 700;
      color: white;
      margin-bottom: 4px;
    }

    .quick-stat-card .stat-hint {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.6);
    }

    .quick-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .quick-action {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.1);
      text-decoration: none;
      transition: all 0.2s ease;
    }

    .quick-action:hover {
      background: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }

    .quick-action mat-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
      color: rgba(255, 255, 255, 0.8);
    }

    .quick-action:hover mat-icon {
      color: white;
    }

    /* Skeleton Styles */
    .skeleton-pulse {
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.1) 0%,
        rgba(255, 255, 255, 0.2) 50%,
        rgba(255, 255, 255, 0.1) 100%
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

    .stat-value-skeleton {
      width: 200px;
      height: 40px;
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .quick-action.skeleton {
      pointer-events: none;
    }

    .skeleton-icon {
      width: 22px;
      height: 22px;
      border-radius: 4px;
    }
  `]
})
export class DashboardContentComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);

  loading = signal(true);
  totalValue = signal(0);
  exchangeCount = signal(0);
  assetCount = signal(0);
  private balanceData = signal<ConsolidatedBalance | null>(null);

  constructor(
    private api: ApiService,
    private authService: AuthService,
    private balanceSocket: BalanceSocketService
  ) {
    this.balanceSocket.balanceUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((updatedBalance) => {
        this.updateStats(updatedBalance);
      });
  }

  ngOnInit() {
    const userId = this.authService.user()?.id;
    if (userId) {
      this.balanceSocket.connect(userId);
    }
    this.loadQuickStats();
  }

  ngOnDestroy() {
    this.balanceSocket.disconnect();
  }

  hasExchanges(): boolean {
    return this.exchangeCount() > 0;
  }

  private loadQuickStats(): void {
    this.loading.set(true);

    this.api.get<ConsolidatedBalance>('/balances').subscribe({
      next: (data) => {
        this.updateStats(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  private updateStats(data: ConsolidatedBalance): void {
    this.balanceData.set(data);
    this.totalValue.set(data.totalValueUsd || 0);
    this.exchangeCount.set(data.byExchange?.length || 0);
    this.assetCount.set(data.byAsset?.length || 0);
  }
}
