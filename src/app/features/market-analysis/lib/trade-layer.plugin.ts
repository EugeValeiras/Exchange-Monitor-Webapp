import { Chart, Plugin } from 'chart.js';
import { chartColors } from '../../../shared/charts/chart-theme';
import { placeMarkers, TradeMarker } from './chart-markers';
import { LotRung } from './lot-rungs';

/**
 * Draws the "my trades" layer straight onto the canvas.
 *
 * The first version of this shipped as three extra datasets, which is how the
 * markers ended up in the legend and in the tooltip: Chart.js has no notion of
 * "this dataset is an annotation". Drawing in a plugin keeps the layer out of
 * every dataset-driven surface, and gives us the pixel access that stacking
 * overlapping markers needs.
 */

export interface TradeLayerOptions {
  markers: TradeMarker[];
  /** Average entry price line, or null when there is no open position */
  avgEntry: number | null;
  /** Average entry outside the plotted range: pinned to the edge and labelled */
  avgEntryOutOfRange?: boolean;
  /** Dust timestamps, drawn as ticks in the activity strip under the panel */
  dustAt?: number[];
  hoveredOrderId?: string | null;
  enabled: boolean;
  /** Lotes abiertos como escalones horizontales. */
  lots?: LotRung[];
  /** La capa está encendida: se dibujan todos. Apagada, sólo el que se señala. */
  lotsOn?: boolean;
  /** El lote sobre el que está el mouse en la lista, resaltado. */
  hoveredLotId?: string | null;
}

