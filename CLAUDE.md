# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# analyze-me

## Module
`github.com/hackmajoris/analyze-me`

## Structure
- `cmd/server/` — single binary entry point; keep thin, wire into `pkg/`
- `pkg/` — all business logic; each package independently testable
- `pkg/web/` — embeds `web/dist/` and exposes `http.Handler` for the SPA
- `web/` — React + Vite + TypeScript frontend; `npm run build` outputs to `web/dist/`

## Prerequisites
- Go 1.22+
- Node 20+
- `golangci-lint` (for `make lint`)

## Commands

```bash
make build        # build Go binary (also runs web-build)
make test         # go test -race -cover ./...
make lint         # golangci-lint run ./...
make fmt          # gofmt + goimports
make web-dev      # frontend dev server (proxies /api to localhost:8080)
make web-build    # npm ci && npm run build → web/dist/
make clean        # rm -rf .bin/ web/dist/
make generate     # go generate ./...
```

Run a single Go test:
```bash
go test -run TestName ./pkg/example/
```

## Adding a New Package
1. Create `pkg/<n>/`
2. Define the main type and a `New()` constructor with functional options
3. Add `mocks/` sub-package if the package exposes an interface used by others
4. Add `<n>_test.go` using the `_test` package suffix

## Adding a New API Endpoint
1. Add handler in `pkg/<feature>/handler.go`
2. Register route under `/api/` in `cmd/server/main.go`
3. Add corresponding `api.<method>()` call in `web/src/lib/api.ts`

## Frontend
- React 18 + TypeScript 5 + Vite 6
- `web/src/lib/api.ts` — typed HTTP client; use `api.get<T>()`, `api.post<T>()`, etc.
- Dev server runs on `:5173` and proxies `/api/*` to `:8080` (Go server)
- Built output in `web/dist/` is embedded into the Go binary via `pkg/web/` (`//go:embed all:dist`)

## Conventions
- Functional options: `type Option func(*Client)`
- Sentinel errors: `var ErrNotFound = errors.New("not found")`
- Wrap errors: `fmt.Errorf("doing X: %w", err)`
- `main()` calls `run(args, out)` — keeps entry point testable
- Prefer table-driven tests; fixtures go in `testdata/`
