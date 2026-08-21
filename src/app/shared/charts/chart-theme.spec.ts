import { applyYDomain, formatAxisValue, resolveVisibleDomain, shouldIncludeInDomain } from './chart-theme';

describe('chart-theme · Y domain', () => {
  const btcWeekly = { lo: 15417, hi: 126480 };

  it('never lets the price panel reach zero, on any range width', () => {
    // the regression this exists for: 0–140.000 on a 15k–126k range
    for (const range of [btcWeekly, { lo: 70000, hi: 72000 }, { lo: 0.4, hi: 2.9 }]) {
      for (const log of [false, true]) {
        const { min } = resolveVisibleDomain(range, { log });
        expect(min).toBeGreaterThan(0);
        expect(min).toBeGreaterThan(range.lo * 0.9);
      }
    }
  });

  it('keeps the lowest wick near the floor of the canvas', () => {
    // A wide range is drawn logarithmically, which is the default on 1d/1w
    const wide = resolveVisibleDomain(btcWeekly, { log: true });
    const wideShare =
      (Math.log10(btcWeekly.lo) - Math.log10(wide.min)) /
      (Math.log10(wide.max) - Math.log10(wide.min));
    expect(wideShare).toBeGreaterThan(0.02);
    expect(wideShare).toBeLessThan(0.13);

    // A narrow intraday range stays linear
    const narrow = { lo: 70000, hi: 72000 };
    const lin = resolveVisibleDomain(narrow);
    const narrowShare = (narrow.lo - lin.min) / (lin.max - lin.min);
    expect(narrowShare).toBeGreaterThan(0.02);
    expect(narrowShare).toBeLessThan(0.13);
  });

  it('pads multiplicatively on a log scale', () => {
    const log = resolveVisibleDomain(btcWeekly, { log: true });
    expect(log.min).toBeCloseTo(btcWeekly.lo * 0.94, 0);
    expect(log.max).toBeCloseTo(btcWeekly.hi * 1.04, 0);
  });

  it('caps the linear padding so a wide range does not sink the floor', () => {
    // A plain 6% of the 111k span would put the floor at ~8.7k, less than a
    // sixth of the lowest wick. Capping at 6% of the value keeps it at ~14.5k.
    const linear = resolveVisibleDomain(btcWeekly, { log: false });
    expect(linear.min).toBeGreaterThan(btcWeekly.lo * 0.93);
    expect(linear.min).toBeLessThan(btcWeekly.lo);
  });

  it('leaves a degenerate range alone instead of inventing one', () => {
    expect(resolveVisibleDomain({ lo: 100, hi: 100 })).toEqual({ min: 100, max: 100 });
  });

  it('includes an average entry price that sits inside the data', () => {
    expect(shouldIncludeInDomain(85399, btcWeekly, { log: true })).toBe(true);
    expect(shouldIncludeInDomain(85399, btcWeekly)).toBe(true);
  });

  it('excludes an average entry far from the data, so it cannot flatten it', () => {
    expect(shouldIncludeInDomain(20100, { lo: 90000, hi: 95000 })).toBe(false);
  });

  it('measures the distance in log space when the axis is logarithmic', () => {
    // 500 against a 15k–110k range widens the linear span by only 15%, but it
    // is one and a half decades on a log axis: the guard has to catch it
    const range = { lo: 15200, hi: 110000 };
    expect(shouldIncludeInDomain(500, range, { log: true })).toBe(false);
  });

  it('rejects a non-positive value, which a log axis cannot plot at all', () => {
    expect(shouldIncludeInDomain(0, btcWeekly, { log: true })).toBe(false);
  });

  it('applies each panel domain by its declared intent', () => {
    const price: Record<string, unknown> = {};
    applyYDomain(price, 'visible', btcWeekly);
    expect(price['beginAtZero']).toBe(false);
    expect(price['bounds']).toBe('data');

    const volume: Record<string, unknown> = {};
    applyYDomain(volume, 'zero-based');
    expect(volume['beginAtZero']).toBe(true);

    const rsi: Record<string, unknown> = {};
    applyYDomain(rsi, [0, 100]);
    expect(rsi['min']).toBe(0);
    expect(rsi['max']).toBe(100);

    const macd: Record<string, unknown> = {};
    applyYDomain(macd, 'symmetric-zero', { lo: -140, hi: 320 });
    expect(macd['min']).toBe(-320);
    expect(macd['max']).toBe(320);
  });
});

describe('chart-theme · axis numbers', () => {
  it('formats in the same locale as the rest of the app', () => {
    // the axis read 1.0 next to a crosshair pill reading 1,16
    expect(formatAxisValue(1.16)).toBe('1,16');
    expect(formatAxisValue(1)).toBe('1,00');
  });

  it('gives sub-unit assets the digits that tell candles apart', () => {
    expect(formatAxisValue(0.9523)).toBe('0,9523');
    expect(formatAxisValue(0.65)).toBe('0,6500');
  });

  it('drops the decimals once they stop meaning anything', () => {
    expect(formatAxisValue(85399.1)).toBe('85.399');
    expect(formatAxisValue(126480)).toBe('126.480');
  });

  it('passes through anything that is not a number', () => {
    expect(formatAxisValue('—')).toBe('—');
  });
});
