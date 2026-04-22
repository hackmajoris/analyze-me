import type { RangeStatus } from '../types';

export function rangeStatus(v: number, refLow: number | null, refHigh: number | null): RangeStatus {
  if ((refLow !== null && v < refLow) || (refHigh !== null && v > refHigh)) return 'high';
  const span = (refHigh ?? v) - (refLow ?? v);
  const pad = span * 0.1;
  if ((refLow !== null && v < refLow + pad) || (refHigh !== null && v > refHigh - pad)) return 'warn';
  return 'ok';
}

export function fmtRef(low: number | null, high: number | null): string {
  if (low !== null && high !== null) return `${low}–${high}`;
  if (low !== null) return `≥ ${low}`;
  if (high !== null) return `≤ ${high}`;
  return '–';
}

export function statusColor(status: RangeStatus): string {
  if (status === 'high') return 'oklch(0.62 0.18 28)';  // red for out of range
  if (status === 'warn') return 'oklch(0.72 0.14 75)';  // orange for warning
  return 'oklch(0.58 0.13 155)';  // green for in range
}

export function fmtNum(v: number): string {
  if (v >= 100) return String(Math.round(v));
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function fmtDate(d: string, opts?: Intl.DateTimeFormatOptions): string {
  const defaults: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return new Date(d).toLocaleDateString(undefined, opts ?? defaults);
}

export function deltaPct(a: number, b: number): number {
  if (b === 0) return 0;
  return ((a - b) / b) * 100;
}
