import { CostBasisLot } from '../../../core/services/pnl.service';

/**
 * Los lotes abiertos, como escalones sobre las velas.
 *
 * Un trade es un punto: pasó en un momento y a un precio. Un lote abierto es
 * otra cosa —una compra que TODAVÍA tenés—, así que se dibuja como un tramo
 * horizontal que arranca el día que la hiciste y llega hasta el borde derecho:
 * el tiempo que llevás sosteniéndola. Donde los escalones se amontonan está
 * concentrado tu costo, y la línea punteada del PPC pasa por su centro de
 * gravedad.
 *
 * El grosor sale de cuánto pesa el lote en la posición, no de su tamaño
 * absoluto: si no, en una cartera grande todos los escalones serían iguales.
 */
export interface LotRung {
  id: string;
  /** Cuándo se abrió: dónde arranca el tramo. */
  t: number;
  /** El costo por unidad: la altura del escalón. */
  price: number;
  /** Qué fracción de la posición abierta representa, de 0 a 1. */
  weight: number;
  /** Consumido en parte por una venta anterior. */
  partial: boolean;
}

/**
 * Convierte los lotes abiertos en escalones. Descarta lo que no se puede
 * dibujar —sin precio, sin fecha, sin nada que quede— y lo que cae del lado
 * derecho del rango visible, que no tendría tramo.
 */
export function rungsFromLots(lots: CostBasisLot[], lastCandleTime: number): LotRung[] {
  const abiertos = lots.filter(
    (l) => l.remainingAmount > 0 && l.costPerUnit > 0 && !!l.acquiredAt,
  );
  const total = abiertos.reduce((s, l) => s + l.remainingAmount, 0);
  if (!(total > 0)) return [];

  return abiertos
    .map((l) => ({
      id: l.id,
      t: new Date(l.acquiredAt).getTime(),
      price: l.costPerUnit,
      weight: l.remainingAmount / total,
      partial: l.remainingAmount < l.originalAmount,
    }))
    .filter((r) => Number.isFinite(r.t) && r.t <= lastCandleTime)
    .sort((a, b) => a.weight - b.weight); // los gruesos arriba, se ven mejor
}
