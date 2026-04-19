import { useState, useMemo } from 'react';
import type { Marker, Density, ChartType } from '../types';
import { useMarkerData } from '../hooks/useMarkerData';
import { SummaryCard } from '../components/SummaryCard';
import { DetailModal } from '../components/DetailModal';

interface GridViewProps {
  density: Density;
  showBand: boolean;
  chartType: ChartType;
  selectedLab: string;
}

export function GridView({ density, showBand, chartType, selectedLab }: GridViewProps) {
  const { markers, categories, loading, error } = useMarkerData(selectedLab);
  const [open, setOpen] = useState<Marker | null>(null);
  const [filter, setFilter] = useState('all');

  const grouped = useMemo(() => {
    const g: Record<string, Marker[]> = {};
    markers.forEach(m => {
      if (filter !== 'all' && m.category !== filter) return;
      (g[m.category] = g[m.category] ?? []).push(m);
    });
    return g;
  }, [filter, markers]);

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
        <div className="filter-chips">
          <button
            className={`chip ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
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

      {Object.entries(grouped).map(([catId, groupMarkers]) => (
        <section key={catId} className="group">
          <div className="group-head">
            <div className="group-swatch" style={{ background: categories[catId]?.color }} />
            <h2 className="group-title">{categories[catId]?.label}</h2>
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
                onOpen={setOpen}
              />
            ))}
          </div>
        </section>
      ))}

      {open && (
        <DetailModal
          marker={open}
          markers={markers}
          categories={categories}
          annotations={[]}
          onClose={() => setOpen(null)}
          showBand={showBand}
          chartType={chartType}
        />
      )}
    </div>
  );
}
