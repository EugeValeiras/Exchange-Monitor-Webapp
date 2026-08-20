import { PairPosition, PairTrade } from '../../../core/services/transactions.service';
import { collapseFills, groupTrades, markDust } from './trade-grouping';

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
