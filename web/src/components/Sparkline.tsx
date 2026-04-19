import type { Marker, ChartType } from '../types';
import { rangeStatus, statusColor } from '../lib/chartUtils';

interface SparklineProps {
  marker: Marker;
  height?: number;
  showBand?: boolean;
  chartType?: ChartType;
}

export function Sparkline({ marker, height = 58, showBand = true, chartType = 'line' }: SparklineProps) {
  const { values, refLow, refHigh } = marker;
  const vbW = 220;
  const pad = { l: 4, r: 4, t: 6, b: 6 };
  const w = vbW - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  // Handle edge cases: empty or single-point data
  if (values.length === 0) {
    return null;
  }

  const vals = values.map(v => v.value);
  const min = Math.min(refLow, ...vals) - 2;
  const max = Math.max(refHigh, ...vals) + 2;
  const range = max - min;

  const x = (i: number) => {
    if (values.length === 1) return pad.l + w / 2;
    return pad.l + (i / (values.length - 1)) * w;
  };

  const y = (v: number) => {
    if (range === 0) return pad.t + h / 2; // Handle case where all values are identical
    return pad.t + h - ((v - min) / range) * h;
  };

  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v.value).toFixed(1)}`).join(' ');
  const areaPath = `${path} L ${x(values.length - 1).toFixed(1)} ${pad.t + h} L ${x(0).toFixed(1)} ${pad.t + h} Z`;

  return (
    <svg viewBox={`0 0 ${vbW} ${height}`} width="100%" height={height} style={{ display: 'block' }}>
      {showBand && (
        <rect
          x={pad.l} y={y(refHigh)} width={w} height={Math.max(1, y(refLow) - y(refHigh))}
          fill="currentColor" opacity="0.08" rx="2"
        />
      )}
      {chartType !== 'dots' && (
        <>
          <path d={areaPath} fill="currentColor" opacity="0.09" />
          <path d={path} fill="none" stroke="currentColor" strokeWidth="1.75"
            strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}
      {values.map((v, i) => {
        const s = rangeStatus(v.value, refLow, refHigh);
        return (
          <circle
            key={i}
            cx={x(i)} cy={y(v.value)}
            r={i === values.length - 1 ? 3.2 : 2}
            fill={statusColor(s)}
            stroke="#fff"
            strokeWidth={i === values.length - 1 ? 1.2 : 0.6}
          />
        );
      })}
    </svg>
  );
}
