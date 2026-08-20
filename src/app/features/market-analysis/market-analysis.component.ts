import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart } from 'chart.js';
import {
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  TimeScale,
  PointElement,
  LineElement,
  LineController,
  BarElement,
  BarController,
  Filler,
} from 'chart.js';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
import 'chartjs-adapter-date-fns';

import {
  IndicatorsResponse,
  MarketAnalysisService,
  MarketExchange,
  MarketTimeframe,
  SummaryResponse,
} from '../../core/services/market-analysis.service';
import { PairTrades, TransactionsService } from '../../core/services/transactions.service';
import { PnlService, UnrealizedPnlPosition } from '../../core/services/pnl.service';
import { LogoLoaderComponent } from '../../shared/components/logo-loader/logo-loader.component';
import { InstrumentHeaderComponent, HeaderContext } from './instrument-header.component';
import { ChartStackComponent } from './chart-stack.component';
import { AnalysisRailComponent, RailFacet, RailPosition } from './analysis-rail.component';
import { CommandPaletteComponent, PaletteRow } from './command-palette.component';
import { ChartAction } from './agent-chat.component';
import { groupTrades } from './lib/trade-grouping';
import { markersFromOrders } from './lib/chart-markers';

Chart.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  TimeScale,
  PointElement,
  LineElement,
  LineController,
  BarElement,
  BarController,
  CandlestickController,
  CandlestickElement,
  Filler,
);

const TIMEFRAMES: MarketTimeframe[] = ['15m', '1h', '4h', '1d', '1w'];
const STATE_KEY = 'marketAnalysisChart';
const LOG_KEY = 'marketAnalysisLog';
const LAYER_KEY = 'marketAnalysisTradesLayer';
const FACET_KEY = 'marketAnalysisFacet';

/** Wide-range timeframes read wrong on a linear scale, so they default to log. */
const LOG_BY_DEFAULT: MarketTimeframe[] = ['1d', '1w'];

