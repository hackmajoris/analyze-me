package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	dbPath := filepath.Join("data", "blood_tests.db")
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	// Define normalization mappings: old test_name -> (canonical_test_name, canonical_test_code)
	normalizationMap := map[string][2]string{
		// Cholesterol Total
		"COLESTEROL":       {"COLESTEROL TOTAL", "COL"},
		"COLESTEROL TOTAL": {"COLESTEROL TOTAL", "COL"},
		"Colesterol total": {"COLESTEROL TOTAL", "COL"},

		// Cholesterol LDL
		"Colesterol LDL": {"COLESTEROL LDL", "LDL"},
		"LDL COLESTEROL": {"COLESTEROL LDL", "LDL"},

		// Cholesterol HDL
		"Colesterol HDL": {"COLESTEROL HDL", "HDL"},
		"COLESTEROL HDL": {"COLESTEROL HDL", "HDL"},
		"HDL COLESTEROL": {"COLESTEROL HDL", "HDL"},
		"HDLCOLESTEROL":  {"COLESTEROL HDL", "HDL"},

		// Cholesterol VLDL
		"Colesterol VLDL (calculat)": {"COLESTEROL VLDL", "VLDL"},
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	for oldName, canonical := range normalizationMap {
		canonicalName := canonical[0]
		canonicalCode := canonical[1]

		query := `UPDATE test_results SET test_name = ?, test_code = ? WHERE test_name = ?`
		result, err := tx.Exec(query, canonicalName, canonicalCode, oldName)
		if err != nil {
			return fmt.Errorf("update %s: %w", oldName, err)
		}

		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("rows affected for %s: %w", oldName, err)
		}

		if rowsAffected > 0 {
			fmt.Printf("✓ Updated %d rows: '%s' → '%s' (code: %s)\n", rowsAffected, oldName, canonicalName, canonicalCode)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}

	// Verify the changes
	fmt.Println("\n=== Verification ===")
	query := `SELECT test_code, test_name, COUNT(*) as count FROM test_results
	          WHERE test_name LIKE '%COLESTEROL%' OR test_name LIKE '%Colesterol%'
	          GROUP BY test_code, test_name ORDER BY test_name`

	rows, err := db.Query(query)
	if err != nil {
		return fmt.Errorf("verify query: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var code, name string
		var count int
		if err := rows.Scan(&code, &name, &count); err != nil {
			return fmt.Errorf("scan result: %w", err)
		}
		fmt.Printf("  %s | %s: %d entries\n", code, name, count)
	}

	return rows.Err()
}
