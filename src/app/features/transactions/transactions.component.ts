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
      @if (stats) {
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon total">
              <mat-icon>receipt_long</mat-icon>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.totalTransactions | number }}</span>
              <span class="stat-label">Total Transacciones</span>
            </div>
          </div>

          <div class="stat-card interest-card">
            <div class="stat-icon interest">
              <mat-icon>percent</mat-icon>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ stats.totalInterestUsd | currency:'USD':'symbol':'1.2-2' }}</span>
              <span class="stat-label">Intereses Ganados</span>
            </div>
          </div>

          <div class="stat-card pnl-card" [class.positive]="pnlSummary && pnlSummary.totalPnl >= 0" [class.negative]="pnlSummary && pnlSummary.totalPnl < 0">
            <div class="stat-icon pnl" [class.positive]="pnlSummary && pnlSummary.totalPnl >= 0" [class.negative]="pnlSummary && pnlSummary.totalPnl < 0">
              <mat-icon>{{ pnlSummary && pnlSummary.totalPnl >= 0 ? 'trending_up' : 'trending_down' }}</mat-icon>
            </div>
            <div class="stat-info">
              @if (pnlLoading) {
                <span class="stat-value">...</span>
              } @else if (pnlSummary) {
                <span class="stat-value" [class.positive]="pnlSummary.totalPnl >= 0" [class.negative]="pnlSummary.totalPnl < 0">
                  {{ pnlSummary.totalPnl >= 0 ? '+' : '' }}{{ pnlSummary.totalPnl | currency:'USD':'symbol':'1.2-2' }}
                </span>
              } @else {
                <span class="stat-value">$0.00</span>
              }
              <span class="stat-label">P&L Total</span>
            </div>
          </div>

          <div class="stat-card" [class.positive]="pnlSummary && pnlSummary.totalRealizedPnl >= 0" [class.negative]="pnlSummary && pnlSummary.totalRealizedPnl < 0">
            <div class="stat-icon realized">
              <mat-icon>check_circle</mat-icon>
            </div>
            <div class="stat-info">
              @if (pnlLoading) {
                <span class="stat-value">...</span>
              } @else if (pnlSummary) {
                <span class="stat-value" [class.positive]="pnlSummary.totalRealizedPnl >= 0" [class.negative]="pnlSummary.totalRealizedPnl < 0">
                  {{ pnlSummary.totalRealizedPnl >= 0 ? '+' : '' }}{{ pnlSummary.totalRealizedPnl | currency:'USD':'symbol':'1.2-2' }}
                </span>
              } @else {
                <span class="stat-value">$0.00</span>
              }
              <span class="stat-label">P&L Realizado</span>
            </div>
          </div>

          <div class="stat-card" [class.positive]="pnlSummary && pnlSummary.totalUnrealizedPnl >= 0" [class.negative]="pnlSummary && pnlSummary.totalUnrealizedPnl < 0">
            <div class="stat-icon unrealized">
              <mat-icon>schedule</mat-icon>
            </div>
            <div class="stat-info">
              @if (pnlLoading) {
                <span class="stat-value">...</span>
              } @else if (pnlSummary) {
                <span class="stat-value" [class.positive]="pnlSummary.totalUnrealizedPnl >= 0" [class.negative]="pnlSummary.totalUnrealizedPnl < 0">
                  {{ pnlSummary.totalUnrealizedPnl >= 0 ? '+' : '' }}{{ pnlSummary.totalUnrealizedPnl | currency:'USD':'symbol':'1.2-2' }}
                </span>
              } @else {
                <span class="stat-value">$0.00</span>
              }
              <span class="stat-label">P&L No Realizado</span>
            </div>
          </div>
        </div>

        }

      <!-- Filters -->
      <div class="filters-container">
        <div class="filter-section">
          <span class="filter-label">Tipo</span>
          <mat-chip-listbox multiple (change)="onTypeFilterChange($event)" class="type-chips">
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
            <mat-chip-option value="interest" [selected]="selectedTypes.has('interest')" class="type-chip interest">
              <mat-icon>percent</mat-icon>
              Interés
            </mat-chip-option>
          </mat-chip-listbox>
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
          <div class="asset-chips-container">
            <mat-chip-listbox multiple (change)="onAssetFilterChange($event)" class="asset-chips">
              @for (asset of assetList; track asset.name) {
                <mat-chip-option [value]="asset.name" [selected]="selectedAssets.has(asset.name)" class="asset-chip">
                  <img [src]="getAssetLogo(asset.name)" [alt]="asset.name" class="asset-chip-logo" (error)="onAssetLogoError($event, asset.name)">
                  {{ asset.name }}
                  <span class="asset-count">{{ asset.count }}</span>
                </mat-chip-option>
              }
            </mat-chip-listbox>
          </div>
        </div>

        </div>

      <!-- Table -->
      @if (loading) {
        <div class="loading-container">
          <app-logo-loader [size]="140" text="Cargando transacciones..."></app-logo-loader>
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
                <div class="amount-cell" [class.buy]="tx.side === 'buy' || tx.type === 'deposit' || tx.type === 'interest'" [class.sell]="tx.side === 'sell' || tx.type === 'withdrawal'">
                  <span class="amount">
                    {{ tx.side === 'sell' || tx.type === 'withdrawal' ? '-' : '+' }}{{ tx.amount | number:'1.2-8' }}
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
  styles: [`
    .transactions-container {
      padding: 24px;
    }

    .page-header {
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .header-actions .date-range-field {
      min-width: 220px;

      ::ng-deep .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }

      ::ng-deep .mat-mdc-text-field-wrapper {
        padding: 0 12px;
      }

      ::ng-deep .mdc-notched-outline__notch {
        border-right: none;
      }
    }

    .header-content h1 {
      margin: 0 0 4px 0;
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .header-content p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 14px;
    }

    .recalculate-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-secondary);
      border-color: var(--border-color);

      &:hover:not(:disabled) {
        color: var(--brand-primary);
        border-color: var(--brand-primary);
      }

      &:disabled {
        opacity: 0.6;
      }

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      mat-icon.spinning {
        animation: spin 1s linear infinite;
      }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    @media (max-width: 1400px) {
      .stats-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    @media (max-width: 900px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 600px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }
    }

    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;

      mat-icon {
        font-size: 24px;
        width: 24px;
        height: 24px;
      }

      &.total {
        background: rgba(139, 92, 246, 0.15);
        color: #a78bfa;
      }

      &.deposits {
        background: rgba(14, 203, 129, 0.15);
        color: var(--color-success);
      }

      &.withdrawals {
        background: rgba(246, 70, 93, 0.15);
        color: var(--color-error);
      }

      &.trades {
        background: rgba(59, 130, 246, 0.15);
        color: #3b82f6;
      }

      &.interest {
        background: rgba(14, 203, 129, 0.15);
        color: var(--color-success);
      }

      &.pnl {
        background: rgba(139, 92, 246, 0.15);
        color: #a78bfa;

        &.positive {
          background: rgba(14, 203, 129, 0.15);
          color: var(--color-success);
        }

        &.negative {
          background: rgba(246, 70, 93, 0.15);
          color: var(--color-error);
        }
      }

      &.realized {
        background: rgba(59, 130, 246, 0.15);
        color: #3b82f6;
      }

      &.unrealized {
        background: rgba(251, 146, 60, 0.15);
        color: #fb923c;
      }
    }

    .stat-card.interest-card {
      background: linear-gradient(135deg, rgba(14, 203, 129, 0.1) 0%, rgba(14, 203, 129, 0.05) 100%);
      border-color: rgba(14, 203, 129, 0.3);
    }

    .stat-card.pnl-card {
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%);
      border-color: rgba(139, 92, 246, 0.3);

      &.positive {
        background: linear-gradient(135deg, rgba(14, 203, 129, 0.1) 0%, rgba(14, 203, 129, 0.05) 100%);
        border-color: rgba(14, 203, 129, 0.3);
      }

      &.negative {
        background: linear-gradient(135deg, rgba(246, 70, 93, 0.1) 0%, rgba(246, 70, 93, 0.05) 100%);
        border-color: rgba(246, 70, 93, 0.3);
      }
    }

    .stat-value.positive {
      color: var(--color-success);
    }

    .stat-value.negative {
      color: var(--color-error);
    }

    .stat-info {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .stat-label {
      font-size: 13px;
      color: var(--text-secondary);
    }

    /* Filters */
    .filters-container {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      align-items: flex-end;
      justify-content: space-between;
      margin-bottom: 24px;
      padding: 20px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
    }

    .filter-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-right: 20px;
      border-right: 1px solid var(--border-color);

      &:last-child {
        border-right: none;
        padding-right: 0;
      }
    }

    .filter-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .type-chips, .exchange-chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    ::ng-deep .type-chip {
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

      &.deposit {
        --mdc-chip-elevated-container-color: rgba(14, 203, 129, 0.1) !important;
        --mdc-chip-label-text-color: var(--color-success) !important;
        --mdc-chip-elevated-selected-container-color: rgba(14, 203, 129, 0.15) !important;

        &.mat-mdc-chip-selected {
          border-color: var(--color-success);
          box-shadow: 0 0 8px rgba(14, 203, 129, 0.5);
        }
      }

      &.withdrawal {
        --mdc-chip-elevated-container-color: rgba(246, 70, 93, 0.1) !important;
        --mdc-chip-label-text-color: var(--color-error) !important;
        --mdc-chip-elevated-selected-container-color: rgba(246, 70, 93, 0.15) !important;

        &.mat-mdc-chip-selected {
          border-color: var(--color-error);
          box-shadow: 0 0 8px rgba(246, 70, 93, 0.5);
        }
      }

      &.trade {
        --mdc-chip-elevated-container-color: rgba(251, 146, 60, 0.1) !important;
        --mdc-chip-label-text-color: #fb923c !important;
        --mdc-chip-elevated-selected-container-color: rgba(251, 146, 60, 0.15) !important;

        &.mat-mdc-chip-selected {
          border-color: #fb923c;
          box-shadow: 0 0 8px rgba(251, 146, 60, 0.5);
        }
      }

      &.interest {
        --mdc-chip-elevated-container-color: rgba(59, 130, 246, 0.1) !important;
        --mdc-chip-label-text-color: #3b82f6 !important;
        --mdc-chip-elevated-selected-container-color: rgba(59, 130, 246, 0.15) !important;

        &.mat-mdc-chip-selected {
          border-color: #3b82f6;
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
        }
      }

      mat-icon {
        font-size: 16px !important;
        width: 16px !important;
        height: 16px !important;
        margin-left: 4px;
        margin-right: 4px;
        display: flex !important;
        align-items: center;
        justify-content: center;
      }

      .mdc-evolution-chip__text-label {
        display: flex;
        align-items: center;
      }
    }

    .assets-section {
      flex: 1;
      min-width: 200px;
    }

    .asset-chips-container {
      max-width: 100%;
      overflow-x: auto;
    }

    .asset-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    ::ng-deep .asset-chip {
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
        border-color: var(--brand-accent);
        box-shadow: 0 0 8px rgba(0, 194, 255, 0.4);
      }

      .mdc-evolution-chip__text-label {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .asset-chip-logo {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        object-fit: contain;
        margin-left: 4px;
      }

      .asset-count {
        font-size: 11px;
        color: var(--text-tertiary);
        margin-left: 2px;
      }
    }

    ::ng-deep .exchange-chip {
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
        border-color: var(--brand-primary);
        box-shadow: 0 0 8px rgba(18, 37, 98, 0.5);
      }

      .mdc-evolution-chip__text-label {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      app-exchange-logo {
        margin-left: 4px;
      }

      .exchange-count {
        font-size: 11px;
        color: var(--text-tertiary);
        margin-left: 2px;
      }
    }

    .filter-field {
      min-width: 140px;

      ::ng-deep .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }
    }

    .asset-field {
      min-width: 160px;
    }

    .date-range-field {
      min-width: 240px;
    }

    /* Loading & Empty */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 200px);
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

      mat-icon {
        font-size: 40px;
        width: 40px;
        height: 40px;
        color: var(--text-tertiary);
      }
    }

    .empty-container h2 {
      margin: 0 0 8px 0;
      color: var(--text-primary);
    }

    .empty-container p {
      margin: 0;
      color: var(--text-secondary);
    }

    /* Table */
    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
    }

    .transactions-table {
      width: 100%;

      th.mat-header-cell {
        background: var(--bg-elevated);
        color: var(--text-secondary);
        font-weight: 600;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid var(--border-color);
        padding: 16px;
      }

      td.mat-cell {
        padding: 16px;
        border-bottom: 1px solid var(--border-color);
        color: var(--text-primary);
      }

      tr.mat-row:hover {
        background: var(--bg-hover);
      }
    }

    .date-cell {
      display: flex;
      flex-direction: column;

      .date {
        font-weight: 500;
        color: var(--text-primary);
      }

      .time {
        font-size: 12px;
        color: var(--text-secondary);
      }
    }

    .exchange-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .type-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      &.deposit {
        background: rgba(14, 203, 129, 0.15);
        color: var(--color-success);
      }

      &.withdrawal {
        background: rgba(246, 70, 93, 0.15);
        color: var(--color-error);
      }

      &.trade {
        background: rgba(251, 146, 60, 0.15);
        color: #fb923c;
      }

      &.interest {
        background: rgba(59, 130, 246, 0.15);
        color: #3b82f6;
      }
    }

    .asset-cell {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .asset-logo {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      object-fit: contain;
    }

    .pair-logos {
      position: relative;
      width: 32px;
      height: 32px;
      flex-shrink: 0;
    }

    .pair-logo {
      border-radius: 50%;
      object-fit: contain;
      position: absolute;
    }

    .pair-logo.primary {
      width: 28px;
      height: 28px;
      left: 0;
      top: 0;
      z-index: 1;
    }

    .pair-logo.secondary {
      width: 16px;
      height: 16px;
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

    .pair-info {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .asset-fallback {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--brand-primary);
      color: #1e2026;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 10px;
      flex-shrink: 0;
    }

    .amount-cell {
      .amount {
        font-weight: 600;
        font-family: 'SF Mono', monospace;
      }

      .asset {
        font-size: 12px;
        color: var(--text-secondary);
        margin-left: 4px;
      }

      &.buy .amount {
        color: var(--color-success);
      }

      &.sell .amount {
        color: var(--color-error);
      }
    }

    .price-cell {
      font-family: 'SF Mono', monospace;

      .price-asset {
        font-size: 11px;
        color: var(--text-secondary);
        margin-left: 4px;
      }
    }

    .fee-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: 'SF Mono', monospace;

      .fee-amount {
        color: var(--text-secondary);
      }

      .fee-asset-logo {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        object-fit: contain;
      }
    }

    .no-price, .no-fee {
      color: var(--text-tertiary);
    }

    ::ng-deep .mat-mdc-paginator {
      background: var(--bg-elevated);
      border-top: 1px solid var(--border-color);
      color: var(--text-secondary);
    }
  `]
})
export class TransactionsComponent implements OnInit {
  transactions: Transaction[] = [];
  stats: TransactionStats | null = null;
  loading = true;

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

  // Exchange filtering
  selectedExchanges = new Set<string>();
  exchangeStats: ExchangeStat[] = [];

  constructor(
    private transactionsService: TransactionsService,
    private pnlService: PnlService
  ) {}

  ngOnInit(): void {
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
    this.transactionsService.getStats().subscribe({
      next: (stats) => {
        this.stats = stats;
        this.buildExchangeStats();
        this.buildAssetList();
      },
      error: (err) => {
        console.error('Error loading stats:', err);
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
