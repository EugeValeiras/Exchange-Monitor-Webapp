import { Component, OnInit, signal, computed, inject, DestroyRef } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { timer, forkJoin, of } from 'rxjs';
import { filter, switchMap, catchError } from 'rxjs/operators';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import {
  Chart,
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Tooltip,
  Filler,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import {
  PaperTradingService,
  PaperAccount,
  PaperPosition,
  PaperPerformance,
  PaperOrder,
} from '../../core/services/paper-trading.service';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

// Register Chart.js components
Chart.register(
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Tooltip,
  Filler,
);

const POLL_INTERVAL_MS = 10_000;

@Component({
  selector: 'app-paper-trading',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    DecimalPipe,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
    BaseChartDirective,
  ],
  template: `
    <div class="paper-content">
      @if (error()) {
        <div class="error-container">
          <mat-icon>error_outline</mat-icon>
          <h3>Error al cargar datos</h3>
          <p>{{ error() }}</p>
          <button mat-raised-button color="primary" (click)="loadAccounts()">
            <mat-icon>refresh</mat-icon>
            Reintentar
          </button>
        </div>
      } @else if (loadingAccounts()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
        </div>
      } @else if (accounts().length === 0) {
        <div class="empty-container">
          <div class="empty-icon">
            <mat-icon>science</mat-icon>
          </div>
          <h2>No hay cuentas de paper trading</h2>
          <p>Crea una cuenta simulada para empezar a operar sin riesgo</p>
          <button mat-raised-button color="primary" (click)="createAccount()" [disabled]="creating()">
            <mat-icon>add</mat-icon>
            Crear Cuenta
          </button>
        </div>
      } @else {
        <!-- Toolbar: account selector + actions -->
        <div class="toolbar">
          @if (accounts().length > 1) {
            <mat-form-field appearance="outline" class="account-field" subscriptSizing="dynamic">
              <mat-label>Cuenta</mat-label>
              <mat-select [value]="selectedAccountId()" (selectionChange)="onAccountChange($event.value)">
                @for (account of accounts(); track account.id) {
                  <mat-option [value]="account.id">{{ account.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          } @else {
            <div class="account-name">
              <mat-icon>science</mat-icon>
              <span>{{ accounts()[0].name }}</span>
            </div>
          }
          <div class="toolbar-actions">
            <button mat-icon-button (click)="refresh()" matTooltip="Actualizar" class="refresh-btn">
              <mat-icon>refresh</mat-icon>
            </button>
            <button mat-stroked-button color="warn" (click)="confirmReset()" [disabled]="resetting()">
              <mat-icon>restart_alt</mat-icon>
              Resetear cuenta
            </button>
          </div>
        </div>

        @if (loadingData() && !performance()) {
          <div class="loading-container">
            <mat-spinner diameter="48"></mat-spinner>
          </div>
        }
        @if (performance(); as perf) {
          <!-- Summary cards -->
          <div class="stats-grid">
            <div class="stat-card primary">
              <div class="stat-header">
                <span class="stat-label">Equity</span>
                <mat-icon>account_balance</mat-icon>
              </div>
              <span class="stat-value">{{ perf.equity | currency:'USD':'symbol':'1.2-2' }}</span>
              <span class="stat-hint">Saldo inicial: {{ perf.initialBalance | currency:'USD':'symbol':'1.2-2' }}</span>
            </div>

            <div class="stat-card">
              <div class="stat-header">
                <span class="stat-label">Resultado total</span>
                <mat-icon>trending_up</mat-icon>
              </div>
              <span class="stat-value" [class.positive]="perf.totalPnl >= 0" [class.negative]="perf.totalPnl < 0">
                {{ perf.totalPnl >= 0 ? '+' : '' }}{{ perf.totalPnl | currency:'USD':'symbol':'1.2-2' }}
              </span>
              <span class="stat-sub" [class.positive]="perf.totalPnlPct >= 0" [class.negative]="perf.totalPnlPct < 0">
                {{ perf.totalPnlPct >= 0 ? '+' : '' }}{{ perf.totalPnlPct | number:'1.2-2' }}%
              </span>
            </div>

            <div class="stat-card">
              <div class="stat-header">
                <span class="stat-label">Realizado / No realizado</span>
                <mat-icon>call_split</mat-icon>
              </div>
              <span class="stat-value small" [class.positive]="perf.realizedPnl >= 0" [class.negative]="perf.realizedPnl < 0">
                {{ perf.realizedPnl >= 0 ? '+' : '' }}{{ perf.realizedPnl | currency:'USD':'symbol':'1.2-2' }}
              </span>
              <span class="stat-sub" [class.positive]="perf.unrealizedPnl >= 0" [class.negative]="perf.unrealizedPnl < 0">
                {{ perf.unrealizedPnl >= 0 ? '+' : '' }}{{ perf.unrealizedPnl | currency:'USD':'symbol':'1.2-2' }} no realizado
              </span>
            </div>

            <div class="stat-card">
              <div class="stat-header">
                <span class="stat-label">Comisiones</span>
                <mat-icon>receipt_long</mat-icon>
              </div>
              <span class="stat-value small">{{ perf.feesPaid | currency:'USD':'symbol':'1.2-2' }}</span>
              <span class="stat-hint">{{ perf.totalTrades }} trade{{ perf.totalTrades !== 1 ? 's' : '' }}</span>
            </div>

            <div class="stat-card">
              <div class="stat-header">
                <span class="stat-label">Aciertos</span>
                <mat-icon>emoji_events</mat-icon>
              </div>
              <span class="stat-value small">
                @if (perf.winRate !== null) {
                  {{ perf.winRate * 100 | number:'1.0-1' }}%
                } @else {
                  —
                }
              </span>
              <span class="stat-hint">Max drawdown: {{ perf.maxDrawdownPct | number:'1.2-2' }}%</span>
            </div>

            <div class="stat-card">
              <div class="stat-header">
                <span class="stat-label">Saldo USDT</span>
                <mat-icon>account_balance_wallet</mat-icon>
              </div>
              <span class="stat-value small">{{ usdtFree() | currency:'USD':'symbol':'1.2-2' }}</span>
              <span class="stat-hint">Bloqueado: {{ usdtLocked() | currency:'USD':'symbol':'1.2-2' }}</span>
            </div>
          </div>

          <!-- Equity chart -->
          <div class="section">
            <mat-card class="chart-card">
              <mat-card-header>
                <mat-card-title>Evolución</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                @if (perf.equityCurve.length > 0) {
                  <div class="chart-container">
                    <canvas
                      baseChart
                      [data]="equityChartData()"
                      [options]="equityChartOptions"
                      [type]="'line'">
                    </canvas>
                  </div>
                } @else {
                  <div class="chart-empty">
                    <mat-icon>show_chart</mat-icon>
                    <p>Todavía no hay evolución para mostrar</p>
                    <p class="hint">La curva se genera a medida que se ejecutan órdenes</p>
                  </div>
                }
              </mat-card-content>
            </mat-card>
          </div>

          <!-- Open positions -->
          <div class="section">
            <div class="section-header">
              <h2>Posiciones abiertas</h2>
            </div>
            <div class="table-container">
              @if (positions().length === 0) {
                <div class="table-empty">
                  <mat-icon>inbox</mat-icon>
                  <p>No tenés posiciones abiertas</p>
                </div>
              } @else {
                <table mat-table [dataSource]="positions()">
                  <ng-container matColumnDef="asset">
                    <th mat-header-cell *matHeaderCellDef>Activo</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="asset-name">{{ row.asset }}</span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="amount">
                    <th mat-header-cell *matHeaderCellDef>Cantidad</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="mono-cell">{{ row.amount | number:'1.4-8' }}</span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="avgEntryPrice">
                    <th mat-header-cell *matHeaderCellDef>Precio de entrada</th>
                    <td mat-cell *matCellDef="let row">
                      {{ row.avgEntryPrice | currency:'USD':'symbol':'1.2-4' }}
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="currentPrice">
                    <th mat-header-cell *matHeaderCellDef>Precio actual</th>
                    <td mat-cell *matCellDef="let row">
                      {{ row.currentPrice | currency:'USD':'symbol':'1.2-4' }}
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="valueUsd">
                    <th mat-header-cell *matHeaderCellDef>Valor USD</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="value-cell">{{ row.valueUsd | currency:'USD':'symbol':'1.2-2' }}</span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="unrealizedPnl">
                    <th mat-header-cell *matHeaderCellDef>P&L No realizado</th>
                    <td mat-cell *matCellDef="let row">
                      <div class="pnl-cell" [class.positive]="row.unrealizedPnl >= 0" [class.negative]="row.unrealizedPnl < 0">
                        <span class="pnl-value">{{ row.unrealizedPnl >= 0 ? '+' : '' }}{{ row.unrealizedPnl | currency:'USD':'symbol':'1.2-2' }}</span>
                        <span class="pnl-percent">{{ row.unrealizedPnlPct >= 0 ? '+' : '' }}{{ row.unrealizedPnlPct | number:'1.2-2' }}%</span>
                      </div>
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="positionColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: positionColumns;"></tr>
                </table>
              }
            </div>
          </div>

          <!-- Open orders -->
          <div class="section">
            <div class="section-header">
              <h2>Órdenes abiertas</h2>
            </div>
            <div class="table-container">
              @if (openOrders().length === 0) {
                <div class="table-empty">
                  <mat-icon>pending_actions</mat-icon>
                  <p>No tenés órdenes abiertas</p>
                </div>
              } @else {
                <table mat-table [dataSource]="openOrders()">
                  <ng-container matColumnDef="symbol">
                    <th mat-header-cell *matHeaderCellDef>Símbolo</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="asset-name">{{ row.symbol }}</span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="side">
                    <th mat-header-cell *matHeaderCellDef>Lado</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="side-badge" [class.buy]="row.side === 'buy'" [class.sell]="row.side === 'sell'">
                        {{ row.side === 'buy' ? 'Compra' : 'Venta' }}
                      </span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="type">
                    <th mat-header-cell *matHeaderCellDef>Tipo</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="type-cell">{{ row.type }}</span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="amount">
                    <th mat-header-cell *matHeaderCellDef>Cantidad</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="mono-cell">
                        @if (row.amount != null) {
                          {{ row.amount | number:'1.4-8' }}
                        } @else if (row.quoteAmount != null) {
                          {{ row.quoteAmount | currency:'USD':'symbol':'1.2-2' }}
                        } @else {
                          --
                        }
                      </span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="limitPrice">
                    <th mat-header-cell *matHeaderCellDef>Limit / Stop</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="mono-cell">
                        @if (row.limitPrice != null) {
                          {{ row.limitPrice | currency:'USD':'symbol':'1.2-4' }}
                        } @else if (row.stopPrice != null) {
                          {{ row.stopPrice | currency:'USD':'symbol':'1.2-4' }}
                        } @else {
                          --
                        }
                      </span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="requestedPrice">
                    <th mat-header-cell *matHeaderCellDef>Precio Ref.</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="mono-cell">
                        @if (row.requestedPrice != null) {
                          {{ row.requestedPrice | currency:'USD':'symbol':'1.2-4' }}
                        } @else {
                          --
                        }
                      </span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="note">
                    <th mat-header-cell *matHeaderCellDef>Nota</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="note-cell" [matTooltip]="row.note || ''">{{ row.note || '--' }}</span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="createdAt">
                    <th mat-header-cell *matHeaderCellDef>Creada</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="date-cell">{{ row.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="actions">
                    <th mat-header-cell *matHeaderCellDef></th>
                    <td mat-cell *matCellDef="let row">
                      <button
                        mat-icon-button
                        color="warn"
                        (click)="cancelOrder(row)"
                        [disabled]="cancelingOrderId() === row.id"
                        matTooltip="Cancelar orden">
                        <mat-icon>cancel</mat-icon>
                      </button>
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="openOrderColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: openOrderColumns;"></tr>
                </table>
              }
            </div>
          </div>

          <!-- Recent trades -->
          <div class="section">
            <div class="section-header">
              <h2>Últimos trades</h2>
            </div>
            <div class="table-container">
              @if (trades().length === 0) {
                <div class="table-empty">
                  <mat-icon>history</mat-icon>
                  <p>Todavía no hay operaciones</p>
                </div>
              } @else {
                <table mat-table [dataSource]="trades()">
                  <ng-container matColumnDef="filledAt">
                    <th mat-header-cell *matHeaderCellDef>Fecha</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="date-cell">{{ (row.filledAt || row.createdAt) | date:'dd/MM/yyyy HH:mm' }}</span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="symbol">
                    <th mat-header-cell *matHeaderCellDef>Símbolo</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="asset-name">{{ row.symbol }}</span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="side">
                    <th mat-header-cell *matHeaderCellDef>Lado</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="side-badge" [class.buy]="row.side === 'buy'" [class.sell]="row.side === 'sell'">
                        {{ row.side === 'buy' ? 'Compra' : 'Venta' }}
                      </span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="amount">
                    <th mat-header-cell *matHeaderCellDef>Cantidad</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="mono-cell">
                        @if (row.amount != null) {
                          {{ row.amount | number:'1.4-8' }}
                        } @else {
                          --
                        }
                      </span>
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="filledPrice">
                    <th mat-header-cell *matHeaderCellDef>Precio</th>
                    <td mat-cell *matCellDef="let row">
                      @if (row.filledPrice != null) {
                        {{ row.filledPrice | currency:'USD':'symbol':'1.2-4' }}
                      } @else {
                        --
                      }
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="fee">
                    <th mat-header-cell *matHeaderCellDef>Fee</th>
                    <td mat-cell *matCellDef="let row">
                      @if (row.fee != null) {
                        <span class="mono-cell">{{ row.fee | number:'1.2-6' }} {{ row.feeAsset || '' }}</span>
                      } @else {
                        --
                      }
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="realizedPnl">
                    <th mat-header-cell *matHeaderCellDef>Realizado</th>
                    <td mat-cell *matCellDef="let row">
                      @if (row.realizedPnl != null) {
                        <span class="pnl-value" [class.positive]="row.realizedPnl >= 0" [class.negative]="row.realizedPnl < 0">
                          {{ row.realizedPnl >= 0 ? '+' : '' }}{{ row.realizedPnl | currency:'USD':'symbol':'1.2-2' }}
                        </span>
                      } @else {
                        --
                      }
                    </td>
                  </ng-container>

                  <ng-container matColumnDef="note">
                    <th mat-header-cell *matHeaderCellDef>Nota</th>
                    <td mat-cell *matCellDef="let row">
                      <span class="note-cell" [matTooltip]="row.note || ''">{{ row.note || '--' }}</span>
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="tradeColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: tradeColumns;"></tr>
                </table>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .paper-content {
      padding: 24px;
    }

    @media (max-width: 900px) {
      .paper-content {
        padding: 12px;
      }
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 80px;
    }

    .error-container,
    .empty-container {
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

    .error-container h3,
    .empty-container h2 {
      margin: 0 0 8px 0;
      color: var(--text-primary);
    }

    .error-container p,
    .empty-container p {
      margin: 0 0 24px 0;
      color: var(--text-secondary);
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

    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .account-field {
      width: 260px;
    }

    .account-name {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 17px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .account-name mat-icon {
      color: var(--text-primary);
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .refresh-btn {
      color: var(--text-secondary);
    }

    .refresh-btn:hover {
      color: var(--text-primary);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
    }

    .stat-card.primary {
      background: linear-gradient(135deg, var(--bg-selected) 0%, var(--bg-tertiary) 100%);
      border: none;
    }

    .stat-card.primary .stat-label {
      color: rgba(255, 255, 255, 0.8);
    }

    .stat-card.primary .stat-value {
      color: white;
    }

    .stat-card.primary .stat-hint {
      color: rgba(255, 255, 255, 0.6);
    }

    .stat-card.primary .stat-header mat-icon {
      color: var(--text-primary);
    }

    .stat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .stat-label {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .stat-header mat-icon {
      color: var(--text-tertiary);
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .stat-value.small {
      font-size: 20px;
    }

    .stat-sub {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .stat-hint {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .positive {
      color: var(--color-success) !important;
    }

    .negative {
      color: var(--color-error) !important;
    }

    .section {
      margin-bottom: 32px;
    }

    .section-header {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      margin-bottom: 16px;
    }

    .section-header h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .chart-card mat-card-title {
      font-size: 17px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .chart-card mat-card-header {
      margin-bottom: 8px;
    }

    .chart-container {
      height: 300px;
      position: relative;
    }

    .chart-empty,
    .table-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      color: var(--text-secondary);
    }

    .chart-empty {
      height: 300px;
      padding: 0;
    }

    .chart-empty mat-icon,
    .table-empty mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .chart-empty p,
    .table-empty p {
      margin: 0;
    }

    .chart-empty .hint {
      font-size: 13px;
      margin-top: 8px;
      opacity: 0.7;
    }

    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow-x: auto;
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
      white-space: nowrap;
    }

    ::ng-deep .table-container .mat-mdc-cell {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    ::ng-deep .table-container .mat-mdc-row:last-child .mat-mdc-cell {
      border-bottom: none;
    }

    .asset-name {
      font-weight: 600;
      color: var(--text-primary);
    }

    .mono-cell {
      color: var(--text-secondary);
      font-weight: 500;
    }

    .value-cell {
      font-weight: 700;
      color: var(--text-primary);
    }

    .type-cell {
      text-transform: uppercase;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      letter-spacing: 0.04em;
    }

    .date-cell {
      font-size: 13px;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .note-cell {
      display: inline-block;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      color: var(--text-secondary);
      vertical-align: middle;
    }

    .side-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }

    .side-badge.buy {
      background: rgba(92, 190, 146, 0.12);
      color: var(--color-success);
    }

    .side-badge.sell {
      background: rgba(224, 107, 98, 0.12);
      color: var(--color-error);
    }

    .pnl-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .pnl-cell.positive .pnl-value,
    .pnl-cell.positive .pnl-percent {
      color: var(--color-success);
    }

    .pnl-cell.negative .pnl-value,
    .pnl-cell.negative .pnl-percent {
      color: var(--color-error);
    }

    .pnl-value {
      font-weight: 600;
      font-size: 13px;
    }

    .pnl-percent {
      font-size: 11px;
      opacity: 0.8;
    }
  `]
})
export class PaperTradingComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private paperService = inject(PaperTradingService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  // State
  accounts = signal<PaperAccount[]>([]);
  selectedAccountId = signal<string | null>(null);
  account = signal<PaperAccount | null>(null);
  positions = signal<PaperPosition[]>([]);
  performance = signal<PaperPerformance | null>(null);
  openOrders = signal<PaperOrder[]>([]);
  trades = signal<PaperOrder[]>([]);

  loadingAccounts = signal(true);
  loadingData = signal(false);
  creating = signal(false);
  resetting = signal(false);
  cancelingOrderId = signal<string | null>(null);
  error = signal<string | null>(null);

  positionColumns = ['asset', 'amount', 'avgEntryPrice', 'currentPrice', 'valueUsd', 'unrealizedPnl'];
  openOrderColumns = ['symbol', 'side', 'type', 'amount', 'limitPrice', 'requestedPrice', 'note', 'createdAt', 'actions'];
  tradeColumns = ['filledAt', 'symbol', 'side', 'amount', 'filledPrice', 'fee', 'realizedPnl', 'note'];

  usdtFree = computed(() => this.account()?.balances?.['USDT']?.free ?? 0);
  usdtLocked = computed(() => this.account()?.balances?.['USDT']?.locked ?? 0);

  equityChartData = computed<ChartData<'line'>>(() => {
    const perf = this.performance();
    if (!perf || perf.equityCurve.length === 0) {
      return { datasets: [] };
    }

    const isPositive = perf.totalPnl >= 0;
    const color = isPositive ? '#5cbe92' : '#e06b62';

    const points = perf.equityCurve.map(p => ({
      x: new Date(p.timestamp).getTime(),
      y: p.equity,
    }));

    return {
      datasets: [
        {
          label: 'Equity',
          data: points,
          borderColor: color,
          backgroundColor: `${color}20`,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#f2f3f5',
          pointHoverBorderWidth: 2,
          borderWidth: 2,
        },
        // Línea punteada de referencia en el balance inicial
        {
          label: 'Saldo inicial',
          data: [
            { x: points[0].x, y: perf.initialBalance },
            { x: points[points.length - 1].x, y: perf.initialBalance },
          ],
          borderColor: 'rgba(255, 255, 255, 0.4)',
          borderDash: [6, 6],
          borderWidth: 1.5,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
      ],
    };
  });

  equityChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#f2f3f5',
        bodyColor: '#f2f3f5',
        padding: 12,
        filter: (item) => item.datasetIndex === 0,
        callbacks: {
          title: (tooltipItems) => {
            if (tooltipItems.length === 0) return '';
            const ts = Number(tooltipItems[0].parsed.x ?? 0);
            return new Date(ts).toLocaleString('es-AR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
          },
          label: (context) => {
            const value = context.parsed.y ?? 0;
            return `$${value.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          maxTicksLimit: 8,
        },
        grid: {
          display: false,
        },
      },
      y: {
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          callback: (value) => `$${Number(value).toLocaleString()}`,
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
      },
    },
  };

  ngOnInit(): void {
    this.loadAccounts();

    // Auto-refresh cada 10s (el motor de fills corre cada 10s en el backend).
    // Se pausa cuando el tab está oculto y se cancela al destruir el componente.
    timer(POLL_INTERVAL_MS, POLL_INTERVAL_MS)
      .pipe(
        filter(() => !document.hidden && !!this.selectedAccountId()),
        switchMap(() => this.fetchAccountData$(this.selectedAccountId()!)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result) {
          this.applyAccountData(result);
        }
      });
  }

  loadAccounts(): void {
    this.loadingAccounts.set(true);
    this.error.set(null);
    this.paperService.getAccounts().subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.loadingAccounts.set(false);
        if (accounts.length > 0) {
          const current = this.selectedAccountId();
          const exists = current && accounts.some(a => a.id === current);
          const accountId = exists ? current! : accounts[0].id;
          this.selectedAccountId.set(accountId);
          this.loadAccountData(accountId);
        }
      },
      error: (err) => {
        console.error('Error loading paper trading accounts:', err);
        this.error.set('No se pudieron cargar las cuentas de paper trading');
        this.loadingAccounts.set(false);
      },
    });
  }

  onAccountChange(accountId: string): void {
    this.selectedAccountId.set(accountId);
    this.performance.set(null);
    this.loadAccountData(accountId);
  }

  refresh(): void {
    const accountId = this.selectedAccountId();
    if (accountId) {
      this.loadAccountData(accountId);
    }
  }

  private loadAccountData(accountId: string): void {
    this.loadingData.set(true);
    this.fetchAccountData$(accountId).subscribe((result) => {
      this.loadingData.set(false);
      if (result) {
        this.applyAccountData(result);
      }
    });
  }

  private fetchAccountData$(accountId: string) {
    return forkJoin({
      account: this.paperService.getAccount(accountId),
      positions: this.paperService.getPositions(accountId),
      performance: this.paperService.getPerformance(accountId),
      openOrders: this.paperService.getOrders({ accountId, status: 'open', limit: 50 }),
      trades: this.paperService.getTrades(accountId, 1, 20),
    }).pipe(
      catchError((err) => {
        console.error('Error loading paper trading data:', err);
        return of(null);
      }),
    );
  }

  private applyAccountData(result: {
    account: PaperAccount;
    positions: PaperPosition[];
    performance: PaperPerformance;
    openOrders: { data: PaperOrder[] };
    trades: { data: PaperOrder[] };
  }): void {
    this.account.set(result.account);
    this.positions.set(result.positions);
    this.performance.set(result.performance);
    this.openOrders.set(result.openOrders.data);
    this.trades.set(result.trades.data);
    this.error.set(null);
  }

  createAccount(): void {
    this.creating.set(true);
    this.paperService.createAccount({}).subscribe({
      next: () => {
        this.creating.set(false);
        this.showSuccess('Cuenta de paper trading creada');
        this.loadAccounts();
      },
      error: (err) => {
        console.error('Error creating paper trading account:', err);
        this.creating.set(false);
        this.showError('No se pudo crear la cuenta');
      },
    });
  }

  confirmReset(): void {
    const account = this.accounts().find(a => a.id === this.selectedAccountId());
    if (!account) return;

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Resetear cuenta',
        message: `¿Estás seguro de resetear "${account.name}"? Se eliminarán todas las órdenes, posiciones y el historial, y el balance volverá al inicial.`,
        confirmLabel: 'Resetear',
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.resetAccount(account.id);
      }
    });
  }

  private resetAccount(accountId: string): void {
    this.resetting.set(true);
    this.paperService.resetAccount(accountId).subscribe({
      next: () => {
        this.resetting.set(false);
        this.showSuccess('Cuenta reseteada');
        this.loadAccountData(accountId);
      },
      error: (err) => {
        console.error('Error resetting paper trading account:', err);
        this.resetting.set(false);
        this.showError('No se pudo resetear la cuenta');
      },
    });
  }

  cancelOrder(order: PaperOrder): void {
    this.cancelingOrderId.set(order.id);
    this.paperService.cancelOrder(order.id).subscribe({
      next: () => {
        this.cancelingOrderId.set(null);
        this.showSuccess(`Orden ${order.symbol} cancelada`);
        this.refresh();
      },
      error: (err) => {
        console.error('Error canceling order:', err);
        this.cancelingOrderId.set(null);
        this.showError('No se pudo cancelar la orden');
      },
    });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      panelClass: 'success-snackbar',
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      panelClass: 'error-snackbar',
    });
  }
}
