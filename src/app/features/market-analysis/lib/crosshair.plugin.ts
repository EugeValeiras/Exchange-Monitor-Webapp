import { Chart, Plugin } from 'chart.js';
import { chartColors } from '../../../shared/charts/chart-theme';

/**
 * A single vertical line, snapped to the centre of a candle, drawn across
 * every stacked panel at the same instant.
 *
 * The panels are separate Chart instances, so the position lives outside them:
 * whoever handles the pointer writes the timestamp, and all three read it.
 */

export interface CrosshairOptions {
  /** Timestamp under the pointer, or null when it left the stack */
  at: number | null;
  /** Draw the price label on the right edge (only the price panel does) */
  showLabel?: boolean;
  /** Y in pixels for the label, when hovering this particular panel */
  pointerY?: number | null;
}

declare module 'chart.js' {
  interface PluginOptionsByType<TType> {
    crosshair?: CrosshairOptions;
  }
}

function formatPrice(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const crosshairPlugin: Plugin = {
  id: 'crosshair',

  afterDatasetsDraw(chart: Chart) {
    // Chart.js types plugin options as a deep partial; this block is ours
    const opts = chart.options.plugins?.crosshair as CrosshairOptions | undefined;
    if (!opts || opts.at === null || opts.at === undefined) return;

    const { ctx, chartArea, scales } = chart;
    const x = scales['x'];
    if (!x || !chartArea) return;

    const px = x.getPixelForValue(opts.at);
    if (px < chartArea.left || px > chartArea.right) return;

    const c = chartColors();
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = c.crosshair;
    ctx.lineWidth = 1;
    ctx.moveTo(px, chartArea.top);
    ctx.lineTo(px, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // horizontal line + price pill, only on the panel the pointer is over
    if (opts.showLabel && opts.pointerY !== null && opts.pointerY !== undefined) {
      const y = scales['y'];
      const py = opts.pointerY;
      if (y && py >= chartArea.top && py <= chartArea.bottom) {
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = c.crosshair;
        ctx.moveTo(chartArea.left, py);
        ctx.lineTo(chartArea.right, py);
        ctx.stroke();
        ctx.setLineDash([]);

        // Deliberately not configurable through the options: Chart.js resolves
        // any function it finds there as a scriptable option and calls it with
        // its own context, not with the value.
        const text = formatPrice(y.getValueForPixel(py) ?? 0);
        ctx.font = "600 10.5px Inter, sans-serif";
        const width = ctx.measureText(text).width + 12;
        ctx.fillStyle = '#2b3139';
        ctx.fillRect(chartArea.right + 2, py - 9, width, 18);
        ctx.fillStyle = '#eaecef';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, chartArea.right + 8, py + 0.5);
      }
    }
    ctx.restore();
  },
};
