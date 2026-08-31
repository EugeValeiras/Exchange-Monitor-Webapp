import { CrossTrade, PairPosition, PairTrade } from '../../../core/services/transactions.service';

/**
 * Turning 72 raw fills into something a person can read.
 *
 * The problem was never the scroll: it was that three rows of
 * `+0.00009 BTC / 7.78` carried the same visual weight as a 19.000 USD sale.
 * Three mechanisms, applied in this order:
 *
 *   1. fills of one order collapse into the order
 *   2. immaterial movements ("dust") fold into a single summary row
 *   3. the month is the unit, and inside it size decides the order
 *
 * Dust is aggregated, never dropped: the full history stays auditable.
 */

/** Trades closer than this are candidate fills of the same order. */
const MAX_FILL_WINDOW_MS = 15 * 60 * 1000;

/** Below both of these, a movement is dust. Relative — never a fixed amount. */
const DUST_AMOUNT_RATIO = 0.005; // 0,5% of the position
const DUST_VALUE_RATIO = 0.01; // 1% of the cost basis

/**
 * The other pair a movement came through. A BTC/USDT screen lists the BTC
 * that arrived by selling NEXO for BTC: the row is in BTC at the USD price
 * the P&L booked, and this keeps what actually happened next to it.
 */
export interface ViaPair {
  pair: string;
  /** The asset the trade is stored under (NEXO in NEXO/BTC) */
  asset: string;
  /** What happened to `asset` */
  side: 'buy' | 'sell';
  amount: number;
  /** In `priceAsset`, amount-weighted when fills collapse */
  price: number;
  priceAsset: string;
  /** The P&L had a USD price for it; otherwise the row has no value */
  booked: boolean;
  source: 'lot' | 'realized' | 'none';
}

export type TradeRow = PairTrade & { via?: ViaPair };

export interface TradeOrder {
  id: string;
  side: 'buy' | 'sell';
  exchange: string;
  /** Sum of the fills */
  amount: number;
  /** Amount-weighted average price */
  price: number;
  total: number;
  fee: number;
  timestamp: string;
  fills: TradeRow[];
  isDust: boolean;
  /** Set when the movement came through another pair */
  via: ViaPair | null;
}

/**
 * Cross trades as rows of the base asset: side, amount, price and total are
 * what the P&L booked for the base asset, so they sit in the same list and
 * on the same candles as the direct trades. What really happened travels in
 * `via`.
 */
export function rowsFromCross(cross: CrossTrade[]): TradeRow[] {
  return cross.map((c) => ({
    id: c.id,
    exchange: c.exchange,
    pair: c.pair,
    side: c.base.side,
    amount: c.base.amount,
    price: c.base.usdPrice ?? 0,
    total: c.base.usdTotal ?? 0,
    timestamp: c.timestamp,
    via: {
      pair: c.pair,
      asset: c.asset,
      side: c.side,
      amount: c.amount,
      price: c.price,
      priceAsset: c.priceAsset,
      booked: c.base.usdPrice !== null,
      source: c.base.source,
    },
  }));
}

export interface DustSummary {
  count: number;
  amount: number;
  total: number;
  price: number;
}

