import { markersFromOrders, placeMarkers, TradeMarker } from './chart-markers';
import { TradeOrder } from './trade-grouping';

const WEEK = 7 * 24 * 60 * 60 * 1000;

function order(p: Partial<TradeOrder> & { amount: number; price: number; timestamp: string }): TradeOrder {
  return {
    id: p.timestamp,
    side: 'buy',
    exchange: 'binance',
    total: p.amount * p.price,
    fee: 0,
    fills: [],
    isDust: false,
    ...p,
  } as TradeOrder;
}

describe('markersFromOrders', () => {
  const times = [0, WEEK, 2 * WEEK, 3 * WEEK].map((t) => Date.UTC(2026, 0, 1) + t);

  const via = {
    pair: 'NEXO/BTC',
    asset: 'NEXO',
    side: 'sell' as const,
    amount: 915.2,
    price: 0.0000122,
    priceAsset: 'BTC',
    booked: true,
    source: 'lot' as const,
  };

  it('keeps a cross trade as its own hollow marker, apart from the direct buy on the same candle', () => {
    const markers = markersFromOrders(
      [
        order({ amount: 0.01, price: 63000, timestamp: new Date(times[1] + 1000).toISOString() }),
        order({ amount: 0.0112, price: 63258.77, via, timestamp: new Date(times[1] + 5000).toISOString() }),
      ],
      times,
      WEEK,
    );
    expect(markers.length).toBe(2);
    expect(markers.map((m) => m.cross).sort()).toEqual([false, true]);
  });

  it('has nowhere to put a cross trade the P&L never priced', () => {
    const markers = markersFromOrders(
      [order({ amount: 0.0112, price: 0, via: { ...via, booked: false }, timestamp: new Date(times[1]).toISOString() })],
      times,
      WEEK,
    );
    expect(markers.length).toBe(0);
  });

  it('collapses the orders of one candle into a single marker with a count', () => {
    const markers = markersFromOrders(
      [
        order({ amount: 0.08902, price: 83500, timestamp: new Date(times[1] + 1000).toISOString() }),
        order({ amount: 0.08875, price: 84500, timestamp: new Date(times[1] + 5000).toISOString() }),
      ],
      times,
      WEEK,
    );
    expect(markers.length).toBe(1);
    expect(markers[0].count).toBe(2);
    // weighted by amount, so it sits where the money went
    expect(markers[0].price).toBeGreaterThan(83500);
    expect(markers[0].price).toBeLessThan(84500);
  });

  it('keeps buys and sells as separate markers on the same candle', () => {
    const markers = markersFromOrders(
      [
        order({ amount: 1, price: 100, timestamp: new Date(times[2]).toISOString() }),
        order({ amount: 1, price: 110, side: 'sell', timestamp: new Date(times[2]).toISOString() }),
      ],
      times,
      WEEK,
    );
    expect(markers.length).toBe(2);
  });

  it('drops orders outside the visible range instead of clamping them to the edge', () => {
    const markers = markersFromOrders(
      [order({ amount: 1, price: 100, timestamp: new Date(times[0] - 40 * WEEK).toISOString() })],
      times,
      WEEK,
    );
    expect(markers.length).toBe(0);
  });

  it('returns nothing when there are no candles yet', () => {
    expect(markersFromOrders([order({ amount: 1, price: 1, timestamp: '2026-01-01' })], [], WEEK)).toEqual([]);
  });
});

describe('placeMarkers', () => {
  const at = (t: number, price: number, side: 'buy' | 'sell' = 'buy'): TradeMarker =>
    ({ t, price, side, count: 1, total: 100, orders: [], cross: false });

  it('leaves markers alone when they do not collide', () => {
    const placed = placeMarkers([at(0, 100), at(1000, 200)], (t) => t, (p) => 500 - p);
    expect(placed.every((m) => m.anchorY === null)).toBe(true);
  });

  it('pushes apart markers that would overlap, and remembers the real price', () => {
    // same X, four pixels apart in Y
    const placed = placeMarkers([at(0, 100), at(0, 104)], () => 50, (p) => 500 - p, { minGap: 18 });
    const moved = placed.find((m) => m.anchorY !== null)!;
    expect(moved).toBeTruthy();
    expect(Math.abs(placed[0].y - placed[1].y)).toBeGreaterThanOrEqual(18);
    // the guide still points at the untouched price
    expect(moved.anchorY).toBe(500 - moved.price);
  });

  it('does not move markers that are far apart horizontally', () => {
    const placed = placeMarkers([at(0, 100), at(1, 100)], (t) => t * 400, (p) => 500 - p);
    expect(placed.every((m) => m.anchorY === null)).toBe(true);
  });
});
