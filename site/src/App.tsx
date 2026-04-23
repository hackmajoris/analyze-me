import './index.css'

const FAKE_CARDS = [
  { cat: 'CBC', name: 'Hemoglobin', val: '14.2', unit: 'g/dL', delta: '+1.4%', status: 'ok', color: 'var(--cat-cbc)', points: [13.1, 13.5, 13.8, 14.0, 14.2] },
  { cat: 'Lipids', name: 'LDL Cholesterol', val: '118', unit: 'mg/dL', delta: '-3.2%', status: 'warn', color: 'var(--cat-lipids)', points: [132, 128, 125, 122, 118] },
  { cat: 'Metabolic', name: 'Glucose', val: '92', unit: 'mg/dL', delta: '+0.8%', status: 'ok', color: 'var(--cat-metabolic)', points: [88, 90, 89, 91, 92] },
  { cat: 'Vitamins', name: 'Vitamin D', val: '28', unit: 'ng/mL', delta: '-12.5%', status: 'alarm', color: 'var(--cat-vitamins)', points: [38, 35, 32, 30, 28] },
  { cat: 'Liver', name: 'ALT', val: '24', unit: 'U/L', delta: '+2.1%', status: 'ok', color: 'var(--cat-liver)', points: [22, 21, 23, 22, 24] },
  { cat: 'Thyroid', name: 'TSH', val: '2.1', unit: 'mIU/L', delta: '-0.5%', status: 'ok', color: 'var(--cat-thyroid)', points: [2.4, 2.3, 2.2, 2.2, 2.1] },
  { cat: 'CBC', name: 'WBC', val: '6.8', unit: 'K/uL', delta: '+3.0%', status: 'ok', color: 'var(--cat-cbc)', points: [6.2, 6.4, 6.5, 6.6, 6.8] },
  { cat: 'Lipids', name: 'HDL Cholesterol', val: '58', unit: 'mg/dL', delta: '+5.4%', status: 'ok', color: 'var(--cat-lipids)', points: [52, 53, 55, 55, 58] },
]

function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  const min = Math.min(...points) - 1
  const max = Math.max(...points) + 1
  const w = 180, h = 32, pad = 4
  const path = points
    .map((v, i) => {
      const px = pad + (i / (points.length - 1)) * (w - pad * 2)
      const py = pad + (h - pad * 2) - ((v - min) / (max - min)) * (h - pad * 2)
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      {points.map((v, i) => {
        const px = pad + (i / (points.length - 1)) * (w - pad * 2)
        const py = pad + (h - pad * 2) - ((v - min) / (max - min)) * (h - pad * 2)
        return (
          <circle key={i} cx={px} cy={py} r={i === points.length - 1 ? 3 : 1.5}
            fill={color} stroke="var(--bg-surface)" strokeWidth={i === points.length - 1 ? 1.5 : 0.5} />
        )
      })}
    </svg>
  )
}

