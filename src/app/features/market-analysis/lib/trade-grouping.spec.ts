import { CrossTrade, PairPosition, PairTrade } from '../../../core/services/transactions.service';
import { collapseFills, groupTrades, markDust, rowsFromCross } from './trade-grouping';

const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;

let seq = 0;
function trade(p: Partial<PairTrade> & { amount: number; price: number; timestamp: string }): PairTrade {
  return {
    id: `t${++seq}`,
    exchange: 'binance',
    pair: 'BTC/USDT',
    side: 'buy',
    total: p.amount * p.price,
    ...p,
  } as PairTrade;
}

const POSITION: PairPosition = {
  netAmount: 0.80575704,
  avgEntryPrice: 85399.1,
  costBasis: 68810.94,
  realizedPnl: -2374.84,
  totalBought: 1.25,
  totalSold: 0.45,
  tradeCount: 72,
};

describe('collapseFills', () => {
  it('collapses the four fills of one order at the same price', () => {
    // straight from the user's screen: one order that arrived in four pieces
    const fills = [
      trade({ amount: 0.00119, price: 86495.24, timestamp: '2026-01-25T14:30:00Z' }),
      trade({ amount: 0.00009, price: 86495.24, timestamp: '2026-01-25T14:30:20Z' }),
      trade({ amount: 0.00009, price: 86495.24, timestamp: '2026-01-25T14:30:41Z' }),
      trade({ amount: 0.00009, price: 86495.24, timestamp: '2026-01-25T14:31:02Z' }),
    ];
    const orders = collapseFills(fills, HOUR);
    expect(orders.length).toBe(1);
    expect(orders[0].fills.length).toBe(4);
    expect(orders[0].amount).toBeCloseTo(0.00146, 8);
    expect(orders[0].price).toBeCloseTo(86495.24, 2);
  });

  it('never invents an order out of trades days apart, even on a weekly chart', () => {
    const orders = collapseFills(
      [
        trade({ amount: 0.08902, price: 83500, timestamp: '2026-01-29T10:00:00Z' }),
        trade({ amount: 0.12668, price: 78940.93, timestamp: '2026-01-31T16:00:00Z' }),
      ],
      WEEK,
    );
    expect(orders.length).toBe(2);
  });

  it('keeps buys and sells apart even inside the window', () => {
    const orders = collapseFills(
      [
        trade({ amount: 1, price: 100, timestamp: '2026-01-01T10:00:00Z' }),
        trade({ amount: 1, price: 101, side: 'sell', timestamp: '2026-01-01T10:01:00Z' }),
      ],
      HOUR,
    );
    expect(orders.length).toBe(2);
  });

  it('keeps different exchanges apart', () => {
    const orders = collapseFills(
      [
        trade({ amount: 1, price: 100, timestamp: '2026-01-01T10:00:00Z' }),
        trade({ amount: 1, price: 100, exchange: 'kraken', timestamp: '2026-01-01T10:01:00Z' }),
      ],
      HOUR,
    );
    expect(orders.length).toBe(2);
  });

  it('weights the collapsed price by amount, not by a plain average', () => {
    const orders = collapseFills(
      [
        trade({ amount: 0.9, price: 100, timestamp: '2026-01-01T10:00:00Z' }),
        trade({ amount: 0.1, price: 200, timestamp: '2026-01-01T10:01:00Z' }),
      ],
      HOUR,
    );
    expect(orders[0].price).toBeCloseTo(110, 6); // not 150
  });
});

