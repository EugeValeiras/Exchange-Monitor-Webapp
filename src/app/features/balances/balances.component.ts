import { Component, OnInit, OnDestroy, signal, ViewChild, AfterViewInit, effect, DestroyRef, inject } from '@angular/core';
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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { PriceSocketService } from '../../core/services/price-socket.service';
import { BalanceSocketService } from '../../core/services/balance-socket.service';
import { SettingsService } from '../../core/services/settings.service';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';
import { LogoLoaderComponent } from '../../shared/components/logo-loader/logo-loader.component';

interface AssetBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  priceUsd?: number;
  valueUsd?: number;
  exchanges?: string[];
  exchangeBreakdown?: { exchange: string; total: number }[];
  pricePair?: string; // e.g., "BTC/USDT" or "BTC/USD"
  pricesByExchange?: { exchange: string; price: number; pair: string; change24h?: number }[];
  isAveragePrice?: boolean;
  change24h?: number;
}

interface ExchangeBalance {
  exchange: string;
  label: string;
  credentialId: string;
  balances: AssetBalance[];
  totalValueUsd: number;
}

interface ConsolidatedBalance {
  byAsset: AssetBalance[];
  byExchange: ExchangeBalance[];
  totalValueUsd: number;
  lastUpdated: Date;
  isCached?: boolean;
  isSyncing?: boolean;
}

