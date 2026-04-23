import { useEffect, useRef, useState } from 'react';
import { CreateMarkerModal } from '../components/CreateMarkerModal';
import type { Marker } from '../types';
import { createMarkerService } from '../services/markerService';

type Status = 'idle' | 'uploading' | 'done';

export function SettingsView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLPreElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // CSV import state
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvStatus, setCsvStatus] = useState<Status>('idle');
  const [csvResult, setCsvResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [markerModalOpen, setMarkerModalOpen] = useState(false);
  const [markerKey, setMarkerKey] = useState(0); // bump to force re-mount after create
  const [editingMarker, setEditingMarker] = useState<Marker | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Electron-only: database config
  const isElectron = !!window.electronAPI;
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [keySet, setKeySet] = useState(false);
  const [changingKey, setChangingKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newKeyConfirm, setNewKeyConfirm] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Auto-scroll logs to bottom as they arrive.
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  function loadMarkers() {
    createMarkerService().getMarkers().then(setMarkers).catch(console.error);
  }

  useEffect(() => {
    loadMarkers();
  }, [markerKey]);

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI!.getConfig().then(cfg => {
      setDbPath(cfg.dbPath);
      setKeySet(cfg.keySet);
    });
  }, [isElectron]);

  async function handleChangeKey(e: React.FormEvent) {
    e.preventDefault();
    if (newKey !== newKeyConfirm) { setKeyError('Keys do not match.'); return; }
    setKeyError(null);
    const result = await window.electronAPI!.changeKey(newKey);
    if (result.ok) {
      setKeySet(true);
      setChangingKey(false);
      setNewKey('');
      setNewKeyConfirm('');
    } else {
      setKeyError(result.error ?? 'Failed to change key.');
    }
  }

  async function handleDeleteMarker(code: string) {
    setDeletingCode(code);
    try {
      await createMarkerService().deleteMarker(code);
      setMarkers(prev => prev.filter(m => m.id !== code));
    } catch (err) {
      console.error('Failed to delete marker:', err);
    } finally {
      setDeletingCode(null);
      setConfirmDelete(null);
    }
  }

  function handleFileChange() {
    const file = fileRef.current?.files?.[0];
    setFileName(file ? file.name : null);
    setLogs([]);
    setSuccess(null);
    setFetchError(null);
    setStatus('idle');
  }

  function handleCsvFileChange() {
    const file = csvFileRef.current?.files?.[0];
    setCsvFileName(file ? file.name : null);
    setCsvResult(null);
    setCsvError(null);
    setCsvStatus('idle');
  }

  function handleDownloadTemplate() {
    const a = document.createElement('a');
    a.href = '/api/upload/csv/template';
    a.download = 'markers_template.csv';
    a.click();
  }

  async function handleCsvImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = csvFileRef.current?.files?.[0];
    if (!file) return;

    setCsvStatus('uploading');
    setCsvResult(null);
    setCsvError(null);

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch('/api/upload/csv', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`Server returned ${res.status} ${res.statusText}`);
      const data = await res.json() as { imported: number; errors: string[] };
      setCsvResult(data);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setCsvStatus('done');
      if (csvFileRef.current) csvFileRef.current.value = '';
      setCsvFileName(null);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setStatus('uploading');
    setLogs([]);
    setSuccess(null);
    setFetchError(null);

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch('/api/upload/zip', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`Server returned ${res.status} ${res.statusText}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE events are separated by "\n\n".
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const part of parts) {
          const dataLine = part.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine.slice(6)) as { type: string; line?: string; success?: boolean };
            if (ev.type === 'log' && ev.line != null) {
              setLogs(prev => [...prev, ev.line!]);
            } else if (ev.type === 'done') {
              setSuccess(ev.success ?? false);
              setStatus('done');
            }
          } catch {
            // ignore malformed events
          }
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Upload failed');
      setStatus('done');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
      setFileName(null);
    }
  }

  const busy = status === 'uploading';
  const csvBusy = csvStatus === 'uploading';

  return (
    <div className="view settings-view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Settings</h1>
          <p className="view-sub">Manage data imports and app configuration</p>
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">Import blood tests</h2>
        <p className="settings-section-desc">
          Upload a ZIP file containing PDF blood test reports. The extractor will
          parse each PDF and save the results to the database.
        </p>

        <form className="upload-form" onSubmit={handleSubmit}>
          <label className="file-pick">
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept=".zip"
              required
              onChange={handleFileChange}
            />
            <span className="file-pick-btn">Choose ZIP…</span>
            <span className="file-pick-name">{fileName ?? 'No file chosen'}</span>
          </label>
          <button type="submit" className="import-btn" disabled={busy || !fileName}>
            {busy ? 'Processing…' : 'Upload & import'}
          </button>
        </form>

        {fetchError && (
          <div className="import-result import-result--error">
            <div className="import-result-status">Error: {fetchError}</div>
          </div>
        )}

        {(logs.length > 0 || busy) && (
          <div className={`import-result ${
            status === 'done'
              ? success ? 'import-result--ok' : 'import-result--error'
              : 'import-result--running'
          }`}>
            {status === 'done' && (
              <div className="import-result-status">
                {success ? 'Import completed successfully.' : 'Import finished with errors.'}
              </div>
            )}
            {busy && (
              <div className="import-result-status import-result-status--running">
                Processing…
              </div>
            )}
            <pre className="import-logs">
              {logs.join('\n')}
              <span ref={logsEndRef} />
            </pre>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">Import / Export CSV</h2>
        <p className="settings-section-desc">
          Download a CSV template with example markers and readings, fill it in, then
          upload it to create or update markers and add readings in bulk.
        </p>

        <button className="import-btn" onClick={handleDownloadTemplate} style={{ marginBottom: 12 }}>
          Download template
        </button>

        <form className="upload-form" onSubmit={handleCsvImport}>
          <label className="file-pick">
            <input
              ref={csvFileRef}
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              onChange={handleCsvFileChange}
            />
            <span className="file-pick-btn">Choose CSV…</span>
            <span className="file-pick-name">{csvFileName ?? 'No file chosen'}</span>
          </label>
          <button type="submit" className="import-btn" disabled={csvBusy || !csvFileName}>
            {csvBusy ? 'Importing…' : 'Import CSV'}
          </button>
        </form>

        {csvError && (
          <div className="import-result import-result--error">
            <div className="import-result-status">Error: {csvError}</div>
          </div>
        )}

        {csvResult && (
          <div className={`import-result ${csvResult.errors.length === 0 ? 'import-result--ok' : 'import-result--error'}`}>
            <div className="import-result-status">
              {csvResult.imported} marker{csvResult.imported !== 1 ? 's' : ''} imported
              {csvResult.errors.length > 0 ? ` · ${csvResult.errors.length} error${csvResult.errors.length !== 1 ? 's' : ''}` : '.'}
            </div>
            {csvResult.errors.length > 0 && (
              <pre className="import-logs">{csvResult.errors.join('\n')}</pre>
            )}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">Marker Definitions</h2>
        <p className="settings-section-desc">
          Create or update marker metadata — name, unit, category, reference range, and description.
          If a marker code already exists (from imported reports or a previous definition), its
          min/max values and metadata will be overwritten.
        </p>
        <button
          className="import-btn"
          onClick={() => setMarkerModalOpen(true)}
        >
          Add Marker
        </button>

        {markers.length > 0 && (
          <div className="marker-list">
            {markers.map(m => (
              <div key={m.id} className="marker-list-row">
                <span className="marker-list-name">{m.name}</span>
                <span className="marker-list-meta">{m.id}{m.unit ? ` · ${m.unit}` : ''}{m.category ? ` · ${m.category}` : ''}</span>
                <button
                  className="marker-list-btn"
                  onClick={() => setEditingMarker(m)}
                  disabled={confirmDelete === m.id}
                >
                  Edit
                </button>
                {confirmDelete === m.id ? (
                  <span className="marker-list-confirm">
                    Delete all data?
                    <button
                      className="marker-list-btn marker-list-btn--danger"
                      disabled={deletingCode === m.id}
                      onClick={() => handleDeleteMarker(m.id)}
                    >
                      {deletingCode === m.id ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button
                      className="marker-list-btn"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    className="marker-list-btn marker-list-btn--delete"
                    onClick={() => setConfirmDelete(m.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {markerModalOpen && (
        <CreateMarkerModal
          key={markerKey}
          onClose={() => setMarkerModalOpen(false)}
          onCreated={() => setMarkerKey(k => k + 1)}
        />
      )}

      {editingMarker && (
        <CreateMarkerModal
          key={`edit-${editingMarker.id}`}
          initialMarker={editingMarker}
          onClose={() => setEditingMarker(null)}
          onCreated={() => { setMarkerKey(k => k + 1); setEditingMarker(null); }}
        />
      )}

      {isElectron && (
        <div className="settings-section">
          <h2 className="settings-section-title">Database</h2>
          <p className="settings-section-desc">
            Database file location and encryption settings.
          </p>

          <div className="settings-row">
            <span className="settings-row-label">Location</span>
            <span className="settings-row-value">{dbPath ?? '—'}</span>
          </div>

          <div className="settings-row">
            <span className="settings-row-label">Encryption key</span>
            <span className="settings-row-value">{keySet ? '••••••••' : 'Not set'}</span>
            <button className="import-btn" onClick={() => { setChangingKey(v => !v); setKeyError(null); setNewKey(''); setNewKeyConfirm(''); }}>
              {changingKey ? 'Cancel' : 'Change key'}
            </button>
          </div>

          {changingKey && (
            <form className="key-change-form" onSubmit={handleChangeKey}>
              <p className="settings-key-warning">
                If you lose your encryption key, your data will be permanently inaccessible.
                Store it in a password manager.
              </p>
              <input
                type="password"
                className="settings-key-input"
                placeholder="New encryption key"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                required
              />
              <input
                type="password"
                className="settings-key-input"
                placeholder="Confirm new key"
                value={newKeyConfirm}
                onChange={e => setNewKeyConfirm(e.target.value)}
                required
              />
              {keyError && <p className="settings-key-error">{keyError}</p>}
              <button type="submit" className="import-btn" disabled={!newKey || !newKeyConfirm}>
                Set new key
              </button>
            </form>
          )}

          <div className="settings-row" style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 20 }}>
            <span className="settings-row-label">Reset</span>
            <span className="settings-row-value" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              Clears the saved database path and encryption key. The database file itself is not deleted.
            </span>
            {confirmReset ? (
              <>
                <button
                  className="import-btn"
                  style={{ background: 'oklch(0.62 0.18 28)' }}
                  onClick={() => window.electronAPI!.resetConfig()}
                >
                  Yes, reset
                </button>
                <button className="form-btn-secondary" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="form-btn-secondary" onClick={() => setConfirmReset(true)}>
                Reset…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