export interface MonthGroup {
  /** `2026-01`, for stable sorting and keys */
  key: string;
  label: string;
  buys: number;
  sells: number;
  /** Orders that came through another pair */
  via: number;
  netAmount: number;
  orders: TradeOrder[];
  dust: DustSummary | null;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Groups fills into orders: same side, same exchange, within a window.
 *
 * The window is the candle span capped at 15 minutes. Using the candle span
 * alone would collapse orders placed days apart into one "order" on a weekly
 * chart, with an average price that never existed — that is not reconstructing
 * fills, it is inventing an order.
 */
export function collapseFills(trades: TradeRow[], candleSpanMs: number): TradeOrder[] {
  const windowMs = Math.min(Math.max(candleSpanMs, 0) || MAX_FILL_WINDOW_MS, MAX_FILL_WINDOW_MS);
  const sorted = [...trades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const orders: TradeOrder[] = [];
  for (const trade of sorted) {
    const at = new Date(trade.timestamp).getTime();
    const open = orders[orders.length - 1];
    const last = open?.fills[open.fills.length - 1];
    // a NEXO/BTC fill is never a piece of a BTC/USDT order, whatever the clock says
    const sameRoute =
      !!open &&
      (open.via?.pair ?? null) === (trade.via?.pair ?? null) &&
      (open.via?.booked ?? true) === (trade.via?.booked ?? true);
    const sameOrder =
      sameRoute &&
      open.side === trade.side &&
      open.exchange === trade.exchange &&
      at - new Date(last.timestamp).getTime() <= windowMs;

    if (sameOrder) {
      open.fills.push(trade);
      open.amount += trade.amount;
      open.total += trade.total;
      open.fee += trade.fee ?? 0;
      open.price = open.amount > 0 ? open.total / open.amount : trade.price;
      open.timestamp = trade.timestamp;
      if (open.via && trade.via) {
        open.via.amount += trade.via.amount;
        open.via.price = weightedViaPrice(open.fills);
      }
      continue;
    }

    orders.push({
      id: trade.id,
      side: trade.side,
      exchange: trade.exchange,
      amount: trade.amount,
      price: trade.price,
      total: trade.total,
      fee: trade.fee ?? 0,
      timestamp: trade.timestamp,
      fills: [trade],
      isDust: false,
      via: trade.via ? { ...trade.via } : null,
    });
  }
  return orders;
}

function weightedViaPrice(fills: TradeRow[]): number {
  let amount = 0;
  let quote = 0;
  for (const fill of fills) {
    if (!fill.via) continue;
    amount += fill.via.amount;
    quote += fill.via.amount * fill.via.price;
  }
  return amount > 0 ? quote / amount : 0;
}

/**
 * Marks the immaterial orders.
 *
 * The backend resets `netAmount` and `costBasis` to 0 when a position goes
 * flat (an anti-drift clamp), so a relative threshold would divide by zero and
 * either everything or nothing would be material. In that case the threshold
 * falls back to 1% of the largest movement shown, and the UI says so.
 */
export function markDust(orders: TradeOrder[], position: PairPosition | null): {
  orders: TradeOrder[];
  relativeToLargest: boolean;
} {
  const hasPosition = !!position && position.netAmount > 1e-12 && position.costBasis > 1e-12;
  const largest = orders.reduce((max, o) => Math.max(max, o.total), 0);

  const amountFloor = hasPosition ? position!.netAmount * DUST_AMOUNT_RATIO : Infinity;
  const valueFloor = hasPosition ? position!.costBasis * DUST_VALUE_RATIO : largest * DUST_VALUE_RATIO;

  return {
    orders: orders.map((o) => ({
      ...o,
      // a cross trade the P&L never priced has no total: it is not small, it
      // is unexplained, and folding it into dust would hide exactly that
      isDust:
        o.via && !o.via.booked
          ? false
          : hasPosition
            ? o.amount < amountFloor && o.total < valueFloor
            : o.total < valueFloor,
    })),
    relativeToLargest: !hasPosition,
  };
}

/** Groups by month, newest first; inside a month, by size. */
export function groupByMonth(orders: TradeOrder[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();

  for (const order of orders) {
    const date = new Date(order.timestamp);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: `${MONTHS[date.getMonth()].toUpperCase()} ${date.getFullYear()}`,
        buys: 0,
        sells: 0,
        via: 0,
        netAmount: 0,
        orders: [],
        dust: null,
      };
      groups.set(key, group);
    }

    const signed = order.side === 'sell' ? -order.amount : order.amount;
    group.netAmount += signed;
    if (order.side === 'sell') group.sells += 1;
    else group.buys += 1;
    if (order.via) group.via += 1;

    if (order.isDust) {
      const dust = group.dust ?? { count: 0, amount: 0, total: 0, price: 0 };
      dust.count += 1;
      dust.amount += order.amount;
      dust.total += order.total;
      dust.price = dust.amount > 0 ? dust.total / dust.amount : order.price;
      group.dust = dust;
    } else {
      group.orders.push(order);
    }
  }

  const out = [...groups.values()];
  for (const group of out) {
    // Inside a month, size decides. You do not look for "the one from the
    // 14th", you look for the big one.
    group.orders.sort((a, b) => b.total - a.total);
  }
  return out.sort((a, b) => b.key.localeCompare(a.key));
}

export interface GroupedTrades {
  months: MonthGroup[];
  orderCount: number;
  dustCount: number;
  /** Orders that came through another pair */
  viaCount: number;
  relativeToLargest: boolean;
}

/**
 * The whole pipeline, which is what the panel actually calls.
 *
 * Cross trades ride along as rows of the base asset; the dust threshold still
 * comes from the pair's own position, which is the number on screen.
 */
export function groupTrades(
  trades: PairTrade[],
  position: PairPosition | null,
  candleSpanMs: number,
  cross: CrossTrade[] = [],
): GroupedTrades {
  const collapsed = collapseFills([...trades, ...rowsFromCross(cross)], candleSpanMs);
  const { orders, relativeToLargest } = markDust(collapsed, position);
  return {
    months: groupByMonth(orders),
    orderCount: orders.length,
    dustCount: orders.filter((o) => o.isDust).length,
    viaCount: orders.filter((o) => o.via).length,
    relativeToLargest,
  };
}
