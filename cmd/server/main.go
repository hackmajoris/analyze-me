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
	"github.com/hackmajoris/analyze-me/pkg/web"
	_ "github.com/mattn/go-sqlite3"
)

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string, out io.Writer) error {
	// Open database
	dbPath := filepath.Join("data", "blood_tests.db")
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	// Test connection
	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	// Wire up blood test service
	store := bloodtest.NewStore(db)
	handler := bloodtest.NewHandler(store)

	// Register API routes
	mux := http.NewServeMux()
	mux.HandleFunc("/api/markers", handler.HandleGetMarkers)
	mux.HandleFunc("/api/categories", handler.HandleGetCategories)
	mux.HandleFunc("/api/annotations", handler.HandleGetAnnotations)
	mux.HandleFunc("/api/labs", handler.HandleGetLabs)

	// Serve web app (SPA fallback)
	mux.Handle("/", web.Handler())

	// Start server
	const port = ":8080"
	listener, err := net.Listen("tcp", port)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}

	fmt.Fprintf(out, "Server running on http://localhost%s\n", port)
	return http.Serve(listener, mux)
}
