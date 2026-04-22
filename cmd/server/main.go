package main

import (
	"database/sql"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"

	"github.com/hackmajoris/analyze-me/pkg/bloodtest"
	"github.com/hackmajoris/analyze-me/pkg/upload"
	"github.com/hackmajoris/analyze-me/pkg/web"
	_ "github.com/mattn/go-sqlite3"
)

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		_, err := fmt.Fprintf(os.Stderr, "error: %v\n", err)
		if err != nil {
			return
		}
		os.Exit(1)
	}
}

func run(args []string, out io.Writer) error {
	// DB_PATH env var overrides default (used in Docker / non-macOS).
	// Falls back to iCloud Drive for local macOS installs.
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return fmt.Errorf("get home dir: %w", err)
		}
		dbDir := filepath.Join(home, "Library", "Mobile Documents", "com~apple~CloudDocs", "AnalyzeMe")
		if err := os.MkdirAll(dbDir, 0o755); err != nil {
			return fmt.Errorf("create db dir: %w", err)
		}
		dbPath = filepath.Join(dbDir, "blood_tests.db")
	} else {
		if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
			return fmt.Errorf("create db dir: %w", err)
		}
	}
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func(db *sql.DB) {
		err := db.Close()
		if err != nil {
			_, err := fmt.Fprintf(os.Stderr, "error closing database: %v\n", err)
			if err != nil {
				return
			}
		}
	}(db)

	// Test connection
	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	// Auto-migrate: user-defined marker definitions
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS markers (
		code        TEXT PRIMARY KEY,
		name        TEXT NOT NULL DEFAULT '',
		unit        TEXT NOT NULL DEFAULT '',
		category    TEXT NOT NULL DEFAULT '',
		ref_min     REAL,
		ref_max     REAL,
		description TEXT NOT NULL DEFAULT '',
		value_type  TEXT NOT NULL DEFAULT 'numeric'
	)`); err != nil {
		return fmt.Errorf("migrate markers table: %w", err)
	}

	// Wire up blood test service
	store := bloodtest.NewStore(db)
	handler := bloodtest.NewHandler(store)
	uploadHandler := upload.NewHandler()

	// Register API routes
	mux := http.NewServeMux()
	mux.HandleFunc("/api/markers", handler.HandleMarkers)
	mux.HandleFunc("/api/categories", handler.HandleGetCategories)
	mux.HandleFunc("/api/annotations", handler.HandleGetAnnotations)
	mux.HandleFunc("/api/labs", handler.HandleGetLabs)
	mux.HandleFunc("/api/readings", handler.HandleReadings)
	mux.HandleFunc("/api/upload/zip", uploadHandler.HandleUploadZip)

	// Serve web app (SPA fallback)
	mux.Handle("/", web.Handler())

	// Start server
	const port = ":8080"
	listener, err := net.Listen("tcp", port)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}

	_, err = fmt.Fprintf(out, "Server running on http://localhost%s\n", port)
	if err != nil {
		return err
	}
	return http.Serve(listener, mux)
}
