package main

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/hackmajoris/analyze-me/pkg/bloodtest"
	"github.com/hackmajoris/analyze-me/pkg/upload"
	"github.com/hackmajoris/analyze-me/pkg/web"
	_ "github.com/mutecomm/go-sqlcipher/v4"
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

	// DB_KEY enables SQLCipher AES-256 encryption. When set on an existing
	// plaintext database, it is migrated in-place on first startup.
	dbKey := os.Getenv("DB_KEY")
	if dbKey != "" {
		if err := maybeEncryptExisting(dbPath, dbKey, out); err != nil {
			return fmt.Errorf("encrypt existing db: %w", err)
		}
	}

	db, err := sql.Open("sqlite3", buildDSN(dbPath, dbKey))
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
		return fmt.Errorf("ping database (wrong DB_KEY?): %w", err)
	}

	// Auto-migrate: core tables (safe to run on every startup)
	migrations := []struct {
		name string
		sql  string
	}{
		{"reports", `CREATE TABLE IF NOT EXISTS reports (
			id              INTEGER PRIMARY KEY AUTOINCREMENT,
			collection_date TEXT,
			lab_name        TEXT,
			sample_id       TEXT
		)`},
		{"test_results", `CREATE TABLE IF NOT EXISTS test_results (
			id             INTEGER PRIMARY KEY AUTOINCREMENT,
			report_id      INTEGER REFERENCES reports(id),
			category       TEXT,
			test_name      TEXT,
			test_code      TEXT,
			result_numeric REAL,
			result_text    TEXT,
			unit           TEXT,
			ref_min        REAL,
			ref_max        REAL,
			is_flagged     INTEGER DEFAULT 0,
			UNIQUE(report_id, test_name)
		)`},
		{"markers", `CREATE TABLE IF NOT EXISTS markers (
			code        TEXT PRIMARY KEY,
			name        TEXT NOT NULL DEFAULT '',
			unit        TEXT NOT NULL DEFAULT '',
			category    TEXT NOT NULL DEFAULT '',
			ref_min     REAL,
			ref_max     REAL,
			description TEXT NOT NULL DEFAULT '',
			value_type  TEXT NOT NULL DEFAULT 'numeric'
		)`},
	}
	for _, m := range migrations {
		if _, err := db.Exec(m.sql); err != nil {
			return fmt.Errorf("migrate %s table: %w", m.name, err)
		}
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

	// Start server — PORT env selects the port; 0 lets the OS pick a free one.
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	listener, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}

	_, err = fmt.Fprintf(out, "Server running on http://localhost:%d\n", listener.Addr().(*net.TCPAddr).Port)
	if err != nil {
		return err
	}
	return http.Serve(listener, mux)
}

// buildDSN returns a SQLite/SQLCipher connection string. When key is empty the
// database is opened without encryption (backwards-compatible).
func buildDSN(dbPath, key string) string {
	if key == "" {
		return dbPath
	}
	return "file:" + url.PathEscape(dbPath) +
		"?_pragma_key=" + url.QueryEscape(key) +
		"&_pragma_cipher_page_size=4096"
}

// sqlLiteral escapes a string for use as a SQL single-quoted literal.
func sqlLiteral(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

// maybeEncryptExisting detects a plaintext database at dbPath and migrates it
// to SQLCipher in-place using sqlcipher_export(). The original file is
// preserved as dbPath+".bak". It is a no-op when the file does not exist or is
// already encrypted with the given key.
func maybeEncryptExisting(dbPath, key string, out io.Writer) error {
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		return nil // new database — will be created encrypted
	}

	// Probe: can we open the file with the key already?
	enc, err := sql.Open("sqlite3", buildDSN(dbPath, key))
	if err != nil {
		return err
	}
	pingErr := enc.Ping()
	enc.Close()
	if pingErr == nil {
		return nil // already encrypted with this key
	}

	// Probe: is it a valid plaintext SQLite file?
	plain, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return err
	}
	if err := plain.Ping(); err != nil {
		plain.Close()
		return fmt.Errorf("db is neither plaintext nor decryptable with the given DB_KEY: %w", err)
	}

	fmt.Fprintln(out, "info: migrating database to encrypted format...")

	encPath := dbPath + ".enc"

	// Pin to one connection so ATTACH/export/DETACH share the same session.
	plain.SetMaxOpenConns(1)
	ctx := context.Background()
	conn, err := plain.Conn(ctx)
	if err != nil {
		plain.Close()
		return fmt.Errorf("acquire db connection: %w", err)
	}

	attachSQL := fmt.Sprintf(
		`ATTACH DATABASE '%s' AS enc KEY '%s'`,
		sqlLiteral(encPath), sqlLiteral(key),
	)
	_, err = conn.ExecContext(ctx, attachSQL)
	if err == nil {
		_, err = conn.ExecContext(ctx, `SELECT sqlcipher_export('enc')`)
	}
	if err == nil {
		_, err = conn.ExecContext(ctx, `DETACH DATABASE enc`)
	}
	conn.Close()
	plain.Close()

	if err != nil {
		_ = os.Remove(encPath)
		return fmt.Errorf("export to encrypted db: %w", err)
	}

	if err = os.Rename(dbPath, dbPath+".bak"); err != nil {
		_ = os.Remove(encPath)
		return fmt.Errorf("backup original db: %w", err)
	}
	if err = os.Rename(encPath, dbPath); err != nil {
		_ = os.Rename(dbPath+".bak", dbPath) // restore on failure
		return fmt.Errorf("replace with encrypted db: %w", err)
	}

	fmt.Fprintf(out, "info: migration done; original backed up at %s.bak\n", dbPath)
	return nil
}
