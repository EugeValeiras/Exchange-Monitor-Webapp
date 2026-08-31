import { chartColors } from '../../../shared/charts/chart-theme';

/**
 * Which series are drawn. The API has always sent all of them — candles, RSI,
 * MACD, three moving averages and Bollinger — and the chart drew three. This
 * is the switchboard that decides which of them reach the canvas.
 */
export type SeriesId = 'sma20' | 'sma50' | 'ema20' | 'bollinger' | 'volume' | 'rsi' | 'macd';

export type SeriesConfig = Record<SeriesId, boolean>;

/**
 * Two kinds of series, because they cost different things:
 *  - `overlay` shares the price panel, so it costs ink
 *  - `panel` opens a pane of its own, so it costs height
 */
export interface SeriesMeta {
  id: SeriesId;
  label: string;
  hint: string;
  kind: 'overlay' | 'panel';
}

export const SERIES: SeriesMeta[] = [
  { id: 'sma20', label: 'SMA 20', hint: 'Media simple de 20 períodos', kind: 'overlay' },
  { id: 'sma50', label: 'SMA 50', hint: 'Media simple de 50 períodos', kind: 'overlay' },
  { id: 'ema20', label: 'EMA 20', hint: 'Media exponencial de 20 períodos', kind: 'overlay' },
  { id: 'bollinger', label: 'Bollinger', hint: 'Bandas de Bollinger (20, 2σ)', kind: 'overlay' },
  { id: 'volume', label: 'Volumen', hint: 'Volumen por vela', kind: 'panel' },
  { id: 'rsi', label: 'RSI 14', hint: 'Índice de fuerza relativa', kind: 'panel' },
  { id: 'macd', label: 'MACD', hint: 'MACD (12, 26, 9) con histograma', kind: 'panel' },
];

/** What the screen has always shown: candles, volume and RSI. */
export const DEFAULT_SERIES: SeriesConfig = {
  sma20: false,
  sma50: false,
  ema20: false,
  bollinger: false,
  volume: true,
  rsi: true,
  macd: false,
};

/**
 * The colour a series is drawn in, so the menu's swatch and the line on the
 * chart cannot drift apart: both read it from here.
 */
export function seriesColor(id: SeriesId): string {
  const c = chartColors();
  switch (id) {
    case 'sma20':
      return c.ma[0];
    case 'sma50':
      return c.ma[1];
    case 'ema20':
      return c.ma[2];
    case 'bollinger':
      return c.axis;
    case 'rsi':
      return c.ma[2];
    case 'macd':
      return c.ma[1];
    case 'volume':
      return c.axis;
  }
}

/**
 * Reads a stored config, keeping only keys we know. Anything else — a series
 * renamed, a hand-edited value, a half-written entry — falls back to the
 * default for that key rather than putting `undefined` on the chart.
 */
export function parseSeries(raw: string | null): SeriesConfig {
  if (!raw) return { ...DEFAULT_SERIES };
  try {
    const stored = JSON.parse(raw) as Partial<Record<SeriesId, unknown>>;
    const out = { ...DEFAULT_SERIES };
    for (const { id } of SERIES) {
      if (typeof stored[id] === 'boolean') out[id] = stored[id];
    }
    return out;
  } catch {
    return { ...DEFAULT_SERIES };
  }
}
