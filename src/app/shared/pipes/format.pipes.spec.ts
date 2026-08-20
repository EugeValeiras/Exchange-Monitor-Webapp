import { EmCompactPipe, EmMoneyPipe, EmPctPipe, EmQtyPipe, EmSignedPipe, toneOf } from './format.pipes';

describe('format pipes', () => {
  it('formats money with two decimals and es-AR grouping', () => {
    expect(new EmMoneyPipe().transform(85399.1)).toBe('85.399,10');
    expect(new EmMoneyPipe().transform(0)).toBe('0,00');
  });

  it('formats quantities by magnitude, without padding', () => {
    const qty = new EmQtyPipe();
    expect(qty.transform(0.80575704)).toBe('0,805757');
    expect(qty.transform(0)).toBe('0');
    expect(qty.transform(1500)).toBe('1.500');
    expect(qty.transform(0.80575704, 'BTC')).toBe('0,805757 BTC');
  });

  it('signs percentages explicitly, with a real minus sign', () => {
    const pct = new EmPctPipe();
    expect(pct.transform(-15.0632)).toBe('−15,06%');
    expect(pct.transform(2.17)).toBe('+2,17%');
    expect(pct.transform(0)).toBe('0,00%');
  });

  it('signs money for P&L', () => {
    expect(new EmSignedPipe().transform(-10365.3)).toBe('−10.365,30');
    expect(new EmSignedPipe().transform(178.94)).toBe('+178,94');
  });

  it('compacts volume', () => {
    const c = new EmCompactPipe();
    expect(c.transform(2790000000)).toBe('2,79 B');
    expect(c.transform(83600)).toBe('83,6 K');
  });

  it('returns an em dash for missing values instead of NaN', () => {
    expect(new EmMoneyPipe().transform(null)).toBe('—');
    expect(new EmQtyPipe().transform(undefined)).toBe('—');
    expect(new EmPctPipe().transform(Number.NaN)).toBe('—');
  });

  it('maps a value to its tone class', () => {
    expect(toneOf(5)).toBe('em-up');
    expect(toneOf(-5)).toBe('em-down');
    expect(toneOf(0)).toBe('em-flat');
    expect(toneOf(null)).toBe('em-flat');
  });
});
