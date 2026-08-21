import { InstrumentHeaderComponent } from './instrument-header.component';

/**
 * The freshness indicator is the only thing on screen that says whether the
 * numbers can be trusted, so it gets to be explicit about how old they are.
 */
describe('InstrumentHeaderComponent · freshness', () => {
  let header: InstrumentHeaderComponent;

  beforeEach(() => {
    header = new InstrumentHeaderComponent();
    header.context = { candleCount: 500, high: 1, low: 0.5, volume24h: null, ageSeconds: 3 };
  });

  it('counts in seconds while the data is fresh', () => {
    expect(header.freshnessLabel).toBe('hace 3 s');
    expect(header.isStale).toBe(false);
  });

  it('calls it out once the data is over a minute old', () => {
    header.context = { ...header.context!, ageSeconds: 200 };
    expect(header.isStale).toBe(true);
    expect(header.freshnessLabel).toContain('min');
  });

  it('switches to hours rather than counting to 300 minutes', () => {
    header.context = { ...header.context!, ageSeconds: 7200 };
    expect(header.freshnessLabel).toContain('h');
  });

  it('says the live feed is down, which outranks the age', () => {
    header.socketConnected = false;
    expect(header.freshnessLabel).toBe('sin conexión en vivo');
  });

  it('does not claim an age it does not have', () => {
    header.context = { ...header.context!, ageSeconds: null };
    expect(header.freshnessLabel).toBe('sin datos');
  });
});
