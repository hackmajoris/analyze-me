.PHONY: build serve dev test lint fmt clean generate web-dev web-build up down logs ps \
        electron-install electron-run electron-mac electron-dist electron-reset

APP := server
BIN := .bin/$(APP)

build: web-build
	go build -ldflags="-s -w" -o $(BIN) ./cmd/$(APP)

serve: build
	$(BIN)

test:
	go test -race -cover ./...

lint:
	golangci-lint run ./...

fmt:
	gofmt -w .
	goimports -w .

clean:
	rm -rf .bin/ web/dist/ pkg/web/dist/

generate:
	go generate ./...

dev: build
	npx --prefix web concurrently \
		--names "server,web" \
		--prefix-colors "cyan.bold,green.bold" \
		--kill-others-on-fail \
		"$(BIN)" \
		"cd web && npm run dev"

web-dev:
	cd web && npm run dev

web-build:
	cd web && npm ci && npm run build
	cp -r web/dist pkg/web/dist

electron-install:
	cd electron && npm install

electron/bin/server: build
	@mkdir -p electron/bin
	cp $(BIN) electron/bin/server
	codesign --sign - --force electron/bin/server

electron-reset:
	rm -f "$(HOME)/Library/Application Support/analyze-me/config.json" \
	      "$(HOME)/Library/Application Support/analyze-me/db.key.enc"

electron-run: electron/bin/server
	cd electron && npx electron .

electron-mac: electron/bin/server
	cd electron && npx electron-builder --mac dmg

electron-dist: electron/bin/server
	cd electron && npx electron-builder

up:
	./run.sh up -d

down:
	./run.sh down

logs:
	./run.sh logs -f

ps:
	./run.sh ps
