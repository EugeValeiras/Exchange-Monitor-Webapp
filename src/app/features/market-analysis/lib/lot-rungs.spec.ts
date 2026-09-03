import { rungsFromLots } from './lot-rungs';
import { CostBasisLot } from '../../../core/services/pnl.service';

const HOY = new Date('2026-09-03T00:00:00Z').getTime();

function lote(campos: Partial<CostBasisLot>): CostBasisLot {
  return {
    id: 'x', asset: 'BTC', exchange: 'binance', source: 'trade',
    acquiredAt: new Date('2026-01-24T00:00:00Z') as unknown as Date,
    originalAmount: 1, remainingAmount: 1, costPerUnit: 80000, totalCost: 80000,
    ...campos,
  } as CostBasisLot;
}

describe('rungsFromLots · los lotes abiertos como escalones', () => {
  it('el peso es la fracción de la posición, no la cantidad', () => {
    const r = rungsFromLots(
      [lote({ id: 'a', remainingAmount: 3 }), lote({ id: 'b', remainingAmount: 1 })],
      HOY,
    );
    expect(r.find((x) => x.id === 'a')!.weight).toBeCloseTo(0.75, 10);
    expect(r.find((x) => x.id === 'b')!.weight).toBeCloseTo(0.25, 10);
  });

  it('deja afuera lo cerrado y lo que no se puede dibujar', () => {
    const r = rungsFromLots(
      [
        lote({ id: 'cerrado', remainingAmount: 0 }),
        lote({ id: 'sin-precio', costPerUnit: 0 }),
        lote({ id: 'bueno' }),
      ],
      HOY,
    );
    expect(r.map((x) => x.id)).toEqual(['bueno']);
  });

  it('marca los consumidos a medias', () => {
    const r = rungsFromLots([lote({ originalAmount: 4, remainingAmount: 1 })], HOY);
    expect(r[0].partial).toBe(true);
  });

  it('descarta un lote posterior a la última vela: no tendría tramo', () => {
    const r = rungsFromLots(
      [lote({ acquiredAt: new Date('2026-12-01T00:00:00Z') as unknown as Date })],
      HOY,
    );
    expect(r).toEqual([]);
  });

  it('sin lotes abiertos no hay escalones', () => {
    expect(rungsFromLots([], HOY)).toEqual([]);
    expect(rungsFromLots([lote({ remainingAmount: 0 })], HOY)).toEqual([]);
  });

  it('ordena de menor a mayor peso, para que los gruesos queden arriba', () => {
    const r = rungsFromLots(
      [lote({ id: 'gordo', remainingAmount: 9 }), lote({ id: 'flaco', remainingAmount: 1 })],
      HOY,
    );
    expect(r.map((x) => x.id)).toEqual(['flaco', 'gordo']);
  });
});
