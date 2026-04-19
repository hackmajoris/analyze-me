import { useState, useEffect } from 'react';
import type { Marker, ChartType, Category, Annotation } from '../types';
import { rangeStatus, fmtNum, fmtDate, deltaPct } from '../lib/chartUtils';
import { LineChart } from './LineChart';

interface DetailModalProps {
  marker: Marker;
  markers: Marker[];
  categories: Record<string, Category>;
  annotations: Annotation[];
  onClose: () => void;
  showBand: boolean;
  chartType: ChartType;
}

export function DetailModal({ marker, markers, categories, annotations, onClose, showBand, chartType }: DetailModalProps) {
  const cat = categories[marker.category];
  const [compareId, setCompareId] = useState<string | null>(null);
  const compareMarker = compareId ? (markers.find(m => m.id === compareId) ?? null) : null;

  if (!cat) {
    return null;
  }

  const vals = marker.values.map(v => v.value);
  const latest = marker.values[marker.values.length - 1];
  const prev = marker.values[marker.values.length - 2];
  const d = prev ? deltaPct(latest.value, prev.value) : 0;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const status = rangeStatus(latest.value, marker.refLow, marker.refHigh);

  const markerAnnotations = annotations.filter(a => marker.values.some(v => v.date === a.date));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ color: cat.color, '--tint': cat.tint } as React.CSSProperties}
      >
        <div className="modal-head">
          <div>
            <div className="modal-cat">{cat.label}</div>
            <h2 className="modal-title">{marker.name}</h2>
            <div className="modal-desc">{marker.description}</div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="stat-strip">
          <div className={`stat stat--hero${status === 'high' ? ' stat--alarm' : ''}`}>
            <div className="stat-label">Latest</div>
            <div className="stat-value">
              <span className="num">{fmtNum(latest.value)}</span>
              <span className="unit">{marker.unit}</span>
            </div>
            <div className={`stat-sub status-${status}`}>
              {status === 'ok' ? 'In range' : status === 'warn' ? 'Near edge' : 'Out of range'}
              {' · '}{fmtDate(latest.date)}
            </div>
          </div>
          {prev && (
            <div className={`stat${status === 'high' ? ' stat--alarm' : ''}`}>
              <div className="stat-label">Δ vs previous</div>
              <div className={`stat-value ${status === 'high' ? 'stat-value--alarm' : status === 'ok' ? 'delta--ok' : `delta--${d >= 0 ? 'up' : 'down'}`}`}>
                <span className="num">{d >= 0 ? '+' : ''}{d.toFixed(1)}%</span>
              </div>
              <div className="stat-sub">from {fmtNum(prev.value)} {marker.unit}</div>
            </div>
          )}
          <div className="stat">
            <div className="stat-label">Min</div>
            <div className="stat-value"><span className="num">{fmtNum(min)}</span></div>
            <div className="stat-sub">of {marker.values.length} readings</div>
          </div>
          <div className="stat">
            <div className="stat-label">Average</div>
            <div className="stat-value"><span className="num">{fmtNum(avg)}</span></div>
            <div className="stat-sub">reference {marker.refLow}–{marker.refHigh}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Max</div>
            <div className="stat-value"><span className="num">{fmtNum(max)}</span></div>
            <div className="stat-sub">&nbsp;</div>
          </div>
        </div>

        <div className="chart-area">
          <LineChart
            marker={marker}
            compareMarker={compareMarker}
            height={360}
            showBand={showBand}
            chartType={chartType}
            annotations={markerAnnotations}
          />
        </div>

        <div className="compare-row">
          <label className="compare-label">Compare with</label>
          <select value={compareId ?? ''} onChange={e => setCompareId(e.target.value || null)}>
            <option value="">— None —</option>
            {markers.filter(m => m.id !== marker.id).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {compareMarker && (
            <div className="compare-legend">
              <span className="lg">
                <span className="lg-line" style={{ background: cat?.color }} />
                {marker.short}
              </span>
              <span className="lg">
                <span className="lg-line dashed" style={{ color: categories[compareMarker.category]?.color }} />
                {compareMarker.short}
              </span>
            </div>
          )}
        </div>

        {markerAnnotations.length > 0 && (
          <div className="annotations">
            <div className="section-label">Annotations</div>
            <ul>
              {markerAnnotations.map((a, i) => (
                <li key={i}>
                  <div className="ann-date">{fmtDate(a.date)}</div>
                  <div className="ann-body">
                    <div className="ann-title">{a.title}</div>
                    <div className="ann-text">{a.body}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="readings">
          <div className="section-label">All readings</div>
          <div className="readings-grid">
            {marker.values.slice().reverse().map((v, i) => {
              const s = rangeStatus(v.value, marker.refLow, marker.refHigh);
              return (
                <div key={i} className="reading">
                  <span className={`status-dot status-${s}`} />
                  <span className="r-date">{fmtDate(v.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="r-val">
                    {fmtNum(v.value)} <span className="unit">{marker.unit}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
