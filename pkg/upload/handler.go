package upload

import (
	"archive/zip"
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/hackmajoris/analyze-me/pkg/bloodtest"
	_ "github.com/mutecomm/go-sqlcipher/v4"
)

// Handler serves upload endpoints.
type Handler struct {
	store  *bloodtest.Store
	dbPath string
	dbKey  string
}

// NewHandler creates a new Handler. dbPath and dbKey are used to merge the
// plaintext DB written by extract.py into the encrypted main DB.
func NewHandler(store *bloodtest.Store, dbPath, dbKey string) *Handler {
	return &Handler{store: store, dbPath: dbPath, dbKey: dbKey}
}

type sseEvent struct {
	Type    string `json:"type"`
	Line    string `json:"line,omitempty"`
	Success *bool  `json:"success,omitempty"`
}

// HandleUploadZip accepts a multipart ZIP upload, extracts PDFs,
// streams extract.py output via SSE, then deletes the temp directory.
func (h *Handler) HandleUploadZip(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Connection", "keep-alive")

	emit := func(line string) {
		b, _ := json.Marshal(sseEvent{Type: "log", Line: line})
		fmt.Fprintf(w, "data: %s\n\n", b)
		flusher.Flush()
	}
	finish := func(success bool) {
		b, _ := json.Marshal(sseEvent{Type: "done", Success: &success})
		fmt.Fprintf(w, "data: %s\n\n", b)
		flusher.Flush()
	}

	const maxBytes = 128 << 20 // 128 MB
	if err := r.ParseMultipartForm(maxBytes); err != nil {
		emit("Error: cannot parse form: " + err.Error())
		finish(false)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		emit("Error: missing 'file' field")
		finish(false)
		return
	}
	defer file.Close()
	emit(fmt.Sprintf("Received: %s", header.Filename))

	// Write ZIP to a temp directory.
	tmpDir, err := os.MkdirTemp("", "analyze-upload-*")
	if err != nil {
		emit("Error: cannot create temp dir: " + err.Error())
		finish(false)
		return
	}
	defer os.RemoveAll(tmpDir)

	zipPath := filepath.Join(tmpDir, "upload.zip")
	if err := writeFile(zipPath, file); err != nil {
		emit("Error: cannot save zip: " + err.Error())
		finish(false)
		return
	}

	// Extract PDFs from ZIP.
	pdfDir := filepath.Join(tmpDir, "pdfs")
	if err := os.MkdirAll(pdfDir, 0o755); err != nil {
		emit("Error: cannot create pdf dir: " + err.Error())
		finish(false)
		return
	}

	n, err := extractPDFs(zipPath, pdfDir)
	if err != nil {
		emit("Error extracting ZIP: " + err.Error())
		finish(false)
		return
	}
	emit(fmt.Sprintf("Extracted %d PDF file(s) from ZIP.", n))

	if n == 0 {
		emit("No PDF files found inside the ZIP — nothing to import.")
		finish(false)
		return
	}

	emit("Running extractor…")

	// Extract.py writes to a temp plaintext SQLite file; we merge it into the
	// encrypted main DB afterwards. This preserves the script's existing
	// sqlite3-only DB path without needing pysqlcipher3 in the image.
	scratchDB := filepath.Join(tmpDir, "extract.db")

	// Pipe combined stdout+stderr so we can scan line by line.
	pr, pw := io.Pipe()
	cmd := exec.Command("python3", filepath.Join("data", "extract.py"), pdfDir)
	cmd.Env = append(os.Environ(), "DB_PATH="+scratchDB)
	cmd.Stdout = pw
	cmd.Stderr = pw

	if err := cmd.Start(); err != nil {
		pw.Close()
		pr.Close()
		emit("Error starting extract.py: " + err.Error())
		finish(false)
		return
	}

	// Close the write end once the process exits.
	waitCh := make(chan error, 1)
	go func() {
		waitCh <- cmd.Wait()
		pw.Close()
	}()

	// Stream output lines to the client.
	scanner := bufio.NewScanner(pr)
	for scanner.Scan() {
		emit(scanner.Text())
	}
	pr.Close()

	runErr := <-waitCh
	if runErr != nil {
		emit("extract.py error: " + runErr.Error())
		finish(false)
		return
	}

	// Merge scratch DB → encrypted main DB.
	if _, statErr := os.Stat(scratchDB); statErr != nil {
		emit("Extractor produced no database (nothing to import).")
		finish(true)
		return
	}
	reports, results, mergeErr := h.mergeScratch(scratchDB)
	if mergeErr != nil {
		emit("Error merging into main DB: " + mergeErr.Error())
		finish(false)
		return
	}
	emit(fmt.Sprintf("Imported %d report(s) and %d test result(s) into main DB.", reports, results))
	finish(true)
}

