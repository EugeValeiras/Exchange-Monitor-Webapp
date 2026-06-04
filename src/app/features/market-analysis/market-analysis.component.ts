import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  LineController,
  BarElement,
  BarController,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartConfiguration,
  ChartData,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import {
  CandlestickController,
  CandlestickElement,
} from 'chartjs-chart-financial';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';
import { LogoLoaderComponent } from '../../shared/components/logo-loader/logo-loader.component';
import {
  AgentChatComponent,
  AnnotationChart,
  ChartAction,
  ChartAnnotation,
  TrendLineAnnotation,
} from './agent-chat.component';
import {
  IndicatorsResponse,
  MarketAnalysisService,
  MarketExchange,
  MarketTimeframe,
  SummaryResponse,
  SummaryRow,
} from '../../core/services/market-analysis.service';

Chart.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  LineController,
  BarElement,
  BarController,
  CandlestickController,
  CandlestickElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const TIMEFRAMES: MarketTimeframe[] = ['15m', '1h', '4h', '1d'];

@Component({
  selector: 'app-market-analysis',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    MatTableModule,
    MatTooltipModule,
    BaseChartDirective,
    ExchangeLogoComponent,
    LogoLoaderComponent,
    AgentChatComponent,
  ],
  template: `
    <div class="ma-layout" [class.chat-collapsed]="chatCollapsed()">
    <div class="ma-container">
      <!-- Filter row -->
      <div class="filter-row">
        <div class="filter-section">
          <span class="filter-label">Exchange</span>
          <mat-chip-listbox
            [value]="selectedExchange()"
            (change)="onExchangeChange($event)"
            class="exchange-chips">
            @for (ex of exchanges; track ex) {
              <mat-chip-option [value]="ex">
                <app-exchange-logo [exchange]="ex" [size]="18"></app-exchange-logo>
                {{ ex | titlecase }}
              </mat-chip-option>
            }
          </mat-chip-listbox>
        </div>

        <div class="filter-spacer"></div>

        <button
          mat-stroked-button
          class="refresh-btn"
          (click)="refreshAll()"
          [disabled]="summaryLoading() || detailLoading()">
          <mat-icon [class.spinning]="summaryLoading() || detailLoading()">refresh</mat-icon>
          Refrescar
        </button>
      </div>

      <!-- Summary table -->
      <mat-card class="summary-card">
        <mat-card-header>
          <mat-card-title>Resumen multi-timeframe</mat-card-title>
          <mat-card-subtitle>
            Cambios % por par para {{ selectedExchange() | titlecase }}
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (summaryLoading()) {
            <div class="loading-state">
              <app-logo-loader [size]="64" text="Cargando resumen..." [showText]="true"></app-logo-loader>
            </div>
          } @else if (summary()?.rows?.length) {
            <div class="table-wrapper">
              <table mat-table [dataSource]="summary()?.rows ?? []" class="summary-table">
                <ng-container matColumnDef="symbol">
                  <th mat-header-cell *matHeaderCellDef>Par</th>
                  <td mat-cell *matCellDef="let row">
                    <span class="symbol-cell">{{ row.symbol }}</span>
                  </td>
                </ng-container>

                <ng-container matColumnDef="price">
                  <th mat-header-cell *matHeaderCellDef class="num">Precio</th>
                  <td mat-cell *matCellDef="let row" class="num">
                    {{ row.price | number: '1.2-8' }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="pct1h">
                  <th mat-header-cell *matHeaderCellDef class="num">1h</th>
                  <td mat-cell *matCellDef="let row" class="num" [class]="pctClass(row.pctChange1h)">
                    {{ formatPct(row.pctChange1h) }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="pct24h">
                  <th mat-header-cell *matHeaderCellDef class="num">24h</th>
                  <td mat-cell *matCellDef="let row" class="num" [class]="pctClass(row.pctChange24h)">
                    {{ formatPct(row.pctChange24h) }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="pct7d">
                  <th mat-header-cell *matHeaderCellDef class="num">7d</th>
                  <td mat-cell *matCellDef="let row" class="num" [class]="pctClass(row.pctChange7d)">
                    {{ formatPct(row.pctChange7d) }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="pct30d">
                  <th mat-header-cell *matHeaderCellDef class="num">30d</th>
                  <td mat-cell *matCellDef="let row" class="num" [class]="pctClass(row.pctChange30d)">
                    {{ formatPct(row.pctChange30d) }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="volume">
                  <th mat-header-cell *matHeaderCellDef class="num">Vol 24h</th>
                  <td mat-cell *matCellDef="let row" class="num">
                    {{ formatVolume(row.volume24h) }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="sparkline">
                  <th mat-header-cell *matHeaderCellDef>24h</th>
                  <td mat-cell *matCellDef="let row" class="sparkline-cell">
                    <div class="sparkline">
                      <canvas
                        baseChart
                        [data]="sparklineData(row)"
                        [options]="sparklineOptions"
                        [type]="'line'"></canvas>
                    </div>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="summaryColumns"></tr>
                <tr
                  mat-row
                  *matRowDef="let row; columns: summaryColumns"
                  class="summary-row"
                  matRipple
                  [class.selected]="row.symbol === selectedSymbol()"
                  (click)="selectSymbol(row.symbol)"
                  [matTooltip]="row.error ?? ''"
                  [matTooltipDisabled]="!row.error"></tr>
              </table>
            </div>
          } @else {
            <div class="empty-state">
              <mat-icon>insights</mat-icon>
              <p>No hay pares configurados para {{ selectedExchange() | titlecase }}.</p>
              <p class="hint">
                Configurá símbolos en
                <a routerLink="/settings/symbols">Configuración → Pares de Precios</a>.
              </p>
            </div>
          }
        </mat-card-content>
      </mat-card>

      <!-- Detail card -->
      @if (selectedSymbol()) {
        <mat-card class="detail-card">
          <mat-card-header>
            <mat-card-title>{{ selectedSymbol() }}</mat-card-title>
            <mat-card-subtitle>
              Velas + indicadores ({{ selectedTimeframe() }})
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="timeframe-row">
              <span class="filter-label">Timeframe</span>
              <mat-chip-listbox
                [value]="selectedTimeframe()"
                (change)="onTimeframeChange($event)"
                class="tf-chips">
                @for (tf of timeframes; track tf) {
                  <mat-chip-option [value]="tf">{{ tf }}</mat-chip-option>
                }
              </mat-chip-listbox>
            </div>

            @if (detailLoading()) {
              <div class="loading-state">
                <app-logo-loader [size]="64" text="Cargando indicadores..." [showText]="true"></app-logo-loader>
              </div>
            } @else if (indicators()) {
              @if (annotations().length) {
                <div class="annotations-bar">
                  <span class="annotations-label">
                    <mat-icon>edit</mat-icon>
                    {{ annotations().length }} annotation(s) del agente
                  </span>
                  <button mat-stroked-button (click)="clearAnnotations()">
                    <mat-icon>clear</mat-icon>
                    Limpiar
                  </button>
                </div>
              }
              <div class="chart-block">
                <h4 class="chart-title">Precio + medias + Bollinger</h4>
                <div class="candlestick-chart">
                  <canvas
                    baseChart
                    [data]="priceChartData()"
                    [options]="priceChartOptions"
                    [type]="'candlestick'"></canvas>
                </div>
              </div>

              <div class="chart-block">
                <h4 class="chart-title">RSI(14)</h4>
                <div class="oscillator-chart">
                  <canvas
                    baseChart
                    [data]="rsiChartData()"
                    [options]="rsiChartOptions"
                    [type]="'line'"></canvas>
                </div>
              </div>

              <div class="chart-block">
                <h4 class="chart-title">MACD(12, 26, 9)</h4>
                <div class="oscillator-chart">
                  <canvas
                    baseChart
                    [data]="macdChartData()"
                    [options]="macdChartOptions"
                    [type]="'bar'"></canvas>
                </div>
              </div>
            } @else {
              <div class="empty-state">
                <mat-icon>show_chart</mat-icon>
                <p>No hay datos para {{ selectedSymbol() }} en {{ selectedTimeframe() }}.</p>
              </div>
            }
          </mat-card-content>
        </mat-card>
      }
    </div>
    @if (!chatCollapsed()) {
      <aside class="ma-chat-sidebar">
        <app-agent-chat
          (collapse)="setChatCollapsed(true)"
          (toggleFullscreen)="openFullscreenAgent()"
          (chartAction)="onChartAction($event)"></app-agent-chat>
      </aside>
    }
    </div>

    @if (!chatCollapsed()) {
      <div class="chat-backdrop" (click)="setChatCollapsed(true)"></div>
    }

    <button
      class="chat-fab"
      [class.pulse]="chatCollapsed()"
      mat-fab
      extended
      color="primary"
      [matTooltip]="chatCollapsed() ? 'Abrir agente' : 'Cerrar agente'"
      (click)="setChatCollapsed(!chatCollapsed())">
      <mat-icon>{{ chatCollapsed() ? 'smart_toy' : 'close' }}</mat-icon>
      {{ chatCollapsed() ? 'Agente IA' : 'Cerrar' }}
    </button>
  `,
  styles: [
    `
      .ma-layout {
        position: relative;
        padding: 16px;
        padding-right: calc(420px + 32px); /* deja espacio para el sidebar fijo */
        min-height: 100%;
        box-sizing: border-box;
        transition: padding-right 0.2s ease;
      }

      .ma-container {
        min-width: 0;
      }

      /* Cuando el chat está colapsado, el contenido va full width */
      .ma-layout.chat-collapsed {
        padding-right: 16px;
      }

      /* Sidebar fixed a la derecha, full height de la viewport */
      .ma-chat-sidebar {
        position: fixed;
        top: 64px; /* debajo del topbar */
        right: 16px;
        bottom: 16px;
        width: 420px;
        height: calc(100vh - 80px);
        z-index: 50;
        display: flex;
        flex-direction: column;
      }

      .ma-chat-sidebar app-agent-chat {
        flex: 1;
        min-height: 0;
        display: flex;
      }

      .chat-backdrop {
        display: none;
      }

      /* Hide the FAB whenever the chat is open (sidebar or mobile overlay).
         On collapsed state the FAB shows so the user can re-open. */
      .ma-layout:not(.chat-collapsed) ~ .chat-fab {
        display: none;
      }

      /* Tablet: sidebar más angosto */
      @media (max-width: 1200px) {
        .ma-layout {
          padding-right: calc(360px + 32px);
        }

        .ma-chat-sidebar {
          width: 360px;
        }
      }

      /* Mobile: chat se vuelve overlay flotante */
      @media (max-width: 900px) {
        .ma-layout {
          padding: 12px;
          padding-right: 12px;
        }

        .ma-chat-sidebar {
          top: 0;
          right: 0;
          bottom: 0;
          left: auto;
          width: 100vw;
          max-width: 100vw;
          height: 100vh;
          height: 100dvh;
          min-height: 0;
          z-index: 1001;
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
        }

        .chat-backdrop {
          display: block;
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
        }
      }

      .chat-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 1002;
        gap: 8px;
      }

      .chat-fab.pulse {
        animation: chatFabPulse 2s ease-in-out infinite;
        box-shadow: 0 4px 20px rgba(14, 203, 129, 0.5);
      }

      @keyframes chatFabPulse {
        0%, 100% {
          box-shadow: 0 4px 20px rgba(14, 203, 129, 0.5);
        }
        50% {
          box-shadow: 0 4px 30px rgba(14, 203, 129, 0.9);
          transform: scale(1.05);
        }
      }

      .ma-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
        min-width: 0;
      }

      .filter-row {
        display: flex;
        align-items: center;
        gap: 16px;
        background: var(--bg-card);
        padding: 12px 16px;
        border-radius: 8px;
        border: 1px solid var(--border-color);
      }

      .filter-section {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .filter-label {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-secondary);
      }

      .filter-spacer {
        flex: 1;
      }

      .refresh-btn .spinning {
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        from { transform: rotate(0); }
        to { transform: rotate(360deg); }
      }

      .summary-card,
      .detail-card {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
      }

      .table-wrapper {
        overflow-x: auto;
      }

      table.summary-table {
        width: 100%;
      }

      th.num,
      td.num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .symbol-cell {
        font-weight: 600;
      }

      .pct-positive {
        color: #0ecb81;
      }

      .pct-negative {
        color: #f6465d;
      }

      .pct-neutral {
        color: var(--text-secondary);
      }

      .sparkline-cell {
        width: 120px;
      }

      .sparkline {
        width: 110px;
        height: 36px;
      }

      .summary-row {
        cursor: pointer;
      }

      .summary-row.selected {
        background: rgba(14, 203, 129, 0.08);
      }

      .summary-row:hover {
        background: rgba(255, 255, 255, 0.04);
      }

      .timeframe-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .chart-block {
        margin-top: 16px;
      }

      .annotations-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        background: rgba(240, 185, 11, 0.08);
        border: 1px solid rgba(240, 185, 11, 0.25);
        border-radius: 8px;
        margin: 12px 0 4px;
      }

      .annotations-label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--color-warning, #f0b90b);
        font-size: 13px;
        font-weight: 500;
      }

      .annotations-label mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      .chart-title {
        margin: 0 0 8px;
        font-size: 14px;
        color: var(--text-secondary);
      }

      .candlestick-chart {
        height: 360px;
        position: relative;
      }

      .oscillator-chart {
        height: 160px;
        position: relative;
      }

      .loading-state,
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 16px;
        color: var(--text-secondary);
      }

      .empty-state mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        opacity: 0.5;
        margin-bottom: 12px;
      }

      .empty-state .hint {
        font-size: 13px;
        opacity: 0.7;
      }
    `,
  ],
})
export class MarketAnalysisComponent implements OnInit {
  private readonly marketService = inject(MarketAnalysisService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly exchanges: MarketExchange[] = ['binance', 'kraken'];
  readonly timeframes = TIMEFRAMES;
  readonly summaryColumns = [
    'symbol',
    'price',
    'pct1h',
    'pct24h',
    'pct7d',
    'pct30d',
    'volume',
    'sparkline',
  ];

  readonly selectedExchange = signal<MarketExchange>('binance');
  readonly selectedSymbol = signal<string | null>(null);
  readonly selectedTimeframe = signal<MarketTimeframe>('1h');
  readonly chatCollapsed = signal<boolean>(this.loadChatCollapsed());
  readonly annotations = signal<ChartAnnotation[]>([]);

  readonly summary = signal<SummaryResponse | null>(null);
  readonly summaryLoading = signal(false);

  readonly indicators = signal<IndicatorsResponse | null>(null);
  readonly detailLoading = signal(false);

  readonly priceChartData = computed<ChartData<'candlestick'>>(() => {
    const ind = this.indicators();
    if (!ind) return { datasets: [] };

    const candleData = ind.candles.map((c) => ({
      x: c.timestamp,
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close,
    }));

    const sma20Line = mapLine(ind.sma20.map((p) => ({ x: p.timestamp, y: p.value })));
    const sma50Line = mapLine(ind.sma50.map((p) => ({ x: p.timestamp, y: p.value })));
    const ema20Line = mapLine(ind.ema20.map((p) => ({ x: p.timestamp, y: p.value })));
    const bbUpper = mapLine(ind.bollinger.map((p) => ({ x: p.timestamp, y: p.upper })));
    const bbLower = mapLine(ind.bollinger.map((p) => ({ x: p.timestamp, y: p.lower })));

    const divergenceDatasets = (ind.rsiDivergences ?? []).map((d) => ({
      type: 'line' as const,
      label: `Div ${d.type}`,
      data: [
        { x: d.startTimestamp, y: d.startPrice },
        { x: d.endTimestamp, y: d.endPrice },
      ],
      borderColor: d.type === 'bullish' ? '#0ecb81' : '#f6465d',
      borderWidth: 2,
      borderDash: [6, 3],
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: d.type === 'bullish' ? '#0ecb81' : '#f6465d',
      pointBorderColor: '#fff',
      pointBorderWidth: 1,
      fill: false,
      showLine: true,
    }));

    const priceCandles = ind.candles;
    const priceRange = priceCandles.length
      ? {
          tMin: priceCandles[0].timestamp,
          tMax: priceCandles[priceCandles.length - 1].timestamp,
        }
      : { tMin: 0, tMax: 0 };

    const annotationDatasets = buildAnnotationDatasets(
      this.annotations(),
      'price',
      priceRange,
    );

    return {
      datasets: [
        {
          type: 'candlestick',
          label: ind.symbol,
          data: candleData,
          borderColors: { up: '#0ecb81', down: '#f6465d', unchanged: '#999' },
          backgroundColors: { up: '#0ecb81', down: '#f6465d', unchanged: '#999' },
        } as any,
        {
          type: 'line',
          label: 'SMA(20)',
          data: sma20Line,
          borderColor: '#f0b90b',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        } as any,
        {
          type: 'line',
          label: 'SMA(50)',
          data: sma50Line,
          borderColor: '#a78bfa',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        } as any,
        {
          type: 'line',
          label: 'EMA(20)',
          data: ema20Line,
          borderColor: '#60a5fa',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
        } as any,
        {
          type: 'line',
          label: 'BB upper',
          data: bbUpper,
          borderColor: 'rgba(255,255,255,0.4)',
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        } as any,
        {
          type: 'line',
          label: 'BB lower',
          data: bbLower,
          borderColor: 'rgba(255,255,255,0.4)',
          borderWidth: 1,
          pointRadius: 0,
          fill: '-1',
          backgroundColor: 'rgba(255,255,255,0.04)',
        } as any,
        ...(divergenceDatasets as any[]),
        ...(annotationDatasets as any[]),
      ],
    };
  });

  readonly priceChartOptions: ChartConfiguration<'candlestick'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: 'rgba(255,255,255,0.7)',
          filter: (item) => !(item.text ?? '').startsWith('Div '),
        },
      },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: {
        type: 'time',
        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 8 },
        grid: { display: false },
      },
      y: {
        ticks: { color: 'rgba(255,255,255,0.5)' },
        grid: { color: 'rgba(255,255,255,0.08)' },
      },
    },
  };

  readonly rsiChartData = computed<ChartData<'line'>>(() => {
    const ind = this.indicators();
    if (!ind) return { labels: [], datasets: [] };
    const points = ind.rsi.map((p) => ({ x: p.timestamp, y: p.value }));

    const divergenceDatasets = (ind.rsiDivergences ?? []).map((d) => ({
      label: `Div ${d.type}`,
      data: [
        { x: d.startTimestamp, y: d.startRsi },
        { x: d.endTimestamp, y: d.endRsi },
      ],
      borderColor: d.type === 'bullish' ? '#0ecb81' : '#f6465d',
      borderWidth: 2,
      borderDash: [6, 3],
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: d.type === 'bullish' ? '#0ecb81' : '#f6465d',
      pointBorderColor: '#fff',
      pointBorderWidth: 1,
      fill: false,
      showLine: true,
    }));

    const rsiCandles = ind.candles;
    const rsiRange = rsiCandles.length
      ? {
          tMin: rsiCandles[0].timestamp,
          tMax: rsiCandles[rsiCandles.length - 1].timestamp,
        }
      : { tMin: 0, tMax: 0 };

    const annotationDatasets = buildAnnotationDatasets(
      this.annotations(),
      'rsi',
      rsiRange,
    );

    return {
      datasets: [
        {
          label: 'RSI(14)',
          data: mapLine(points),
          borderColor: '#60a5fa',
          backgroundColor: 'rgba(96,165,250,0.1)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        } as any,
        ...(divergenceDatasets as any[]),
        ...(annotationDatasets as any[]),
      ],
    };
  });

  readonly rsiChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        type: 'time',
        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 6 },
        grid: { display: false },
      },
      y: {
        min: 0,
        max: 100,
        ticks: {
          color: 'rgba(255,255,255,0.5)',
          stepSize: 30,
          callback: (v) => `${v}`,
        },
        grid: { color: 'rgba(255,255,255,0.08)' },
      },
    },
  };

  readonly macdChartData = computed<ChartData<'bar'>>(() => {
    const ind = this.indicators();
    if (!ind) return { datasets: [] };
    const histogram = ind.macd.map((p) => ({ x: p.timestamp, y: p.histogram }));
    const macdLine = ind.macd.map((p) => ({ x: p.timestamp, y: p.macd }));
    const signalLine = ind.macd.map((p) => ({ x: p.timestamp, y: p.signal }));
    const histColors = ind.macd.map((p) =>
      (p.histogram ?? 0) >= 0 ? 'rgba(14,203,129,0.7)' : 'rgba(246,70,93,0.7)',
    );

    return {
      datasets: [
        {
          type: 'bar',
          label: 'Histograma',
          data: mapLine(histogram),
          backgroundColor: histColors,
          borderWidth: 0,
        } as any,
        {
          type: 'line',
          label: 'MACD',
          data: mapLine(macdLine),
          borderColor: '#60a5fa',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        } as any,
        {
          type: 'line',
          label: 'Signal',
          data: mapLine(signalLine),
          borderColor: '#f0b90b',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        } as any,
      ],
    };
  });

  readonly macdChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top', labels: { color: 'rgba(255,255,255,0.7)' } } },
    scales: {
      x: {
        type: 'time',
        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 6 },
        grid: { display: false },
      },
      y: {
        ticks: { color: 'rgba(255,255,255,0.5)' },
        grid: { color: 'rgba(255,255,255,0.08)' },
      },
    },
  };

  readonly sparklineOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    elements: { point: { radius: 0 } },
    scales: {
      x: { display: false },
      y: { display: false },
    },
  };

  ngOnInit(): void {
    // Precedence: URL params > localStorage > defaults
    const params = this.route.snapshot.queryParamMap;
    const urlExchange = params.get('exchange') as MarketExchange | null;
    const urlSymbol = params.get('symbol');
    const urlTimeframe = params.get('timeframe') as MarketTimeframe | null;

    let stored: Partial<{ exchange: MarketExchange; symbol: string; timeframe: MarketTimeframe }> = {};
    try {
      const raw = localStorage.getItem('marketAnalysisChart');
      if (raw) stored = JSON.parse(raw);
    } catch {
      /* ignore */
    }

    const exchange = urlExchange ?? stored.exchange;
    const symbol = urlSymbol ?? stored.symbol;
    const timeframe = urlTimeframe ?? stored.timeframe;

    if (exchange && this.exchanges.includes(exchange)) {
      this.selectedExchange.set(exchange);
    }
    if (timeframe && TIMEFRAMES.includes(timeframe)) {
      this.selectedTimeframe.set(timeframe);
    }
    if (symbol) {
      this.selectedSymbol.set(symbol);
    }

    this.annotations.set(this.loadAnnotations());
    this.loadSummary();
    if (this.selectedSymbol()) {
      this.loadDetail();
    }
  }

  onExchangeChange(event: MatChipListboxChange): void {
    const next = event.value as MarketExchange | undefined;
    if (!next || next === this.selectedExchange()) return;
    this.selectedExchange.set(next);
    this.selectedSymbol.set(null);
    this.indicators.set(null);
    this.syncQueryParams();
    this.loadSummary();
  }

  onTimeframeChange(event: MatChipListboxChange): void {
    const next = event.value as MarketTimeframe | undefined;
    if (!next || next === this.selectedTimeframe()) return;
    this.selectedTimeframe.set(next);
    this.syncQueryParams();
    if (this.selectedSymbol()) {
      this.loadDetail();
    }
  }

  selectSymbol(symbol: string): void {
    this.selectedSymbol.set(symbol);
    this.syncQueryParams();
    this.loadDetail();
  }

  refreshAll(): void {
    this.loadSummary();
    if (this.selectedSymbol()) {
      this.loadDetail();
    }
  }

  sparklineData(row: SummaryRow): ChartData<'line'> {
    const data = row.sparkline ?? [];
    const first = data[0];
    const last = data[data.length - 1];
    const positive = last !== undefined && first !== undefined ? last >= first : true;
    const color = positive ? '#0ecb81' : '#f6465d';
    return {
      labels: data.map((_, i) => i),
      datasets: [
        {
          data,
          borderColor: color,
          backgroundColor: `${color}22`,
          fill: true,
          tension: 0.35,
          borderWidth: 1.5,
          pointRadius: 0,
        },
      ],
    };
  }

  pctClass(value: number | null): string {
    if (value === null || Number.isNaN(value)) return 'pct-neutral';
    if (value > 0) return 'pct-positive';
    if (value < 0) return 'pct-negative';
    return 'pct-neutral';
  }

  formatPct(value: number | null): string {
    if (value === null || Number.isNaN(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  formatVolume(value: number): string {
    if (!value) return '—';
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
    return value.toFixed(2);
  }

  private loadSummary(): void {
    this.summaryLoading.set(true);
    this.marketService.getSummary(this.selectedExchange()).subscribe({
      next: (resp) => {
        this.summary.set(resp);
        this.summaryLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load market summary', err);
        this.summary.set({
          exchange: this.selectedExchange(),
          rows: [],
          generatedAt: Date.now(),
        });
        this.summaryLoading.set(false);
      },
    });
  }

  private loadDetail(): void {
    const symbol = this.selectedSymbol();
    if (!symbol) return;
    this.detailLoading.set(true);
    this.marketService
      .getIndicators(this.selectedExchange(), symbol, this.selectedTimeframe())
      .subscribe({
        next: (resp) => {
          this.indicators.set(resp);
          this.detailLoading.set(false);
        },
        error: (err) => {
          console.error('Failed to load indicators', err);
          this.indicators.set(null);
          this.detailLoading.set(false);
        },
      });
  }

  private syncQueryParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        exchange: this.selectedExchange(),
        symbol: this.selectedSymbol(),
        timeframe: this.selectedTimeframe(),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    try {
      localStorage.setItem(
        'marketAnalysisChart',
        JSON.stringify({
          exchange: this.selectedExchange(),
          symbol: this.selectedSymbol(),
          timeframe: this.selectedTimeframe(),
        }),
      );
    } catch {
      /* ignore */
    }
  }

  setChatCollapsed(collapsed: boolean): void {
    this.chatCollapsed.set(collapsed);
    try {
      localStorage.setItem('marketAnalysisChatCollapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  openFullscreenAgent(): void {
    void this.router.navigate(['/market-analysis/agent']);
  }

  /**
   * Apply a chart-action emitted by the agent. Persists changes to URL (via
   * syncQueryParams) and triggers a reload of the detail view if a symbol
   * becomes selected.
   */
  onChartAction(action: ChartAction): void {
    let changed = false;
    if (
      action.exchange &&
      this.exchanges.includes(action.exchange as MarketExchange) &&
      action.exchange !== this.selectedExchange()
    ) {
      this.selectedExchange.set(action.exchange as MarketExchange);
      this.selectedSymbol.set(null);
      this.indicators.set(null);
      this.loadSummary();
      changed = true;
    }
    if (
      action.timeframe &&
      (TIMEFRAMES as readonly string[]).includes(action.timeframe) &&
      action.timeframe !== this.selectedTimeframe()
    ) {
      this.selectedTimeframe.set(action.timeframe as MarketTimeframe);
      changed = true;
    }
    if (action.symbol && action.symbol !== this.selectedSymbol()) {
      this.selectedSymbol.set(action.symbol);
      changed = true;
    }
    if (changed) {
      this.syncQueryParams();
      // Reload annotations for the new symbol+tf context
      this.annotations.set(this.loadAnnotations());
      if (this.selectedSymbol()) {
        this.loadDetail();
      }
    }

    // Handle annotation mutations
    if (action.clearAnnotations) {
      this.annotations.set([]);
    }
    if (action.annotations?.length) {
      const withIds = action.annotations.map((a) => ({
        ...a,
        id: a.id ?? crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }));
      this.annotations.update((curr) => [...curr, ...withIds]);
    }
    if (action.clearAnnotations || action.annotations?.length) {
      this.persistAnnotations();
    }
  }

  clearAnnotations(): void {
    this.annotations.set([]);
    this.persistAnnotations();
  }

  private annotationsKey(): string {
    return `marketAnalysisAnnotations:${this.selectedExchange()}:${this.selectedSymbol() ?? ''}:${this.selectedTimeframe()}`;
  }

  private loadAnnotations(): ChartAnnotation[] {
    try {
      const raw = localStorage.getItem(this.annotationsKey());
      if (!raw) return [];
      return JSON.parse(raw) as ChartAnnotation[];
    } catch {
      return [];
    }
  }

  private persistAnnotations(): void {
    try {
      localStorage.setItem(this.annotationsKey(), JSON.stringify(this.annotations()));
    } catch {
      /* ignore */
    }
  }

  private loadChatCollapsed(): boolean {
    try {
      const stored = localStorage.getItem('marketAnalysisChatCollapsed');
      if (stored === '1') return true;
      if (stored === '0') return false;
      // Sin preferencia previa: colapsar por default en mobile
      return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches;
    } catch {
      return false;
    }
  }
}

function mapLine(points: Array<{ x: number; y: number | null }>): Array<{ x: number; y: number | null }> {
  return points.filter((p) => p.x > 0);
}

/**
 * Convert user/agent-provided annotations into Chart.js line datasets.
 * Horizontal lines span the full visible range. Trendlines / divergences /
 * markers use the raw coordinates.
 */
function buildAnnotationDatasets(
  annotations: ChartAnnotation[],
  targetChart: AnnotationChart,
  range: { tMin: number; tMax: number },
): unknown[] {
  const sets: unknown[] = [];
  for (const a of annotations) {
    if (a.chart !== targetChart) continue;
    const baseColor =
      a.color ??
      (a.type === 'divergence'
        ? (a as TrendLineAnnotation).variant === 'bullish'
          ? '#0ecb81'
          : '#f6465d'
        : '#f0b90b');

    if (a.type === 'horizontal-line') {
      sets.push({
        type: 'line',
        label: a.label ?? `Nivel ${a.value}`,
        data: [
          { x: range.tMin, y: a.value },
          { x: range.tMax, y: a.value },
        ],
        borderColor: baseColor,
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
        showLine: true,
      });
      continue;
    }

    if (a.type === 'trend-line' || a.type === 'divergence') {
      const trend = a as TrendLineAnnotation;
      const isDiv = a.type === 'divergence';
      sets.push({
        type: 'line',
        label: a.label ?? (isDiv ? `Div ${trend.variant ?? ''}` : 'Trendline'),
        data: [
          { x: trend.from.t, y: trend.from.y },
          { x: trend.to.t, y: trend.to.y },
        ],
        borderColor: baseColor,
        borderWidth: isDiv ? 2.5 : 2,
        borderDash: isDiv ? [6, 3] : [],
        pointRadius: isDiv ? 5 : 3,
        pointBackgroundColor: baseColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        fill: false,
        showLine: true,
      });
      continue;
    }

    if (a.type === 'marker') {
      sets.push({
        type: 'line',
        label: a.label ?? 'Marker',
        data: [{ x: a.t, y: a.y }],
        borderColor: baseColor,
        borderWidth: 0,
        pointRadius: 7,
        pointBackgroundColor: baseColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        fill: false,
        showLine: false,
      });
      continue;
    }
  }
  return sets;
}
