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
  const [markerModalOpen, setMarkerModalOpen] = useState(false);
  const [markerKey, setMarkerKey] = useState(0); // bump to force re-mount after create
  const [editingMarker, setEditingMarker] = useState<Marker | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
    </div>
  );
}