describe('markDust', () => {
  it('marks the small stuff and leaves the real movements alone', () => {
    const orders = collapseFills(
      [
        trade({ amount: 0.12668, price: 78940.93, timestamp: '2026-01-31T16:00:00Z' }),
        trade({ amount: 0.00009, price: 86495.24, timestamp: '2026-01-25T14:30:00Z' }),
      ],
      HOUR,
    );
    const { orders: marked } = markDust(orders, POSITION);
    expect(marked.find((o) => o.amount > 0.1)!.isDust).toBe(false);
    expect(marked.find((o) => o.amount < 0.001)!.isDust).toBe(true);
  });

  it('needs BOTH thresholds: a tiny amount that is still worth real money counts', () => {
    // floors here: 0,05 of the asset and 10 of the quote currency
    const position: PairPosition = { ...POSITION, netAmount: 10, costBasis: 1000 };
    const orders = collapseFills(
      // under the amount floor (0,04 < 0,05) but well over the value one (50 > 10)
      [trade({ amount: 0.04, price: 1250, timestamp: '2026-01-31T16:00:00Z' })],
      HOUR,
    );
    expect(markDust(orders, position).orders[0].isDust).toBe(false);
  });

  it('treats the real dust of the screenshot as dust', () => {
    // 0,00119 BTC / 102,93 USD is under both floors (0,004029 and 688,11)
    const orders = collapseFills(
      [trade({ amount: 0.00119, price: 86495.24, timestamp: '2026-01-25T14:30:00Z' })],
      HOUR,
    );
    expect(markDust(orders, POSITION).orders[0].isDust).toBe(true);
  });

  it('falls back to a relative threshold when the position is flat', () => {
    // the backend clamps netAmount and costBasis to 0 once a position closes
    const flat: PairPosition = { ...POSITION, netAmount: 0, costBasis: 0 };
    const orders = collapseFills(
      [
        trade({ amount: 1, price: 10000, timestamp: '2026-01-02T10:00:00Z' }),
        trade({ amount: 0.00001, price: 10000, timestamp: '2026-01-03T10:00:00Z' }),
      ],
      HOUR,
    );
    const { orders: marked, relativeToLargest } = markDust(orders, flat);
    expect(relativeToLargest).toBe(true);
    expect(marked[0].isDust).toBe(false);
    expect(marked[1].isDust).toBe(true);
  });

  it('does not divide by zero when there is no position at all', () => {
    const orders = collapseFills([trade({ amount: 1, price: 100, timestamp: '2026-01-01T10:00:00Z' })], HOUR);
    expect(() => markDust(orders, null)).not.toThrow();
  });
});

describe('groupTrades', () => {
  const REAL_SCREEN: PairTrade[] = [
    trade({ amount: 0.04782, price: 70150, timestamp: '2026-06-01T12:00:00Z' }),
    trade({ amount: 0.06844, price: 73050, timestamp: '2026-05-28T12:00:00Z' }),
    trade({ amount: 0.25009, price: 78250, side: 'sell', timestamp: '2026-04-22T12:00:00Z' }),
    trade({ amount: 0.12668, price: 78940.93, timestamp: '2026-01-31T16:00:00Z' }),
    trade({ amount: 0.08902, price: 83500, timestamp: '2026-01-29T10:00:00Z' }),
    trade({ amount: 0.08875, price: 84500, timestamp: '2026-01-29T15:00:00Z' }),
    trade({ amount: 0.00119, price: 86495.24, timestamp: '2026-01-25T14:30:00Z' }),
    trade({ amount: 0.00009, price: 86495.24, timestamp: '2026-01-25T14:30:20Z' }),
    trade({ amount: 0.00009, price: 86495.24, timestamp: '2026-01-25T14:30:41Z' }),
    trade({ amount: 0.00009, price: 86495.24, timestamp: '2026-01-25T14:31:02Z' }),
  ];

  it('turns the ten rows of the screenshot into four months and one dust row', () => {
    const { months } = groupTrades(REAL_SCREEN, POSITION, WEEK);
    expect(months.map((m) => m.label)).toEqual(['JUN 2026', 'MAY 2026', 'ABR 2026', 'ENE 2026']);

    const enero = months.find((m) => m.key === '2026-01')!;
    expect(enero.orders.length).toBe(3);
    expect(enero.dust).not.toBeNull();
    expect(enero.dust!.count).toBe(1);
    expect(enero.dust!.amount).toBeCloseTo(0.00146, 8);
  });

  it('orders a month by size, not by date', () => {
    const enero = groupTrades(REAL_SCREEN, POSITION, WEEK).months.find((m) => m.key === '2026-01')!;
    expect(enero.orders.map((o) => Math.round(o.total))).toEqual([10000, 7499, 7433]);
  });

  it('counts the net of the month with the right sign', () => {
    const abril = groupTrades(REAL_SCREEN, POSITION, WEEK).months.find((m) => m.key === '2026-04')!;
    expect(abril.sells).toBe(1);
    expect(abril.netAmount).toBeCloseTo(-0.25009, 8);
  });

  it('survives an empty history', () => {
    const empty = groupTrades([], POSITION, WEEK);
    expect(empty.months).toEqual([]);
    expect(empty.orderCount).toBe(0);
  });
});

