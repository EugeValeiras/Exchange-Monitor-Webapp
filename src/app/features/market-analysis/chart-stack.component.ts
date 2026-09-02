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
import {
  BollingerPoint,
  IndicatorPoint,
  MacdPoint,
  MarketTimeframe,
  OhlcCandle,
} from '../../core/services/market-analysis.service';
import {
  chartColors,
  chartTheme,
  resolveVisibleDomain,
  shouldIncludeInDomain,
} from '../../shared/charts/chart-theme';
import { TradeMarker } from './lib/chart-markers';
import { TradeOrder } from './lib/trade-grouping';
import { tradeLayerPlugin } from './lib/trade-layer.plugin';
import { crosshairPlugin } from './lib/crosshair.plugin';
import { DEFAULT_SERIES, SeriesConfig, seriesColor } from './lib/series';

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
        </div>
      }

      @if (tradeTip(); as tip) {
        <div
          class="trade-tip"
          [style.left.px]="tip.x"
          [style.top.px]="tip.y"
          [class.flip-x]="tip.flipX"
          [class.flip-y]="tip.flipY">
          @for (order of tip.orders; track order.id) {
            <div class="tip-order" [class.sell]="order.side === 'sell'">
              <div class="tip-head">
                <span class="badge" [class.sell]="order.side === 'sell'">
                  {{ order.side === 'sell' ? 'S' : 'B' }}
                </span>
                <span class="verb">{{ order.side === 'sell' ? 'Venta' : 'Compra' }}</span>
                <span class="exchange">{{ order.exchange | titlecase }}</span>
              </div>
              <div class="tip-rows">
                @if (order.via; as via) {
                  <div>
                    <span>Vía</span>
                    <b class="num">{{ via.pair }} · {{ via.amount | number: '1.0-4' }} {{ via.asset }}</b>
                  </div>
                }
                <div><span>Cantidad</span><b class="num">{{ fmt(order.amount) }} {{ baseAsset }}</b></div>
                <div>
                  <span>{{ order.via ? baseAsset + '/USD ese día' : 'Precio' }}</span>
                  <b class="num">{{ fmt(order.price) }}</b>
                </div>
                <div><span>Total</span><b class="num">{{ fmt(order.total) }}</b></div>
                @if (order.fills.length > 1) {
                  <div><span>Fills</span><b class="num">{{ order.fills.length }}</b></div>
                }
              </div>
              @if (vsSpot(order.price); as vs) {
                <div class="tip-foot">
                  <span>vs. precio de hoy</span>
                  <b [class]="vs.tone">{{ vs.label }}</b>
                </div>
              }
            </div>
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
        <span class="pane-label">PRECIO{{ log ? ' · LOG' : '' }}{{ overlayLabel() }}</span>
        <canvas
          baseChart
          [data]="priceData()"
          [options]="priceOptions()"
          [type]="'candlestick'"></canvas>
      </div>

      @if (showsVolume()) {
        <div class="pane volume" (pointermove)="onPointerMove($event, paneIndex('volume'))">
          <span class="pane-label">VOLUMEN</span>
          <canvas baseChart [data]="volumeData()" [options]="volumeOptions()" [type]="'bar'"></canvas>
        </div>
      }

      @if (showsRsi()) {
        <div class="pane oscillator" (pointermove)="onPointerMove($event, paneIndex('rsi'))">
          <span class="pane-label">RSI 14</span>
          <canvas baseChart [data]="rsiData()" [options]="rsiOptions()" [type]="'line'"></canvas>
        </div>
      }

      @if (showsMacd()) {
        <div class="pane oscillator" (pointermove)="onPointerMove($event, paneIndex('macd'))">
          <span class="pane-label">MACD 12 · 26 · 9</span>
          <canvas baseChart [data]="macdData()" [options]="macdOptions()" [type]="'bar'"></canvas>
        </div>
      }
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
        background: rgba(12, 13, 15, 0.94);
        color: var(--text-secondary);
        font-family: inherit;
        font-size: 10.5px;
        cursor: pointer;
      }

      .reset:hover {
        color: var(--text-primary);
      }

      .reset .action {
        color: var(--text-primary);
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
        background: rgba(12, 13, 15, 0.94);
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

      .trade-tip {
        position: absolute;
        z-index: 3;
        display: flex;
        flex-direction: column;
        gap: var(--sp-3);
        width: 216px;
        padding: 10px 12px;
        border: 1px solid var(--border-light);
        border-radius: var(--r-2);
        background: rgba(12, 13, 15, 0.96);
        box-shadow: var(--shadow-lg);
        pointer-events: none;
        /* anchored beside the marker; flipped when it would leave the panel */
        transform: translate(14px, -50%);
      }

      .trade-tip.flip-x {
        transform: translate(calc(-100% - 14px), -50%);
      }

      .trade-tip.flip-y {
        transform: translate(14px, -90%);
      }

      .trade-tip.flip-x.flip-y {
        transform: translate(calc(-100% - 14px), -90%);
      }

      .tip-order + .tip-order {
        padding-top: var(--sp-3);
        border-top: 1px solid var(--border-color);
      }

      .tip-head {
        display: flex;
        align-items: center;
        gap: var(--sp-2);
        margin-bottom: var(--sp-3);
      }

      .tip-head .verb {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--chart-up);
      }

      .tip-order.sell .verb {
        color: var(--chart-down);
      }

      .tip-head .exchange {
        margin-left: auto;
        font-size: 11px;
        color: var(--text-tertiary);
      }

      .tip-rows {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .tip-rows > div,
      .tip-foot {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--sp-4);
      }

      .tip-rows span,
      .tip-foot span {
        font-size: 11px;
        color: var(--text-tertiary);
      }

      .tip-rows b {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-primary);
      }

      .tip-foot {
        padding-top: var(--sp-3);
        border-top: 1px solid var(--border-color);
      }

      .tip-foot b {
        font-size: 12px;
        font-weight: 600;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--chart-up);
        color: var(--bg-primary);
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
    this.candlesSignal.set(value ?? []);
  }

  /**
   * Identifies the series on screen (pair + timeframe + exchange).
   *
   * A refresh brings new candles for the SAME series, and must not throw away
   * the window you zoomed into — that is the difference between a chart that
   * stays live and one you have to re-aim every minute. Only a new series
   * clears it.
   */
  @Input() set seriesKey(value: string) {
    if (value === this.currentSeries) return;
    this.currentSeries = value;
    this.viewRef = null;
    this.zoomed.set(false);
    this.rangeLabel.set('');
    this.tradeTip.set(null);
  }

  private currentSeries = '';
  @Input() set rsi(value: IndicatorPoint[]) {
    this.rsiSignal.set(value ?? []);
  }
  @Input() set sma20(value: IndicatorPoint[]) {
    this.sma20Signal.set(value ?? []);
  }
  @Input() set sma50(value: IndicatorPoint[]) {
    this.sma50Signal.set(value ?? []);
  }
  @Input() set ema20(value: IndicatorPoint[]) {
    this.ema20Signal.set(value ?? []);
  }
  @Input() set bollinger(value: BollingerPoint[]) {
    this.bollingerSignal.set(value ?? []);
  }
  @Input() set macd(value: MacdPoint[]) {
    this.macdSignal.set(value ?? []);
  }
  /** Which of the above actually reach the canvas. */
  @Input() set series(value: SeriesConfig) {
    this.seriesSignal.set(value ?? { ...DEFAULT_SERIES });
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
  /** Base asset of the pair, for the amounts in the trade tooltip */
  @Input() baseAsset = '';

  @Output() hoveredMarker = new EventEmitter<TradeMarker | null>();
  /** Visible window after a gesture, or null when showing everything */
  @Output() viewChange = new EventEmitter<{ min: number; max: number } | null>();

  private readonly candlesSignal = signal<OhlcCandle[]>([]);
  private readonly rsiSignal = signal<IndicatorPoint[]>([]);
  private readonly sma20Signal = signal<IndicatorPoint[]>([]);
  private readonly sma50Signal = signal<IndicatorPoint[]>([]);
  private readonly ema20Signal = signal<IndicatorPoint[]>([]);
  private readonly bollingerSignal = signal<BollingerPoint[]>([]);
  private readonly macdSignal = signal<MacdPoint[]>([]);
  private readonly seriesSignal = signal<SeriesConfig>({ ...DEFAULT_SERIES });
  private readonly markersSignal = signal<TradeMarker[]>([]);
  private readonly avgEntrySignal = signal<number | null>(null);
  private readonly dustSignal = signal<number[]>([]);
  private readonly layerOn = signal(true);
  private readonly hovered = signal<string | null>(null);
  private readonly crosshairAt = signal<number | null>(null);

  /**
   * The trade tooltip is its own surface, anchored to the marker.
   *
   * It used to be tacked onto the end of the candle readout, which made one
   * strip carry two unrelated things: what the market did, and what you did.
   */
  readonly tradeTip = signal<{
    x: number;
    y: number;
    flipX: boolean;
    flipY: boolean;
    orders: TradeOrder[];
  } | null>(null);
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

  /** How the trade's price compares with the last close on screen. */
  vsSpot(price: number): { label: string; tone: string } | null {
    const candles = this.candlesSignal();
    if (!candles.length || !price) return null;

    const last = candles[candles.length - 1].close;
    const pct = ((last - price) / price) * 100;
    const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
    return {
      label: `${sign}${Math.abs(pct).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
      tone: pct > 0 ? 'em-up' : pct < 0 ? 'em-down' : 'em-flat',
    };
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

  // ── panel geometry ────────────────────────────────────────────────────────

  /**
   * The panes actually on screen, in order. Everything that used to be a
   * hard-coded index — which chart the pointer is over, which pane carries
   * the date labels — reads off this instead, so a pane can be switched off
   * without the crosshair landing on the wrong canvas.
   */
  readonly panes = computed<Array<'price' | 'volume' | 'rsi' | 'macd'>>(() => {
    const s = this.seriesSignal();
    const out: Array<'price' | 'volume' | 'rsi' | 'macd'> = ['price'];
    if (s.volume) out.push('volume');
    if (s.rsi) out.push('rsi');
    if (s.macd) out.push('macd');
    return out;
  });

  paneIndex(pane: 'price' | 'volume' | 'rsi' | 'macd'): number {
    return this.panes().indexOf(pane);
  }

  /** Only the bottom-most pane shows the dates, whichever one that is now. */
  private showsDates(pane: 'price' | 'volume' | 'rsi' | 'macd'): boolean {
    const panes = this.panes();
    return panes[panes.length - 1] === pane;
  }

  readonly showsVolume = computed(() => this.seriesSignal().volume);
  readonly showsRsi = computed(() => this.seriesSignal().rsi);
  readonly showsMacd = computed(() => this.seriesSignal().macd);

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

    const view = this.viewRef;
    const bands = this.bollingerBounds(view?.min, view?.max);
    if (bands) {
      lo = Math.min(lo, bands.lo);
      hi = Math.max(hi, bands.hi);
    }
    return { lo, hi };
  }

  /**
   * Bollinger sits outside the candles by construction, so the axis has to
   * make room for it or the band gets clipped at the edge of the panel.
   * Nothing else needs this: a moving average is an average of the candles
   * and always lands inside them.
   */
  private bollingerBounds(min?: number, max?: number): { lo: number; hi: number } | null {
    if (!this.seriesSignal().bollinger) return null;
    const inWindow = this.bollingerSignal().filter(
      (p) => (min === undefined || p.timestamp >= min) && (max === undefined || p.timestamp <= max),
    );
    const lows = inWindow.map((p) => p.lower).filter((v): v is number => v !== null);
    const highs = inWindow.map((p) => p.upper).filter((v): v is number => v !== null);
    if (!lows.length || !highs.length) return null;
    return { lo: Math.min(...lows), hi: Math.max(...highs) };
  }

  avgEntryOutOfRange(): boolean {
    const avg = this.avgEntrySignal();
    if (avg === null) return false;
    return !shouldIncludeInDomain(avg, this.priceRange(), { log: this.log });
  }

  /** Names the overlays in the pane label, so a line always has a name. */
  readonly overlayLabel = computed(() => {
    const s = this.seriesSignal();
    const on = [
      s.bollinger ? 'BB' : null,
      s.sma20 ? 'SMA 20' : null,
      s.sma50 ? 'SMA 50' : null,
      s.ema20 ? 'EMA 20' : null,
    ].filter(Boolean);
    return on.length ? ` · ${on.join(' · ')}` : '';
  });

  private line(id: 'sma20' | 'sma50' | 'ema20', points: IndicatorPoint[], label: string): object {
    return {
      type: 'line',
      label,
      data: points.filter((p) => p.value !== null).map((p) => ({ x: p.timestamp, y: p.value })),
      borderColor: seriesColor(id),
      borderWidth: 1.3,
      pointRadius: 0,
      pointHitRadius: 0,
      spanGaps: true,
      fill: false,
      // Chart.js draws the LOWEST order first, i.e. furthest back. A moving
      // average is read against the candles, so it goes on top of them.
      order: 2,
    };
  }

  readonly priceData = computed<ChartData<'candlestick'>>(() => {
    const c = chartColors();
    const s = this.seriesSignal();

    const candles = {
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
      order: 1,
    };


    const datasets: object[] = [candles];

    // Bollinger goes in first and draws behind the candles: it is the channel
    // the price moves inside, not a line competing with it.
    if (s.bollinger) {
      const bb = this.bollingerSignal();
      const colour = seriesColor('bollinger');
      // order 0: the channel is the space the price moves inside, so it is
      // drawn first and the candles land on top of it
      const band = {
        borderColor: colour,
        borderWidth: 0.9,
        pointRadius: 0,
        pointHitRadius: 0,
        spanGaps: true,
        order: 0,
      };
      const upperIndex = datasets.length;
      datasets.push({
        ...band,
        type: 'line',
        label: 'BB sup.',
        data: bb.filter((p) => p.upper !== null).map((p) => ({ x: p.timestamp, y: p.upper })),
        fill: false,
      });
      datasets.push({
        ...band,
        type: 'line',
        label: 'BB inf.',
        data: bb.filter((p) => p.lower !== null).map((p) => ({ x: p.timestamp, y: p.lower })),
        // fill up to the upper band by absolute index: a relative target
        // breaks the moment another series is switched on between them
        fill: { target: upperIndex, above: chartColors().band, below: chartColors().band },
      });
      // The middle band is SMA(20) — literally the same series the backend
      // sends as `sma20`. Drawn only when that one is off, so turning both on
      // does not stack one line on top of an identical one.
      if (!s.sma20) {
        datasets.push({
          ...band,
          type: 'line',
          label: 'BB media',
          data: bb.filter((p) => p.middle !== null).map((p) => ({ x: p.timestamp, y: p.middle })),
          fill: false,
          borderDash: [4, 3],
        });
      }
    }

    if (s.sma20) datasets.push(this.line('sma20', this.sma20Signal(), 'SMA 20'));
    if (s.sma50) datasets.push(this.line('sma50', this.sma50Signal(), 'SMA 50'));
    if (s.ema20) datasets.push(this.line('ema20', this.ema20Signal(), 'EMA 20'));

    return { datasets: datasets as never };
  });

  readonly priceOptions = computed<ChartOptions>(() => {
    const x = this.xDomain();
    const base = chartTheme({
      xMin: x.min,
      xMax: x.max,
      showXLabels: this.showsDates('price'),
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
      showXLabels: this.showsDates('volume'),
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
      showXLabels: this.showsDates('rsi'),
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

  /**
   * MACD inside the visible window, so the axis follows the zoom like the
   * price panel does rather than staying sized for history off screen.
   */
  private visibleMacd(): MacdPoint[] {
    const points = this.macdSignal();
    const view = this.viewRef;
    if (!view) return points;
    const inside = points.filter((p) => p.timestamp >= view.min && p.timestamp <= view.max);
    return inside.length ? inside : points;
  }

  /** Widest excursion on screen, which `symmetric-zero` mirrors around zero. */
  private macdRange(): { lo: number; hi: number } {
    const values = this.visibleMacd().flatMap((p) =>
      [p.macd, p.signal, p.histogram].filter((v): v is number => v !== null),
    );
    if (!values.length) return { lo: -1, hi: 1 };
    return { lo: Math.min(...values), hi: Math.max(...values) };
  }

  readonly macdData = computed<ChartData<'bar'>>(() => {
    const c = chartColors();
    const points = this.macdSignal();
    return {
      datasets: [
        {
          type: 'bar',
          label: 'histograma',
          data: points.filter((p) => p.histogram !== null).map((p) => ({ x: p.timestamp, y: p.histogram })),
          // the histogram is the gap between the two lines: its sign is the
          // whole message, so it takes the same up/down colours as the candles
          backgroundColor: points
            .filter((p) => p.histogram !== null)
            .map((p) => ((p.histogram as number) >= 0 ? c.up : c.down)),
          borderWidth: 0,
          barPercentage: 0.7,
          categoryPercentage: 1,
          order: 2,
        },
        {
          type: 'line',
          label: 'MACD',
          data: points.filter((p) => p.macd !== null).map((p) => ({ x: p.timestamp, y: p.macd })),
          borderColor: seriesColor('macd'),
          borderWidth: 1.3,
          pointRadius: 0,
          pointHitRadius: 0,
          spanGaps: true,
          fill: false,
          order: 0,
        },
        {
          type: 'line',
          label: 'señal',
          data: points.filter((p) => p.signal !== null).map((p) => ({ x: p.timestamp, y: p.signal })),
          borderColor: c.ma[0],
          borderWidth: 1.1,
          pointRadius: 0,
          pointHitRadius: 0,
          spanGaps: true,
          fill: false,
          order: 1,
        },
      ] as never,
    };
  });

  readonly macdOptions = computed<ChartOptions>(() => {
    const x = this.xDomain();
    const base = chartTheme({
      xMin: x.min,
      xMax: x.max,
      showXLabels: this.showsDates('macd'),
      timeUnit: TIME_UNIT[this.timeframe],
      // centred on zero: the crossing is the signal, so it sits in the middle
      yDomain: 'symmetric-zero',
      yRange: this.macdRange(),
    });
    return {
      ...base,
      scales: {
        ...base.scales,
        y: {
          ...(base.scales as never as Record<string, object>)['y'],
          ticks: { color: chartColors().axis, maxTicksLimit: 3, font: { size: 10 } },
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
    this.refitMacdAxis(min, max);
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

    const bands = this.bollingerBounds(min, max);
    if (bands) {
      lo = Math.min(lo, bands.lo);
      hi = Math.max(hi, bands.hi);
    }

    const domain = resolveVisibleDomain({ lo, hi }, { log: this.log });
    const scale = price.options.scales?.['y'] as { min?: number; max?: number } | undefined;
    if (!scale) return;
    scale.min = domain.min;
    scale.max = domain.max;
    price.update('none');
  }

  /**
   * Same story as the price axis: MACD sized for six months of history is a
   * flat line once you zoom into a week. RSI and volume are exempt — one is
   * pinned to 0–100 and the other to zero.
   */
  private refitMacdAxis(min: number, max: number): void {
    const index = this.paneIndex('macd');
    if (index < 0) return;
    const chart = this.charts?.toArray()[index]?.chart;
    if (!chart) return;

    const values = this.macdSignal()
      .filter((p) => p.timestamp >= min && p.timestamp <= max)
      .flatMap((p) => [p.macd, p.signal, p.histogram].filter((v): v is number => v !== null));
    if (!values.length) return;

    const bound = Math.max(Math.abs(Math.min(...values)), Math.abs(Math.max(...values)));
    const scale = chart.options.scales?.['y'] as { min?: number; max?: number } | undefined;
    if (!scale || !bound) return;
    scale.min = -bound;
    scale.max = bound;
    chart.update('none');
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
      const marker = this.markersSignal().find((m) => m.t === nearest.timestamp) ?? null;
      this.hoveredMarker.emit(marker);
      this.placeTradeTip(nearest.timestamp);
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

  /**
   * Puts the trade tooltip beside its marker, flipped when it would otherwise
   * run off the panel.
   */
  private placeTradeTip(at: number): void {
    const price = this.charts?.first?.chart;
    const markers = this.markersSignal().filter((m) => m.t === at);

    if (!price || !markers.length || !this.layerOn()) {
      this.tradeTip.set(null);
      return;
    }

    const x = price.scales['x'];
    const y = price.scales['y'];
    const area = price.chartArea;
    if (!x || !y || !area) {
      this.tradeTip.set(null);
      return;
    }

    const orders = markers.flatMap((m) => m.orders);
    if (!orders.length) {
      this.tradeTip.set(null);
      return;
    }

    // vertically, sit beside the marker that carries the most money
    const anchor = markers.reduce((best, m) => (m.total > best.total ? m : best));
    const px = x.getPixelForValue(anchor.t);
    const py = y.getPixelForValue(anchor.price);

    this.tradeTip.set({
      x: px,
      y: py,
      flipX: px > area.right - 250,
      flipY: py < area.top + 120,
      orders,
    });
  }

  clearCrosshair(): void {
    this.tradeTip.set(null);
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
