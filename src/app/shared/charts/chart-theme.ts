import { ChartOptions, ScaleOptions } from 'chart.js';

/**
 * One source of truth for how a chart looks in this app.
 *
 * Before this, eight charts carried hand-copied option blocks: 20 literal
 * `#0ecb81`, 22 `#f6465d` and 13 different grid rgba() values. Changing the
 * identity of the chart system meant 40 edits; now it means editing the
 * tokens this file reads.
 */

/** Reads a CSS custom property, with a fallback for non-browser contexts. */
function token(name: string, fallback: string): string {
  if (typeof getComputedStyle === 'undefined' || typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export const chartColors = () => ({
  up: token('--chart-up', '#0ecb81'),
  down: token('--chart-down', '#f6465d'),
  mine: token('--chart-mine', '#00bcd4'),
  agent: token('--chart-agent', '#f0b90b'),
  grid: token('--chart-grid', 'rgba(255,255,255,0.055)'),
  axis: token('--chart-axis', 'rgba(255,255,255,0.42)'),
  crosshair: token('--chart-crosshair', 'rgba(255,255,255,0.28)'),
  band: token('--chart-band', 'rgba(255,255,255,0.025)'),
  ma: [
    token('--chart-ma-1', '#f0b90b'),
    token('--chart-ma-2', '#a78bfa'),
    token('--chart-ma-3', '#8ab4f8'),
  ],
});

/**
 * How a panel's Y axis is allowed to behave. Declaring the intent per panel
 * is what makes the "axis starts at zero" bug unrepresentable instead of
 * merely fixed: the price panel can no longer forget to bound itself.
 *
 *  - `visible`        → domain from the visible data, with asymmetric padding
 *  - `zero-based`     → starts at zero. The ONLY legitimate case (volume)
 *  - `[min, max]`     → fixed range, e.g. RSI [0, 100]
 *  - `symmetric-zero` → zero centred, e.g. MACD
 */
export type YDomain = 'visible' | 'zero-based' | 'symmetric-zero' | [number, number];

export interface PriceRange {
  lo: number;
  hi: number;
}

/**
 * Resolves a `visible` domain.
 *
 * On a LOGARITHMIC scale the padding has to be multiplicative: subtracting a
 * percentage of the linear range leaves a third of the canvas empty at the
 * bottom, which is the zero bug coming back through another door.
 */
export function resolveVisibleDomain(
  range: PriceRange,
  { log = false, padBelow = 0.06, padAbove = 0.04 }: { log?: boolean; padBelow?: number; padAbove?: number } = {},
): { min: number; max: number } {
  const { lo, hi } = range;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    return { min: lo, max: hi };
  }
  if (log) {
    return { min: lo * (1 - padBelow), max: hi * (1 + padAbove) };
  }
  // The padding is the SMALLER of "a slice of the range" and "a slice of the
  // value". On a narrow range (70k–72k) the first one wins and gives it room;
  // on a wide one (15k–126k) a slice of the range would drop the floor to 8.7k
  // and flatten the candles all over again — a milder version of the same bug.
  const span = hi - lo;
  return {
    min: lo - Math.min(span * padBelow, lo * padBelow),
    max: hi + Math.min(span * padAbove, hi * padAbove),
  };
}

/**
 * A price line should only widen the domain when it is actually near the data.
 * An average entry far from the visible range (bought very cheap, or very
 * expensive) would flatten the candles all over again — past that distance the
 * line is pinned to the edge and labelled instead.
 *
 * The distance has to be measured in the space the axis actually uses. On a
 * log axis, dropping the floor from 15.000 to 500 is one and a half decades
 * even though in linear terms it only widens the span by 15%, so a linear
 * tolerance lets through exactly the case this guard exists for.
 */
export function shouldIncludeInDomain(
  value: number,
  range: PriceRange,
  { log = false, tolerance = 0.3 }: { log?: boolean; tolerance?: number } = {},
): boolean {
  const { lo, hi } = range;
  if (!(hi > lo) || value <= 0) return false;

  if (log) {
    const ratio = hi / lo;
    const widened = Math.max(hi, value) / Math.min(lo, value);
    return widened <= ratio * (1 + tolerance);
  }

  const span = hi - lo;
  const widened = Math.max(hi, value) - Math.min(lo, value);
  return widened <= span * (1 + tolerance);
}

export function applyYDomain(scale: Record<string, unknown>, domain: YDomain, range?: PriceRange, log = false): void {
  if (Array.isArray(domain)) {
    scale['min'] = domain[0];
    scale['max'] = domain[1];
    return;
  }
  if (domain === 'zero-based') {
    scale['beginAtZero'] = true;
    return;
  }
  if (domain === 'symmetric-zero' && range) {
    const bound = Math.max(Math.abs(range.lo), Math.abs(range.hi));
    scale['min'] = -bound;
    scale['max'] = bound;
    return;
  }
  if (domain === 'visible' && range) {
    const { min, max } = resolveVisibleDomain(range, { log });
    scale['min'] = min;
    scale['max'] = max;
    // `bounds: 'data'` keeps Chart.js from stretching the domain out to the
    // next round tick, which is what produced 0–140.000 on a 15k–126k range.
    scale['bounds'] = 'data';
    scale['beginAtZero'] = false;
  }
}

export interface ChartThemeOptions {
  /** Shared X domain, so stacked panels line up on the same instant */
  xMin?: number;
  xMax?: number;
  /** Only the bottom-most visible panel shows date labels */
  showXLabels?: boolean;
  timeUnit?: 'minute' | 'hour' | 'day' | 'week' | 'month';
  yDomain?: YDomain;
  yRange?: PriceRange;
  log?: boolean;
  /** Y axis on the right, the convention in trading charts */
  yPosition?: 'left' | 'right';
}

/**
 * Axis numbers in the same locale as every other figure in the app.
 *
 * Chart.js formats ticks with the browser default, so the axis read `1.0`
 * while the crosshair pill right next to it read `1,16`. `ticks.callback` is
 * a first-class Chart.js option, unlike a function smuggled into a plugin's
 * own options block.
 */
export function formatAxisValue(value: number | string, decimals = 2): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * How many decimals an axis needs, decided ONCE for the whole axis from the
 * distance between ticks.
 *
 * Deciding per value gives an axis reading 1,00 · 0,8000 · 0,5734, where the
 * same column carries three different shapes. What matters is not how big
 * each number is, it is how close together the ticks are: a step of 0,1 needs
 * two decimals, a step of 20.000 needs none.
 */
export function axisDecimals(ticks: Array<{ value: number }>): number {
  if (ticks.length < 2) return 2;

  let step = Infinity;
  for (let i = 1; i < ticks.length; i++) {
    const gap = Math.abs(ticks[i].value - ticks[i - 1].value);
    if (gap > 0) step = Math.min(step, gap);
  }
  if (!Number.isFinite(step)) return 2;
  if (step >= 100) return 0;

  return Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 1));
}