@Component({
  selector: 'app-market-analysis',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    LogoLoaderComponent,
    InstrumentHeaderComponent,
    ChartStackComponent,
    AnalysisRailComponent,
    CommandPaletteComponent,
  ],
  host: { '[attr.data-density]': "'compact'" },
  template: `
    <div class="screen">
      <app-instrument-header
        [symbol]="selectedSymbol()"
        [exchange]="selectedExchange()"
        [timeframe]="selectedTimeframe()"
        [timeframes]="timeframes"
        [price]="lastClose()"
        [change]="change()"
        [changePct]="changePct()"
        [position]="headerPosition()"
        [context]="headerContext()"
        [log]="log()"
        [tradesLayer]="tradesLayer()"
        [hasTrades]="hasTrades()"
        [tradeCount]="pairTrades()?.position?.tradeCount ?? 0"
        (timeframeChange)="setTimeframe($event)"
        (logChange)="setLog($event)"
        (tradesLayerChange)="setTradesLayer($event)"
        (openSwitcher)="paletteOpen.set(true)"></app-instrument-header>

      <div class="canvas">
        @if (detailLoading() && !indicators()) {
          <div class="loading">
            <app-logo-loader [size]="64" text="Cargando el par…" [showText]="true"></app-logo-loader>
          </div>
        } @else {
          @if (indicators(); as ind) {
          <app-chart-stack
            [class.refreshing]="detailLoading()"
            [candles]="ind.candles"
            [rsi]="ind.rsi"
            [markers]="markers()"
            [avgEntry]="avgEntry()"
            [dustAt]="dustAt()"
            [tradesLayer]="tradesLayer()"
            [hoveredOrderId]="hoveredOrderId()"
            [log]="log()"
            [timeframe]="selectedTimeframe()"
            (hoveredMarker)="onHoveredMarker($event)"></app-chart-stack>
          } @else {
            <div class="loading empty">
              <p>No se pudieron cargar las velas de {{ selectedSymbol() }}.</p>
              <button type="button" (click)="loadDetail()">Reintentar</button>
            </div>
          }
        }

        <div class="rail-slot">
          <app-analysis-rail
            [facet]="facet()"
            [symbol]="selectedSymbol()"
            [position]="railPosition()"
            [data]="pairTrades()"
            [candleSpanMs]="candleSpanMs()"
            [highlightedId]="hoveredOrderId()"
            [annotationCount]="annotations().length"
            (facetChange)="setFacet($event)"
            (hover)="hoveredOrderId.set($event)"
            (chartAction)="onChartAction($event)"
            (openFullscreen)="openAgentFullscreen()"></app-analysis-rail>
        </div>
      </div>

      @if (paletteOpen()) {
        <app-command-palette
          [rows]="paletteRows()"
          [symbol]="selectedSymbol()"
          [exchange]="selectedExchange()"
          [timeframe]="selectedTimeframe()"
          [hasPosition]="!!railPosition()"
          (pick)="onPickPair($event)"
          (askAgent)="onAskAgent($event)"
          (close)="paletteOpen.set(false)"></app-command-palette>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 0;
      }

      .screen {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--bg-primary);
      }

      .canvas {
        display: grid;
        grid-template-columns: minmax(0, 1fr) clamp(288px, 26%, 360px);
        gap: 18px;
        padding: 18px 20px;
        flex: 1;
        min-height: 0;
      }

      .rail-slot {
        min-height: 0;
      }

      /* A refresh never unmounts the chart: the old data stays, marked as old */
      app-chart-stack.refreshing {
        opacity: 0.4;
        transition: opacity var(--dur) var(--ease);
      }

      .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--sp-4);
        min-height: 0;
        border: 1px solid var(--border-color);
        border-radius: var(--r-4);
        background: var(--bg-card);
        color: var(--text-secondary);
      }

      .loading.empty p {
        margin: 0;
        font-size: 13px;
      }

      .loading button {
        height: 30px;
        padding: 0 14px;
        border: 1px solid var(--border-light);
        border-radius: var(--r-2);
        background: transparent;
        color: var(--text-primary);
        font-family: inherit;
        font-size: 12.5px;
        cursor: pointer;
      }

      @media (max-width: 1280px) {
        .canvas {
          grid-template-columns: minmax(0, 1fr);
        }

        /* Stacking 72 rows under the chart is not a layout, it is a scroll.
           The rail becomes a drawer over the chart instead. */
        .rail-slot {
          position: fixed;
          top: 56px;
          right: 0;
          bottom: 0;
          width: min(360px, 92vw);
          z-index: var(--z-rail);
          box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
        }
      }
    `,
  ],
})
export class MarketAnalysisComponent implements OnInit {
  @ViewChild(AnalysisRailComponent) private rail?: AnalysisRailComponent;