@Component({
  selector: 'app-balances',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    DecimalPipe,
    FormsModule,
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
    MatSlideToggleModule,
    ExchangeLogoComponent,
    LogoLoaderComponent
  ],
  template: `
    <div class="balances-content">
      @if (error()) {
        <div class="error-container">
          <mat-icon>error_outline</mat-icon>
          <h3>Error al cargar datos</h3>
          <p>{{ error() }}</p>
          <button mat-raised-button color="primary" (click)="loadBalances()">
            <mat-icon>refresh</mat-icon>
            Reintentar
          </button>
        </div>
      } @else if (!loading() && !hasExchanges()) {
        <div class="empty-container">
          <div class="empty-icon">
            <mat-icon>account_balance_wallet</mat-icon>
          </div>
          <h2>No hay exchanges conectados</h2>
          <p>Conecta tu primer exchange para comenzar a ver tus balances</p>
          <a mat-raised-button color="primary" routerLink="/exchanges">
            <mat-icon>add</mat-icon>
            Agregar Exchange
          </a>
        </div>
      } @else {
        <!-- Indicators row -->
        <div class="indicators-row">
          @if (loading()) {
            <!-- Skeleton indicator -->
            <div class="realtime-indicator skeleton">
              <span class="skeleton-circle skeleton-pulse"></span>
              <span class="skeleton-text skeleton-pulse" style="width: 130px; height: 12px;"></span>
            </div>
          } @else {
            <!-- Real-time indicator -->
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

            <!-- Sync indicator -->
            @if (isSyncing()) {
              <div class="sync-indicator">
                <mat-spinner diameter="14"></mat-spinner>
                <span>Sincronizando balances...</span>
              </div>
            } @else if (balances()?.isCached) {
              <div class="sync-indicator cached">
                <mat-icon>schedule</mat-icon>
                <span>Datos en cache</span>
              </div>
            }
          }
        </div>

        <!-- Stats Cards -->
        <div class="stats-grid">
          <div class="stat-card primary">
            <div class="stat-content">
              <div class="stat-header">
                @if (loading()) {
                  <span class="skeleton-text skeleton-pulse" style="width: 100px; height: 14px;"></span>
                } @else {
                  <span class="stat-label">Balance Total</span>
                }
                <mat-icon>trending_up</mat-icon>
              </div>
              @if (loading()) {
                <span class="skeleton-text skeleton-pulse stat-value-skeleton"></span>
                <span class="skeleton-text skeleton-pulse" style="width: 140px; height: 13px;"></span>
              } @else {
                <span class="stat-value">{{ balances()?.totalValueUsd | currency:'USD':'symbol':'1.2-2' }}</span>
                <span class="stat-hint">
                  {{ balances()?.byExchange?.length || 0 }} exchange{{ (balances()?.byExchange?.length || 0) !== 1 ? 's' : '' }} ·
                  {{ dataSource.data.length }} activo{{ dataSource.data.length !== 1 ? 's' : '' }}
                </span>
              }
            </div>
          </div>
        </div>

        <!-- Exchanges Summary -->
        <div class="section">
          <div class="section-header">
            <h2>Por Exchange</h2>
          </div>

          <div class="exchanges-grid">
            @if (loading()) {
              @for (i of [1, 2]; track i) {
                <div class="exchange-card skeleton-card">
                  <div class="exchange-header">
                    <div class="skeleton-logo skeleton-pulse"></div>
                    <div class="exchange-info">
                      <span class="skeleton-text skeleton-pulse" style="width: 80px; height: 16px;"></span>
                      <span class="skeleton-text skeleton-pulse" style="width: 60px; height: 13px; margin-top: 4px;"></span>
                    </div>
                  </div>
                  <div class="skeleton-text skeleton-pulse" style="width: 120px; height: 24px; margin-bottom: 4px;"></div>
                  <div class="skeleton-text skeleton-pulse" style="width: 70px; height: 13px;"></div>
                </div>
              }
            } @else {
              @for (exchange of getSortedExchanges(); track exchange.credentialId) {
                <div
                  class="exchange-card"
                  [class.selected]="isExchangeSelected(exchange.exchange)"
                  [class.dimmed]="hasExchangeFilter() && !isExchangeSelected(exchange.exchange)"
                  (click)="toggleExchangeFilter(exchange.exchange)"
                  matTooltip="Click para {{ isExchangeSelected(exchange.exchange) ? 'quitar filtro' : 'filtrar' }}"
                  matTooltipPosition="above">
                  <div class="exchange-header">
                    <app-exchange-logo [exchange]="exchange.exchange" [size]="44"></app-exchange-logo>
                    <div class="exchange-info">
                      <span class="exchange-name">{{ getExchangeDisplayName(exchange.exchange) }}</span>
                      <span class="exchange-label">{{ exchange.label }}</span>
                    </div>
                  </div>
                  <div class="exchange-value">
                    {{ exchange.totalValueUsd | currency:'USD':'symbol':'1.2-2' }}
                  </div>
                  <div class="exchange-assets">
                    {{ exchange.balances.length }} activos
                  </div>
                </div>
              }
            }
          </div>
        </div>

        <!-- Top Assets -->
        <div class="section">
          <div class="section-header">
            <h2>Top Activos</h2>
          </div>

          <div class="top-assets-grid">
            @if (loading()) {
              @for (i of [1, 2, 3, 4]; track i) {
                <div class="top-asset-card">
                  <div class="skeleton-asset-logo skeleton-pulse"></div>
                  <div class="top-asset-info">
                    <span class="skeleton-text skeleton-pulse" style="width: 50px; height: 16px;"></span>
                    <span class="skeleton-text skeleton-pulse" style="width: 80px; height: 12px; margin-top: 4px;"></span>
                  </div>
                  <div class="skeleton-text skeleton-pulse" style="width: 70px; height: 18px;"></div>
                </div>
              }
            } @else {
              @for (asset of getTopAssets(); track asset.asset) {
                <div class="top-asset-card">
                  <img [src]="getAssetLogo(asset.asset)" [alt]="asset.asset" class="top-asset-logo" (error)="onLogoError($event, asset.asset)">
                  <div class="top-asset-info">
                    <span class="top-asset-name">{{ asset.asset }}</span>
                    <span class="top-asset-amount">{{ asset.total | number:'1.4-8' }}</span>
                  </div>
                  <div class="top-asset-value">
                    {{ asset.valueUsd | currency:'USD':'symbol':'1.2-2' }}
                  </div>
                </div>
              }
            }
          </div>
        </div>

        <!-- Assets Table -->
        <div class="section">
          <div class="section-header">
            <h2>Balances por Activo</h2>
            @if (!loading()) {
              <div class="section-actions">
                <mat-slide-toggle
                  [(ngModel)]="showAllAssets"
                  (change)="onShowAllToggle()"
                  class="show-all-toggle">
                  Mostrar todos
                </mat-slide-toggle>
                <button mat-icon-button (click)="loadBalances()">
                  <mat-icon>refresh</mat-icon>
                </button>
              </div>
            }
          </div>

          <div class="table-container">
            @if (loading()) {
              <div class="skeleton-table">
                <div class="skeleton-table-header">
                  <span class="skeleton-text skeleton-pulse" style="width: 60px;"></span>
                  <span class="skeleton-text skeleton-pulse" style="width: 70px;"></span>
                  <span class="skeleton-text skeleton-pulse" style="width: 50px;"></span>
                  <span class="skeleton-text skeleton-pulse" style="width: 40px;"></span>
                  <span class="skeleton-text skeleton-pulse" style="width: 70px;"></span>
                  <span class="skeleton-text skeleton-pulse" style="width: 70px;"></span>
                </div>
                @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                  <div class="skeleton-table-row">
                    <div class="skeleton-cell asset-cell">
                      <div class="skeleton-asset-logo-sm skeleton-pulse"></div>
                      <span class="skeleton-text skeleton-pulse" style="width: 50px;"></span>
                    </div>
                    <div class="skeleton-cell">
                      <div class="skeleton-exchange-logo skeleton-pulse"></div>
                    </div>
                    <div class="skeleton-cell">
                      <span class="skeleton-text skeleton-pulse" style="width: 80px;"></span>
                    </div>
                    <div class="skeleton-cell">
                      <span class="skeleton-text skeleton-pulse" style="width: 50px;"></span>
                    </div>
                    <div class="skeleton-cell">
                      <span class="skeleton-text skeleton-pulse" style="width: 90px;"></span>
                    </div>
                    <div class="skeleton-cell">
                      <span class="skeleton-text skeleton-pulse" style="width: 70px;"></span>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <table mat-table [dataSource]="dataSource" matSort>
                <ng-container matColumnDef="asset">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Activo</th>
                  <td mat-cell *matCellDef="let row">
                    <div class="asset-cell">
                      <img [src]="getAssetLogo(row.asset)" [alt]="row.asset" class="asset-logo" (error)="onLogoError($event, row.asset)">
                      <span class="asset-name">{{ row.asset }}</span>
                    </div>
                  </td>
                </ng-container>

                <ng-container matColumnDef="exchanges">
                  <th mat-header-cell *matHeaderCellDef>Exchange</th>
                  <td mat-cell *matCellDef="let row">
                    <div class="exchanges-cell">
                      @for (exchange of row.exchanges; track exchange) {
                        <img
                          [src]="'/' + exchange + '.svg'"
                          [alt]="exchange"
                          class="exchange-mini-logo"
                          [matTooltip]="getExchangeTooltip(row, exchange)"
                          matTooltipPosition="above">
                      }
                    </div>
                  </td>
                </ng-container>

                <ng-container matColumnDef="price">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header="priceUsd">Precio</th>
                  <td mat-cell *matCellDef="let row">
                    <div class="price-cell-row">
                      <span class="price-cell">
                        {{ row.priceUsd | currency:'USD':'symbol':'1.2-4' }}
                      </span>
                      @if (row.pricesByExchange && row.pricesByExchange.length > 0) {
                        <div class="price-sources">
                          @for (ep of row.pricesByExchange; track ep.exchange) {
                            <img [src]="'/' + ep.exchange + '.svg'" [alt]="ep.exchange" class="price-source-logo" [matTooltip]="ep.exchange + ': ' + (ep.price | currency:'USD':'symbol':'1.2-4')" matTooltipPosition="above">
                          }
                        </div>
                      }
                    </div>
                  </td>
                </ng-container>

                <!-- Change 24h Column -->
                <ng-container matColumnDef="change24h">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>24h</th>
                  <td mat-cell *matCellDef="let row">
                    @if (row.change24h !== undefined && row.change24h !== null) {
                      <span class="change-cell" [class.positive]="row.change24h > 0" [class.negative]="row.change24h < 0">
                        {{ row.change24h > 0 ? '+' : '' }}{{ row.change24h | number:'1.2-2' }}%
                      </span>
                    } @else {
                      <span class="change-cell neutral">--</span>
                    }
                  </td>
                </ng-container>

                <ng-container matColumnDef="total">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Cantidad</th>
                  <td mat-cell *matCellDef="let row">
                    <span class="quantity-cell">{{ row.total | number:'1.4-8' }}</span>
                  </td>
                </ng-container>

                <ng-container matColumnDef="value">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header="valueUsd">Valor USD</th>
                  <td mat-cell *matCellDef="let row">
                    <span class="value-cell">{{ row.valueUsd | currency:'USD':'symbol':'1.2-2' }}</span>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .balances-content {
      padding: 24px;
    }

    .indicators-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .sync-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      background: rgba(33, 150, 243, 0.1);
      color: #2196f3;
    }

    .sync-indicator.cached {
      background: rgba(156, 163, 175, 0.1);
      color: var(--text-secondary);
    }

    .sync-indicator mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .realtime-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      width: fit-content;
    }

    .realtime-indicator.connected {
      background: rgba(14, 203, 129, 0.1);
      color: var(--color-success);
    }

    .realtime-indicator.disconnected {
      background: rgba(255, 152, 0, 0.1);
      color: #ff9800;
    }

    .realtime-indicator.skeleton {
      background: var(--bg-tertiary);
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

    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px;
      text-align: center;
    }

    .error-container mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: var(--color-error);
      margin-bottom: 16px;
    }

    .error-container h3 {
      margin: 0 0 8px 0;
      color: var(--text-primary);
    }

    .error-container p {
      margin: 0 0 24px 0;
      color: var(--text-secondary);
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

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }

    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 24px;
    }

    .stat-card.primary {
      background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
      border: none;
    }

    .stat-content {
      display: flex;
      flex-direction: column;
    }

    .stat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .stat-label {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .stat-card.primary .stat-label {
      color: rgba(255, 255, 255, 0.8);
    }

    .stat-header mat-icon {
      color: var(--text-tertiary);
    }

    .stat-card.primary .stat-header mat-icon {
      color: var(--brand-accent);
    }

    .icon-orange {
      color: #ff9800 !important;
    }

    .icon-green {
      color: var(--color-success) !important;
    }

    .stat-value {
      font-size: 32px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .stat-card.primary .stat-value {
      color: white;
    }

    .stat-hint {
      font-size: 13px;
      color: var(--text-tertiary);
    }

    .stat-card.primary .stat-hint {
      color: rgba(255, 255, 255, 0.6);
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

    .section-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .show-all-toggle {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .section-header button {
      color: var(--text-secondary);
    }

    .filter-field {
      width: 200px;
    }

    .filter-field .mat-mdc-form-field-subscript-wrapper {
      display: none;
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

    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
    }

    table {
      width: 100%;
    }

    ::ng-deep .table-container .mat-mdc-header-row {
      background: var(--bg-elevated);
    }

    ::ng-deep .table-container .mat-mdc-header-cell {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    ::ng-deep .table-container .mat-mdc-cell {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    ::ng-deep .table-container .mat-mdc-row:last-child .mat-mdc-cell {
      border-bottom: none;
    }

    .asset-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .asset-logo {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: contain;
    }

    .asset-name {
      font-weight: 500;
    }

    .exchanges-cell {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .exchange-mini-logo {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      object-fit: contain;
    }

    .price-cell-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .price-cell {
      font-weight: 700;
      color: var(--text-primary);
    }

    .price-sources {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .price-source-logo {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      opacity: 0.7;
      cursor: help;
      transition: opacity 0.15s ease;
    }

    .price-source-logo:hover {
      opacity: 1;
    }

    .change-cell {
      font-weight: 600;
      font-size: 13px;
    }

    .change-cell.positive {
      color: var(--color-success);
    }

    .change-cell.negative {
      color: var(--color-error);
    }

    .change-cell.neutral {
      color: var(--text-tertiary);
    }

    .quantity-cell {
      font-weight: 500;
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
      color: var(--text-secondary);
    }

    .value-cell {
      font-weight: 700;
      color: var(--text-primary);
    }

    .exchanges-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .exchange-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .exchange-card:hover {
      border-color: var(--brand-primary);
      transform: translateY(-2px);
    }

    .exchange-card.selected {
      border-color: var(--brand-primary);
      box-shadow: 0 0 12px rgba(240, 185, 11, 0.3);
    }

    .exchange-card.dimmed {
      opacity: 0.4;
      filter: grayscale(0.8);
    }

    .exchange-card.dimmed:hover {
      opacity: 0.7;
      filter: grayscale(0.4);
    }

    .exchange-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .exchange-info {
      display: flex;
      flex-direction: column;
    }

    .exchange-name {
      font-weight: 600;
      color: var(--text-primary);
    }

    .exchange-label {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .exchange-value {
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .exchange-assets {
      font-size: 13px;
      color: var(--text-tertiary);
    }

    .top-assets-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
    }

    @media (max-width: 1200px) {
      .top-assets-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 600px) {
      .top-assets-grid {
        grid-template-columns: 1fr;
      }
    }

    .top-asset-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .top-asset-logo {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: contain;
    }

    .top-asset-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .top-asset-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .top-asset-amount {
      font-size: 12px;
      color: var(--text-secondary);
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    }

    .top-asset-value {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    /* Skeleton Styles */
    .skeleton-pulse {
      background: linear-gradient(
        90deg,
        var(--bg-tertiary) 0%,
        var(--bg-elevated) 50%,
        var(--bg-tertiary) 100%
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
      height: 14px;
      border-radius: 4px;
    }

    .skeleton-circle {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .stat-value-skeleton {
      width: 180px;
      height: 38px;
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .stat-card.primary .skeleton-pulse {
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.1) 0%,
        rgba(255, 255, 255, 0.2) 50%,
        rgba(255, 255, 255, 0.1) 100%
      );
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s infinite;
    }

    .skeleton-card {
      pointer-events: none;
    }

    .skeleton-logo {
      width: 44px;
      height: 44px;
      border-radius: 12px;
    }

    .skeleton-asset-logo {
      width: 40px;
      height: 40px;
      border-radius: 50%;
    }

    .skeleton-asset-logo-sm {
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }

    .skeleton-exchange-logo {
      width: 24px;
      height: 24px;
      border-radius: 6px;
    }

    .skeleton-table {
      padding: 0;
    }

    .skeleton-table-header {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr 0.8fr 1.2fr 1fr;
      gap: 16px;
      padding: 16px;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border-color);
    }

    .skeleton-table-header .skeleton-text {
      height: 12px;
    }

    .skeleton-table-row {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr 0.8fr 1.2fr 1fr;
      gap: 16px;
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .skeleton-table-row:last-child {
      border-bottom: none;
    }

    .skeleton-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .skeleton-cell .skeleton-text {
      height: 14px;
    }
  `]
})
export class BalancesComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(MatSort) sort!: MatSort;
  private destroyRef = inject(DestroyRef);

  balances = signal<ConsolidatedBalance | null>(null);
  loading = signal(true);
  error = signal('');
  isSyncing = signal(false);

  displayedColumns = ['asset', 'exchanges', 'price', 'change24h', 'total', 'value'];
  dataSource = new MatTableDataSource<AssetBalance>([]);
  originalAssets: AssetBalance[] = [];
  allAssets: AssetBalance[] = [];
  originalTotalValueUsd = 0;
  selectedExchanges = new Set<string>();
  showAllAssets = false;
  configuredAssets = new Set<string>();

  constructor(
    private api: ApiService,
    private authService: AuthService,
    public priceSocket: PriceSocketService,
    private balanceSocket: BalanceSocketService,
    private settingsService: SettingsService
  ) {
    this.dataSource.filterPredicate = (data: AssetBalance, filter: string) => {
      return data.asset.toLowerCase().includes(filter);
    };

    effect(() => {
      const socketPrices = this.priceSocket.prices();
      this.updateTablePrices(socketPrices);
    });

    this.balanceSocket.balanceUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((updatedBalance) => {
        this.updateBalanceData(updatedBalance);
        this.isSyncing.set(false);
      });
  }

  ngOnInit() {
    const userId = this.authService.user()?.id;
    if (userId) {
      this.balanceSocket.connect(userId);
    }

    this.loadConfiguredAssets();
    this.loadBalances();
    this.priceSocket.connect();
  }

  private loadConfiguredAssets(): void {
    this.settingsService.loadAllSymbols().subscribe({
      next: (response: { symbolsByExchange: Record<string, string[]> }) => {
        this.configuredAssets.clear();
        // Collect assets from all exchanges
        for (const symbols of Object.values(response.symbolsByExchange || {})) {
          for (const symbol of symbols) {
            const base = symbol.split('/')[0];
            this.configuredAssets.add(base);
          }
        }
        this.applyExchangeFilter();
      },
      error: (err: Error) => {
        console.error('Error loading configured assets:', err);
      }
    });
  }

  onShowAllToggle(): void {
    this.applyExchangeFilter();
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
  }

  ngOnDestroy() {
    this.priceSocket.disconnect();
    this.balanceSocket.disconnect();
  }

  private updateTablePrices(socketPrices: Map<string, { symbol: string; price: number }>): void {
    if (!this.originalAssets.length || socketPrices.size === 0) return;

    let hasUpdates = false;

    this.originalAssets = this.originalAssets.map(asset => {
      const priceResult = this.calculateAssetPrice(asset);
      if (priceResult && (priceResult.price !== asset.priceUsd || priceResult.change24h !== asset.change24h)) {
        hasUpdates = true;
        return {
          ...asset,
          priceUsd: priceResult.price,
          valueUsd: asset.total * priceResult.price,
          pricePair: priceResult.pair,
          pricesByExchange: priceResult.pricesByExchange,
          isAveragePrice: priceResult.isAverage,
          change24h: priceResult.change24h,
        };
      }
      return asset;
    });

    this.allAssets = this.allAssets.map(asset => {
      const priceResult = this.calculateAssetPrice(asset);
      if (priceResult && (priceResult.price !== asset.priceUsd || priceResult.change24h !== asset.change24h)) {
        return {
          ...asset,
          priceUsd: priceResult.price,
          valueUsd: asset.total * priceResult.price,
          pricePair: priceResult.pair,
          pricesByExchange: priceResult.pricesByExchange,
          isAveragePrice: priceResult.isAverage,
          change24h: priceResult.change24h,
        };
      }
      return asset;
    });

    if (hasUpdates) {
      this.originalTotalValueUsd = this.originalAssets.reduce(
        (sum, asset) => sum + (asset.valueUsd || 0), 0
      );
      this.applyExchangeFilter();
    }
  }

  /**
   * Calculate the price for an asset based on:
   * 1. If 1 exchange is selected in filter and we have price from it → use it
   * 2. If asset is in 1 exchange and we have that exchange's price → use it
   * 3. If asset is in multiple exchanges → average
   * 4. If asset is in 1 exchange but no price from that exchange → average of available
   */
  private calculateAssetPrice(asset: AssetBalance): { price: number; pair: string; pricesByExchange: { exchange: string; price: number; pair: string; change24h?: number }[]; isAverage: boolean; change24h?: number } | undefined {
    const multiPrice = this.priceSocket.getMultiExchangePrice(asset.asset);
    if (!multiPrice || multiPrice.prices.length === 0) {
      // Fallback: try simple price lookup
      const simplePrice = this.priceSocket.getPriceByAssetWithPair(asset.asset);
      if (simplePrice) {
        return {
          price: simplePrice.price,
          pair: simplePrice.pair,
          pricesByExchange: [], // No exchange info available
          isAverage: false,
          change24h: undefined,
        };
      }
      return undefined;
    }

    // Case: 1 exchange selected in filter and we have price from it
    if (this.selectedExchanges.size === 1) {
      const selectedExchange = Array.from(this.selectedExchanges)[0];
      const matchingPrice = multiPrice.prices.find(p => p.exchange === selectedExchange);

      if (matchingPrice) {
        return {
          price: matchingPrice.price,
          pair: matchingPrice.pair,
          pricesByExchange: [matchingPrice],
          isAverage: false,
          change24h: matchingPrice.change24h,
        };
      }
      // No price from selected exchange, fall through to other logic
    }

    const assetExchanges = asset.exchanges || [];

    // Case: Asset in only one exchange
    if (assetExchanges.length === 1) {
      const assetExchange = assetExchanges[0];
      // Check if we have price from that specific exchange
      const matchingPrice = multiPrice.prices.find(p => p.exchange === assetExchange);

      if (matchingPrice) {
        // Use the price from the exchange where the asset is held
        return {
          price: matchingPrice.price,
          pair: matchingPrice.pair,
          pricesByExchange: [matchingPrice],
          isAverage: false,
          change24h: matchingPrice.change24h,
        };
      }
      // No price from that exchange, use average of available
    }

    // Case: Asset in multiple exchanges OR no price from specific exchange
    // Use average of all available prices
    return {
      price: multiPrice.averagePrice,
      pair: multiPrice.pair,
      pricesByExchange: multiPrice.prices,
      isAverage: multiPrice.prices.length > 1,
      change24h: multiPrice.change24h,
    };
  }

  hasExchanges(): boolean {
    return (this.balances()?.byExchange?.length || 0) > 0;
  }

  getSortedExchanges(): ExchangeBalance[] {
    const exchanges = this.balances()?.byExchange || [];
    return [...exchanges].sort((a, b) => b.totalValueUsd - a.totalValueUsd);
  }

  getTopAssets(): AssetBalance[] {
    return this.allAssets
      .filter(a => (a.valueUsd || 0) > 0)
      .slice(0, 4);
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  loadBalances() {
    this.loading.set(true);
    this.error.set('');

    this.api.get<ConsolidatedBalance>('/balances').subscribe({
      next: (data) => {
        this.updateBalanceData(data);
        this.loading.set(false);

        if (data.isCached) {
          this.isSyncing.set(true);
        }

        const symbols = (data.byAsset || [])
          .map(a => `${a.asset}/USDT`)
          .filter(s => !s.startsWith('USDT/') && !s.startsWith('USD/'));
        this.priceSocket.subscribe(symbols);

        setTimeout(() => {
          if (this.sort) {
            this.sort.sort({ id: 'value', start: 'desc', disableClear: false });
          }
        });
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Error al cargar balances');
        this.loading.set(false);
      }
    });
  }

  private updateBalanceData(data: ConsolidatedBalance): void {
    this.balances.set(data);
    const sortedAssets = [...(data.byAsset || [])].sort((a, b) =>
      (b.valueUsd || 0) - (a.valueUsd || 0)
    );
    this.originalAssets = JSON.parse(JSON.stringify(sortedAssets));
    this.allAssets = sortedAssets;
    this.originalTotalValueUsd = data.totalValueUsd;
    this.selectedExchanges.clear();
    this.applyExchangeFilter();
  }

  toggleExchangeFilter(exchange: string): void {
    if (this.selectedExchanges.has(exchange)) {
      this.selectedExchanges.delete(exchange);
    } else {
      this.selectedExchanges.add(exchange);
    }
    this.applyExchangeFilter();
  }

  isExchangeSelected(exchange: string): boolean {
    return this.selectedExchanges.has(exchange);
  }

  hasExchangeFilter(): boolean {
    return this.selectedExchanges.size > 0;
  }

  applyExchangeFilter(): void {
    let assetsToProcess = [...this.originalAssets];

    if (!this.showAllAssets && this.configuredAssets.size > 0) {
      assetsToProcess = assetsToProcess.filter(asset =>
        this.configuredAssets.has(asset.asset)
      );
    }

    // Recalculate prices based on current filter
    assetsToProcess = assetsToProcess.map(asset => {
      const priceResult = this.calculateAssetPrice(asset);
      if (priceResult) {
        return {
          ...asset,
          priceUsd: priceResult.price,
          valueUsd: asset.total * priceResult.price,
          pricePair: priceResult.pair,
          pricesByExchange: priceResult.pricesByExchange,
          isAveragePrice: priceResult.isAverage,
          change24h: priceResult.change24h,
        };
      }
      return asset;
    });

    // If no exchanges selected, show all
    if (this.selectedExchanges.size === 0) {
      this.allAssets = assetsToProcess.sort((a, b) =>
        (b.valueUsd || 0) - (a.valueUsd || 0)
      );
      this.dataSource.data = this.allAssets;

      const currentTotal = this.allAssets.reduce(
        (sum, asset) => sum + (asset.valueUsd || 0), 0
      );
      const balanceData = this.balances();
      if (balanceData) {
        this.balances.set({
          ...balanceData,
          totalValueUsd: currentTotal,
        });
      }
    } else {
      // Filter to INCLUDE only selected exchanges
      const filteredAssets: AssetBalance[] = [];

      for (const asset of assetsToProcess) {
        const filteredBreakdown = asset.exchangeBreakdown?.filter(
          b => this.selectedExchanges.has(b.exchange)
        ) || [];

        if (filteredBreakdown.length === 0) {
          continue;
        }

        const filteredTotal = filteredBreakdown.reduce((sum, b) => sum + b.total, 0);
        // Recalculate price for filtered asset
        const priceResult = this.calculateAssetPrice({ ...asset, exchanges: filteredBreakdown.map(b => b.exchange) });
        const priceUsd = priceResult?.price || asset.priceUsd || 0;
        const filteredValueUsd = filteredTotal * priceUsd;

        filteredAssets.push({
          ...asset,
          total: filteredTotal,
          priceUsd: priceUsd,
          valueUsd: filteredValueUsd,
          exchanges: filteredBreakdown.map(b => b.exchange),
          exchangeBreakdown: filteredBreakdown,
          pricesByExchange: priceResult?.pricesByExchange || asset.pricesByExchange,
          isAveragePrice: priceResult?.isAverage,
          change24h: priceResult?.change24h,
        });
      }

      filteredAssets.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

      this.allAssets = filteredAssets;
      this.dataSource.data = filteredAssets;

      const filteredTotal = filteredAssets.reduce(
        (sum, asset) => sum + (asset.valueUsd || 0), 0
      );
      const balanceData = this.balances();
      if (balanceData) {
        this.balances.set({
          ...balanceData,
          totalValueUsd: filteredTotal,
        });
      }
    }
  }

  getExchangeTooltip(row: AssetBalance, exchange: string): string {
    const breakdown = row.exchangeBreakdown?.find(b => b.exchange === exchange);
    if (breakdown) {
      const amount = this.formatAmount(breakdown.total);
      const usdValue = (breakdown.total * (row.priceUsd || 0));
      const usdFormatted = usdValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      return `${amount} ${row.asset} (${usdFormatted})`;
    }
    return exchange;
  }

  getPriceBreakdownTooltip(row: AssetBalance): string {
    if (!row.pricesByExchange || row.pricesByExchange.length === 0) {
      return 'Precio';
    }

    const lines = row.pricesByExchange.map(ep => {
      const priceFormatted = ep.price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
      return `${this.getExchangeDisplayName(ep.exchange)}: ${priceFormatted}`;
    });

    if (row.isAveragePrice) {
      const avgFormatted = (row.priceUsd || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
      lines.push(`Promedio: ${avgFormatted}`);
    }

    return lines.join('\n');
  }

  private formatAmount(value: number): string {
    if (value >= 1) {
      return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    } else if (value >= 0.0001) {
      return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    } else {
      return value.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
    }
  }

  getExchangeDisplayName(exchange: string): string {
    const displayNames: Record<string, string> = {
      'binance': 'Binance',
      'kraken': 'Kraken',
      'nexo-pro': 'Nexo Pro',
      'nexo-manual': 'Nexo Manual'
    };
    return displayNames[exchange] || exchange;
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
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--brand-primary);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 11px;
      `;
      parent.insertBefore(fallback, img);
    }
  }
}
