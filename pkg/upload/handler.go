package upload

import (
	"archive/zip"
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Handler serves upload endpoints.
type Handler struct{}

// NewHandler creates a new Handler.
func NewHandler() *Handler {
	return &Handler{}
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

	// Pipe combined stdout+stderr so we can scan line by line.
	pr, pw := io.Pipe()
	cmd := exec.Command("python3", filepath.Join("data", "extract.py"), pdfDir)
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
	}
	finish(runErr == nil)
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
