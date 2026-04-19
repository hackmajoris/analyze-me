import { useState, useMemo } from 'react';
import type { Marker, Density, ChartType } from '../types';
import { MARKERS, CATEGORIES } from '../data/markers';
import { SummaryCard } from '../components/SummaryCard';
import { DetailModal } from '../components/DetailModal';

interface GridViewProps {
  density: Density;
  showBand: boolean;
  chartType: ChartType;
}

export function GridView({ density, showBand, chartType }: GridViewProps) {
  const [open, setOpen] = useState<Marker | null>(null);
  const [filter, setFilter] = useState('all');

  const grouped = useMemo(() => {
    const g: Record<string, Marker[]> = {};
    MARKERS.forEach(m => {
      if (filter !== 'all' && m.category !== filter) return;
      (g[m.category] = g[m.category] ?? []).push(m);
    });
    return g;
  }, [filter]);

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Blood Analysis</h1>
          <div className="view-sub">12 markers · 14 tests · Feb 2020 – Feb 2026</div>
        </div>
        <div className="filter-chips">
          <button
            className={`chip ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          {Object.entries(CATEGORIES).map(([id, c]) => (
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

      {Object.entries(grouped).map(([catId, markers]) => (
        <section key={catId} className="group">
          <div className="group-head">
            <div className="group-swatch" style={{ background: CATEGORIES[catId].color }} />
            <h2 className="group-title">{CATEGORIES[catId].label}</h2>
            <div className="group-count">{markers.length} markers</div>
          </div>
          <div className="grid">
            {markers.map(m => (
              <SummaryCard
                key={m.id}
                marker={m}
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
          onClose={() => setOpen(null)}
          showBand={showBand}
          chartType={chartType}
        />
      )}
    </div>
  );
}
