import { useState, useEffect } from 'react';
import type { Density, ChartType } from './types';
import { GridView } from './views/GridView';
import { TimelineView } from './views/TimelineView';

type Variation = 'grid' | 'timeline';

const DEFAULTS = {
  density: 'compact' as Density,
  chartType: 'line' as ChartType,
  showBand: true,
  dark: false,
};

export function App() {
  const [variation, setVariation] = useState<Variation>(
    () => (localStorage.getItem('as-variation') as Variation) || 'grid'
  );
  const [density, setDensity] = useState<Density>(DEFAULTS.density);
  const [chartType, setChartType] = useState<ChartType>(DEFAULTS.chartType);
  const [showBand, setShowBand] = useState(DEFAULTS.showBand);
  const [dark, setDark] = useState(DEFAULTS.dark);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  useEffect(() => {
    localStorage.setItem('as-variation', variation);
  }, [variation]);

  return (
    <>
      <nav className="topnav">
        <div className="brand">
          <div className="brand-mark" />
          <span>analysis&#8209;sync</span>
        </div>
        <div className="variation-tabs">
          <button
            className={variation === 'grid' ? 'active' : ''}
            onClick={() => setVariation('grid')}
          >
            Grid
          </button>
          <button
            className={variation === 'timeline' ? 'active' : ''}
            onClick={() => setVariation('timeline')}
          >
            Timeline
          </button>
        </div>
        <button
          className="tweaks-trigger"
          title="Tweaks"
          onClick={() => setTweaksOpen(o => !o)}
          aria-pressed={tweaksOpen}
        >
          ⚙
        </button>
      </nav>

      {variation === 'grid' ? (
        <GridView density={density} showBand={showBand} chartType={chartType} />
      ) : (
        <TimelineView showBand={showBand} chartType={chartType} />
      )}

      <div className={`tweaks ${tweaksOpen ? 'active' : ''}`}>
        <div className="tweaks-title">Tweaks</div>
        <div className="tweak-row">
          <label>Density</label>
          <select value={density} onChange={e => setDensity(e.target.value as Density)}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>
        <div className="tweak-row">
          <label>Chart type</label>
          <select value={chartType} onChange={e => setChartType(e.target.value as ChartType)}>
            <option value="line">Line</option>
            <option value="bar">Bar</option>
            <option value="dots">Dots</option>
          </select>
        </div>
        <div className="tweak-row">
          <label>Reference band</label>
          <button
            className={`toggle ${showBand ? 'on' : ''}`}
            onClick={() => setShowBand(v => !v)}
            aria-pressed={showBand}
          />
        </div>
        <div className="tweak-row">
          <label>Dark mode</label>
          <button
            className={`toggle ${dark ? 'on' : ''}`}
            onClick={() => setDark(v => !v)}
            aria-pressed={dark}
          />
        </div>
      </div>
    </>
  );
}
