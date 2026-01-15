import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PnlSummaryResponse } from '../../../core/services/pnl.service';

@Component({
  selector: 'app-pnl-summary-cards',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, MatIconModule, MatTooltipModule],
  template: `
    <div class="summary-cards">
      @if (!summary) {
        <!-- Skeleton Cards -->
        @for (i of [1, 2, 3]; track i) {
          <div class="summary-card skeleton">
            <div class="card-header">
              <span class="skeleton-text skeleton-pulse" style="width: 80px; height: 14px;"></span>
              <div class="skeleton-icon skeleton-pulse"></div>
            </div>
            <span class="skeleton-text skeleton-pulse" style="width: 120px; height: 32px;"></span>
          </div>
        }
      } @else {
        <!-- Total P&L Card -->
        <div class="summary-card total" [class.positive]="summary.totalPnl >= 0" [class.negative]="summary.totalPnl < 0">
          <div class="card-header">
            <span class="card-label">P&L Total</span>
            <mat-icon>{{ summary.totalPnl >= 0 ? 'trending_up' : 'trending_down' }}</mat-icon>
          </div>
          <span class="card-value">
            {{ summary.totalPnl >= 0 ? '+' : '' }}{{ summary.totalPnl | currency:'USD':'symbol':'1.2-2' }}
          </span>
        </div>

        <!-- Realized P&L Card -->
        <div class="summary-card" [class.positive]="summary.totalRealizedPnl >= 0" [class.negative]="summary.totalRealizedPnl < 0">
          <div class="card-header">
            <span class="card-label">Realizado</span>
            <mat-icon matTooltip="Ganancias/pérdidas de ventas completadas">check_circle</mat-icon>
          </div>
          <span class="card-value">
            {{ summary.totalRealizedPnl >= 0 ? '+' : '' }}{{ summary.totalRealizedPnl | currency:'USD':'symbol':'1.2-2' }}
          </span>
          <span class="card-hint">Ventas completadas</span>
        </div>

        <!-- Unrealized P&L Card -->
        <div class="summary-card" [class.positive]="summary.totalUnrealizedPnl >= 0" [class.negative]="summary.totalUnrealizedPnl < 0">
          <div class="card-header">
            <span class="card-label">No Realizado</span>
            <mat-icon matTooltip="Ganancias/pérdidas de posiciones abiertas">schedule</mat-icon>
          </div>
          <span class="card-value">
            {{ summary.totalUnrealizedPnl >= 0 ? '+' : '' }}{{ summary.totalUnrealizedPnl | currency:'USD':'symbol':'1.2-2' }}
          </span>
          <span class="card-hint">Posiciones abiertas</span>
        </div>
      }
    </div>

    <!-- Period Breakdown -->
    @if (summary?.periodBreakdown) {
      <div class="period-breakdown">
        <div class="period-item" [class.positive]="summary!.periodBreakdown.today >= 0" [class.negative]="summary!.periodBreakdown.today < 0">
          <span class="period-label">Hoy</span>
          <span class="period-value">{{ summary!.periodBreakdown.today >= 0 ? '+' : '' }}{{ summary!.periodBreakdown.today | currency:'USD':'symbol':'1.2-2' }}</span>
        </div>
        <div class="period-item" [class.positive]="summary!.periodBreakdown.thisWeek >= 0" [class.negative]="summary!.periodBreakdown.thisWeek < 0">
          <span class="period-label">Esta semana</span>
          <span class="period-value">{{ summary!.periodBreakdown.thisWeek >= 0 ? '+' : '' }}{{ summary!.periodBreakdown.thisWeek | currency:'USD':'symbol':'1.2-2' }}</span>
        </div>
        <div class="period-item" [class.positive]="summary!.periodBreakdown.thisMonth >= 0" [class.negative]="summary!.periodBreakdown.thisMonth < 0">
          <span class="period-label">Este mes</span>
          <span class="period-value">{{ summary!.periodBreakdown.thisMonth >= 0 ? '+' : '' }}{{ summary!.periodBreakdown.thisMonth | currency:'USD':'symbol':'1.2-2' }}</span>
        </div>
        <div class="period-item" [class.positive]="summary!.periodBreakdown.thisYear >= 0" [class.negative]="summary!.periodBreakdown.thisYear < 0">
          <span class="period-label">Este año</span>
          <span class="period-value">{{ summary!.periodBreakdown.thisYear >= 0 ? '+' : '' }}{{ summary!.periodBreakdown.thisYear | currency:'USD':'symbol':'1.2-2' }}</span>
        </div>
        <div class="period-item" [class.positive]="summary!.periodBreakdown.allTime >= 0" [class.negative]="summary!.periodBreakdown.allTime < 0">
          <span class="period-label">All Time</span>
          <span class="period-value">{{ summary!.periodBreakdown.allTime >= 0 ? '+' : '' }}{{ summary!.periodBreakdown.allTime | currency:'USD':'symbol':'1.2-2' }}</span>
        </div>
      </div>
    }
  `,
  styles: [`
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }

    .summary-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
    }

    .summary-card.total {
      background: var(--bg-elevated);
    }

    .summary-card.skeleton {
      pointer-events: none;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .card-label {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .card-header mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--text-tertiary);
    }

    .summary-card.positive .card-header mat-icon {
      color: var(--color-success);
    }

    .summary-card.negative .card-header mat-icon {
      color: var(--color-error);
    }

    .card-value {
      font-size: 28px;
      font-weight: 700;
      font-family: 'SF Mono', monospace;
      color: var(--text-primary);
    }

    .summary-card.total .card-value {
      font-size: 32px;
    }

    .summary-card.positive .card-value {
      color: var(--color-success);
    }

    .summary-card.negative .card-value {
      color: var(--color-error);
    }

    .card-hint {
      font-size: 12px;
      color: var(--text-tertiary);
      margin-top: 4px;
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
      border-radius: 4px;
      display: block;
    }

    .skeleton-icon {
      width: 20px;
      height: 20px;
      border-radius: 4px;
    }

    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    /* Period Breakdown */
    .period-breakdown {
      display: flex;
      gap: 16px;
      padding: 16px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      margin-bottom: 24px;
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
  `],
})
export class PnlSummaryCardsComponent {
  @Input() summary: PnlSummaryResponse | null = null;
}