declare module 'chart.js' {
  interface PluginOptionsByType<TType> {
    tradeLayer?: TradeLayerOptions;
  }
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, letter: 'B' | 'S', color: string, opts: {
  radius: number;
  count: number;
  highlighted: boolean;
  surface: string;
  /** Hollow: the movement came through another pair, at a historical price */
  hollow: boolean;
}): void {
  const { radius, count, highlighted, surface, hollow } = opts;

  if (highlighted) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = hollow ? surface : color;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = hollow ? color : surface;
  if (hollow) ctx.setLineDash([2.5, 2]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = hollow ? color : '#0c0d0f';
  ctx.font = "700 9px Inter, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, x, y + 0.5);

  if (count > 1) {
    const bx = x + radius * 0.8;
    const by = y - radius * 0.8;
    ctx.beginPath();
    ctx.arc(bx, by, 5.8, 0, Math.PI * 2);
    ctx.fillStyle = surface;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "700 7.5px Inter, sans-serif";
    ctx.fillText(String(count), bx, by + 0.5);
  }
}

export const tradeLayerPlugin: Plugin = {
  id: 'tradeLayer',

  afterDatasetsDraw(chart: Chart) {
    // Chart.js types plugin options as a deep partial; this block is ours
    const opts = chart.options.plugins?.tradeLayer as TradeLayerOptions | undefined;
    if (!opts?.enabled) return;

    const { ctx, chartArea, scales } = chart;
    const x = scales['x'];
    const y = scales['y'];
    if (!x || !y || !chartArea) return;

    const c = chartColors();
    const surface = getComputedStyle(chart.canvas).backgroundColor || '#141518';
    ctx.save();

    // ── lotes abiertos ─────────────────────────────────────────────────────
    // Van primero, debajo de todo lo demás: son el piso sobre el que se leen
    // las velas, no una anotación que compita con ellas.
    for (const rung of opts.lots ?? []) {
      const señalado = !!opts.hoveredLotId && rung.id === opts.hoveredLotId;
      // Con la capa apagada igual se muestra el que estás señalando en la
      // lista: pasar el mouse por un lote es preguntar dónde está.
      if (!opts.lotsOn && !señalado) continue;

      const py = y.getPixelForValue(rung.price);
      if (py < chartArea.top || py > chartArea.bottom) continue;

      const desde = Math.max(chartArea.left, x.getPixelForValue(rung.t));
      if (desde > chartArea.right) continue;

      // El peso de un lote va de casi nada a un tercio de la posición: la raíz
      // evita que los chicos desaparezcan y que uno grande tape el gráfico.
      const fuerza = Math.sqrt(Math.min(rung.weight, 1));
      ctx.beginPath();
      ctx.strokeStyle = c.mine;
      // El señalado se lee entero aunque sea el más chico de todos.
      ctx.globalAlpha = señalado ? 1 : 0.12 + fuerza * 0.5;
      ctx.lineWidth = (señalado ? 1.6 : 1) + fuerza * 2.5;
      if (rung.partial) ctx.setLineDash([5, 3]);
      ctx.moveTo(desde, py);
      ctx.lineTo(chartArea.right, py);
      ctx.stroke();
      ctx.setLineDash([]);

      // Un punto donde arranca: el día que lo compraste. Hueco si entró por
      // otro par —vendiste NEXO y te dieron BTC—, que es la misma marca que
      // usan los trades cruzados: no vas a encontrar una compra acá.
      if (desde > chartArea.left) {
        const r = 1.5 + fuerza * 1.5;
        ctx.beginPath();
        ctx.arc(desde, py, r + (rung.via ? 0.8 : 0), 0, Math.PI * 2);
        ctx.globalAlpha = señalado ? 1 : 0.5 + fuerza * 0.5;
        if (rung.via) {
          ctx.fillStyle = surface;
          ctx.fill();
          ctx.strokeStyle = c.mine;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else {
          ctx.fillStyle = c.mine;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // ── average entry price ────────────────────────────────────────────────
    if (opts.avgEntry !== null && opts.avgEntry !== undefined) {
      const raw = y.getPixelForValue(opts.avgEntry);
      const pinned = opts.avgEntryOutOfRange;
      const py = pinned
        ? Math.min(chartArea.bottom - 12, Math.max(chartArea.top + 12, raw))
        : raw;

      if (py >= chartArea.top && py <= chartArea.bottom) {
        ctx.beginPath();
        ctx.setLineDash(pinned ? [2, 3] : [6, 4]);
        ctx.strokeStyle = c.mine;
        ctx.lineWidth = 1.2;
        ctx.moveTo(chartArea.left, py);
        ctx.lineTo(chartArea.right, py);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── activity strip: the dust that is not worth a pin of its own ────────
    for (const t of opts.dustAt ?? []) {
      const px = x.getPixelForValue(t);
      if (px < chartArea.left || px > chartArea.right) continue;
      ctx.beginPath();
      ctx.strokeStyle = c.mine;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.moveTo(px, chartArea.bottom - 5);
      ctx.lineTo(px, chartArea.bottom);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── markers ────────────────────────────────────────────────────────────
    const visible = opts.markers.filter((m) => {
      const px = x.getPixelForValue(m.t);
      return px >= chartArea.left && px <= chartArea.right;
    });

    const placed = placeMarkers(
      visible,
      (t) => x.getPixelForValue(t),
      (price) => y.getPixelForValue(price),
    );

    for (const marker of placed) {
      const px = x.getPixelForValue(marker.t);
      const color = marker.side === 'sell' ? c.down : c.up;
      const highlighted =
        !!opts.hoveredOrderId && marker.orders.some((o) => o.id === opts.hoveredOrderId);
      const radius = marker.count > 1 ? 9 : 7.5;

      // guide back to the real price, for the ones that had to move
      if (marker.anchorY !== null) {
        ctx.beginPath();
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1;
        ctx.moveTo(px, marker.anchorY);
        ctx.lineTo(px, marker.y - radius);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(px, marker.anchorY, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      badge(ctx, px, marker.y, marker.side === 'sell' ? 'S' : 'B', color, {
        radius,
        count: marker.count,
        highlighted,
        surface,
        hollow: marker.cross,
      });
    }

    ctx.restore();
  },
};
