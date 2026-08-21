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
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = '900px';
    host.style.height = '600px';
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('enables wheel zoom on the time axis only', () => {
    const zoom = (component.priceOptions().plugins as Record<string, Record<string, never>>)['zoom'];
    expect(zoom).toBeTruthy();
    expect((zoom['zoom'] as { wheel: { enabled: boolean } }).wheel.enabled).toBe(true);
    expect((zoom['zoom'] as { mode: string }).mode).toBe('x');
  });

  it('leaves the plugin drag-pan off, since it needs hammerjs', () => {
    const zoom = (component.priceOptions().plugins as Record<string, Record<string, never>>)['zoom'];
    expect((zoom['pan'] as { enabled: boolean }).enabled).toBe(false);
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
    expect(component.rangeLabel()).toBe('');
  });

  it('refits the price axis to the candles left visible', () => {
    const data = candles();
    // a window over the cheap early candles only
    const min = data[0].timestamp;
    const max = data[9].timestamp;

    // The axis is refitted imperatively during the gesture, on purpose: doing
    // it through a signal is what resets the zoom plugin mid-drag.
    component['viewRef'] = { min, max };
    component['refitPriceAxis'](min, max);

    const chart = (component as unknown as {
      charts?: { first?: { chart?: { options: { scales: Record<string, { max?: number }> } } } };
    }).charts?.first?.chart;
    if (!chart) {
      pending('canvas has no layout in this environment');
      return;
    }

    const highestVisible = Math.max(...data.slice(0, 10).map((c) => c.high));
    const highestOverall = Math.max(...data.map((c) => c.high));

    expect(chart.options.scales['y'].max!).toBeLessThan(highestOverall / 2);
    expect(chart.options.scales['y'].max!).toBeGreaterThanOrEqual(highestVisible);
  });

  it('keeps the three panels on the same window while zoomed', () => {
    const data = candles();
    component['viewRef'] = { min: data[5].timestamp, max: data[15].timestamp };
    fixture.detectChanges();

    const x = (o: Record<string, unknown>) =>
      (o['scales'] as Record<string, { min?: number; max?: number }>)['x'];
    expect(x(component.volumeOptions() as never).min).toBe(x(component.priceOptions() as never).min);
    expect(x(component.rsiOptions() as never).max).toBe(x(component.priceOptions() as never).max);
  });

  it('describes the visible window in human terms, by magnitude', () => {
    const data = candles();
    const commit = (min: number, max: number) =>
      component['commitView']({ scales: { x: { min, max } } } as never);

    commit(data[0].timestamp, data[8].timestamp);
    expect(component.rangeLabel()).toBe('56 días');
    expect(component.zoomed()).toBe(true);

    commit(data[0].timestamp, data[20].timestamp);
    expect(component.rangeLabel()).toContain('meses');

    commit(data[0].timestamp, data[0].timestamp + 12 * 60 * 60 * 1000);
    expect(component.rangeLabel()).toBe('12 h');
  });

  it('goes back to the full history on reset', () => {
    const data = candles();
    component['commitView']({ scales: { x: { min: data[5].timestamp, max: data[15].timestamp } } } as never);
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

describe('ChartStackComponent · pan', () => {
  let fixture: ComponentFixture<ChartStackComponent>;
  let component: ChartStackComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChartStackComponent] }).compileComponents();
    fixture = TestBed.createComponent(ChartStackComponent);
    component = fixture.componentInstance;
    component.candles = candles();
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = '900px';
    host.style.height = '600px';
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('does not tie the chart options to the crosshair', () => {
    // The regression this exists for: the pointer moves on every frame of a
    // drag. If the options depend on the crosshair, change detection reapplies
    // the pre-pan window mid-gesture and the chart never moves.
    const before = JSON.stringify(component.priceOptions().scales);
    component['crosshairAt'].set(candles()[10].timestamp);
    fixture.detectChanges();
    const after = JSON.stringify(component.priceOptions().scales);

    expect(after).toBe(before);
    const plugins = component.priceOptions().plugins as Record<string, { at?: number | null }>;
    expect(plugins['crosshair'].at).toBeNull();
  });

  it('tracks the window mid-gesture without re-rendering anything', () => {
    const data = candles();
    const fake = {
      scales: { x: { min: data[5].timestamp, max: data[15].timestamp } },
    } as unknown as Parameters<ChartStackComponent['trackView']>[0];

    const optionsBefore = JSON.stringify(component.priceOptions().scales);
    component['trackView'](fake);
    fixture.detectChanges();

    // the source of truth moves...
    expect(component['viewRef']).toEqual({ min: data[5].timestamp, max: data[15].timestamp });
    // ...and nothing re-renders. Recomputing options mid-gesture is precisely
    // what reset the zoom plugin and cancelled the pan.
    expect(JSON.stringify(component.priceOptions().scales)).toBe(optionsBefore);
    expect(component.zoomed()).toBe(false);
  });

  it('publishes the window once the gesture settles', () => {
    const data = candles();
    component['commitView']({
      scales: { x: { min: data[5].timestamp, max: data[15].timestamp } },
    } as never);

    expect(component.zoomed()).toBe(true);
    expect(component.rangeLabel()).toBeTruthy();
  });

  it('still lets the crosshair reach the readout', () => {
    const data = candles();
    component['crosshairAt'].set(data[12].timestamp);
    expect(component.readout()?.t).toBe(data[12].timestamp);
  });
});

