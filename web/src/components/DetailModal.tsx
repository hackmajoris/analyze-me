import { useState, useEffect } from 'react';
import type { DataPoint, Marker, ChartType, Category, Annotation } from '../types';
import { rangeStatus, fmtNum, fmtDate, deltaPct, fmtRef } from '../lib/chartUtils';
import { LineChart } from './LineChart';
import { AddReadingForm } from './AddReadingForm';
import { api } from '../lib/api';

interface DetailModalProps {
  marker: Marker;
  markers: Marker[];
  categories: Record<string, Category>;
  annotations: Annotation[];
  onClose: () => void;
  showBand: boolean;
  chartType: ChartType;
  onReadingAdded?: () => void;
}

export function DetailModal({ marker, markers, categories, annotations, onClose, showBand, chartType, onReadingAdded }: DetailModalProps) {
  const cat = categories[marker.category] ?? { label: marker.category || 'Custom', color: 'oklch(0.65 0.12 195)', tint: 'oklch(0.965 0.022 195)' };
  const [compareId, setCompareId] = useState<string | null>(null);
  const [addingReading, setAddingReading] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const compareMarker = compareId ? (markers.find(m => m.id === compareId) ?? null) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasValues = marker.values.length > 0;
  const latest = hasValues ? marker.values[marker.values.length - 1] : null;
  const prev = marker.values.length > 1 ? marker.values[marker.values.length - 2] : null;

  const isTextOnly = latest
    ? !!(latest.label && marker.refLow === null && marker.refHigh === null)
    : false;

  const status = latest
    ? (isTextOnly && latest.flagged !== undefined
        ? (latest.flagged ? 'high' : 'ok')
        : rangeStatus(latest.value, marker.refLow, marker.refHigh))
    : 'ok';

  const vals = marker.values.map(v => v.value);
  const min = hasValues ? Math.min(...vals) : 0;
  const max = hasValues ? Math.max(...vals) : 0;
  const avg = hasValues ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const d = latest && prev ? deltaPct(latest.value, prev.value) : 0;

  const markerAnnotations = annotations.filter(a => marker.values.some(v => v.date === a.date));

  function handleReadingAdded() {
    setAddingReading(false);
    onReadingAdded?.();
  }

  async function handleDeleteReading(v: DataPoint) {
    const key = `${v.date}__${v.lab}`;
    if (confirmDeleteKey !== key) {
      setConfirmDeleteKey(key);
      return;
    }
    setConfirmDeleteKey(null);
    try {
      await api.delete(
        `/api/readings?code=${encodeURIComponent(marker.id)}&date=${encodeURIComponent(v.date)}&lab=${encodeURIComponent(v.lab)}`
      );
      onReadingAdded?.();
    } catch {
      // silently ignore — the reading stays visible
    }
  }

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
            {marker.description && <div className="modal-desc">{marker.description}</div>}
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {hasValues && latest ? (
          <>
            <div className="stat-strip">
              <div className={`stat stat--hero${status !== 'ok' ? ` stat--${status}` : ''}`}>
                <div className="stat-label">Latest</div>
                <div className="stat-value">
                  {isTextOnly ? (
                    <>
                      <span className="num">{latest.label}</span>
                      {latest.expectedText && <span className="unit" style={{ fontSize: '10px', opacity: 0.7 }}>Expected: {latest.expectedText}</span>}
                    </>
                  ) : (
                    <>
                      <span className="num">{fmtNum(latest.value)}</span>
                      <span className="unit">{marker.unit}</span>
                    </>
                  )}
                </div>
                <div className={`stat-sub status-${status}`}>
                  {isTextOnly
                    ? (status === 'ok' ? 'As expected' : 'Unexpected value')
                    : (status === 'ok' ? 'In range' : status === 'warn' ? 'Near edge' : 'Out of range')}
                  {' · '}{fmtDate(latest.date)}
                </div>
              </div>
              {!isTextOnly && prev && (
                <div className={`stat${status !== 'ok' ? ` stat--${status}` : ''}`}>
                  <div className="stat-label">Δ vs previous</div>
                  <div className={`stat-value ${status !== 'ok' ? `stat-value--${status}` : 'delta--ok'}`}>
                    <span className="num">{d >= 0 ? '+' : ''}{d.toFixed(1)}%</span>
                  </div>
                  <div className="stat-sub">from {fmtNum(prev.value)} {marker.unit}</div>
                </div>
              )}
              {!isTextOnly && (
                <>
                  <div className="stat">
                    <div className="stat-label">Min</div>
                    <div className="stat-value"><span className="num">{fmtNum(min)}</span></div>
                    <div className="stat-sub">of {marker.values.length} readings</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Average</div>
                    <div className="stat-value"><span className="num">{fmtNum(avg)}</span></div>
                    <div className="stat-sub">reference {fmtRef(marker.refLow, marker.refHigh)}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Max</div>
                    <div className="stat-value"><span className="num">{fmtNum(max)}</span></div>
                    <div className="stat-sub">&nbsp;</div>
                  </div>
                </>
              )}
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
                {markers.filter(m => m.id !== marker.id && m.values.length > 0).map(m => (
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
          </>
        ) : (
          <div className="no-readings-notice">
            No readings recorded yet. Add the first one below.
          </div>
        )}

        <div className="readings">
          <div className="readings-head">
            <div className="section-label">{hasValues ? 'All readings' : 'Add reading'}</div>
            {hasValues && !addingReading && (
              <button className="add-reading-btn" onClick={() => setAddingReading(true)}>
                + Add reading
              </button>
            )}
          </div>

          {(addingReading || !hasValues) && (
            <AddReadingForm
              marker={marker}
              isTextMarker={isTextOnly}
              onAdded={handleReadingAdded}
              onCancel={hasValues ? () => setAddingReading(false) : onClose}
            />
          )}

          {hasValues && (
            <div className="readings-grid">
              {marker.values.slice().reverse().map((v, i) => {
                const s = v.flagged !== undefined
                  ? (v.flagged ? 'high' : 'ok')
                  : rangeStatus(v.value, marker.refLow, marker.refHigh);
                const delKey = `${v.date}__${v.lab}`;
                const confirming = confirmDeleteKey === delKey;
                return (
                  <div
                    key={i}
                    className={`reading ${confirming ? 'reading--confirming' : ''}`}
                    onClick={() => { if (confirmDeleteKey && !confirming) setConfirmDeleteKey(null); }}
                  >
                    <span className={`status-dot status-${s}`} />
                    <span className="r-date">{fmtDate(v.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span className="r-val">
                      {isTextOnly ? v.label : fmtNum(v.value)} <span className="unit">{marker.unit}</span>
                    </span>
                    <button
                      className={`r-delete ${confirming ? 'r-delete--confirm' : ''}`}
                      onClick={e => { e.stopPropagation(); handleDeleteReading(v); }}
                      title={confirming ? 'Click again to confirm deletion' : 'Delete reading'}
                    >
                      {confirming ? 'Delete?' : '×'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
