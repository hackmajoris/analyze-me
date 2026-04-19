import { useRef, useState, useEffect } from 'react';
import type { Marker, Annotation, ChartType } from '../types';
import { rangeStatus, statusColor, fmtDate } from '../lib/chartUtils';

interface LineChartProps {
  marker: Marker;
  compareMarker?: Marker | null;
  height?: number;
  showBand?: boolean;
  chartType?: ChartType;
  annotations?: Annotation[];
}

export function LineChart({
  marker,
  compareMarker = null,
  height = 340,
  showBand = true,
  chartType = 'line',
  annotations = [],
}: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(Math.max(320, e.contentRect.width));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const pad = { l: 54, r: compareMarker ? 54 : 16, t: 20, b: 40 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const { values, refLow, refHigh } = marker;
  const vals = values.map(v => v.value);
  const dataMin = Math.min(refLow, ...vals);
  const dataMax = Math.max(refHigh, ...vals);
  const span = dataMax - dataMin || 1;
  const min = dataMin - span * 0.12;
  const max = dataMax + span * 0.12;

  const x = (i: number) => pad.l + (i / (values.length - 1)) * w;
  const y = (v: number) => pad.t + h - ((v - min) / (max - min)) * h;

  // Build compare scale once
  let cy: ((v: number) => number) | null = null;
  let cLo = 0, cHi = 1;
  if (compareMarker) {
    const cv = compareMarker.values.map(p => p.value);
    const cMin = Math.min(compareMarker.refLow, ...cv);
    const cMax = Math.max(compareMarker.refHigh, ...cv);
    const cSpan = cMax - cMin || 1;
    cLo = cMin - cSpan * 0.12;
    cHi = cMax + cSpan * 0.12;
    cy = (v: number) => pad.t + h - ((v - cLo) / (cHi - cLo)) * h;
  }

  const path = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v.value).toFixed(1)}`)
    .join(' ');
  const areaPath = `${path} L ${x(values.length - 1).toFixed(1)} ${pad.t + h} L ${x(0).toFixed(1)} ${pad.t + h} Z`;

  const comparePath = compareMarker && cy
    ? compareMarker.values
        .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${cy!(v.value).toFixed(1)}`)
        .join(' ')
    : null;

  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks }, (_, i) => min + ((max - min) * i) / (yTicks - 1));
  const xTickStep = Math.max(1, Math.floor(values.length / 6));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const rel = (px - pad.l) / w;
    const i = Math.round(rel * (values.length - 1));
    setHoverIdx(i >= 0 && i < values.length ? i : null);
  };

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
        style={{ display: 'block', touchAction: 'none' }}
      >
        {/* horizontal grid */}
        {yTickVals.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={pad.l + w} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-dim)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {v.toFixed(v < 10 ? 1 : 0)}
            </text>
          </g>
        ))}

        {/* reference band */}
        {showBand && (
          <g>
            <rect x={pad.l} y={y(refHigh)} width={w} height={Math.max(1, y(refLow) - y(refHigh))}
              fill="currentColor" opacity="0.08" />
            <line x1={pad.l} x2={pad.l + w} y1={y(refLow)} y2={y(refLow)}
              stroke="currentColor" strokeDasharray="3 3" opacity="0.35" />
            <line x1={pad.l} x2={pad.l + w} y1={y(refHigh)} y2={y(refHigh)}
              stroke="currentColor" strokeDasharray="3 3" opacity="0.35" />
          </g>
        )}

        {/* annotation lines */}
        {annotations.map((a, i) => {
          const idx = values.findIndex(v => v.date === a.date);
          if (idx < 0) return null;
          return (
            <g key={i}>
              <line x1={x(idx)} x2={x(idx)} y1={pad.t} y2={pad.t + h}
                stroke="var(--text-dim)" strokeDasharray="2 3" opacity="0.5" />
              <circle cx={x(idx)} cy={pad.t + 6} r="4" fill="var(--bg)" stroke="var(--text-dim)" strokeWidth="1" />
              <text x={x(idx)} y={pad.t + 9} textAnchor="middle" fontSize="8" fill="var(--text-dim)" fontWeight="600">i</text>
            </g>
          );
        })}

        {/* primary series */}
        {chartType === 'bar' ? (
          values.map((v, i) => {
            const barW = Math.max(3, w / values.length - 6);
            const barH = Math.max(1, pad.t + h - y(v.value));
            const s = rangeStatus(v.value, refLow, refHigh);
            return (
              <rect key={i} x={x(i) - barW / 2} y={y(v.value)} width={barW} height={barH}
                fill={statusColor(s)} opacity="0.85" rx="2" />
            );
          })
        ) : chartType !== 'dots' ? (
          <>
            <path d={areaPath} fill="currentColor" opacity="0.1" />
            <path d={path} fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : null}

        {chartType !== 'bar' && values.map((v, i) => {
          const s = rangeStatus(v.value, refLow, refHigh);
          return (
            <circle key={i} cx={x(i)} cy={y(v.value)} r={hoverIdx === i ? 5.5 : 3.5}
              fill={statusColor(s)} stroke="var(--bg)" strokeWidth="1.5" />
          );
        })}

        {/* compare series */}
        {compareMarker && comparePath && cy && (
          <g style={{ color: `var(--cat-${compareMarker.category})` }}>
            <path d={comparePath} fill="none" stroke="currentColor" strokeWidth="1.6"
              strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
            {compareMarker.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={cy!(v.value)} r="2.8"
                fill="currentColor" stroke="var(--bg)" strokeWidth="1" opacity="0.9" />
            ))}
            {/* right axis */}
            {Array.from({ length: yTicks }, (_, i) => {
              const v = cLo + ((cHi - cLo) * i) / (yTicks - 1);
              return (
                <text key={i} x={pad.l + w + 8} y={pad.t + h - (i / (yTicks - 1)) * h + 4}
                  fontSize="11" fill="currentColor" opacity="0.85" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {v.toFixed(v < 10 ? 1 : 0)}
                </text>
              );
            })}
          </g>
        )}

        {/* x-axis labels */}
        {values.map((v, i) => {
          if (i % xTickStep !== 0 && i !== values.length - 1) return null;
          return (
            <text key={i} x={x(i)} y={pad.t + h + 18} textAnchor="middle" fontSize="11"
              fill="var(--text-dim)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtDate(v.date, { month: 'short', year: '2-digit' })}
            </text>
          );
        })}

        {/* hover crosshair */}
        {hoverIdx !== null && (
          <g>
            <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={pad.t} y2={pad.t + h}
              stroke="var(--text)" opacity="0.2" />
            <circle cx={x(hoverIdx)} cy={y(values[hoverIdx].value)} r="6"
              fill="none" stroke="currentColor" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hoverIdx !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(width - 180, Math.max(0, x(hoverIdx) - 80)),
            top: Math.max(0, y(values[hoverIdx].value) - 72),
          }}
        >
          <div className="tt-date">
            {new Date(values[hoverIdx].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="tt-row">
            <span className="tt-dot" style={{ background: 'currentColor' }} />
            <span className="tt-name">{marker.short}</span>
            <span className="tt-val">
              {values[hoverIdx].value} <span className="tt-unit">{marker.unit}</span>
            </span>
          </div>
          {compareMarker && (
            <div className="tt-row" style={{ color: `var(--cat-${compareMarker.category})` }}>
              <span className="tt-dot" style={{ background: 'currentColor' }} />
              <span className="tt-name">{compareMarker.short}</span>
              <span className="tt-val">
                {compareMarker.values[hoverIdx].value} <span className="tt-unit">{compareMarker.unit}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
