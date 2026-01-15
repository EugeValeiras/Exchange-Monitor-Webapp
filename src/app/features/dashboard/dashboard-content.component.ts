import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { ConsolidatedBalanceService } from '../../core/services/consolidated-balance.service';
import { BalanceChartComponent } from './components/balance-chart.component';
import { PriceCardsComponent } from './components/price-cards.component';
import { FlipNumberComponent } from '../../shared/components/flip-number/flip-number.component';

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
    PriceCardsComponent,
    FlipNumberComponent
  ],
  template: `
    <div class="dashboard-content">
      @if (!balanceService.loading() && !balanceService.hasExchanges()) {
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
            <div class="stat-content">
              <div class="stat-header">
                @if (balanceService.loading()) {
                  <span class="skeleton-text skeleton-pulse" style="width: 100px; height: 14px;"></span>
                } @else {
                  <span class="stat-label">Balance Total</span>
                }
                <mat-icon>account_balance_wallet</mat-icon>
              </div>
              @if (balanceService.loading()) {
                <span class="skeleton-text skeleton-pulse stat-value-skeleton"></span>
                <span class="skeleton-text skeleton-pulse" style="width: 140px; height: 13px;"></span>
              } @else {
                <span class="stat-value">
                  <app-flip-number [value]="balanceService.totalValueUsd()" format="currency" [decimals]="2" size="large"></app-flip-number>
                </span>
                @if (balanceService.change24h() !== null) {
                  <div class="stat-change" [class.positive]="balanceService.change24h()! >= 0" [class.negative]="balanceService.change24h()! < 0">
                    <span class="change-value">
                      {{ balanceService.changeUsd24h()! >= 0 ? '+' : '' }}{{ balanceService.changeUsd24h() | currency:'USD':'symbol':'1.2-2' }}
                    </span>
                    <span class="change-percent">
                      ({{ balanceService.change24h()! >= 0 ? '+' : '' }}{{ balanceService.change24h() | number:'1.2-2' }}%)
                    </span>
                    <span class="change-label">24h</span>
                    <mat-icon
                      class="info-icon"
                      matTooltip="Variación calculada usando el cambio 24h de cada activo ponderado por su valor en el portfolio"
                      matTooltipPosition="above">info_outline</mat-icon>
                  </div>
                }
              }
            </div>
            <div class="quick-actions">
              @if (balanceService.loading()) {
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

        <!-- Price Cards -->
        <app-price-cards></app-price-cards>
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

    .stat-change {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      padding: 6px 12px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.1);
      width: fit-content;
    }

    .stat-change.positive {
      background: rgba(14, 203, 129, 0.2);
    }

    .stat-change.negative {
      background: rgba(246, 70, 93, 0.2);
    }

    .stat-change .change-value {
      font-size: 16px;
      font-weight: 600;
      color: white;
      font-family: 'SF Mono', monospace;
    }

    .stat-change.positive .change-value,
    .stat-change.positive .change-percent {
      color: #0ecb81;
    }

    .stat-change.negative .change-value,
    .stat-change.negative .change-percent {
      color: #f6465d;
    }

    .stat-change .change-percent {
      font-size: 14px;
      font-weight: 500;
    }

    .stat-change .change-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      margin-left: 4px;
    }

    .stat-change .info-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: rgba(255, 255, 255, 0.5);
      cursor: help;
      margin-left: 2px;
    }

    .stat-change .info-icon:hover {
      color: rgba(255, 255, 255, 0.8);
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
  constructor(public balanceService: ConsolidatedBalanceService) {}

  ngOnInit() {
    this.balanceService.initialize();
  }

  ngOnDestroy() {
    // Don't disconnect - service is shared across components
  }
}
