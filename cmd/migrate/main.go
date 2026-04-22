package main

import (
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"regexp"
	"strings"

	_ "github.com/mutecomm/go-sqlcipher/v4"
)

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string, out io.Writer) error {
	db, err := sql.Open("sqlite3", "data/blood_tests.db")
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	// Find all tests with NULL test_code but with test_name
	rows, err := db.Query(`
		SELECT DISTINCT test_name
		FROM test_results
		WHERE test_code IS NULL AND test_name IS NOT NULL
		ORDER BY test_name
	`)
	if err != nil {
		return fmt.Errorf("query test names: %w", err)
	}
	defer rows.Close()

	var testNames []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return fmt.Errorf("scan test name: %w", err)
		}
		testNames = append(testNames, name)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("rows error: %w", err)
	}

	fmt.Fprintf(out, "Found %d unique test names without codes\n", len(testNames))

	// Generate codes and update
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	updated := 0
	for _, testName := range testNames {
		code := generateTestCode(testName)

		// Check if this code already exists
		var exists int
		err := tx.QueryRow(`SELECT COUNT(*) FROM test_results WHERE test_code = ? AND test_code IS NOT NULL`, code).Scan(&exists)
		if err != nil {
			return fmt.Errorf("check code existence: %w", err)
		}

		if exists > 0 {
			// Code already exists, use the existing one
			fmt.Fprintf(out, "%-50s -> %-15s (existing)\n", testName, code)
		} else {
			// Generate a unique code
			code = makeUniqueCode(tx, code)
			fmt.Fprintf(out, "%-50s -> %-15s (new)\n", testName, code)
		}

		// Update all test_results with this test_name to have this code
		res, err := tx.Exec(`UPDATE test_results SET test_code = ? WHERE test_name = ? AND test_code IS NULL`, code, testName)
		if err != nil {
			return fmt.Errorf("update test_results: %w", err)
		}

		count, err := res.RowsAffected()
		if err != nil {
			return fmt.Errorf("rows affected: %w", err)
		}
		updated += int(count)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}

	fmt.Fprintf(out, "\nUpdated %d test results with generated codes\n", updated)
	return nil
}

// generateTestCode creates a code from test name
// e.g., "ACID URIC SERIC" -> "ACID_URIC"
func generateTestCode(testName string) string {
	// Convert to uppercase and remove special chars
	name := strings.ToUpper(testName)

	// Remove special characters, keep alphanumeric and spaces
	reg := regexp.MustCompile(`[^A-Z0-9\s]`)
	name = reg.ReplaceAllString(name, "")

	// Split on spaces and take first 2 significant words
	parts := strings.Fields(name)
	if len(parts) > 2 {
		parts = parts[:2]
	}

	code := strings.Join(parts, "_")

	// Limit length to 20 chars
	if len(code) > 20 {
		code = code[:20]
	}

	return code
}

// makeUniqueCode appends a suffix if code already exists
func makeUniqueCode(tx *sql.Tx, code string) string {
	base := code
	suffix := 2

	for {
		var count int
		err := tx.QueryRow(`SELECT COUNT(*) FROM test_results WHERE test_code = ?`, code).Scan(&count)
		if err != nil {
			log.Printf("error checking code uniqueness: %v", err)
			return code
		}

		if count == 0 {
			return code
		}

		code = fmt.Sprintf("%s_%d", base, suffix)
		suffix++

		if suffix > 10 {
			// Fallback: use with random numeric suffix
			return fmt.Sprintf("%s_%d", base, suffix)
		}
	}
}