const DISPLAY_FORMATS: Record<string, Record<string, string>> = {
  minute: { minute: 'HH:mm', hour: 'HH:mm' },
  hour: { hour: 'HH:mm', day: 'dd MMM' },
  day: { day: 'dd MMM', month: 'MMM yyyy' },
  week: { week: 'dd MMM', month: 'MMM yyyy' },
  month: { month: 'MMM yyyy' },
};

/**
 * Base options every panel in the app starts from. Callers add their datasets
 * and whatever is genuinely specific to them — never the grid, the fonts, the
 * interaction mode or the colours.
 */
export function chartTheme(opts: ChartThemeOptions = {}): ChartOptions {
  const c = chartColors();
  const unit = opts.timeUnit ?? 'day';

  const y: Record<string, unknown> = {
    position: opts.yPosition ?? 'right',
    type: opts.log ? 'logarithmic' : 'linear',
    ticks: {
      color: c.axis,
      maxTicksLimit: 6,
      font: { size: 10.5 },
      callback: function (
        this: { ticks: Array<{ value: number }>; $emDecimals?: number },
        value: number | string,
      ) {
        const decimals = axisDecimals(this.ticks ?? []);
        // Published on the scale so anything drawing in the gutter — the
        // crosshair pill — can match it exactly. A logarithmic axis generates
        // intermediate ticks that a plugin reading `scale.ticks` never sees,
        // so recomputing it there lands on a different answer.
        this.$emDecimals = decimals;
        return formatAxisValue(value, decimals);
      },
    },
    grid: { color: c.grid, drawTicks: false },
    border: { display: false },
  };
  applyYDomain(y, opts.yDomain ?? 'visible', opts.yRange, opts.log);

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    // Shared across panels so a single crosshair reads all of them at once
    interaction: { mode: 'index', intersect: false, axis: 'x' },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    scales: {
      x: {
        type: 'time',
        offset: true,
        min: opts.xMin,
        max: opts.xMax,
        time: { unit, displayFormats: DISPLAY_FORMATS[unit] ?? DISPLAY_FORMATS['day'] },
        ticks: {
          display: opts.showXLabels ?? true,
          color: c.axis,
          maxTicksLimit: 8,
          font: { size: 10.5 },
          autoSkipPadding: 24,
        },
        grid: { display: false },
        border: { display: false },
      },
      y: y as ScaleOptions,
    },
  } as ChartOptions;
}
