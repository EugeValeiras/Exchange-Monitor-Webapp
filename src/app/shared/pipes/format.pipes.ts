import { Pipe, PipeTransform } from '@angular/core';

/**
 * Shared number formatting. Until now every screen formatted its own way:
 * `number:'1.2-8'` on quantities, `currency:'USD'` on some totals, raw
 * `toFixed(2)` elsewhere. These pipes are the single answer.
 *
 * All of them use es-AR grouping (1.234,56), which is what the app already
 * shows through the ARS-aware screens, and tabular figures are expected on
 * the element (`font-variant-numeric: tabular-nums`).
 */

const LOCALE = 'es-AR';

function fmt(value: number, min: number, max: number): string {
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

/** Money: always two decimals. `12345.6` → `12.345,60` */
@Pipe({ name: 'emMoney', standalone: true })
export class EmMoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 2): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return fmt(value, decimals, decimals);
  }
}

/**
 * Crypto quantity: significant, not padded. `0.80575704` → `0,805757`,
 * `1500` → `1.500`. Sub-unit amounts keep 6 decimals, whole ones keep none:
 * `0,00000000` and `1.500,00000000` are both noise.
 */
@Pipe({ name: 'emQty', standalone: true })
export class EmQtyPipe implements PipeTransform {
  transform(value: number | null | undefined, asset?: string): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const abs = Math.abs(value);
    const decimals = abs === 0 ? 0 : abs < 1 ? 6 : abs < 1000 ? 4 : 2;
    const out = fmt(value, 0, decimals);
    return asset ? `${out} ${asset}` : out;
  }
}

/** Percentage with an explicit sign. `-15.0632` → `−15,06%` */
@Pipe({ name: 'emPct', standalone: true })
export class EmPctPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 2): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${fmt(Math.abs(value), decimals, decimals)}%`;
  }
}

/** Signed money, for P&L. `-10365.3` → `−10.365,30` */
@Pipe({ name: 'emSigned', standalone: true })
export class EmSignedPipe implements PipeTransform {
  transform(value: number | null | undefined, decimals = 2): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${fmt(Math.abs(value), decimals, decimals)}`;
  }
}

/** Compact volume. `2790000000` → `2,79 B` */
@Pipe({ name: 'emCompact', standalone: true })
export class EmCompactPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${fmt(value / 1e9, 2, 2)} B`;
    if (abs >= 1e6) return `${fmt(value / 1e6, 2, 2)} M`;
    if (abs >= 1e3) return `${fmt(value / 1e3, 1, 1)} K`;
    return fmt(value, 2, 2);
  }
}

/** CSS class for a signed value, so colour never gets decided ad hoc. */
export function toneOf(value: number | null | undefined): 'em-up' | 'em-down' | 'em-flat' {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) return 'em-flat';
  return value > 0 ? 'em-up' : 'em-down';
}

export const FORMAT_PIPES = [EmMoneyPipe, EmQtyPipe, EmPctPipe, EmSignedPipe, EmCompactPipe] as const;