describe('the asset on other pairs', () => {
  // straight from the user's history: NEXO sold for BTC, booked by the P&L as
  // a BTC lot at the historical BTC/USD price of that day
  function cross(p: Partial<CrossTrade> & { timestamp: string; usdPrice?: number | null }): CrossTrade {
    const amount = p.amount ?? 915.2;
    const price = p.price ?? 0.0000122;
    const usdPrice = p.usdPrice === undefined ? 63258.77 : p.usdPrice;
    const baseAmount = amount * price;
    return {
      id: `x${++seq}`,
      exchange: 'binance',
      pair: 'NEXO/BTC',
      asset: 'NEXO',
      side: 'sell',
      amount,
      price,
      priceAsset: 'BTC',
      base: {
        side: 'buy',
        amount: baseAmount,
        usdPrice,
        usdTotal: usdPrice === null ? null : baseAmount * usdPrice,
        source: usdPrice === null ? 'none' : 'lot',
      },
      ...p,
      ...(p.base ? { base: p.base } : {}),
    } as CrossTrade;
  }

  it('reads a sale for the base asset as a buy of it, at the USD price the P&L booked', () => {
    const [row] = rowsFromCross([cross({ timestamp: '2026-03-10T10:00:00Z' })]);
    expect(row.side).toBe('buy');
    expect(row.amount).toBeCloseTo(915.2 * 0.0000122, 10);
    expect(row.price).toBeCloseTo(63258.77, 2);
    expect(row.via?.pair).toBe('NEXO/BTC');
    expect(row.via?.asset).toBe('NEXO');
    expect(row.via?.side).toBe('sell');
    expect(row.via?.booked).toBe(true);
  });

  it('never merges a cross trade into a direct order, whatever the clock says', () => {
    const orders = collapseFills(
      [
        trade({ amount: 0.01, price: 63000, timestamp: '2026-03-10T10:00:00Z' }),
        ...rowsFromCross([cross({ timestamp: '2026-03-10T10:00:30Z' })]),
      ],
      HOUR,
    );
    expect(orders.length).toBe(2);
    expect(orders[0].via).toBeNull();
    expect(orders[1].via?.pair).toBe('NEXO/BTC');
  });

  it('collapses the fills of one cross order and keeps the other leg summed', () => {
    const orders = collapseFills(
      rowsFromCross([
        cross({ amount: 500, timestamp: '2026-03-10T10:00:00Z' }),
        cross({ amount: 415.2, timestamp: '2026-03-10T10:00:40Z' }),
      ]),
      HOUR,
    );
    expect(orders.length).toBe(1);
    expect(orders[0].fills.length).toBe(2);
    expect(orders[0].amount).toBeCloseTo(915.2 * 0.0000122, 10);
    expect(orders[0].via?.amount).toBeCloseTo(915.2, 8);
    expect(orders[0].via?.price).toBeCloseTo(0.0000122, 10);
  });

  it('lists a cross trade the P&L never priced, and never folds it into dust', () => {
    const grouped = groupTrades(
      [trade({ amount: 0.5, price: 80000, timestamp: '2026-03-01T10:00:00Z' })],
      POSITION,
      HOUR,
      [cross({ amount: 1, timestamp: '2026-03-10T10:00:00Z', usdPrice: null })],
    );
    const orders = grouped.months.flatMap((m) => m.orders);
    const unpriced = orders.find((o) => o.via);
    expect(unpriced).toBeDefined();
    expect(unpriced!.isDust).toBe(false);
    expect(unpriced!.via?.booked).toBe(false);
    expect(unpriced!.total).toBe(0);
  });

  it('counts them apart from the direct trades, in the month and overall', () => {
    const grouped = groupTrades(
      [trade({ amount: 0.5, price: 80000, timestamp: '2026-03-01T10:00:00Z' })],
      POSITION,
      HOUR,
      [cross({ timestamp: '2026-03-10T10:00:00Z' }), cross({ timestamp: '2026-04-10T10:00:00Z' })],
    );
    expect(grouped.viaCount).toBe(2);
    expect(grouped.orderCount).toBe(3);
    const march = grouped.months.find((m) => m.key === '2026-03')!;
    expect(march.via).toBe(1);
    expect(march.buys).toBe(2);
  });

  it('leaves the list untouched when no cross trades are passed', () => {
    const direct = [trade({ amount: 0.5, price: 80000, timestamp: '2026-03-01T10:00:00Z' })];
    expect(groupTrades(direct, POSITION, HOUR)).toEqual(groupTrades(direct, POSITION, HOUR, []));
  });
});
