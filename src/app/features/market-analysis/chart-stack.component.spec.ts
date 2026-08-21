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

describe('ChartStackComponent · zoom', () => {
  let fixture: ComponentFixture<ChartStackComponent>;
  let component: ChartStackComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChartStackComponent] }).compileComponents();
    fixture = TestBed.createComponent(ChartStackComponent);
    component = fixture.componentInstance;
    component.candles = candles();
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('enables wheel zoom and drag pan on the time axis only', () => {
    const zoom = (component.priceOptions().plugins as Record<string, Record<string, never>>)['zoom'];
    expect(zoom).toBeTruthy();
    expect((zoom['zoom'] as { wheel: { enabled: boolean } }).wheel.enabled).toBe(true);
    expect((zoom['zoom'] as { mode: string }).mode).toBe('x');
    expect((zoom['pan'] as { enabled: boolean; mode: string }).enabled).toBe(true);
    expect((zoom['pan'] as { mode: string }).mode).toBe('x');
  });

  it('will not let you pan into empty space or zoom past a handful of candles', () => {
    const zoom = (component.priceOptions().plugins as Record<string, Record<string, never>>)['zoom'];
    const limits = zoom['limits'] as { x: { min: string; max: string; minRange: number } };
    expect(limits.x.min).toBe('original');
    expect(limits.x.max).toBe('original');
    expect(limits.x.minRange).toBeGreaterThan(0);
  });

  it('starts unzoomed and reports no window', () => {
    expect(component.zoomed()).toBe(false);
    expect(component.visibleLabel()).toBe('');
  });

  it('refits the price axis to the candles left visible', () => {
    const data = candles();
    // a window over the cheap early candles only
    const min = data[0].timestamp;
    const max = data[9].timestamp;
    component['view'].set({ min, max });
    fixture.detectChanges();

    const scales = component.priceOptions().scales as Record<string, { max?: number }>;
    const highestVisible = Math.max(...data.slice(0, 10).map((c) => c.high));
    const highestOverall = Math.max(...data.map((c) => c.high));

    // the axis follows the window instead of staying sized for the whole range
    expect(scales['y'].max!).toBeLessThan(highestOverall / 2);
    expect(scales['y'].max!).toBeGreaterThanOrEqual(highestVisible);
  });

  it('keeps the three panels on the same window while zoomed', () => {
    const data = candles();
    component['view'].set({ min: data[5].timestamp, max: data[15].timestamp });
    fixture.detectChanges();

    const x = (o: Record<string, unknown>) =>
      (o['scales'] as Record<string, { min?: number; max?: number }>)['x'];
    expect(x(component.volumeOptions() as never).min).toBe(x(component.priceOptions() as never).min);
    expect(x(component.rsiOptions() as never).max).toBe(x(component.priceOptions() as never).max);
  });

  it('describes the visible window in human terms, by magnitude', () => {
    const data = candles();

    component['view'].set({ min: data[0].timestamp, max: data[8].timestamp });
    expect(component.visibleLabel()).toBe('56 días');
    expect(component.zoomed()).toBe(true);

    component['view'].set({ min: data[0].timestamp, max: data[20].timestamp });
    expect(component.visibleLabel()).toContain('meses');

    component['view'].set({ min: data[0].timestamp, max: data[0].timestamp + 12 * 60 * 60 * 1000 });
    expect(component.visibleLabel()).toBe('12 h');
  });

  it('goes back to the full history on reset', () => {
    const data = candles();
    component['view'].set({ min: data[5].timestamp, max: data[15].timestamp });
    expect(component.zoomed()).toBe(true);

    component.resetZoom();
    expect(component.zoomed()).toBe(false);
    const scales = component.priceOptions().scales as Record<string, { max?: number }>;
    expect(scales['y'].max!).toBeGreaterThan(Math.max(...data.map((c) => c.high)) * 0.9);
  });
});

describe('ChartStackComponent · zoom gesture', () => {
  let fixture: ComponentFixture<ChartStackComponent>;
  let component: ChartStackComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChartStackComponent] }).compileComponents();
    fixture = TestBed.createComponent(ChartStackComponent);
    component = fixture.componentInstance;
    component.candles = candles();
    // the panels need a real size for the scales to resolve
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = '900px';
    host.style.height = '600px';
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('narrows the window and keeps the other panels in step', () => {
    const charts = (component as unknown as { charts: { toArray(): Array<{ chart?: never }> } }).charts;
    const list = charts.toArray().map((d) => (d as { chart?: { scales: Record<string, { min: number; max: number }>; zoom(f: number): void } }).chart);
    const price = list[0];
    if (!price?.scales?.['x']) {
      pending('canvas has no layout in this environment');
      return;
    }

    const before = { min: price.scales['x'].min, max: price.scales['x'].max };
    price.zoom(1.6);

    const after = { min: price.scales['x'].min, max: price.scales['x'].max };
    expect(after.max - after.min).toBeLessThan(before.max - before.min);

    for (const other of list.slice(1)) {
      const scale = other?.scales?.['x'];
      if (!scale) continue;
      expect(Math.round(scale.min)).toBe(Math.round(after.min));
      expect(Math.round(scale.max)).toBe(Math.round(after.max));
    }
  });
});

describe('ChartStackComponent · layout', () => {
  let fixture: ComponentFixture<ChartStackComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChartStackComponent] }).compileComponents();
    fixture = TestBed.createComponent(ChartStackComponent);
    fixture.componentInstance.candles = candles();

    // a real box, the way the screen's grid hands one to the component
    const host = fixture.nativeElement as HTMLElement;
    host.style.height = '600px';
    host.style.width = '900px';
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('gives the price panel the space it is handed, not the canvas default', () => {
    const price = (fixture.nativeElement as HTMLElement).querySelector('.pane.price');
    const height = price?.getBoundingClientRect().height ?? 0;

    // the regression: the inner stack fell back to content height and every
    // panel collapsed to the 150px a bare <canvas> defaults to
    expect(height).toBeGreaterThan(300);
  });

  it('makes price the tallest panel, by a wide margin', () => {
    const host = fixture.nativeElement as HTMLElement;
    const h = (sel: string) => host.querySelector(sel)?.getBoundingClientRect().height ?? 0;

    expect(h('.pane.price')).toBeGreaterThan(h('.pane.oscillator') * 2);
    expect(h('.pane.price')).toBeGreaterThan(h('.pane.volume') * 3);
  });

  it('fills the height it was given, without spilling past it', () => {
    const host = fixture.nativeElement as HTMLElement;
    const stack = host.querySelector('.stack')?.getBoundingClientRect().height ?? 0;
    expect(stack).toBeGreaterThan(560);
    expect(stack).toBeLessThanOrEqual(600);
  });
});
