APP := server
BIN := .bin/$(APP)

# Optional per-machine overrides (gitignored), e.g.:
#   COMPOSE_FILE := docker-compose-local.yml
-include Makefile-local

# Compose file used by up/down/logs/ps; docker compose reads it from the env.
COMPOSE_FILE ?= docker-compose.yml
export COMPOSE_FILE

.DEFAULT_GOAL := help

.PHONY: help build serve dev test lint fmt clean generate \
        web-dev web-build site-dev \
        up down restart logs ps \
        electron-install electron-run electron-reset electron-mac electron-win electron-linux electron-dist

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ── Go ──────────────────────────────────────────

build: web-build ## Build Go binary (includes frontend)
	go build -ldflags="-s -w" -o $(BIN) ./cmd/$(APP)

serve: build ## Build and run the server
	$(BIN)

test: ## Run Go tests with race detector
	go test -race -cover ./...

lint: ## Run golangci-lint
	golangci-lint run ./...

fmt: ## Format Go code
	gofmt -w .
	goimports -w .

generate: ## Run go generate
	go generate ./...

clean: ## Remove build output
	rm -rf .bin/ web/dist/ pkg/web/dist/

# ── Frontend ────────────────────────────────────

web-build: ## Build frontend and copy into pkg/web for embedding
	cd web && npm ci && npm run build
	rm -rf pkg/web/dist
	cp -r web/dist pkg/web/dist

web-dev: ## Frontend dev server (proxies /api to :8080)
	cd web && npm run dev

site-dev: ## Marketing site dev server
	cd site && npm run dev

dev: build ## Run backend + frontend dev server together
	@mkdir -p data
	npx --prefix web concurrently \
		--names "server,web" \
		--prefix-colors "cyan.bold,green.bold" \
		--kill-others-on-fail \
		"DB_PATH=data/blood_tests.db $(BIN)" \
		"cd web && npm run dev"

# ── Docker ──────────────────────────────────────

up: ## Build image and start container
	./run.sh up -d --build

down: ## Stop container
	./run.sh down

restart: down up ## Rebuild and restart container

logs: ## Follow container logs
	./run.sh logs -f

ps: ## Show container status
	./run.sh ps

# ── Electron ────────────────────────────────────

electron-install: ## Install Electron dependencies
	cd electron && npm install

electron/bin/server: build
	@mkdir -p electron/bin
	cp $(BIN) electron/bin/server
	codesign --sign - --force electron/bin/server

electron-run: electron/bin/server ## Run Electron app
	cd electron && npx electron .

electron-reset: ## Remove Electron config and stored key
	rm -f "$(HOME)/Library/Application Support/analyze-me/config.json" \
	      "$(HOME)/Library/Application Support/analyze-me/db.key.enc"

electron-mac: electron/bin/server ## Build macOS DMG
	cd electron && npx electron-builder --mac dmg

electron-win: web-build ## Build Windows installer (run on Windows)
	@mkdir -p electron/bin
	go build -ldflags="-s -w" -o electron/bin/server.exe ./cmd/server
	cd electron && npx electron-builder --win nsis

electron-linux: web-build ## Build Linux AppImage (run on Linux)
	@mkdir -p electron/bin
	go build -ldflags="-s -w" -o electron/bin/server ./cmd/server
	cd electron && npx electron-builder --linux AppImage

electron-dist: electron/bin/server ## Build Electron app for current platform
	cd electron && npx electron-builder
