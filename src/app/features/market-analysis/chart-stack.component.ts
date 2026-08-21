import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChildren,
  QueryList,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartData,
  ChartOptions,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  LogarithmicScale,
  PointElement,
  TimeScale,
} from 'chart.js';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-date-fns';
import { OhlcCandle, IndicatorPoint, MarketTimeframe } from '../../core/services/market-analysis.service';
import {
  chartColors,
  chartTheme,
  resolveVisibleDomain,
  shouldIncludeInDomain,
} from '../../shared/charts/chart-theme';
import { TradeMarker } from './lib/chart-markers';
import { tradeLayerPlugin } from './lib/trade-layer.plugin';
import { crosshairPlugin } from './lib/crosshair.plugin';

// The panel that draws candles registers what it needs, instead of relying on
// whichever screen imported the financial plugin first.
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
  zoomPlugin,
  tradeLayerPlugin,
  crosshairPlugin,
);

const TIME_UNIT: Record<MarketTimeframe, 'minute' | 'hour' | 'day' | 'week'> = {
  '15m': 'minute',
  '1h': 'hour',
  '4h': 'hour',
  '1d': 'day',
  '1w': 'week',
};

interface Readout {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  up: boolean;
  markers: TradeMarker[];
}

/** How much history is on screen, in words. */
function describeSpan(ms: number): string {
  const days = ms / (24 * 60 * 60 * 1000);
  if (days < 2) return `${Math.max(1, Math.round(days * 24))} h`;
  if (days < 60) return `${Math.round(days)} días`;
  if (days < 730) return `${Math.round(days / 30)} meses`;
  return `${(days / 365).toFixed(1)} años`;
}

/**
 * The instrument: price, volume and one oscillator as three panels that share
 * an X domain and a single crosshair, instead of three independent widgets
 * with three different date axes stacked on top of each other.
 *
 * Panel names live inside the canvas, in 10px. Four titled cards are four
 * widgets; three unlabelled panes under one crosshair are one instrument.
 */