function App() {
  return (
    <>
      {/* ---- Nav ---- */}
      <nav className="site-nav">
        <div className="nav-inner">
          <a href="#" className="nav-brand">
            <div className="nav-mark" />
            <span>AnalyzeMe</span>
          </a>
          <div className="nav-links">
            <a href="#features" className="nav-link">Features</a>
            <a href="#screenshots" className="nav-link">Views</a>
            <a href="#how-it-works" className="nav-link">How it works</a>
            <a href="#privacy" className="nav-link">Privacy</a>
            <a href="https://github.com/hackmajoris/analyze-me" className="nav-cta" target="_blank" rel="noopener">
              GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <section className="hero">
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          Open source &middot; Local-first
        </div>
        <h1>
          Track your<br />
          <span className="gradient">blood work</span>
        </h1>
        <p className="hero-sub">
          Upload lab results, visualize biomarker trends over time, and spot changes before they matter.
          Private by design, your data never leaves your device.
        </p>
        <div className="hero-actions">
          <a href="https://github.com/hackmajoris/analyze-me" className="btn-primary" target="_blank" rel="noopener">
            Get Started
          </a>
          <a href="#features" className="btn-secondary">
            Learn More
          </a>
        </div>

        {/* ---- Fake App Preview ---- */}
        <div className="hero-preview">
          <div className="preview-window">
            <div className="preview-titlebar">
              <div className="preview-dot" />
              <div className="preview-dot" />
              <div className="preview-dot" />
            </div>
            <div className="preview-body">
              <div className="fake-nav">
                <div className="fake-brand">
                  <div className="fake-mark" />
                  <span>analysis-sync</span>
                </div>
                <div className="fake-tabs">
                  <span className="fake-tab active">Grid</span>
                  <span className="fake-tab">Timeline</span>
                  <span className="fake-tab">Settings</span>
                </div>
              </div>
              <div className="fake-grid">
                {FAKE_CARDS.map((c) => (
                  <div key={c.name} className="fake-card">
                    <div className="fake-card-cat" style={{ color: c.color }}>{c.cat}</div>
                    <div className="fake-card-name">{c.name}</div>
                    <div className="fake-card-row">
                      <div>
                        <span className="fake-card-val">{c.val}</span>
                        <span className="fake-card-unit">{c.unit}</span>
                      </div>
                      <span className={`fake-delta fake-delta--${c.status}`}>
                        {c.delta.startsWith('-') ? '\u2193' : '\u2191'} {c.delta.replace(/^[+-]/, '')}
                      </span>
                    </div>
                    <div className="fake-sparkline">
                      <MiniSparkline points={c.points} color={c.color} />
                    </div>
                    <div className="fake-card-foot">
                      <span>Apr 2026</span>
                      <span style={{ opacity: 0.7 }}>Ref range</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section className="section" id="features">
        <div className="section-label">Features</div>
        <h2 className="section-title">Everything you need to<br />understand your labs</h2>
        <p className="section-sub">
          A clean dashboard that turns dense lab reports into actionable insights, with no medical jargon required.
        </p>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'oklch(0.28 0.06 25)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cat-cbc)" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18"/><polyline points="7 14 11 10 15 13 21 7"/></svg>
            </div>
            <div className="feature-title">Trend Visualization</div>
            <div className="feature-desc">
              Line charts, sparklines, and delta indicators make it easy to see how each biomarker moves across visits.
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'oklch(0.28 0.06 145)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cat-vitamins)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </div>
            <div className="feature-title">Category Grouping</div>
            <div className="feature-desc">
              Markers organized by CBC, lipids, vitamins, liver, thyroid, and metabolic. Filter by category or view out-of-range results.
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'oklch(0.28 0.06 250)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cat-metabolic)" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div className="feature-title">PDF & CSV Import</div>
            <div className="feature-desc">
              Upload ZIP files with PDFs from your lab or drop CSVs. The parser automatically detects markers, units, and reference ranges.
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'oklch(0.28 0.06 295)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cat-liver)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </div>
            <div className="feature-title">Reference Ranges</div>
            <div className="feature-desc">
              Every marker shows its lab reference band. Out-of-range values are highlighted instantly so nothing slips through.
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'oklch(0.28 0.06 65)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cat-lipids)" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </div>
            <div className="feature-title">Desktop App</div>
            <div className="feature-desc">
              Native Electron app for Windows, macOS, and Linux with system-level secure storage and optional cloud sync.
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'oklch(0.28 0.06 195)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cat-thyroid)" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div className="feature-title">Encrypted Storage</div>
            <div className="feature-desc">
              Database encrypted at rest. Keys are securely stored in your system: Keychain (macOS), Credential Manager (Windows), or libsecret (Linux).
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'oklch(0.28 0.06 75)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cat-lipids)" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </div>
            <div className="feature-title">Manual Data Entry</div>
            <div className="feature-desc">
              Add or remove markers and manually enter readings. Full control over your health data with customizable marker definitions.
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-icon" style={{ background: 'oklch(0.28 0.06 35)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cat-cbc)" strokeWidth="2" strokeLinecap="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            </div>
            <div className="feature-title">Marker Comparison</div>
            <div className="feature-desc">
              Compare two markers side-by-side on interactive charts. Spot correlations and understand how different biomarkers relate.
            </div>
          </div>
        </div>
      </section>

      {/* ---- How It Works ---- */}
      <section className="section" id="how-it-works">
        <div className="section-label">How it works</div>
        <h2 className="section-title">Three steps to clarity</h2>
        <p className="section-sub">
          From a stack of lab PDFs to a clear, longitudinal view of your health.
        </p>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-title">Import your labs</div>
            <div className="step-desc">
              Upload a CSV export from your lab. The parser detects markers, units, and reference ranges automatically.
            </div>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-title">Watch trends form</div>
            <div className="step-desc">
              Each new import adds data points. Sparklines and delta badges show you which direction each marker is heading.
            </div>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-title">Act on insights</div>
            <div className="step-desc">
              Filter to out-of-range markers, export a summary, and bring it to your next doctor visit with full context.
            </div>
          </div>
        </div>
      </section>

      {/* ---- Screenshots ---- */}
      <section className="section screenshots-section" id="screenshots">
        <div className="section-label">Views</div>
        <h2 className="section-title">Explore your health data<br />three different ways</h2>
        <p className="section-sub">
          Switch between grid, timeline, and settings views to analyze your bloodwork from different perspectives.
        </p>

        <div className="screenshots-grid">
          <div className="screenshot-card">
            <div className="screenshot-window">
              <div className="screenshot-titlebar">
                <div className="screenshot-dot" />
                <div className="screenshot-dot" />
                <div className="screenshot-dot" />
              </div>
              <img src={`${import.meta.env.BASE_URL}grid-view.png`} alt="Grid View showing biomarkers organized by category" className="screenshot-img" />
            </div>
            <div className="screenshot-info">
              <div className="screenshot-title">Grid View</div>
              <div className="screenshot-desc">See all markers organized by category with sparklines and status indicators</div>
            </div>
          </div>

          <div className="screenshot-card">
            <div className="screenshot-window">
              <div className="screenshot-titlebar">
                <div className="screenshot-dot" />
                <div className="screenshot-dot" />
                <div className="screenshot-dot" />
              </div>
              <img src={`${import.meta.env.BASE_URL}timeline-view.png`} alt="Timeline View displaying marker trends over time" className="screenshot-img" />
            </div>
            <div className="screenshot-info">
              <div className="screenshot-title">Timeline View</div>
              <div className="screenshot-desc">View detailed trends and historical data with interactive line charts</div>
            </div>
          </div>

          <div className="screenshot-card">
            <div className="screenshot-window">
              <div className="screenshot-titlebar">
                <div className="screenshot-dot" />
                <div className="screenshot-dot" />
                <div className="screenshot-dot" />
              </div>
              <img src={`${import.meta.env.BASE_URL}detail-modal.png`} alt="Detail Modal showing marker statistics and chart" className="screenshot-img" />
            </div>
            <div className="screenshot-info">
              <div className="screenshot-title">Detail Modal</div>
              <div className="screenshot-desc">Analyze individual markers with statistics and comparison options</div>
            </div>
          </div>

          <div className="screenshot-card">
            <div className="screenshot-window">
              <div className="screenshot-titlebar">
                <div className="screenshot-dot" />
                <div className="screenshot-dot" />
                <div className="screenshot-dot" />
              </div>
              <img src={`${import.meta.env.BASE_URL}settings-view.png`} alt="Settings View for data import and marker management" className="screenshot-img" />
            </div>
            <div className="screenshot-info">
              <div className="screenshot-title">Settings View</div>
              <div className="screenshot-desc">Import data, manage marker definitions, and configure your preferences</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Privacy & Highlights ---- */}
      <section className="section" id="privacy">
        <div className="section-label">Privacy & Design</div>
        <h2 className="section-title">Your data, your device</h2>
        <p className="section-sub">
          Built with a local-first philosophy. No accounts, no cloud, no tracking.
        </p>
        <div className="highlights">
          <div className="highlight-card">
            <div className="highlight-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--cat-vitamins)" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div className="highlight-title">100% Local</div>
            <div className="highlight-desc">
              No server, no analytics, no third-party calls.
              Your health data stays in an encrypted SQLite database on your machine.
            </div>
          </div>
          <div className="highlight-card">
            <div className="highlight-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--cat-cbc)" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div className="highlight-title">Cloud Sync</div>
            <div className="highlight-desc">
              On macOS, sync your database across devices via iCloud Drive. Windows and Linux users can configure custom sync solutions.
            </div>
          </div>
          <div className="highlight-card">
            <div className="highlight-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--cat-lipids)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            </div>
            <div className="highlight-title">Secure Storage</div>
            <div className="highlight-desc">
              Encryption key stored securely using your system's native vault: Keychain (macOS), Credential Manager (Windows), or libsecret (Linux). Even if someone accesses the DB file, the data is unreadable.
            </div>
          </div>
          <div className="highlight-card">
            <div className="highlight-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--cat-metabolic)" strokeWidth="2" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </div>
            <div className="highlight-title">Open Source</div>
            <div className="highlight-desc">
              MIT licensed. Read every line, fork it, extend it. No vendor lock-in, no subscription.
            </div>
          </div>
          <div className="highlight-card wide">
            <div className="highlight-title">Built with</div>
            <div className="highlight-desc">
              A modern, minimal stack chosen for speed and simplicity.
            </div>
            <div className="tech-strip">
              <span className="tech-tag">Go 1.22+</span>
              <span className="tech-tag">React 18</span>
              <span className="tech-tag">TypeScript 5</span>
              <span className="tech-tag">Vite 6</span>
              <span className="tech-tag">SQLite</span>
              <span className="tech-tag">Electron</span>
              <span className="tech-tag">Docker</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="cta-section">
        <div className="cta-card">
          <h2 className="cta-title">Start tracking today</h2>
          <p className="cta-sub">
            Clone the repo, import your first lab report, and see your health data come to life.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <a href="https://github.com/hackmajoris/analyze-me" className="btn-primary" target="_blank" rel="noopener">
              View on GitHub
            </a>
          </div>
          <div className="download-buttons">
            <a href="#" className="download-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="17" cy="6" r="4"/><path d="M12 10c2.21 0 4 1.79 4 4v4M4 10c2.21 0 4 1.79 4 4v4M2 20c0-2 4-5 6-5s4 3 6 3 4-3 6-3c1 0 2 1 2 3"/></svg>
              <span className="btn-label"><strong>Mac</strong><small>Apple Silicon & Intel</small></span>
            </a>
            <a href="#" className="download-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 4 4 10 10 10 10 4"/><polyline points="14 4 14 10 20 10 20 4"/><polyline points="4 14 4 20 10 20 10 14"/><polyline points="14 14 14 20 20 20 20 14"/></svg>
              <span className="btn-label"><strong>Windows</strong><small>x64 & ARM64</small></span>
            </a>
            <a href="#" className="download-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c4.97 0 9 1.71 9 3.8v2.4c0 2.09-4.03 3.8-9 3.8s-9-1.71-9-3.8V5.8C3 3.71 7.03 2 12 2z"/><path d="M3 8v6c0 2.09 4.03 3.8 9 3.8s9-1.71 9-3.8V8"/><path d="M3 14v6c0 2.09 4.03 3.8 9 3.8s9-1.71 9-3.8v-6"/></svg>
              <span className="btn-label"><strong>Linux</strong><small>x64 & ARM64</small></span>
            </a>
          </div>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="nav-mark" />
            AnalyzeMe
          </div>
          <div className="footer-links">
            <a href="https://github.com/hackmajoris/analyze-me" className="footer-link" target="_blank" rel="noopener">GitHub</a>
            <a href="https://github.com/hackmajoris/analyze-me/blob/main/LICENSE" className="footer-link" target="_blank" rel="noopener">MIT License</a>
          </div>
        </div>
      </footer>
    </>
  )
}

export default App
