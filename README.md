# analyze-me

> Blood test tracker — upload results, track markers over time.

## Running with Docker

The easiest way to run the app. Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

The app reads the database encryption key from macOS Keychain. Store it once before first run:

```bash
security add-generic-password -a analyze-me -s analyze-me-db-key -w "your_key"
```

Then use the Makefile targets — they retrieve the key automatically:

```bash
make up       # start containers in detached mode
make down     # stop containers
make logs     # tail container logs
make ps       # show container status
```

Open [http://localhost:8080](http://localhost:8080).

The database is read from and written to your iCloud Drive at:
`~/Library/Mobile Documents/com~apple~CloudDocs/AnalyzeMe/blood_tests.db`

---

## Running natively

### Prerequisites

- Go 1.22+
- Node 20+
- [golangci-lint](https://golangci-lint.run/)

```bash
make build        # build frontend then Go binary → .bin/server
make serve        # build and run the server
make dev          # build then run server + frontend dev server concurrently
make web-dev      # frontend dev server only (proxies /api to :8080)
make web-build    # build frontend → web/dist/ and pkg/web/dist/
make test         # go test -race -cover ./...
make lint         # golangci-lint run ./...
make fmt          # gofmt + goimports
make generate     # go generate ./...
make clean        # remove .bin/, web/dist/, pkg/web/dist/
```

## License

MIT
