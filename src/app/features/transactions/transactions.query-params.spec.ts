import { TransactionsComponent } from './transactions.component';

/**
 * The filters live in the URL so a filtered view can be linked to. These
 * exercise the read/write pair directly, without standing up the whole screen.
 */
describe('TransactionsComponent · filters in the URL', () => {
  let component: TransactionsComponent;
  let navigated: Record<string, unknown> | null;

  const build = (params: Record<string, string>) => {
    navigated = null;
    const route = { snapshot: { queryParamMap: new Map(Object.entries(params)) } };
    // Map.get returns undefined for missing keys; the ParamMap contract is null
    (route.snapshot.queryParamMap as unknown as { get(k: string): string | null }).get = (k: string) =>
      params[k] ?? null;

    const router = {
      navigate: (_: unknown[], extras: { queryParams: Record<string, unknown> }) => {
        navigated = extras.queryParams;
        return Promise.resolve(true);
      },
    };

    component = new TransactionsComponent(
      { getTransactions: () => ({ subscribe: () => undefined }), getStats: () => ({ subscribe: () => undefined }) } as never,
      { getSummary: () => ({ subscribe: () => undefined }) } as never,
      route as never,
      router as never,
    );
  };

  it('restores the chips a link carried', () => {
    build({ types: 'trade,deposit', assets: 'BTC,ETH', exchanges: 'binance' });
    component['readQueryParams']();

    expect([...component.selectedTypes]).toEqual(['trade', 'deposit']);
    expect([...component.selectedAssets]).toEqual(['BTC', 'ETH']);
    expect([...component.selectedExchanges]).toEqual(['binance']);
    expect(component.filter.types).toEqual(['trade', 'deposit'] as never);
    expect(component.filter.exchange).toBe('binance' as never);
  });

  it('restores a pair filter, upper-cased', () => {
    build({ pair: 'btc/usdt' });
    component['readQueryParams']();
    expect(component.filter.pair).toBe('BTC/USDT');
  });

  it('restores the date range and the page', () => {
    build({ from: '2026-01-01', to: '2026-03-31', page: '3' });
    component['readQueryParams']();

    expect(component.startDate?.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(component.endDate?.toISOString().slice(0, 10)).toBe('2026-03-31');
    expect(component.currentPage).toBe(3);
    expect(component.filter.startDate).toBe('2026-01-01');
  });

  it('starts clean when the URL carries nothing', () => {
    build({});
    component['readQueryParams']();

    expect(component.selectedTypes.size).toBe(0);
    expect(component.currentPage).toBe(1);
    expect(component.filter.pair).toBeUndefined();
  });

  it('ignores a nonsense page instead of asking the API for it', () => {
    build({ page: 'abc' });
    component['readQueryParams']();
    expect(component.currentPage).toBe(1);
  });

  it('writes the filters back, and clears the keys that no longer apply', () => {
    build({});
    component.selectedTypes.add('trade');
    component.selectedAssets.add('BTC');
    component.currentPage = 1;
    component['syncQueryParams']();

    expect(navigated!['types']).toBe('trade');
    expect(navigated!['assets']).toBe('BTC');
    // a null wipes the key from the URL rather than leaving a stale one
    expect(navigated!['exchanges']).toBeNull();
    expect(navigated!['page']).toBeNull();
  });

  it('round-trips: what it writes is what it reads back', () => {
    build({});
    component.selectedTypes.add('trade');
    component.selectedExchanges.add('kraken');
    component.filter.pair = 'BTC/USDT';
    component.currentPage = 2;
    component['syncQueryParams']();

    const written = navigated as Record<string, string>;
    build({
      types: written['types'],
      exchanges: written['exchanges'],
      pair: written['pair'],
      page: String(written['page']),
    });
    component['readQueryParams']();

    expect([...component.selectedTypes]).toEqual(['trade']);
    expect([...component.selectedExchanges]).toEqual(['kraken']);
    expect(component.filter.pair).toBe('BTC/USDT');
    expect(component.currentPage).toBe(2);
  });

  it('drops the pair filter and takes it out of the URL', () => {
    build({ pair: 'BTC/USDT' });
    component['readQueryParams']();
    component.clearPairFilter();

    expect(component.filter.pair).toBeUndefined();
    expect(navigated!['pair']).toBeNull();
  });
});
