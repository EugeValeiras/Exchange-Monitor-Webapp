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
  // Sub-unit assets need the extra digits: NEXO at 0,95 and at 0,9523 are not
  // the same number, and two decimals hides that.
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Keeps the price pill inside the canvas.
 *
 * It sits in the axis gutter to the right of the plot, but the gutter is only
 * as wide as the tick labels need — a wider number (or a wider format) runs
 * straight off the edge and gets clipped.
 */
export function labelLeft(plotRight: number, canvasWidth: number, labelWidth: number): number {
  return Math.min(plotRight + 2, canvasWidth - labelWidth - 2);
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
        const left = labelLeft(chartArea.right, chart.width, width);
        ctx.fillStyle = '#2b3139';
        ctx.fillRect(left, py - 9, width, 18);
        ctx.fillStyle = '#eaecef';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, left + 6, py + 0.5);
      }
    }
    ctx.restore();
  },
};
