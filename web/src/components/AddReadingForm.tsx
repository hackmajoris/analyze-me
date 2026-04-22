import { useEffect, useState } from 'react';
import type { Marker } from '../types';
import { api } from '../lib/api';

interface Props {
  marker: Marker;
  isTextMarker: boolean;
  onAdded: () => void;
  onCancel: () => void;
}

function localToday(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

export function AddReadingForm({ marker, isTextMarker, onAdded, onCancel }: Props) {
  const today = localToday();
  const [labs, setLabs] = useState<string[]>([]);
  const [date, setDate] = useState(today);
  const [value, setValue] = useState('');
  const [lab, setLab] = useState('Manual');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<string[]>('/api/labs').then(setLabs).catch(() => {});
    if (marker.values.length > 0) {
      const last = marker.values[marker.values.length - 1];
      if (last.lab) setLab(last.lab);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || !date) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/readings', {
        markerCode: marker.id,
        date,
        value: !isTextMarker ? (value.trim() !== '' ? Number(value.trim().replace(',', '.')) : null) : null,
        valueText: isTextMarker ? value.trim() : '',
        lab: lab.trim() || 'Manual',
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reading');
      setSubmitting(false);
    }
  }

  return (
    <form className="add-reading-form" onSubmit={handleSubmit} noValidate>
      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor="ar-date">Date <span className="form-required">*</span></label>
          <input
            id="ar-date" type="date" className="form-input"
            value={date} onChange={e => setDate(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="ar-value">
            Value{!isTextMarker && marker.unit ? ` (${marker.unit})` : ''} <span className="form-required">*</span>
          </label>
          <input
            id="ar-value"
            type="text"
            inputMode={isTextMarker ? 'text' : 'decimal'}
            className="form-input"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={isTextMarker ? 'e.g. Negativ' : '0.0'}
            autoComplete="off"
            autoFocus
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="ar-lab">Lab</label>
          <input
            id="ar-lab" className="form-input"
            list="ar-labs-list"
            value={lab} onChange={e => setLab(e.target.value)}
            placeholder="Manual"
          />
          <datalist id="ar-labs-list">
            {labs.map(l => <option key={l} value={l} />)}
          </datalist>
        </div>
      </div>

      {error && <div className="form-banner form-banner--error">{error}</div>}

      <div className="form-actions">
        <button type="button" className="form-btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="import-btn" disabled={submitting || !value.trim() || !date}>
          {submitting ? 'Saving…' : 'Save Reading'}
        </button>
      </div>
    </form>
  );
}
