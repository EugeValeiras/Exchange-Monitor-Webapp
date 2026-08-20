import { TradeOrder } from './trade-grouping';

/**
 * Placing the user's own trades on the candles without them piling up.
 *
 * Two problems, two rules:
 *  1. several orders on the same candle and the same side render as ONE marker
 *     with a count badge — otherwise three January buys sit on top of each other
 *  2. markers that end up closer than a diameter get pushed apart, with a
 *     dotted guide back to the real price. The pin moves; the data does not.
 */

export interface TradeMarker {
  /** Timestamp of the candle it belongs to */
  t: number;
  /** Real price — where the guide points */
  price: number;
  side: 'buy' | 'sell';
  /** How many orders this marker stands for */
  count: number;
  total: number;
  orders: TradeOrder[];
}

/** Collapses orders sharing a candle and a side into one marker. */
export function markersFromOrders(orders: TradeOrder[], candleTimes: number[], candleSpanMs: number): TradeMarker[] {
  if (!candleTimes.length) return [];

  const first = candleTimes[0];
  const span = candleSpanMs > 0 ? candleSpanMs : 1;
  const last = candleTimes[candleTimes.length - 1];

  const buckets = new Map<string, TradeMarker>();
  for (const order of orders) {
    const at = new Date(order.timestamp).getTime();
    if (at < first - span || at > last + span) continue;

    // snap to the candle that contains it
    const index = Math.min(
      candleTimes.length - 1,
      Math.max(0, Math.round((at - first) / span)),
    );
    const t = candleTimes[index];
    const key = `${t}:${order.side}`;

    const marker = buckets.get(key);
    if (marker) {
      marker.count += 1;
      marker.total += order.total;
      marker.orders.push(order);
      // amount-weighted, so the marker sits where the money actually went
      const amount = marker.orders.reduce((sum, o) => sum + o.amount, 0);
      marker.price = amount > 0 ? marker.orders.reduce((sum, o) => sum + o.price * o.amount, 0) / amount : order.price;
    } else {
      buckets.set(key, {
        t,
        price: order.price,
        side: order.side,
        count: 1,
        total: order.total,
        orders: [order],
      });
    }
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

export interface PlacedMarker extends TradeMarker {
  /** Y in pixels where the badge is drawn */
  y: number;
  /** Y in pixels of the real price, when the badge had to move */
  anchorY: number | null;
}

/**
 * Pushes apart the markers that would overlap, in pixel space.
 * Called on every draw, since it depends on the current scale.
 */
export function placeMarkers(
  markers: TradeMarker[],
  toX: (t: number) => number,
  toY: (price: number) => number,
  { radius = 8, minGap = 18 }: { radius?: number; minGap?: number } = {},
): PlacedMarker[] {
  const placed: PlacedMarker[] = markers.map((m) => ({ ...m, y: toY(m.price), anchorY: null }));

  // cluster by horizontal proximity: markers far apart in X never collide
  const clusters: PlacedMarker[][] = [];
  for (const marker of [...placed].sort((a, b) => toX(a.t) - toX(b.t))) {
    const current = clusters[clusters.length - 1];
    if (current && Math.abs(toX(marker.t) - toX(current[current.length - 1].t)) < radius * 2.4) {
      current.push(marker);
    } else {
      clusters.push([marker]);
    }
  }

  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    cluster.sort((a, b) => a.y - b.y);
    for (let i = 1; i < cluster.length; i++) {
      const gap = cluster[i].y - cluster[i - 1].y;
      if (gap < minGap) {
        cluster[i].anchorY = cluster[i].y;
        cluster[i].y = cluster[i - 1].y + minGap;
      }
    }
  }
  return placed;
}
