import type { RangeStatus } from '../types';

export function rangeStatus(v: number, refLow: number, refHigh: number): RangeStatus {
  const span = refHigh - refLow;
  const pad = span * 0.1;
  if (v < refLow || v > refHigh) return 'high';
  if (v < refLow + pad || v > refHigh - pad) return 'warn';
  return 'ok';
}

export function statusColor(status: RangeStatus): string {
  if (status === 'high') return 'oklch(0.62 0.18 28)';
  if (status === 'warn') return 'oklch(0.72 0.14 75)';
  return 'oklch(0.58 0.13 155)';
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