@Component({
  selector: 'app-chart-stack',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <div class="stack" (pointerleave)="clearCrosshair()" (dblclick)="resetZoom()">
      @if (zoomed()) {
        <button type="button" class="reset" (click)="resetZoom()" title="Ver todo · F o doble click">
          <span class="range">{{ rangeLabel() }}</span>
          <span class="action">Ver todo</span>
        </button>
      }
      @if (readout(); as r) {
        <div class="readout" [style.left.%]="readoutLeft()">
          <span class="date">{{ r.t | date: dateFormat }}</span>
          <span class="ohlc num">A <b>{{ fmt(r.open) }}</b></span>
          <span class="ohlc num">M <b>{{ fmt(r.high) }}</b></span>
          <span class="ohlc num">m <b>{{ fmt(r.low) }}</b></span>
          <span class="ohlc num">C <b [class]="r.up ? 'em-up' : 'em-down'">{{ fmt(r.close) }}</b></span>
          @for (m of r.markers; track m.t + m.side) {
            <span class="sep"></span>
            <span class="trade" [class]="m.side === 'sell' ? 'em-down' : 'em-up'">
              <span class="badge" [class.sell]="m.side === 'sell'">{{ m.side === 'sell' ? 'S' : 'B' }}</span>
              {{ m.count }} {{ m.side === 'sell' ? (m.count === 1 ? 'venta' : 'ventas') : (m.count === 1 ? 'compra' : 'compras') }}
              · <span class="num">{{ fmt(m.total) }}</span>
            </span>
          }
        </div>
      }

      <div
        class="pane price"
        [class.dragging]="dragging"
        (pointermove)="onPointerMove($event, 0)"
        (pointerdown)="startDrag($event, 0)"
        (pointerup)="endDrag($event)"
        (pointercancel)="endDrag($event)">
        <span class="pane-label">PRECIO{{ log ? ' · LOG' : '' }}</span>
        <canvas
          baseChart
          [data]="priceData()"
          [options]="priceOptions()"
          [type]="'candlestick'"></canvas>
      </div>

      <div class="pane volume" (pointermove)="onPointerMove($event, 1)">
        <span class="pane-label">VOLUMEN</span>
        <canvas baseChart [data]="volumeData()" [options]="volumeOptions()" [type]="'bar'"></canvas>
      </div>

      <div class="pane oscillator" (pointermove)="onPointerMove($event, 2)">
        <span class="pane-label">RSI 14</span>
        <canvas baseChart [data]="rsiData()" [options]="rsiOptions()" [type]="'line'"></canvas>
      </div>
    </div>
  `,
  styles: [
    `
      /* The host is what the grid gives height to; without laying it out as a
         column the inner stack falls back to content height and every panel
         collapses to the canvas default of 150px. */
      /* The host is what the grid gives height to; without laying it out as a
         column the inner stack falls back to content height and every panel
         collapses to the canvas default of 150px. */
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }

      .stack {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        border: 1px solid var(--border-color);
        border-radius: var(--r-4);
        background: var(--bg-card);
        overflow: hidden;
      }

      .pane {
        position: relative;
        min-height: 0;
      }

      .pane.price {
        flex: 1 1 auto;
        cursor: grab;
      }

      .pane.price.dragging {
        cursor: grabbing;
      }

      .pane.volume {
        flex: 0 0 12%;
        min-height: 56px;
        max-height: 96px;
      }

      .pane.oscillator {
        flex: 0 0 18%;
        min-height: 96px;
        max-height: 150px;
        border-top: 1px solid var(--border-color);
      }

      .pane-label {
        position: absolute;
        top: 6px;
        left: 8px;
        z-index: 1;
        font-size: var(--fs-10);
        font-weight: 600;
        letter-spacing: 0.06em;
        color: var(--text-tertiary);
        pointer-events: none;
      }

      .reset {
        position: absolute;
        top: 8px;
        right: 86px;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: var(--sp-3);
        padding: 4px 9px;
        border: 1px solid var(--border-light);
        border-radius: var(--r-2);
        background: rgba(11, 14, 17, 0.94);
        color: var(--text-secondary);
        font-family: inherit;
        font-size: 10.5px;
        cursor: pointer;
      }

      .reset:hover {
        color: var(--text-primary);
      }

      .reset .action {
        color: var(--brand-accent);
        font-weight: 500;
      }

      .readout {
        position: absolute;
        top: 8px;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: var(--sp-4);
        padding: 5px 10px;
        border: 1px solid var(--border-light);
        border-radius: var(--r-2);
        background: rgba(11, 14, 17, 0.94);
        box-shadow: var(--shadow-md);
        white-space: nowrap;
        transform: translateX(-50%);
        pointer-events: none;
      }

      .readout .date {
        font-size: 10.5px;
        color: var(--text-tertiary);
      }

      .readout .ohlc {
        font-size: var(--fs-11);
        color: var(--text-secondary);
      }

      .readout .ohlc b {
        font-weight: 500;
        color: var(--text-primary);
      }

      .readout .sep {
        width: 1px;
        height: 12px;
        background: var(--border-color);
      }

      .readout .trade {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: var(--fs-11);
      }

      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--chart-up);
        color: #0b0e11;
        font-size: 8.5px;
        font-weight: 700;
      }

      .badge.sell {
        background: var(--chart-down);
      }
    `,
  ],
})
export class ChartStackComponent {
  @ViewChildren(BaseChartDirective) private charts?: QueryList<BaseChartDirective>;

  @Input({ required: true }) set candles(value: OhlcCandle[]) {
    // new pair or timeframe: the old window means nothing here
    this.viewRef = null;
    this.zoomed.set(false);
    this.rangeLabel.set('');
    this.candlesSignal.set(value ?? []);
  }
  @Input() set rsi(value: IndicatorPoint[]) {
    this.rsiSignal.set(value ?? []);
  }
  @Input() set markers(value: TradeMarker[]) {
    this.markersSignal.set(value ?? []);
    this.pushLayerOptions();
  }
  @Input() set avgEntry(value: number | null) {
    this.avgEntrySignal.set(value);
  }
  @Input() set dustAt(value: number[]) {
    this.dustSignal.set(value ?? []);
  }
  @Input() set tradesLayer(value: boolean) {
    this.layerOn.set(value);
    this.pushLayerOptions();
  }
  @Input() set hoveredOrderId(value: string | null) {
    this.hovered.set(value);
    this.pushLayerOptions();
  }
  @Input() log = false;
  @Input() timeframe: MarketTimeframe = '1h';

  @Output() hoveredMarker = new EventEmitter<TradeMarker | null>();
  /** Visible window after a gesture, or null when showing everything */
  @Output() viewChange = new EventEmitter<{ min: number; max: number } | null>();

  private readonly candlesSignal = signal<OhlcCandle[]>([]);
  private readonly rsiSignal = signal<IndicatorPoint[]>([]);
  private readonly markersSignal = signal<TradeMarker[]>([]);
  private readonly avgEntrySignal = signal<number | null>(null);
  private readonly dustSignal = signal<number[]>([]);
  private readonly layerOn = signal(true);
  private readonly hovered = signal<string | null>(null);
  private readonly crosshairAt = signal<number | null>(null);
  /**
   * Visible window after zoom/pan; null means "everything that was loaded".
   *
   * Deliberately a plain field and NOT a signal. It changes on every frame of
   * a gesture, and anything reactive here recomputes the chart options
   * mid-gesture, which resets the zoom plugin's own state — the exact bug this
   * class keeps running into, from both ends.
   */
  private viewRef: { min: number; max: number } | null = null;

  /** Cheap, low-frequency mirrors of the window, for the reset chip only. */
  readonly zoomed = signal(false);
  readonly rangeLabel = signal('');

  readonly readout = computed<Readout | null>(() => {
    const at = this.crosshairAt();
    const candles = this.candlesSignal();
    if (at === null || !candles.length) return null;
    const candle = candles.reduce((best, c) =>
      Math.abs(c.timestamp - at) < Math.abs(best.timestamp - at) ? c : best,
    );
    return {
      t: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      up: candle.close >= candle.open,
      markers: this.markersSignal().filter((m) => m.t === candle.timestamp),
    };
  });

  readonly readoutLeft = computed(() => {
    const at = this.crosshairAt();
    const candles = this.candlesSignal();
    if (at === null || candles.length < 2) return 50;
    const first = candles[0].timestamp;
    const last = candles[candles.length - 1].timestamp;
    const raw = ((at - first) / (last - first)) * 100;
    // keep the readout inside the panel instead of hanging off an edge
    return Math.min(82, Math.max(18, raw));
  });

  get dateFormat(): string {
    return this.timeframe === '15m' || this.timeframe === '1h' ? 'dd MMM HH:mm' : 'dd MMM yyyy';
  }

  fmt(value: number): string {
    return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── shared X domain ───────────────────────────────────────────────────────
  /**
   * NOT a computed: it reads `viewRef`, which is a plain field on purpose. A
   * computed would cache the pre-gesture window and hand it back the next time
   * anything rebuilds the options — snapping the chart out of the zoom.
   */
  private xDomain(): { min: number | undefined; max: number | undefined; span: number } {
    const candles = this.candlesSignal();
    if (!candles.length) return { min: undefined, max: undefined, span: 0 };
    const span = candles.length > 1 ? candles[1].timestamp - candles[0].timestamp : 0;
    const full = {
      min: candles[0].timestamp - span / 2,
      max: candles[candles.length - 1].timestamp + span / 2,
    };
    const view = this.viewRef;
    return { min: view?.min ?? full.min, max: view?.max ?? full.max, span };
  }

  /** Candles inside the visible window — what the Y axis has to fit. */
  private visibleCandles(): OhlcCandle[] {
    const candles = this.candlesSignal();
    const view = this.viewRef;
    if (!view) return candles;
    const inside = candles.filter((c) => c.timestamp >= view.min && c.timestamp <= view.max);
    return inside.length ? inside : candles;
  }

  /**
   * Price domain: the visible candles, plus the average entry line only when
   * it is close enough that including it will not flatten the candles.
   */
  private priceRange(): { lo: number; hi: number } {
    const candles = this.visibleCandles();
    if (!candles.length) return { lo: 0, hi: 1 };
    let lo = Math.min(...candles.map((c) => c.low));
    let hi = Math.max(...candles.map((c) => c.high));

    const avg = this.avgEntrySignal();
    if (avg !== null && this.layerOn() && shouldIncludeInDomain(avg, { lo, hi }, { log: this.log })) {
      lo = Math.min(lo, avg);
      hi = Math.max(hi, avg);
    }
    return { lo, hi };
  }

  avgEntryOutOfRange(): boolean {
    const avg = this.avgEntrySignal();
    if (avg === null) return false;
    return !shouldIncludeInDomain(avg, this.priceRange(), { log: this.log });
  }

  readonly priceData = computed<ChartData<'candlestick'>>(() => {
    const c = chartColors();
    return {
      datasets: [
        {
          type: 'candlestick',
          label: 'price',
          data: this.candlesSignal().map((k) => ({
            x: k.timestamp,
            o: k.open,
            h: k.high,
            l: k.low,
            c: k.close,
          })),
          borderColors: { up: c.up, down: c.down, unchanged: c.axis },
          backgroundColors: { up: c.up, down: c.down, unchanged: c.axis },
        } as never,
      ],
    };
  });

  readonly priceOptions = computed<ChartOptions>(() => {
    const x = this.xDomain();
    const base = chartTheme({
      xMin: x.min,
      xMax: x.max,
      showXLabels: false,
      timeUnit: TIME_UNIT[this.timeframe],
      yDomain: 'visible',
      yRange: this.priceRange(),
      log: this.log,
    });
    return {
      ...base,
      plugins: {
        ...base.plugins,
        zoom: this.zoomConfig(),
        tradeLayer: {
          markers: this.markersSignal(),
          avgEntry: this.layerOn() ? this.avgEntrySignal() : null,
          avgEntryOutOfRange: this.avgEntryOutOfRange(),
          dustAt: this.layerOn() ? this.dustSignal() : [],
          hoveredOrderId: this.hovered(),
          enabled: this.layerOn(),
        },
        // NOT bound to the crosshair signal on purpose: the pointer moves on
        // every frame of a drag, and recomputing options mid-gesture reapplies
        // the pre-pan window and cancels the pan. The crosshair is written
        // straight into the live chart in onPointerMove instead.
        crosshair: { at: null, showLabel: true },
      },
    } as ChartOptions;
  });

  readonly volumeData = computed<ChartData<'bar'>>(() => {
    const c = chartColors();
    const candles = this.candlesSignal();
    return {
      datasets: [
        {
          type: 'bar',
          label: 'volume',
          data: candles.map((k) => ({ x: k.timestamp, y: k.volume })) as never,
          backgroundColor: candles.map((k) => (k.close >= k.open ? c.up : c.down)),
          borderWidth: 0,
          // volume bars read as texture behind the price, never as a rival
          barPercentage: 0.66,
          categoryPercentage: 1,
        } as never,
      ],
    };
  });

  readonly volumeOptions = computed<ChartOptions>(() => {
    const x = this.xDomain();
    const base = chartTheme({
      xMin: x.min,
      xMax: x.max,
      showXLabels: false,
      timeUnit: TIME_UNIT[this.timeframe],
      // the one legitimate exception to never starting at zero
      yDomain: 'zero-based',
    });
    return {
      ...base,
      scales: {
        ...base.scales,
        y: { ...(base.scales as never as Record<string, object>)['y'], ticks: { display: false }, grid: { display: false } },
      },
      plugins: { ...base.plugins, crosshair: { at: null } },
    } as ChartOptions;
  });

  readonly rsiData = computed<ChartData<'line'>>(() => ({
    datasets: [
      {
        type: 'line',
        label: 'RSI(14)',
        data: this.rsiSignal()
          .filter((p) => p.value !== null)
          .map((p) => ({ x: p.timestamp, y: p.value })) as never,
        borderColor: chartColors().ma[2],
        borderWidth: 1.4,
        pointRadius: 0,
        fill: false,
      } as never,
    ],
  }));

  readonly rsiOptions = computed<ChartOptions>(() => {
    const x = this.xDomain();
    const base = chartTheme({
      xMin: x.min,
      xMax: x.max,
      // only the bottom-most panel carries the date labels
      showXLabels: true,
      timeUnit: TIME_UNIT[this.timeframe],
      yDomain: [0, 100],
    });
    return {
      ...base,
      scales: {
        ...base.scales,
        y: {
          ...(base.scales as never as Record<string, object>)['y'],
          ticks: {
            color: chartColors().axis,
            stepSize: 40,
            font: { size: 10 },
            // 0–100 with no decimals: this axis is an index, not a price
            callback: (value: number | string) => String(Math.round(Number(value))),
          },
        },
      },
      plugins: { ...base.plugins, crosshair: { at: null } },
    } as ChartOptions;
  });

  // ── zoom & pan ────────────────────────────────────────────────────────────

  /**
   * Wheel zooms, drag pans, both on X only: the vertical range is not
   * something the user should have to manage — it follows what is visible.
   *
   * The whole thing is driven from the price panel and mirrored onto the other
   * two, rather than each panel zooming itself: three independent zoom states
   * is how stacked charts drift out of sync.
   */
  private zoomConfig(): Record<string, unknown> {
    const span = this.xDomain().span || 60 * 60 * 1000;
    return {
      limits: {
        // never pan into empty space, never zoom past ~8 candles
        x: { min: 'original', max: 'original', minRange: span * 8 },
      },
      // The plugin's own drag-pan routes through hammerjs, which is not in
      // the bundle (and is an unmaintained 20KB dependency). The drag is
      // handled by hand below instead, on the pointer events this component
      // already listens to for the crosshair.
      pan: { enabled: false },
      zoom: {
        wheel: { enabled: true, speed: 0.08 },
        pinch: { enabled: true },
        mode: 'x',
        onZoom: ({ chart }: { chart: Chart }) => {
          this.syncFromChart(chart);
          this.trackView(chart);
        },
        onZoomComplete: ({ chart }: { chart: Chart }) => this.commitView(chart),
      },
    };
  }

  /**
   * Applies the window of the chart being manipulated to the other panels and
   * refits the price axis, imperatively. Runs on every wheel tick, so it stays
   * out of change detection.
   */
  private syncFromChart(source: Chart): void {
    const x = source.scales['x'];
    if (!x) return;
    const min = x.min;
    const max = x.max;

    for (const directive of this.charts?.toArray() ?? []) {
      const chart = directive.chart;
      if (!chart || chart === source) continue;
      const scale = chart.options.scales?.['x'] as { min?: number; max?: number } | undefined;
      if (!scale) continue;
      scale.min = min;
      scale.max = max;
      chart.update('none');
    }

    this.refitPriceAxis(min, max);
  }

  /**
   * The Y axis follows the zoom. Without this you zoom into a quiet stretch
   * and the candles collapse into a flat line in the middle of the panel,
   * because the axis is still sized for a range that is no longer on screen.
   */
  private refitPriceAxis(min: number, max: number): void {
    const price = this.charts?.first?.chart;
    if (!price) return;

    const inside = this.candlesSignal().filter((c) => c.timestamp >= min && c.timestamp <= max);
    if (inside.length < 2) return;

    let lo = Math.min(...inside.map((c) => c.low));
    let hi = Math.max(...inside.map((c) => c.high));

    const avg = this.avgEntrySignal();
    if (avg !== null && this.layerOn() && shouldIncludeInDomain(avg, { lo, hi }, { log: this.log })) {
      lo = Math.min(lo, avg);
      hi = Math.max(hi, avg);
    }

    const domain = resolveVisibleDomain({ lo, hi }, { log: this.log });
    const scale = price.options.scales?.['y'] as { min?: number; max?: number } | undefined;
    if (!scale) return;
    scale.min = domain.min;
    scale.max = domain.max;
    price.update('none');
  }

  /** Mid-gesture bookkeeping. Touches no signal, so nothing re-renders. */
  trackView(chart: Chart): void {
    const x = chart.scales['x'];
    if (!x) return;
    this.viewRef = { min: x.min, max: x.max };
  }

  /** Records the window once the gesture settles, for the reset affordance. */
  private commitView(chart: Chart): void {
    const x = chart.scales['x'];
    if (!x) return;

    const candles = this.candlesSignal();
    if (!candles.length) return;
    const span = this.xDomain().span;
    const fullMin = candles[0].timestamp - span / 2;
    const fullMax = candles[candles.length - 1].timestamp + span / 2;

    // back at the edges within a candle: treat it as "not zoomed"
    const atFullExtent = x.min <= fullMin + span && x.max >= fullMax - span;
    const window = atFullExtent ? null : { min: x.min, max: x.max };

    this.viewRef = window;
    this.zoomed.set(window !== null);
    this.rangeLabel.set(window ? describeSpan(window.max - window.min) : '');
    this.viewChange.emit(window);
  }

  /**
   * Drag-to-pan, by hand.
   *
   * `chart.pan()` is the plugin's own API, so the limits, the axis mode and
   * the completion bookkeeping all still apply — only the gesture detection
   * is ours.
   */
  dragging = false;
  private dragX: number | null = null;

  startDrag(event: PointerEvent, paneIndex: number): void {
    if (event.button !== 0) return;
    const chart = this.charts?.toArray()[paneIndex]?.chart;
    if (!chart) return;

    this.dragging = true;
    this.dragX = event.clientX;
    // keep receiving moves even if the pointer leaves the canvas mid-drag.
    // Capture is a nicety: if the browser refuses it, the drag still works.
    try {
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  private continueDrag(event: PointerEvent, chart: Chart): boolean {
    if (!this.dragging || this.dragX === null) return false;

    const dx = event.clientX - this.dragX;
    if (Math.abs(dx) < 1) return true;

    this.dragX = event.clientX;
    (chart as unknown as { pan(delta: { x: number }, scales?: unknown, mode?: string): void }).pan(
      { x: dx },
      undefined,
      'default',
    );
    this.syncFromChart(chart);
    this.trackView(chart);
    return true;
  }

  endDrag(event: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.dragX = null;
    try {
      (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }

    const chart = this.charts?.first?.chart;
    if (chart) this.commitView(chart);
  }

  /** Back to the whole loaded history. Double click, the button, or F. */
  resetZoom(): void {
    this.viewRef = null;
    this.zoomed.set(false);
    this.rangeLabel.set('');
    this.viewChange.emit(null);
    for (const directive of this.charts?.toArray() ?? []) {
      directive.chart?.resetZoom('none');
    }
  }

  // ── crosshair ─────────────────────────────────────────────────────────────

  /**
   * Written straight into the live chart options rather than through change
   * detection: this fires on every pointer move, and re-rendering three
   * Angular views at that rate is what makes a chart feel cheap.
   */
  onPointerMove(event: PointerEvent, paneIndex: number): void {
    const charts = this.charts?.toArray() ?? [];
    const source = charts[paneIndex]?.chart;
    if (!source) return;

    // a drag in progress owns the gesture; the crosshair keeps following along
    this.continueDrag(event, source);

    const rect = source.canvas.getBoundingClientRect();
    const scale = source.scales['x'];
    if (!scale) return;

    const value = scale.getValueForPixel(event.clientX - rect.left);
    if (value === undefined) return;

    // snap to the centre of the nearest candle
    const candles = this.candlesSignal();
    if (!candles.length) return;
    const nearest = candles.reduce((best, c) =>
      Math.abs(c.timestamp - value) < Math.abs(best.timestamp - value) ? c : best,
    );

    if (nearest.timestamp !== this.crosshairAt()) {
      this.crosshairAt.set(nearest.timestamp);
      this.hoveredMarker.emit(this.markersSignal().find((m) => m.t === nearest.timestamp) ?? null);
    }

    const pointerY = event.clientY - rect.top;
    charts.forEach((directive, index) => {
      const chart = directive.chart;
      if (!chart?.options.plugins) return;
      const crosshair = chart.options.plugins.crosshair;
      if (!crosshair) return;
      crosshair.at = nearest.timestamp;
      crosshair.pointerY = index === paneIndex ? pointerY : null;
      chart.update('none');
    });
  }

  clearCrosshair(): void {
    if (this.crosshairAt() === null) return;
    this.crosshairAt.set(null);
    this.hoveredMarker.emit(null);
    for (const directive of this.charts?.toArray() ?? []) {
      const crosshair = directive.chart?.options.plugins?.crosshair;
      if (!crosshair) continue;
      crosshair.at = null;
      crosshair.pointerY = null;
      directive.chart?.update('none');
    }
  }

  /** Pushes layer changes into the live chart without a full re-render. */
  private pushLayerOptions(): void {
    const chart = this.charts?.first?.chart;
    const layer = chart?.options.plugins?.tradeLayer;
    if (!chart || !layer) return;
    layer.markers = this.markersSignal();
    layer.hoveredOrderId = this.hovered();
    layer.enabled = this.layerOn();
    layer.avgEntry = this.layerOn() ? this.avgEntrySignal() : null;
    chart.update('none');
  }
}
