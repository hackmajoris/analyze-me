# AnalyzeMe

**Track your blood work.** Upload lab results, visualize biomarker trends over time, and spot changes before they matter. Private by design—your data never leaves your device.

---

## Features

- **Trend Visualization** — Line charts, sparklines, and delta indicators make it easy to see how each biomarker moves across visits.
- **Category Grouping** — Markers organized by CBC, lipids, vitamins, liver, thyroid, and metabolic. Filter by category or view out-of-range results.
- **PDF & CSV Import** — Upload ZIP files with PDFs from your lab or drop CSVs. The parser automatically detects markers, units, and reference ranges.
- **Reference Ranges** — Every marker shows its lab reference band. Out-of-range values are highlighted instantly so nothing slips through.
- **Desktop App** — Native Electron app for Windows, macOS, and Linux with system-level secure storage and optional cloud sync.
- **Encrypted Storage** — Database encrypted at rest. Keys are securely stored in your system: Keychain (macOS), Credential Manager (Windows), or libsecret (Linux).
- **Manual Data Entry** — Add or remove markers and manually enter readings. Full control over your health data with customizable marker definitions.
- **Marker Comparison** — Compare two markers side-by-side on interactive charts. Spot correlations and understand how different biomarkers relate.

---

---

## Privacy & Design

- **100% Local** — No server, no analytics, no third-party calls. Your health data stays in an encrypted SQLite database on your machine.
- **Cloud Sync** — On macOS, sync your database across devices via iCloud Drive. Windows and Linux users can configure custom sync solutions.
- **Secure Storage** — Encryption key stored securely using your system's native vault. Even if someone accesses the DB file, the data is unreadable.
- **Open Source** — MIT licensed. Read every line, fork it, extend it. No vendor lock-in, no subscription.

### Built With

Go 1.22+ • React 18 • TypeScript 5 • Vite 6 • SQLite • Electron • Docker

---

## Quick Start

### Option 1: Docker (Easiest)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

On macOS, store the database encryption key in Keychain first:

```bash
security add-generic-password -a analyze-me -s analyze-me-db-key -w "your_key"
```

Then start the app:

```bash
make up       # start containers in detached mode
make down     # stop containers
make logs     # tail container logs
make ps       # show container status
```

Open [http://localhost:8080](http://localhost:8080).

On first launch, you'll be prompted to choose where to store your encrypted database. By default on macOS, it uses iCloud Drive for easy sync across devices.

### Option 2: Build Natively

**Prerequisites:**

- Go 1.22+
- Node 20+
- [golangci-lint](https://golangci-lint.run/)

**Build & Run:**

```bash
make build        # build frontend then Go binary → .bin/server
make serve        # build and run the server
make dev          # run server + frontend dev server concurrently
```

**Development:**

```bash
make web-dev      # frontend dev server only (proxies /api to :8080)
make web-build    # build frontend → web/dist/
make test         # go test -race -cover ./...
make lint         # golangci-lint run ./...
make fmt          # gofmt + goimports
make clean        # remove build artifacts
```

---

## How It Works

1. **Import your labs** — Upload a CSV export from your lab. The parser detects markers, units, and reference ranges automatically.
2. **Watch trends form** — Each new import adds data points. Sparklines and delta badges show which direction each marker is heading.
3. **Act on insights** — Filter to out-of-range markers, export a summary, and bring it to your next doctor visit with full context.

---

## Development

See [CLAUDE.md](CLAUDE.md) for project structure and conventions.

---

## License

MIT
