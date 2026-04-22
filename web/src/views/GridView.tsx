import { useState, useMemo } from 'react';
import type { Marker, Density, ChartType } from '../types';
import { useMarkerData } from '../hooks/useMarkerData';
import { SummaryCard } from '../components/SummaryCard';
import { DetailModal } from '../components/DetailModal';
import { rangeStatus } from '../lib/chartUtils';
import { exportOutOfRange } from '../lib/exportMarkdown';

interface GridViewProps {
  density: Density;
  showBand: boolean;
  chartType: ChartType;
  selectedLab: string;
}

function isOutOfRange(m: Marker): boolean {
  const latest = m.values[m.values.length - 1];
  if (!latest) return false;
  if (latest.flagged !== undefined) return latest.flagged;
  return rangeStatus(latest.value, m.refLow, m.refHigh) === 'high';
}

export function GridView({ density, showBand, chartType, selectedLab }: GridViewProps) {
  const [reloadSignal, setReloadSignal] = useState(0);
  const { markers, categories, loading, error } = useMarkerData(selectedLab, reloadSignal);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (markers.find(m => m.id === openId) ?? null) : null;
  const [filter, setFilter] = useState('all');

  const outOfRangeMarkers = useMemo(() => markers.filter(isOutOfRange), [markers]);

  const grouped = useMemo(() => {
    if (filter === 'out-of-range') {
      return { 'out-of-range': outOfRangeMarkers };
    }
    const g: Record<string, Marker[]> = {};
    markers.forEach(m => {
      if (filter !== 'all' && m.category !== filter) return;
      (g[m.category] = g[m.category] ?? []).push(m);
    });
    return g;
  }, [filter, markers, outOfRangeMarkers]);

  if (loading) {
    return <div className="view"><div className="view-head"><h1 className="view-title">Loading...</h1></div></div>;
  }

  if (error) {
    return <div className="view"><div className="view-head"><h1 className="view-title">Error: {error}</h1></div></div>;
  }

  const dateRange = markers.length > 0
    ? `${markers[0].values[0]?.date || ''} – ${markers[0].values[markers[0].values.length - 1]?.date || ''}`
    : '';

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Blood Analysis</h1>
          <div className="view-sub">{markers.length} markers · {Object.keys(categories).length} categories · {dateRange}</div>
        </div>
        <div className="view-head-actions">
          {filter === 'out-of-range' && outOfRangeMarkers.length > 0 && (
            <button
              className="export-btn"
              onClick={() => exportOutOfRange(outOfRangeMarkers, categories)}
              title="Export out-of-range markers as Markdown"
            >
              ↓ Export .md
            </button>
          )}
          <div className="filter-chips">
          <button
            className={`chip ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`chip chip--alarm ${filter === 'out-of-range' ? 'active' : ''}`}
            onClick={() => setFilter('out-of-range')}
          >
            Out of range
            {outOfRangeMarkers.length > 0 && (
              <span className="chip-badge">{outOfRangeMarkers.length}</span>
            )}
          </button>
          {Object.entries(categories).map(([id, c]) => (
            <button
              key={id}
              className={`chip ${filter === id ? 'active' : ''}`}
              style={{ '--chip-color': c.color, '--chip-tint': c.tint } as React.CSSProperties}
              onClick={() => setFilter(id)}
            >
              <span className="chip-dot" />
              {c.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      {filter === 'out-of-range' ? (
        <section className="group">
          <div className="group-head">
            <div className="group-swatch" style={{ background: 'oklch(0.62 0.18 28)' }} />
            <h2 className="group-title">Out of range</h2>
            <div className="group-count">{outOfRangeMarkers.length} markers</div>
          </div>
          <div className="grid">
            {outOfRangeMarkers.map(m => (
              <SummaryCard
                key={m.id}
                marker={m}
                categories={categories}
                density={density}
                showBand={showBand}
                chartType={chartType}
                onOpen={m => setOpenId(m.id)}
              />
            ))}
          </div>
        </section>
      ) : (
        Object.entries(grouped).map(([catId, groupMarkers]) => {
          const catMeta = categories[catId];
          const groupLabel = catMeta?.label ?? (catId || 'Custom');
          const groupColor = catMeta?.color ?? 'oklch(0.65 0.12 195)';
          return (
          <section key={catId || '__custom__'} className="group">
            <div className="group-head">
              <div className="group-swatch" style={{ background: groupColor }} />
              <h2 className="group-title">{groupLabel}</h2>
              <div className="group-count">{groupMarkers.length} markers</div>
            </div>
            <div className="grid">
              {groupMarkers.map(m => (
                <SummaryCard
                  key={m.id}
                  marker={m}
                  categories={categories}
                  density={density}
                  showBand={showBand}
                  chartType={chartType}
                  onOpen={m => setOpenId(m.id)}
                />
              ))}
            </div>
          </section>
          );
        })
      )}

      {open && (
        <DetailModal
          marker={open}
          markers={markers}
          categories={categories}
          annotations={[]}
          onClose={() => setOpenId(null)}
          showBand={showBand}
          chartType={chartType}
          onReadingAdded={() => setReloadSignal(s => s + 1)}
        />
      )}
    </div>
  );
}