describe('ChartStackComponent · window survives re-renders', () => {
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

  it('keeps the zoomed window when options are rebuilt for an unrelated reason', () => {
    const data = candles();
    const min = data[5].timestamp;
    const max = data[15].timestamp;

    // as a gesture would leave it
    component['viewRef'] = { min, max };

    // something unrelated invalidates the options — a hovered trade, new
    // markers, the layer toggling. If the window is cached anywhere, the
    // rebuilt options snap back to the full range and the zoom is lost.
    component.markers = [];
    component.tradesLayer = true;
    fixture.detectChanges();

    const scales = component.priceOptions().scales as Record<string, { min?: number; max?: number }>;
    expect(scales['x'].min).toBe(min);
    expect(scales['x'].max).toBe(max);
  });
});

describe('ChartStackComponent · drag to pan', () => {
  let fixture: ComponentFixture<ChartStackComponent>;
  let component: ChartStackComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChartStackComponent] }).compileComponents();
    fixture = TestBed.createComponent(ChartStackComponent);
    component = fixture.componentInstance;
    component.candles = candles();
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = '900px';
    host.style.height = '600px';
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  const pointer = (type: string, x: number): PointerEvent => {
    const pane = (fixture.nativeElement as HTMLElement).querySelector('.pane.price')!;
    const ev = new PointerEvent(type, { clientX: x, clientY: 300, bubbles: true, button: 0, buttons: 1 });
    Object.defineProperty(ev, 'target', { value: pane });
    return ev;
  };

  it('moves the window when dragging, and leaves its width alone', () => {
    const chart = (component as unknown as {
      charts?: { first?: { chart?: { scales: Record<string, { min: number; max: number }> } } };
    }).charts?.first?.chart;
    if (!chart?.scales?.['x']) {
      pending('canvas has no layout in this environment');
      return;
    }

    // zoom in first, otherwise there is nowhere to pan to
    (chart as unknown as { zoom(f: number): void }).zoom(2);
    const before = { min: chart.scales['x'].min, max: chart.scales['x'].max };

    component.startDrag(pointer('pointerdown', 500), 0);
    component.onPointerMove(pointer('pointermove', 560), 0);
    component.onPointerMove(pointer('pointermove', 620), 0);
    component.endDrag(pointer('pointerup', 620));

    const after = { min: chart.scales['x'].min, max: chart.scales['x'].max };
    expect(after.min).not.toBe(before.min);
    // dragging right walks back in time
    expect(after.min).toBeLessThan(before.min);
    // and the window keeps its width: a pan is not a zoom
    expect(Math.round(after.max - after.min)).toBe(Math.round(before.max - before.min));
  });

  it('ignores movement when no drag is in progress', () => {
    const chart = (component as unknown as {
      charts?: { first?: { chart?: { scales: Record<string, { min: number }> } } };
    }).charts?.first?.chart;
    if (!chart?.scales?.['x']) {
      pending('canvas has no layout in this environment');
      return;
    }
    const before = chart.scales['x'].min;
    component.onPointerMove(pointer('pointermove', 700), 0);
    expect(chart.scales['x'].min).toBe(before);
  });

  it('tracks the dragging state, for the cursor', () => {
    expect(component.dragging).toBe(false);
    component.startDrag(pointer('pointerdown', 400), 0);
    expect(component.dragging).toBe(true);
    component.endDrag(pointer('pointerup', 400));
    expect(component.dragging).toBe(false);
  });
});

