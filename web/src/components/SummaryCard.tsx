import type { Marker, Density, ChartType, Category } from '../types';
import { rangeStatus, fmtNum, fmtDate, deltaPct } from '../lib/chartUtils';
import { Sparkline } from './Sparkline';

interface SummaryCardProps {
  marker: Marker;
  categories: Record<string, Category>;
  density: Density;
  showBand: boolean;
  chartType: ChartType;
  onOpen: (marker: Marker) => void;
}

export function SummaryCard({ marker, categories, density, showBand, chartType, onOpen }: SummaryCardProps) {
  const cat = categories[marker.category];
  const latest = marker.values[marker.values.length - 1];
  const prev = marker.values[marker.values.length - 2];
  const d = prev ? deltaPct(latest.value, prev.value) : 0;
  const status = rangeStatus(latest.value, marker.refLow, marker.refHigh);

  if (!cat || !latest) {
    return null;
  }

  return (
    <button
      className={`card ${density === 'compact' ? 'card--compact' : ''}`}
      style={{ color: cat.color, '--tint': cat.tint } as React.CSSProperties}
      onClick={() => onOpen(marker)}
    >
      <div className="card-head">
        <div className="card-cat">{cat.label}</div>
        <div className={`status-dot status-${status}`} />
      </div>
      <div className="card-name">{marker.name}</div>
      <div className="card-value-row">
        <div className="card-value">
          <span className={`num val-${status}`}>{fmtNum(latest.value)}</span>
          <span className="unit">{marker.unit}</span>
        </div>
        <div className={`delta delta--${status === 'high' ? 'alarm' : status}`}>
          <span>{d >= 0 ? '↑' : '↓'}</span>
          <span>{Math.abs(d).toFixed(1)}%</span>
        </div>
      </div>
      <div className="card-chart">
        <Sparkline marker={marker} showBand={showBand} chartType={chartType} />
      </div>
      <div className="card-foot">
        <span>{fmtDate(latest.date, { month: 'short', year: 'numeric' })}</span>
        <span className="ref">Ref {marker.refLow}–{marker.refHigh} {marker.unit}</span>
      </div>
    </button>
  );
}
