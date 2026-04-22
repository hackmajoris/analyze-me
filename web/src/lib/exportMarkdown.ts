import type { Marker, Category } from '../types';
import { rangeStatus, fmtRef, fmtNum } from './chartUtils';

function statusLabel(s: 'ok' | 'warn' | 'high'): string {
  if (s === 'high') return '↑ OUT OF RANGE';
  if (s === 'warn') return '~ NEAR LIMIT';
  return '✓ IN RANGE';
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function mdTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
  );
  const sep = widths.map(w => '-'.repeat(w));
  const fmt = (row: string[]) =>
    '| ' + row.map((cell, i) => pad(cell, widths[i])).join(' | ') + ' |';
  return [fmt(headers), fmt(sep), ...rows.map(fmt)].join('\n');
}

export function exportOutOfRange(
  markers: Marker[],
  categories: Record<string, Category>
): void {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`# Out of Range — Blood Test Markers`);
  lines.push(`**Generated:** ${today}  `);
  lines.push(`**Markers out of range:** ${markers.length}  `);
  lines.push(``);

  for (const marker of markers) {
    const cat = categories[marker.category];
    const catLabel = cat?.label ?? marker.category;
    const latest = marker.values[marker.values.length - 1];
    const isTextOnly = !!(latest?.label && marker.refLow === null && marker.refHigh === null);

    lines.push(`---`);
    lines.push(``);
    lines.push(`## ${marker.name}`);
    lines.push(`**Category:** ${catLabel}  `);
    if (marker.unit) {
      lines.push(`**Unit:** ${marker.unit}  `);
    }
    if (!isTextOnly) {
      lines.push(`**Reference:** ${fmtRef(marker.refLow, marker.refHigh)}  `);
    }

    // Latest value summary
    if (latest) {
      if (isTextOnly) {
        const flag = latest.flagged ? '⚠ UNEXPECTED' : '✓ AS EXPECTED';
        lines.push(`**Latest (${latest.date}):** ${latest.label ?? ''}  — ${flag}  `);
        if (latest.expectedText) {
          lines.push(`**Expected values:** ${latest.expectedText}  `);
        }
      } else {
        const s = rangeStatus(
          latest.value,
          latest.refLow ?? marker.refLow,
          latest.refHigh ?? marker.refHigh
        );
        lines.push(`**Latest (${latest.date}):** ${fmtNum(latest.value)} ${marker.unit ?? ''}  — ${statusLabel(s)}  `);
      }
    }

    lines.push(``);

    // History table — newest first
    const sorted = [...marker.values].sort((a, b) => b.date.localeCompare(a.date));

    if (isTextOnly) {
      const rows = sorted.map(v => {
        const flag = v.flagged !== undefined
          ? (v.flagged ? '⚠ UNEXPECTED' : '✓ AS EXPECTED')
          : '—';
        return [v.date, v.label ?? '', v.expectedText ?? '', flag];
      });
      lines.push(mdTable(['Date', 'Result', 'Expected', 'Status'], rows));
    } else {
      const rows = sorted.map(v => {
        const lo = v.refLow ?? marker.refLow;
        const hi = v.refHigh ?? marker.refHigh;
        const s = rangeStatus(v.value, lo, hi);
        return [v.date, fmtNum(v.value), marker.unit ?? '', fmtRef(lo, hi), statusLabel(s)];
      });
      lines.push(mdTable(['Date', 'Value', 'Unit', 'Reference', 'Status'], rows));
    }

    lines.push(``);
  }

  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `out-of-range-${today}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
