import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'uploading' | 'done';

export function SettingsView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLPreElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Auto-scroll logs to bottom as they arrive.
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

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
    </div>
  );
}