  private readonly marketService = inject(MarketAnalysisService);
  private readonly transactionsService = inject(TransactionsService);
  private readonly pnlService = inject(PnlService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly timeframes = TIMEFRAMES;

  readonly selectedExchange = signal<MarketExchange>('binance');
  readonly selectedSymbol = signal<string | null>(null);
  readonly selectedTimeframe = signal<MarketTimeframe>('1h');
  readonly log = signal(false);
  readonly tradesLayer = signal(true);
  readonly facet = signal<RailFacet>('position');
  readonly paletteOpen = signal(false);
  readonly hoveredOrderId = signal<string | null>(null);
  readonly annotations = signal<unknown[]>([]);

  readonly indicators = signal<IndicatorsResponse | null>(null);
  readonly detailLoading = signal(false);
  readonly pairTrades = signal<PairTrades | null>(null);
  readonly summary = signal<SummaryResponse | null>(null);
  readonly unrealized = signal<UnrealizedPnlPosition[]>([]);
  readonly loadedAt = signal<number | null>(null);

  // ── derived ───────────────────────────────────────────────────────────────

  readonly lastClose = computed<number | null>(() => {
    const candles = this.indicators()?.candles ?? [];
    return candles.length ? candles[candles.length - 1].close : null;
  });

  readonly change = computed<number | null>(() => {
    const candles = this.indicators()?.candles ?? [];
    if (candles.length < 2) return null;
    const last = candles[candles.length - 1];
    return last.close - last.open;
  });

  readonly changePct = computed<number | null>(() => {
    const candles = this.indicators()?.candles ?? [];
    if (candles.length < 2) return null;
    const last = candles[candles.length - 1];
    return last.open ? ((last.close - last.open) / last.open) * 100 : null;
  });

  readonly candleSpanMs = computed(() => {
    const candles = this.indicators()?.candles ?? [];
    if (candles.length < 2) return 60 * 60 * 1000;
    return Math.abs(candles[1].timestamp - candles[0].timestamp);
  });

  readonly hasTrades = computed(() => (this.pairTrades()?.position.tradeCount ?? 0) > 0);

  readonly grouped = computed(() =>
    groupTrades(this.pairTrades()?.trades ?? [], this.pairTrades()?.position ?? null, this.candleSpanMs()),
  );

  readonly markers = computed(() => {
    const candles = this.indicators()?.candles ?? [];
    const orders = this.grouped().months.flatMap((m) => m.orders);
    return markersFromOrders(orders, candles.map((c) => c.timestamp), this.candleSpanMs());
  });

  /** Dust does not deserve a pin, but it should still show it happened. */
  readonly dustAt = computed(() =>
    this.grouped()
      .months.filter((m) => m.dust)
      .flatMap((m) => m.orders.length ? [m.orders[0].timestamp] : [])
      .map((t) => new Date(t).getTime()),
  );

  readonly avgEntry = computed(() => {
    const position = this.pairTrades()?.position;
    return position && position.netAmount > 0 ? position.avgEntryPrice : null;
  });

  /**
   * Unrealized P&L is computed here, against the last candle on screen,
   * instead of asking the API for a second price: the number can then never
   * contradict what is drawn.
   */
  readonly railPosition = computed<RailPosition | null>(() => {
    const position = this.pairTrades()?.position;
    if (!position || position.netAmount <= 0) return null;

    const last = this.lastClose();
    const currentValue = last !== null ? position.netAmount * last : null;
    const unrealizedPnl = currentValue !== null ? currentValue - position.costBasis : null;
    const unrealizedPct =
      unrealizedPnl !== null && position.costBasis > 0 ? (unrealizedPnl / position.costBasis) * 100 : null;

    return { ...position, currentValue, unrealizedPnl, unrealizedPct };
  });

  readonly headerPosition = computed(() => {
    const p = this.railPosition();
    return p ? { unrealizedPnl: p.unrealizedPnl, unrealizedPct: p.unrealizedPct } : null;
  });

  readonly headerContext = computed<HeaderContext>(() => {
    const candles = this.indicators()?.candles ?? [];
    const row = this.summary()?.rows.find((r) => r.symbol === this.selectedSymbol());
    const at = this.loadedAt();
    return {
      candleCount: candles.length,
      high: candles.length ? Math.max(...candles.map((c) => c.high)) : null,
      low: candles.length ? Math.min(...candles.map((c) => c.low)) : null,
      volume24h: row?.volume24h ?? null,
      ageSeconds: at === null ? null : (Date.now() - at) / 1000,
    };
  });

  readonly paletteRows = computed<PaletteRow[]>(() => {
    const rows = this.summary()?.rows ?? [];
    const positions = this.unrealized();
    const exchange = this.selectedExchange();

    return rows.map((row) => {
      const base = row.symbol.split('/')[0];
      const held = positions.find((p) => p.asset === base);
      return {
        symbol: row.symbol,
        exchange,
        price: row.price,
        minePct: held?.unrealizedPnlPercent ?? null,
        pct1h: row.pctChange1h,
        pct24h: row.pctChange24h,
        pct7d: row.pctChange7d,
        exposure: held?.currentValue ?? 0,
      };
    });
  });

  // ── lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    let stored: Partial<{ exchange: MarketExchange; symbol: string; timeframe: MarketTimeframe }> = {};
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      /* ignore */
    }

