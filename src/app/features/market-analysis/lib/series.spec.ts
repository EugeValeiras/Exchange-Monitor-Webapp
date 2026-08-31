import { DEFAULT_SERIES, parseSeries } from './series';

/**
 * The stored config outlives the code that wrote it: a series can be renamed
 * or dropped between deploys, and localStorage still holds yesterday's shape.
 * Anything that gets through here ends up as `undefined` on a chart axis.
 */
describe('parseSeries', () => {
  it('falls back to the default when there is nothing stored', () => {
    expect(parseSeries(null)).toEqual(DEFAULT_SERIES);
  });

  it('keeps candles, volume and RSI as the default, so the screen opens as it always did', () => {
    expect(DEFAULT_SERIES.volume).toBe(true);
    expect(DEFAULT_SERIES.rsi).toBe(true);
    expect(DEFAULT_SERIES.macd).toBe(false);
    expect(DEFAULT_SERIES.bollinger).toBe(false);
  });

  it('round-trips a real selection', () => {
    const stored = { ...DEFAULT_SERIES, macd: true, sma20: true, volume: false };
    expect(parseSeries(JSON.stringify(stored))).toEqual(stored);
  });

  it('ignores keys it does not know', () => {
    const parsed = parseSeries(JSON.stringify({ macd: true, ichimoku: true }));
    expect(parsed.macd).toBe(true);
    expect('ichimoku' in parsed).toBe(false);
  });

  it('defaults any key with a non-boolean value instead of putting it on the chart', () => {
    const parsed = parseSeries(JSON.stringify({ rsi: 'yes', macd: null, sma20: 1 }));
    expect(parsed.rsi).toBe(DEFAULT_SERIES.rsi);
    expect(parsed.macd).toBe(DEFAULT_SERIES.macd);
    expect(parsed.sma20).toBe(DEFAULT_SERIES.sma20);
  });

  it('survives corrupted storage', () => {
    expect(parseSeries('{not json')).toEqual(DEFAULT_SERIES);
    expect(parseSeries('null')).toEqual(DEFAULT_SERIES);
  });

  it('hands back a fresh object, so a caller cannot mutate the default', () => {
    const parsed = parseSeries(null);
    parsed.macd = true;
    expect(DEFAULT_SERIES.macd).toBe(false);
  });
});
