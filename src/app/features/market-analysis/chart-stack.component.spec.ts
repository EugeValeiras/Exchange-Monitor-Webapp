import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartStackComponent } from './chart-stack.component';
import { OhlcCandle } from '../../core/services/market-analysis.service';
import { TradeMarker } from './lib/chart-markers';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const START = Date.UTC(2025, 0, 6);

/** A range wide enough that the log scale is the point, like BTC on 1w. */
function candles(count = 40): OhlcCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const close = 16000 * Math.pow(1.05, i);
    const open = i === 0 ? close * 0.98 : 16000 * Math.pow(1.05, i - 1);
    return {
      timestamp: START + i * WEEK,
      open,
      high: Math.max(open, close) * 1.03,
      low: Math.min(open, close) * 0.97,
      close,
      volume: 1000 + i * 25,
    };
  });
}

describe('ChartStackComponent', () => {
  let fixture: ComponentFixture<ChartStackComponent>;
  let component: ChartStackComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChartStackComponent] }).compileComponents();
    fixture = TestBed.createComponent(ChartStackComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture.destroy());

  it('renders candles, volume and the oscillator without blowing up', () => {
    component.candles = candles();
    component.rsi = candles().map((c, i) => ({ timestamp: c.timestamp, value: 40 + (i % 30) }));
    fixture.detectChanges();

    const canvases = fixture.nativeElement.querySelectorAll('canvas');
    expect(canvases.length).toBe(3);
  });

  it('draws a candlestick panel on a logarithmic scale', () => {
    // chartjs-chart-financial on a log axis is the combination the redesign
    // leans on for 1d/1w, and the one nothing in this repo had exercised
    component.candles = candles();
    component.log = true;
    fixture.detectChanges();

    const scales = component.priceOptions().scales as Record<string, { type?: string; min?: number }>;
    expect(scales['y'].type).toBe('logarithmic');
    expect(scales['y'].min).toBeGreaterThan(0);
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('bounds the price panel to the visible candles, never to zero', () => {
    const data = candles();
    component.candles = data;
    fixture.detectChanges();

    const scales = component.priceOptions().scales as Record<string, { min?: number; max?: number }>;
    const lowest = Math.min(...data.map((c) => c.low));
    expect(scales['y'].min).toBeGreaterThan(0);
    expect(scales['y'].min!).toBeGreaterThan(lowest * 0.9);
  });

  it('keeps volume zero-based, which is the one panel that should be', () => {
    component.candles = candles();
    fixture.detectChanges();

    const scales = component.volumeOptions().scales as Record<string, { beginAtZero?: boolean }>;
    expect(scales['y'].beginAtZero).toBe(true);
  });

  it('pins the RSI to 0–100', () => {
    component.candles = candles();
    fixture.detectChanges();

    const scales = component.rsiOptions().scales as Record<string, { min?: number; max?: number }>;
    expect(scales['y'].min).toBe(0);
    expect(scales['y'].max).toBe(100);
  });

  it('shares one X domain across the three panels', () => {
    component.candles = candles();
    fixture.detectChanges();

    const x = (o: Record<string, unknown>) =>
      ((o['scales'] as Record<string, { min?: number; max?: number }>)['x']);
    const price = x(component.priceOptions() as never);
    const volume = x(component.volumeOptions() as never);
    const rsi = x(component.rsiOptions() as never);

    expect(volume.min).toBe(price.min);
    expect(rsi.max).toBe(price.max);
  });

  it('only labels dates on the bottom panel', () => {
    component.candles = candles();
    fixture.detectChanges();

    const ticks = (o: Record<string, unknown>) =>
      ((o['scales'] as Record<string, { ticks?: { display?: boolean } }>)['x'].ticks);
    expect(ticks(component.priceOptions() as never)?.display).toBe(false);
    expect(ticks(component.rsiOptions() as never)?.display).toBe(true);
  });

  it('does not widen the domain for an average entry far from the data', () => {
    component.candles = candles();
    component.avgEntry = 500; // bought very cheap, long ago
    component.log = true; // the default on 1d/1w, and where this matters most
    fixture.detectChanges();

    const data = candles();
    const lowest = Math.min(...data.map((c) => c.low));
    const scales = component.priceOptions().scales as Record<string, { min?: number }>;
    // the candles stay readable; the line gets pinned to the edge instead
    expect(scales['y'].min!).toBeGreaterThan(lowest * 0.9);
    expect(component.avgEntryOutOfRange()).toBe(true);
  });

  it('does widen the domain for an average entry that sits just outside', () => {
    const data = candles();
    component.candles = data;
    component.log = true;
    // 5% under the lowest wick: close enough to be worth showing in place
    component.avgEntry = Math.min(...data.map((c) => c.low)) * 0.95;
    fixture.detectChanges();

    expect(component.avgEntryOutOfRange()).toBe(false);
  });

  it('survives being handed no candles at all', () => {
    component.candles = [];
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(component.readout()).toBeNull();
  });

  it('feeds the trade layer only while the layer is on', () => {
    component.candles = candles();
    const marker: TradeMarker = {
      t: START + 3 * WEEK,
      price: 18000,
      side: 'buy',
      count: 2,
      total: 500,
      orders: [],
    };
    component.markers = [marker];
    component.tradesLayer = false;
    fixture.detectChanges();

    const off = component.priceOptions().plugins as Record<string, { enabled?: boolean }>;
    expect(off['tradeLayer'].enabled).toBe(false);

    component.tradesLayer = true;
    fixture.detectChanges();
    const on = component.priceOptions().plugins as Record<string, { enabled?: boolean }>;
    expect(on['tradeLayer'].enabled).toBe(true);
  });
});
