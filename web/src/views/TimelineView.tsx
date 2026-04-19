import { useState, useMemo } from 'react';
import type { ChartType } from '../types';
import { MARKERS, CATEGORIES, ANNOTATIONS } from '../data/markers';
import { rangeStatus, fmtNum, fmtDate, deltaPct } from '../lib/chartUtils';
import { LineChart } from '../components/LineChart';

interface TimelineViewProps {
  showBand: boolean;
  chartType: ChartType;
}

export function TimelineView({ showBand, chartType }: TimelineViewProps) {
  const [selectedId, setSelectedId] = useState(MARKERS[0].id);
  const [compareId, setCompareId] = useState<string | null>(null);

  const selected = MARKERS.find(m => m.id === selectedId)!;
  const compare = compareId ? (MARKERS.find(m => m.id === compareId) ?? null) : null;
  const cat = CATEGORIES[selected.category];

  const latest = selected.values[selected.values.length - 1];
  const prev = selected.values[selected.values.length - 2];
  const d = deltaPct(latest.value, prev.value);
  const vals = selected.values.map(v => v.value);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const status = rangeStatus(latest.value, selected.refLow, selected.refHigh);

  const markerAnnotations = ANNOTATIONS.filter(a => selected.values.some(v => v.date === a.date));

  const byCat = useMemo(() => {
    const g: Record<string, typeof MARKERS> = {};
    MARKERS.forEach(m => { (g[m.category] = g[m.category] ?? []).push(m); });
    return g;
  }, []);

  return (
    <div className="view view-timeline">
      <aside className="sidebar">
        <div className="sidebar-head">
          <h1 className="view-title">Markers</h1>
          <div className="view-sub">12 · 14 tests</div>
        </div>
        {Object.entries(byCat).map(([catId, list]) => (
          <div key={catId} className="sidebar-group">
            <div className="sidebar-group-head" style={{ color: CATEGORIES[catId].color }}>
              <span className="sidebar-swatch" style={{ background: CATEGORIES[catId].color }} />
              {CATEGORIES[catId].label}
            </div>
            <ul className="sidebar-list">
              {list.map(m => {
                const lv = m.values[m.values.length - 1];
                const s = rangeStatus(lv.value, m.refLow, m.refHigh);
                const isSel = m.id === selectedId;
                const isCmp = m.id === compareId;
                return (
                  <li
                    key={m.id}
                    className={`sidebar-item ${isSel ? 'selected' : ''} ${isCmp ? 'compare' : ''}`}
                    style={{ '--cat-color': CATEGORIES[m.category].color } as React.CSSProperties}
                    onClick={() => setSelectedId(m.id)}
                  >
                    <span className={`status-dot status-${s}`} />
                    <span className="sb-name">{m.name}</span>
                    <span className="sb-val">
                      {fmtNum(lv.value)} <span className="unit">{m.unit}</span>
                    </span>
                    <button
                      className="cmp-btn"
                      title="Compare on chart"
                      onClick={e => {
                        e.stopPropagation();
                        if (isCmp) {
                          setCompareId(null);
                        } else {
                          setCompareId(m.id);
                          if (m.id === selectedId) {
                            setSelectedId(MARKERS.find(x => x.id !== m.id)!.id);
                          }
                        }
                      }}
                    >
                      {isCmp ? '×' : '+'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </aside>

      <main
        className="stage"
        style={{ color: cat.color, '--tint': cat.tint } as React.CSSProperties}
      >
        <div className="stage-head">
          <div>
            <div className="modal-cat">{cat.label}</div>
            <h2 className="modal-title">{selected.name}</h2>
            <div className="modal-desc">{selected.description}</div>
          </div>
          <div className="hero-value">
            <span className="num">{fmtNum(latest.value)}</span>
            <span className="unit">{selected.unit}</span>
            <div className={`hero-delta delta--${d >= 0 ? 'up' : 'down'}`}>
              {d >= 0 ? '↑' : '↓'} {Math.abs(d).toFixed(1)}% from{' '}
              {fmtDate(prev.date, { month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>

        <div className="stat-strip stat-strip--compact">
          <div className="stat">
            <div className="stat-label">Status</div>
            <div className={`stat-value status-${status}`}>
              {status === 'ok' ? 'In range' : status === 'warn' ? 'Near edge' : 'Out of range'}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Min</div>
            <div className="stat-value"><span className="num">{fmtNum(minVal)}</span></div>
          </div>
          <div className="stat">
            <div className="stat-label">Avg</div>
            <div className="stat-value"><span className="num">{fmtNum(avg)}</span></div>
          </div>
          <div className="stat">
            <div className="stat-label">Max</div>
            <div className="stat-value"><span className="num">{fmtNum(maxVal)}</span></div>
          </div>
          <div className="stat">
            <div className="stat-label">Reference</div>
            <div className="stat-value ref-val">
              <span className="num">{selected.refLow}–{selected.refHigh}</span>
            </div>
          </div>
        </div>

        <div className="chart-area chart-area--big">
          <LineChart
            marker={selected}
            compareMarker={compare && compare.id !== selected.id ? compare : null}
            height={420}
            showBand={showBand}
            chartType={chartType}
            annotations={markerAnnotations}
          />
        </div>

        {compare && compare.id !== selected.id && (
          <div className="compare-legend compare-legend--stage">
            <span className="lg">
              <span className="lg-line" style={{ background: cat.color }} />
              {selected.name}
            </span>
            <span className="lg">
              <span className="lg-line dashed" style={{ color: CATEGORIES[compare.category].color }} />
              {compare.name}
            </span>
          </div>
        )}

        {markerAnnotations.length > 0 && (
          <div className="annotations annotations--stage">
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
      </main>
    </div>
  );
}
