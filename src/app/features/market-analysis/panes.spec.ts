import { ChartStackComponent } from './chart-stack.component';
import { DEFAULT_SERIES, SeriesConfig } from './lib/series';

/**
 * Panels used to be three fixed rows, so "which chart is the pointer over"
 * and "which panel carries the dates" were hard-coded indices. Now that any
 * of them can be switched off, both answers are derived — and getting them
 * wrong puts the crosshair on the wrong canvas, silently.
 */
describe('ChartStackComponent · panel geometry', () => {
  let chart: ChartStackComponent;

  const withSeries = (overrides: Partial<SeriesConfig>): void => {
    chart.series = { ...DEFAULT_SERIES, ...overrides };
  };

  beforeEach(() => {
    chart = new ChartStackComponent();
    chart.series = { ...DEFAULT_SERIES };
  });

  it('starts as the screen always looked: price, volume, RSI', () => {
    expect(chart.panes()).toEqual(['price', 'volume', 'rsi']);
  });

  it('keeps the price pane no matter what is switched off', () => {
    withSeries({ volume: false, rsi: false, macd: false });
    expect(chart.panes()).toEqual(['price']);
    expect(chart.paneIndex('price')).toBe(0);
  });

  it('renumbers the panes when one in the middle is switched off', () => {
    withSeries({ volume: false, macd: true });
    // RSI moves up into the slot volume used to hold
    expect(chart.paneIndex('rsi')).toBe(1);
    expect(chart.paneIndex('macd')).toBe(2);
  });

  it('reports -1 for a pane that is not on screen', () => {
    withSeries({ macd: false });
    expect(chart.paneIndex('macd')).toBe(-1);
  });

  it('puts MACD below the RSI when both are on', () => {
    withSeries({ macd: true });
    expect(chart.panes()).toEqual(['price', 'volume', 'rsi', 'macd']);
  });

  it('names the overlays riding on the price pane', () => {
    withSeries({ sma20: true, bollinger: true });
    expect(chart.overlayLabel()).toBe(' · BB · SMA 20');
  });

  it('says nothing when the price pane carries no overlay', () => {
    expect(chart.overlayLabel()).toBe('');
  });
});