// mergeScratch copies rows from a plaintext SQLite DB written by extract.py
// into the encrypted main DB. It preserves idempotency: reports are matched
// by sample_id (reused if present) and test_results use INSERT OR IGNORE
// against the (report_id, test_name) unique index.
func (h *Handler) mergeScratch(scratchPath string) (int, int, error) {
	mainDB, err := sql.Open("sqlite3", buildDSN(h.dbPath, h.dbKey))
	if err != nil {
		return 0, 0, fmt.Errorf("open main db: %w", err)
	}
	defer mainDB.Close()
	mainDB.SetMaxOpenConns(1) // pin ATTACH to one session

	attachSQL := fmt.Sprintf(`ATTACH DATABASE '%s' AS plain KEY ''`, sqlEscape(scratchPath))
	if _, err := mainDB.Exec(attachSQL); err != nil {
		return 0, 0, fmt.Errorf("attach scratch: %w", err)
	}
	defer mainDB.Exec(`DETACH DATABASE plain`)

	tx, err := mainDB.Begin()
	if err != nil {
		return 0, 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	rows, err := tx.Query(`SELECT id, collection_date, lab_name, sample_id FROM plain.reports`)
	if err != nil {
		return 0, 0, fmt.Errorf("select scratch reports: %w", err)
	}

	type scratchReport struct {
		oldID          int64
		collectionDate sql.NullString
		labName        sql.NullString
		sampleID       sql.NullString
	}
	var pending []scratchReport
	for rows.Next() {
		var r scratchReport
		if err := rows.Scan(&r.oldID, &r.collectionDate, &r.labName, &r.sampleID); err != nil {
			rows.Close()
			return 0, 0, fmt.Errorf("scan scratch report: %w", err)
		}
		pending = append(pending, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, 0, fmt.Errorf("iterate scratch reports: %w", err)
	}

	reportsImported := 0
	resultsImported := 0

	for _, r := range pending {
		var newID int64
		err := tx.QueryRow(`SELECT id FROM reports WHERE sample_id = ?`, r.sampleID).Scan(&newID)
		if err == sql.ErrNoRows {
			res, insErr := tx.Exec(
				`INSERT INTO reports (collection_date, lab_name, sample_id) VALUES (?, ?, ?)`,
				r.collectionDate, r.labName, r.sampleID,
			)
			if insErr != nil {
				return reportsImported, resultsImported, fmt.Errorf("insert report: %w", insErr)
			}
			newID, _ = res.LastInsertId()
			reportsImported++
		} else if err != nil {
			return reportsImported, resultsImported, fmt.Errorf("lookup report by sample_id: %w", err)
		}

		res, err := tx.Exec(`
			INSERT OR IGNORE INTO test_results
				(report_id, category, test_name, test_code,
				 result_numeric, result_text, expected_text, unit,
				 ref_min, ref_max, is_flagged)
			SELECT ?, category, test_name, test_code,
			       result_numeric, result_text, expected_text, unit,
			       ref_min, ref_max, is_flagged
			FROM plain.test_results
			WHERE report_id = ?`,
			newID, r.oldID,
		)
		if err != nil {
			return reportsImported, resultsImported, fmt.Errorf("copy test_results: %w", err)
		}
		n, _ := res.RowsAffected()
		resultsImported += int(n)
	}

	if err := tx.Commit(); err != nil {
		return reportsImported, resultsImported, fmt.Errorf("commit: %w", err)
	}
	return reportsImported, resultsImported, nil
}

// buildDSN mirrors cmd/server/main.go's buildDSN. Empty key opens plaintext.
func buildDSN(dbPath, key string) string {
	if key == "" {
		return dbPath
	}
	return "file:" + url.PathEscape(dbPath) +
		"?_pragma_key=" + url.QueryEscape(key) +
		"&_pragma_cipher_page_size=4096"
}

func sqlEscape(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

// extractPDFs unpacks only .pdf files from src ZIP into destDir.
func extractPDFs(src, destDir string) (int, error) {
	r, err := zip.OpenReader(src)
	if err != nil {
		return 0, fmt.Errorf("open zip: %w", err)
	}
	defer r.Close()

	destBase := filepath.Clean(destDir) + string(os.PathSeparator)
	count := 0

	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		base := filepath.Base(f.Name)
		if !strings.HasSuffix(strings.ToLower(base), ".pdf") {
			continue
		}

		dest := filepath.Join(filepath.Clean(destDir), base)
		// Guard against path traversal.
		if !strings.HasPrefix(dest+string(os.PathSeparator), destBase) {
			continue
		}

		rc, err := f.Open()
		if err != nil {
			return count, fmt.Errorf("open entry %s: %w", f.Name, err)
		}
		writeErr := writeFile(dest, rc)
		rc.Close()
		if writeErr != nil {
			return count, fmt.Errorf("write %s: %w", base, writeErr)
		}
		count++
	}
	return count, nil
}

func writeFile(path string, r io.Reader) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	_, cpErr := io.Copy(f, r)
	closeErr := f.Close()
	if cpErr != nil {
		return cpErr
	}
	return closeErr
}
