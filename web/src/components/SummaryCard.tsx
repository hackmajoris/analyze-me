import type { Marker, Density, ChartType, Category } from '../types';
import { rangeStatus, fmtNum, fmtDate, deltaPct, fmtRef } from '../lib/chartUtils';
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
  // For text-only results, use flagged status; for numeric, use range comparison
  const status = latest.flagged !== undefined
    ? (latest.flagged ? 'high' : 'ok')
    : rangeStatus(latest.value, marker.refLow, marker.refHigh);
  // Check if this is a text-only result (has label but refLow/refHigh are null)
  const isTextOnly = latest.label && marker.refLow === null && marker.refHigh === null;

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
          {isTextOnly ? (
            <>
              <span className={`num val-${status}`}>{latest.label}</span>
              {latest.expectedText && <span className="unit" style={{ fontSize: '10px', opacity: 0.7 }}>Expected: {latest.expectedText}</span>}
            </>
          ) : (
            <>
              <span className={`num val-${status}`}>{fmtNum(latest.value)}</span>
              <span className="unit">{marker.unit}</span>
            </>
          )}
        </div>
        {!isTextOnly && (
          <div className={`delta delta--${status === 'high' ? 'alarm' : status}`}>
            <span>{d >= 0 ? '↑' : '↓'}</span>
            <span>{Math.abs(d).toFixed(1)}%</span>
          </div>
        )}
      </div>
      <div className="card-chart">
        <Sparkline marker={marker} showBand={showBand} chartType={chartType} />
      </div>
      <div className="card-foot">
        <span>{fmtDate(latest.date, { month: 'short', year: 'numeric' })}</span>
        {!isTextOnly && <span className="ref">Ref {fmtRef(marker.refLow, marker.refHigh)} {marker.unit}</span>}
      </div>
    </button>
  );
}
