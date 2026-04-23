import { useState } from 'react';

type Mode = 'new' | 'open';

export function SetupView() {
  const [mode, setMode] = useState<Mode>('new');

  // new db
  const [folder, setFolder] = useState('');
  const [key, setKey] = useState('');
  const [keyConfirm, setKeyConfirm] = useState('');

  // open existing
  const [dbPath, setDbPath] = useState('');
  const [existingKey, setExistingKey] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function pickFolder() {
    const f = await window.electronAPI!.pickDbFolder();
    if (f) setFolder(f);
  }

  async function pickFile() {
    const f = await window.electronAPI!.pickDbFile();
    if (f) setDbPath(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (mode === 'new' && key !== keyConfirm) {
      setError('Keys do not match.');
      return;
    }

    setLoading(true);
    const data = mode === 'new'
      ? { dbFolder: folder, encryptionKey: key }
      : { dbPath, encryptionKey: existingKey };

    const result = await window.electronAPI!.completeSetup(data);
    if (!result.ok) {
      setError(result.error ?? 'Setup failed.');
      setLoading(false);
    }
    // On success: main.js resizes and navigates to http://localhost:8080
  }

  const valid = mode === 'new'
    ? !!folder && !!key && key === keyConfirm
    : !!dbPath && !!existingKey;

  return (
    <div className="setup-overlay">
      <div className="setup-card">
        <div className="brand setup-brand">
          <div className="brand-mark" />
          <span>analysis&#8209;sync</span>
        </div>

        <div className="variation-tabs" style={{ marginBottom: 20 }}>
          <button className={mode === 'new' ? 'active' : ''} onClick={() => { setMode('new'); setError(''); }}>
            New database
          </button>
          <button className={mode === 'open' ? 'active' : ''} onClick={() => { setMode('open'); setError(''); }}>
            Open existing
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'new' ? (
            <>
              <p className="setup-subtitle">
                Choose a folder and set an encryption key for a new database.
              </p>

              <div className="setup-field">
                <label className="setup-label">Database folder</label>
                <div className="setup-input-row">
                  <input
                    className="setup-input"
                    type="text"
                    value={folder}
                    readOnly
                    placeholder="No folder selected"
                  />
                  <button type="button" className="setup-browse-btn" onClick={pickFolder}>
                    Browse…
                  </button>
                </div>
              </div>

              <div className="setup-field">
                <label className="setup-label">Encryption key</label>
                <input
                  className="setup-input"
                  type="password"
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="Enter a strong key"
                  required
                />
              </div>

              <div className="setup-field">
                <label className="setup-label">Confirm key</label>
                <input
                  className="setup-input"
                  type="password"
                  value={keyConfirm}
                  onChange={e => setKeyConfirm(e.target.value)}
                  placeholder="Repeat the key"
                  required
                />
              </div>

              <div className="setup-warning">
                <strong>Important:</strong> If you lose your encryption key, your data will be
                permanently inaccessible. Store it in a password manager.
              </div>
            </>
          ) : (
            <>
              <p className="setup-subtitle">
                Select an existing database file and enter its encryption key.
              </p>

              <div className="setup-field">
                <label className="setup-label">Database file</label>
                <div className="setup-input-row">
                  <input
                    className="setup-input"
                    type="text"
                    value={dbPath}
                    readOnly
                    placeholder="No file selected"
                  />
                  <button type="button" className="setup-browse-btn" onClick={pickFile}>
                    Browse…
                  </button>
                </div>
              </div>

              <div className="setup-field">
                <label className="setup-label">Encryption key</label>
                <input
                  className="setup-input"
                  type="password"
                  value={existingKey}
                  onChange={e => setExistingKey(e.target.value)}
                  placeholder="Enter the database key"
                  required
                />
              </div>
            </>
          )}

          {error && <p className="setup-error">{error}</p>}

          <button type="submit" className="setup-submit" disabled={!valid || loading}>
            {loading ? 'Starting…' : mode === 'new' ? 'Get Started' : 'Open Database'}
          </button>
        </form>
      </div>
    </div>
  );
}
