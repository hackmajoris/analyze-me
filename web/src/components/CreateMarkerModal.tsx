import { useEffect, useRef, useState } from 'react';
import type { Category, CreateMarkerRequest, Marker } from '../types';
import { api } from '../lib/api';

interface Props {
  onClose: () => void;
  onCreated: () => void;
  initialMarker?: Marker;
}

const EMPTY_FORM = {
  code: '',
  name: '',
  unit: '',
  category: '',
  valueType: 'numeric' as 'numeric' | 'text',
  refMin: '',
  refMax: '',
  description: '',
};

function markerToForm(m: Marker) {
  return {
    code: m.id,
    name: m.name,
    unit: m.unit ?? '',
    category: m.category ?? '',
    valueType: 'numeric' as 'numeric' | 'text',
    refMin: m.refLow != null ? String(m.refLow) : '',
    refMax: m.refHigh != null ? String(m.refHigh) : '',
    description: m.description ?? '',
  };
}

export function CreateMarkerModal({ onClose, onCreated, initialMarker }: Props) {
  const isEditing = initialMarker != null;
  const [categories, setCategories] = useState<Record<string, Category>>({});
  const [existingCodes, setExistingCodes] = useState<Set<string>>(new Set());
  const [form, setForm] = useState(initialMarker ? markerToForm(initialMarker) : EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ merged: boolean } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) codeRef.current?.focus();
    Promise.all([
      api.get<Record<string, Category>>('/api/categories'),
      api.get<Marker[]>('/api/markers'),
    ]).then(([cats, markers]) => {
      setCategories(cats);
      setExistingCodes(new Set(markers.map(m => m.id.toUpperCase())));
    }).catch(() => {});
  }, [isEditing]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const normalizedCode = form.code.trim().toUpperCase();
  const codeExists = normalizedCode !== '' && existingCodes.has(normalizedCode);

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const req: CreateMarkerRequest = {
      code: normalizedCode,
      name: form.name.trim(),
      unit: form.unit.trim(),
      category: form.category.trim(),
      refMin: form.refMin !== '' ? Number(form.refMin) : null,
      refMax: form.refMax !== '' ? Number(form.refMax) : null,
      description: form.description.trim(),
      valueType: form.valueType,
    };

    try {
      const res = await api.post<{ merged: boolean }>('/api/markers', req);
      setResult(res);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save marker');
    } finally {
      setSubmitting(false);
    }
  }

  const categoryKeys = Object.keys(categories);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal marker-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-cat">Marker Definition</div>
            <h2 className="modal-title">{result ? (result.merged ? 'Marker Updated' : 'Marker Created') : isEditing ? 'Edit Marker' : 'Add Marker'}</h2>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {result ? (
          <div className="marker-form-result">
            <div className={`form-banner form-banner--${result.merged ? 'warn' : 'ok'}`}>
              {result.merged
                ? `Marker "${normalizedCode}" was updated. Min/max values and metadata have been overwritten.`
                : `Marker "${normalizedCode}" was created successfully.`}
            </div>
            <div className="form-actions">
              <button className="import-btn" onClick={onClose}>Done</button>
              <button
                className="form-btn-secondary"
                onClick={() => { setForm(EMPTY_FORM); setResult(null); setError(null); }}
              >
                Add Another
              </button>
            </div>
          </div>
        ) : (
          <form className="marker-form" onSubmit={handleSubmit}>

            {/* Code */}
            <div className="form-field">
              <label className="form-label" htmlFor="mk-code">Marker Code <span className="form-required">*</span></label>
              <input
                ref={codeRef}
                id="mk-code"
                className="form-input"
                value={form.code}
                onChange={e => !isEditing && setField('code', e.target.value.toUpperCase())}
                placeholder="e.g. HGB"
                required
                autoComplete="off"
                spellCheck={false}
                readOnly={isEditing}
                style={isEditing ? { opacity: 0.6, cursor: 'default' } : undefined}
              />
            </div>

            {!isEditing && codeExists && (
              <div className="form-banner form-banner--warn">
                A marker with code <strong>{normalizedCode}</strong> already exists.
                Submitting will overwrite its name, unit, category, and reference min/max values.
              </div>
            )}

            {/* Name + Unit */}
            <div className="form-row form-row--2">
              <div className="form-field">
                <label className="form-label" htmlFor="mk-name">Name <span className="form-required">*</span></label>
                <input
                  id="mk-name"
                  className="form-input"
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="e.g. Hemoglobin"
                  required
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="mk-unit">Unit</label>
                <input
                  id="mk-unit"
                  className="form-input"
                  value={form.unit}
                  onChange={e => setField('unit', e.target.value)}
                  placeholder="e.g. g/dL"
                />
              </div>
            </div>

            {/* Category + Value Type */}
            <div className="form-row form-row--2">
              <div className="form-field">
                <label className="form-label" htmlFor="mk-category">Category</label>
                <input
                  id="mk-category"
                  className="form-input"
                  list="mk-categories-list"
                  value={form.category}
                  onChange={e => setField('category', e.target.value)}
                  placeholder="e.g. Biochimie"
                />
                <datalist id="mk-categories-list">
                  {categoryKeys.map(k => <option key={k} value={k}>{categories[k].label}</option>)}
                </datalist>
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="mk-type">Value Type</label>
                <select
                  id="mk-type"
                  className="form-select"
                  value={form.valueType}
                  onChange={e => setField('valueType', e.target.value as 'numeric' | 'text')}
                >
                  <option value="numeric">Numeric</option>
                  <option value="text">Text / Qualitative</option>
                </select>
              </div>
            </div>

            {/* Ref range — only for numeric */}
            {form.valueType === 'numeric' && (
              <div className="form-row form-row--2">
                <div className="form-field">
                  <label className="form-label" htmlFor="mk-refmin">Reference Min</label>
                  <input
                    id="mk-refmin"
                    className="form-input"
                    type="number"
                    step="any"
                    value={form.refMin}
                    onChange={e => setField('refMin', e.target.value)}
                    placeholder="—"
                  />
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="mk-refmax">Reference Max</label>
                  <input
                    id="mk-refmax"
                    className="form-input"
                    type="number"
                    step="any"
                    value={form.refMax}
                    onChange={e => setField('refMax', e.target.value)}
                    placeholder="—"
                  />
                </div>
              </div>
            )}

            {/* Description */}
            <div className="form-field">
              <label className="form-label" htmlFor="mk-desc">Description</label>
              <textarea
                id="mk-desc"
                className="form-textarea"
                value={form.description}
                onChange={e => setField('description', e.target.value)}
                rows={3}
                placeholder="Optional clinical description…"
              />
            </div>

            {error && <div className="form-banner form-banner--error">{error}</div>}

            <div className="form-actions">
              <button type="button" className="form-btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="import-btn" disabled={submitting}>
                {submitting ? 'Saving…' : isEditing || codeExists ? 'Update Marker' : 'Create Marker'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