    const exchange = (params.get('exchange') as MarketExchange | null) ?? stored.exchange;
    const symbol = params.get('symbol') ?? stored.symbol;
    const timeframe = (params.get('timeframe') as MarketTimeframe | null) ?? stored.timeframe;

    if (exchange) this.selectedExchange.set(exchange);
    if (timeframe && TIMEFRAMES.includes(timeframe)) this.selectedTimeframe.set(timeframe);
    if (symbol) this.selectedSymbol.set(symbol);

    this.log.set(this.readFlag(LOG_KEY, LOG_BY_DEFAULT.includes(this.selectedTimeframe())));
    this.tradesLayer.set(this.readFlag(LAYER_KEY, true));
    const facet = localStorage.getItem(FACET_KEY) as RailFacet | null;
    if (facet) this.facet.set(facet);

    this.loadSummary();
    this.loadUnrealized();
    if (this.selectedSymbol()) this.loadDetail();
    else this.paletteOpen.set(true);
  }

  // ── keyboard ──────────────────────────────────────────────────────────────

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = !!target && /^(INPUT|TEXTAREA)$/.test(target.tagName);

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.paletteOpen.set(true);
      return;
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === 'Escape' && this.paletteOpen()) {
      this.paletteOpen.set(false);
      return;
    }
    if (event.key === '/') {
      event.preventDefault();
      this.paletteOpen.set(true);
      return;
    }

    const index = Number(event.key);
    if (index >= 1 && index <= TIMEFRAMES.length) {
      this.setTimeframe(TIMEFRAMES[index - 1]);
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'l':
        this.setLog(!this.log());
        break;
      case 't':
        if (this.hasTrades()) this.setTradesLayer(!this.tradesLayer());
        break;
      case 'p':
        this.setFacet('position');
        break;
      case 'm':
        this.setFacet('trades');
        break;
      case 'a':
        this.setFacet('agent');
        break;
      case 'r':
        this.loadDetail();
        break;
    }
  }

  // ── actions ───────────────────────────────────────────────────────────────

  setTimeframe(tf: MarketTimeframe): void {
    if (tf === this.selectedTimeframe()) return;
    this.selectedTimeframe.set(tf);
    // the log default follows the timeframe unless the user pinned it
    if (localStorage.getItem(LOG_KEY) === null) this.log.set(LOG_BY_DEFAULT.includes(tf));
    this.syncQueryParams();
    this.loadDetail();
  }

  setLog(value: boolean): void {
    this.log.set(value);
    this.write(LOG_KEY, value ? '1' : '0');
  }

  setTradesLayer(value: boolean): void {
    this.tradesLayer.set(value);
    if (!value) this.hoveredOrderId.set(null);
    this.write(LAYER_KEY, value ? '1' : '0');
  }

  setFacet(facet: RailFacet): void {
    this.facet.set(facet);
    this.write(FACET_KEY, facet);
  }

  onHoveredMarker(marker: { orders: Array<{ id: string }> } | null): void {
    this.hoveredOrderId.set(marker?.orders[0]?.id ?? null);
  }

  onPickPair(row: PaletteRow): void {
    this.paletteOpen.set(false);
    if (row.symbol === this.selectedSymbol()) return;
    this.selectedSymbol.set(row.symbol);
    this.pairTrades.set(null);
    this.syncQueryParams();
    this.loadDetail();
  }

  /**
   * A question asked from the palette travels with what is on screen. Without
   * this the agent has no idea which pair or timeframe you are looking at,
   * and answers about whatever it assumes.
   */
  onAskAgent(question: string): void {
    this.paletteOpen.set(false);
    this.setFacet('agent');

    const context = this.agentContext();
    // the facet has to be mounted before the chat can take the message
    setTimeout(() => this.rail?.askAgent(`${context}\n\n${question}`), 0);
  }

  private agentContext(): string {
    const candles = this.indicators()?.candles ?? [];
    const from = candles.length ? new Date(candles[0].timestamp).toISOString().slice(0, 10) : '—';
    const to = candles.length
      ? new Date(candles[candles.length - 1].timestamp).toISOString().slice(0, 10)
      : '—';

    const parts = [
      `par ${this.selectedSymbol()} en ${this.selectedExchange()}`,
      `timeframe ${this.selectedTimeframe()}`,
      `rango visible ${from} → ${to} (${candles.length} velas)`,
      `escala ${this.log() ? 'logarítmica' : 'lineal'}`,
    ];

    const position = this.railPosition();
    if (position) {
      parts.push(
        `mi posición: ${position.netAmount} ${this.selectedSymbol()?.split('/')[0]}, ` +
          `PPC ${position.avgEntryPrice.toFixed(2)}, ` +
          `no realizado ${position.unrealizedPnl?.toFixed(2) ?? '—'}`,
      );
    }
    return `[contexto de la pantalla: ${parts.join(' · ')}]`;
  }

  onChartAction(action: ChartAction): void {
    let changed = false;
    if (action.exchange && action.exchange !== this.selectedExchange()) {
      this.selectedExchange.set(action.exchange as MarketExchange);
      this.pairTrades.set(null);
      this.loadSummary();
      changed = true;
    }
    if (action.timeframe && (TIMEFRAMES as string[]).includes(action.timeframe)) {
      this.selectedTimeframe.set(action.timeframe as MarketTimeframe);
      changed = true;
    }
    if (action.symbol && action.symbol !== this.selectedSymbol()) {
      this.selectedSymbol.set(action.symbol);
      changed = true;
    }
    if (action.clearAnnotations) this.annotations.set([]);
    if (action.annotations?.length) {
      this.annotations.update((current) => [...current, ...action.annotations!]);
    }
    if (changed) {
      this.syncQueryParams();
      this.loadDetail();
    }
  }

  openAgentFullscreen(): void {
    void this.router.navigate(['/asistente']);
  }

  // ── loading ───────────────────────────────────────────────────────────────

  loadDetail(): void {
    const symbol = this.selectedSymbol();
    if (!symbol) return;
    this.detailLoading.set(true);
    this.marketService.getIndicators(this.selectedExchange(), symbol, this.selectedTimeframe()).subscribe({
      next: (resp) => {
        this.indicators.set(resp);
        this.loadedAt.set(Date.now());
        this.detailLoading.set(false);
        this.loadTrades();
      },
      error: (err) => {
        console.error('Failed to load indicators', err);
        this.detailLoading.set(false);
        // the old candles stay on screen rather than blanking the panel
        if (!this.indicators()) this.pairTrades.set(null);
      },
    });
  }

  private loadTrades(): void {
    const symbol = this.selectedSymbol();
    const candles = this.indicators()?.candles ?? [];
    if (!symbol) return;

    const from = candles.length ? candles[0].timestamp : undefined;
    const to = candles.length ? candles[candles.length - 1].timestamp + this.candleSpanMs() : undefined;

    this.transactionsService.getTradesByPair(symbol, from, to).subscribe({
      next: (resp) => this.pairTrades.set(resp),
      error: (err) => {
        console.error('Failed to load trades for pair', err);
        this.pairTrades.set(null);
      },
    });
  }

  private loadSummary(): void {
    this.marketService.getSummary(this.selectedExchange()).subscribe({
      next: (resp) => this.summary.set(resp),
      error: (err) => console.error('Failed to load market summary', err),
    });
  }

  private loadUnrealized(): void {
    this.pnlService.getUnrealizedPnl().subscribe({
      next: (resp) => this.unrealized.set(resp.positions ?? []),
      error: (err) => console.error('Failed to load unrealized P&L', err),
    });
  }

  // ── persistence ───────────────────────────────────────────────────────────

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
    this.write(
      STATE_KEY,
      JSON.stringify({
        exchange: this.selectedExchange(),
        symbol: this.selectedSymbol(),
        timeframe: this.selectedTimeframe(),
      }),
    );
  }

  private readFlag(key: string, fallback: boolean): boolean {
    try {
      const raw = localStorage.getItem(key);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch {
      /* ignore */
    }
    return fallback;
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }
}