describe('ChartStackComponent · trade tooltip', () => {
  let fixture: ComponentFixture<ChartStackComponent>;
  let component: ChartStackComponent;

  const order = (over: Record<string, unknown> = {}) => ({
    id: 'o1', side: 'buy', exchange: 'binance', amount: 21113.82, price: 0.95,
    total: 20000, fee: 0, fills: [], isDust: false, timestamp: '2026-01-20T12:00:00Z',
    ...over,
  }) as never;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChartStackComponent] }).compileComponents();
    fixture = TestBed.createComponent(ChartStackComponent);
    component = fixture.componentInstance;
    component.candles = candles();
    component.baseAsset = 'NEXO';
    const host = fixture.nativeElement as HTMLElement;
    host.style.width = '900px';
    host.style.height = '600px';
    document.body.appendChild(host);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('keeps the candle readout free of trades', () => {
    const data = candles();
    component.markers = [{
      t: data[10].timestamp, price: data[10].close, side: 'buy',
      count: 1, total: 20000, orders: [order()],
    }];
    component['crosshairAt'].set(data[10].timestamp);
    fixture.detectChanges();

    const readout = (fixture.nativeElement as HTMLElement).querySelector('.readout')?.textContent ?? '';
    // the readout says what the market did, and nothing about what you did
    expect(readout).toContain('A ');
    expect(readout).not.toContain('compra');
    expect(readout).not.toContain('20.000');
  });

  it('shows the trade in a surface of its own', () => {
    const data = candles();
    component.markers = [{
      t: data[10].timestamp, price: data[10].close, side: 'buy',
      count: 1, total: 20000, orders: [order()],
    }];
    component['placeTradeTip'](data[10].timestamp);
    fixture.detectChanges();

    const tip = (fixture.nativeElement as HTMLElement).querySelector('.trade-tip');
    if (!tip) {
      pending('canvas has no layout in this environment');
      return;
    }
    const text = tip.textContent ?? '';
    expect(text).toContain('Compra');
    expect(text).toContain('NEXO');
    expect(text).toContain('20.000,00');
  });

  it('lists every order of the candle, not just the first', () => {
    const data = candles();
    component.markers = [
      { t: data[12].timestamp, price: 1, side: 'buy', count: 1, total: 900, orders: [order({ id: 'a' })] },
      { t: data[12].timestamp, price: 1.2, side: 'sell', count: 1, total: 500, orders: [order({ id: 'b', side: 'sell' })] },
    ];
    component['placeTradeTip'](data[12].timestamp);

    expect(component.tradeTip()?.orders.length).toBe(2);
  });

  it('says nothing when the candle has no trades', () => {
    component['placeTradeTip'](candles()[3].timestamp);
    expect(component.tradeTip()).toBeNull();
  });

  it('stays quiet while the layer is off', () => {
    const data = candles();
    component.markers = [{
      t: data[10].timestamp, price: 1, side: 'buy', count: 1, total: 100, orders: [order()],
    }];
    component.tradesLayer = false;
    component['placeTradeTip'](data[10].timestamp);

    expect(component.tradeTip()).toBeNull();
  });

  it('compares the trade against the last close', () => {
    const data = candles();
    const last = data[data.length - 1].close;

    const cheaper = component.vsSpot(last / 2);
    expect(cheaper?.tone).toBe('em-up');      // bought at half of today: up
    expect(cheaper?.label).toContain('+');

    const dearer = component.vsSpot(last * 2);
    expect(dearer?.tone).toBe('em-down');
  });

  it('clears itself when the pointer leaves', () => {
    const data = candles();
    component.markers = [{
      t: data[10].timestamp, price: 1, side: 'buy', count: 1, total: 100, orders: [order()],
    }];
    component['placeTradeTip'](data[10].timestamp);
    component.clearCrosshair();
    expect(component.tradeTip()).toBeNull();
  });
});

describe('ChartStackComponent · staying live', () => {
  let fixture: ComponentFixture<ChartStackComponent>;
  let component: ChartStackComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChartStackComponent] }).compileComponents();
    fixture = TestBed.createComponent(ChartStackComponent);
    component = fixture.componentInstance;
    component.seriesKey = 'binance:BTC/USDT:1d';
    component.candles = candles();
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('keeps your zoom across a refresh of the same series', () => {
    const data = candles();
    component['commitView']({
      scales: { x: { min: data[5].timestamp, max: data[15].timestamp } },
    } as never);
    expect(component.zoomed()).toBe(true);

    // a poll brings fresh candles for the same pair and timeframe
    component.seriesKey = 'binance:BTC/USDT:1d';
    component.candles = candles(42);
    fixture.detectChanges();

    // a chart that re-aims itself every minute is worse than one that does not move
    expect(component.zoomed()).toBe(true);
    expect(component['viewRef']).not.toBeNull();
  });

  it('drops the zoom when the series itself changes', () => {
    const data = candles();
    component['commitView']({
      scales: { x: { min: data[5].timestamp, max: data[15].timestamp } },
    } as never);

    component.seriesKey = 'binance:ETH/USDT:1d';
    component.candles = candles();
    fixture.detectChanges();

    expect(component.zoomed()).toBe(false);
    expect(component['viewRef']).toBeNull();
  });

  it('drops it when only the timeframe changes, too', () => {
    component['commitView']({
      scales: { x: { min: candles()[5].timestamp, max: candles()[15].timestamp } },
    } as never);

    component.seriesKey = 'binance:BTC/USDT:4h';
    expect(component.zoomed()).toBe(false);
  });

  it('takes fresh candles into the chart', () => {
    const grown = candles(45);
    component.candles = grown;
    fixture.detectChanges();

    const data = component.priceData().datasets[0].data as Array<{ x: number }>;
    expect(data.length).toBe(45);
  });
});
