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
import 'chartjs-adapter-date-fns';
import { OhlcCandle, IndicatorPoint, MarketTimeframe } from '../../core/services/market-analysis.service';
import { chartColors, chartTheme, resolveVisibleDomain, shouldIncludeInDomain } from '../../shared/charts/chart-theme';
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
    <div class="stack" (pointerleave)="clearCrosshair()">
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

      <div class="pane price" (pointermove)="onPointerMove($event, 0)">
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
      .stack {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
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

  private readonly candlesSignal = signal<OhlcCandle[]>([]);
  private readonly rsiSignal = signal<IndicatorPoint[]>([]);
  private readonly markersSignal = signal<TradeMarker[]>([]);
  private readonly avgEntrySignal = signal<number | null>(null);
  private readonly dustSignal = signal<number[]>([]);
  private readonly layerOn = signal(true);
  private readonly hovered = signal<string | null>(null);
  private readonly crosshairAt = signal<number | null>(null);

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
  private readonly xDomain = computed(() => {
    const candles = this.candlesSignal();
    if (!candles.length) return { min: undefined, max: undefined, span: 0 };
    const span = candles.length > 1 ? candles[1].timestamp - candles[0].timestamp : 0;
    return {
      min: candles[0].timestamp - span / 2,
      max: candles[candles.length - 1].timestamp + span / 2,
      span,
    };
  });

  /**
   * Price domain: the visible candles, plus the average entry line only when
   * it is close enough that including it will not flatten the candles.
   */
  private readonly priceRange = computed(() => {
    const candles = this.candlesSignal();
    if (!candles.length) return { lo: 0, hi: 1 };
    let lo = Math.min(...candles.map((c) => c.low));
    let hi = Math.max(...candles.map((c) => c.high));

    const avg = this.avgEntrySignal();
    if (avg !== null && this.layerOn() && shouldIncludeInDomain(avg, { lo, hi }, { log: this.log })) {
      lo = Math.min(lo, avg);
      hi = Math.max(hi, avg);
    }
    return { lo, hi };
  });

  readonly avgEntryOutOfRange = computed(() => {
    const avg = this.avgEntrySignal();
    if (avg === null) return false;
    return !shouldIncludeInDomain(avg, this.priceRange(), { log: this.log });
  });

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
        tradeLayer: {
          markers: this.markersSignal(),
          avgEntry: this.layerOn() ? this.avgEntrySignal() : null,
          avgEntryOutOfRange: this.avgEntryOutOfRange(),
          dustAt: this.layerOn() ? this.dustSignal() : [],
          hoveredOrderId: this.hovered(),
          enabled: this.layerOn(),
        },
        crosshair: { at: this.crosshairAt(), showLabel: true },
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
      plugins: { ...base.plugins, crosshair: { at: this.crosshairAt() } },
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
          ticks: { color: chartColors().axis, stepSize: 40, font: { size: 10 } },
        },
      },
      plugins: { ...base.plugins, crosshair: { at: this.crosshairAt() } },
    } as ChartOptions;
  });

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
      crosshair.labelFor = (v: number) => this.fmt(v);
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
