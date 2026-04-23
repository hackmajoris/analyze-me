package upload

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/hackmajoris/analyze-me/pkg/bloodtest"
)

var csvTemplateHeader = []string{
	"marker_code", "marker_name", "unit", "category",
	"ref_min", "ref_max", "value_type",
	"date", "value", "value_text", "lab",
}

var csvTemplateExamples = [][]string{
	// marker_code, marker_name, unit, category, ref_min, ref_max, value_type, date, value, value_text, lab
	{"GLUCOZA", "Glucose", "mg/dL", "Biochimie", "70", "100", "numeric", "2024-01-15", "85.5", "", "Synevo"},
	{"HGB", "Hemoglobin", "g/dL", "Hematologie", "12", "17.5", "numeric", "2024-01-15", "14.2", "", "Synevo"},
	{"TSH", "TSH", "mIU/L", "Hormonologie", "0.4", "4.0", "numeric", "2024-01-15", "2.1", "", "Regina Maria"},
	// Marker-only row (no reading): leave date, value, value_text, lab empty
	{"VLDL", "VLDL Cholesterol", "mg/dL", "Biochimie", "5", "40", "numeric", "", "", "", ""},
	// Text-result reading
	{"SARS_COV2_AG", "SARS-CoV-2 Antigen", "", "Imunologie", "", "", "text", "2024-03-01", "", "Negativ", "Synevo"},
}

// HandleCSVTemplate responds with a downloadable CSV template that shows
// the expected columns and a few example rows.
func (h *Handler) HandleCSVTemplate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="markers_template.csv"`)

	cw := csv.NewWriter(w)
	_ = cw.Write(csvTemplateHeader)
	for _, row := range csvTemplateExamples {
		_ = cw.Write(row)
	}
	cw.Flush()
}

type csvImportResult struct {
	Imported int      `json:"imported"`
	Errors   []string `json:"errors"`
}

// HandleCSVImport reads a multipart-uploaded CSV file and creates or updates
// markers and readings for each row.
func (h *Handler) HandleCSVImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	const maxBytes = 16 << 20 // 16 MB
	if err := r.ParseMultipartForm(maxBytes); err != nil {
		http.Error(w, "cannot parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "missing 'file' field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	cr := csv.NewReader(file)
	cr.TrimLeadingSpace = true

	rows, err := cr.ReadAll()
	if err != nil {
		http.Error(w, "invalid CSV: "+err.Error(), http.StatusBadRequest)
		return
	}

	result := csvImportResult{Errors: []string{}}

	if len(rows) == 0 {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
		return
	}

	// Build column index from the header row (case-insensitive).
	colIdx := make(map[string]int, len(rows[0]))
	for i, h := range rows[0] {
		colIdx[strings.ToLower(strings.TrimSpace(h))] = i
	}

	get := func(row []string, col string) string {
		idx, ok := colIdx[col]
		if !ok || idx >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[idx])
	}

	parseOptFloat := func(s string) *float64 {
		if s == "" {
			return nil
		}
		v, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return nil
		}
		return &v
	}

	for i, row := range rows[1:] {
		lineNum := i + 2 // 1-based; header is line 1
		code := get(row, "marker_code")
		if code == "" {
			continue
		}

		vt := get(row, "value_type")
		if vt == "" {
			vt = "numeric"
		}

		markerReq := bloodtest.CreateMarkerRequest{
			Code:      code,
			Name:      get(row, "marker_name"),
			Unit:      get(row, "unit"),
			Category:  get(row, "category"),
			RefMin:    parseOptFloat(get(row, "ref_min")),
			RefMax:    parseOptFloat(get(row, "ref_max")),
			ValueType: vt,
		}
		if _, err := h.store.CreateOrUpdateMarker(markerReq); err != nil {
			result.Errors = append(result.Errors,
				fmt.Sprintf("line %d: marker %q: %v", lineNum, code, err))
			continue
		}
		result.Imported++

		// Add a reading only when a date is provided.
		date := get(row, "date")
		if date == "" {
			continue
		}

		valueStr := get(row, "value")
		var numValue *float64
		if valueStr != "" {
			v, err := strconv.ParseFloat(valueStr, 64)
			if err != nil {
				result.Errors = append(result.Errors,
					fmt.Sprintf("line %d: invalid value %q for %s: %v", lineNum, valueStr, code, err))
				continue
			}
			numValue = &v
		}

		readingReq := bloodtest.AddReadingRequest{
			MarkerCode: code,
			Date:       date,
			Value:      numValue,
			ValueText:  get(row, "value_text"),
			Lab:        get(row, "lab"),
		}
		if err := h.store.AddReading(readingReq); err != nil {
			result.Errors = append(result.Errors,
				fmt.Sprintf("line %d: reading for %s on %s: %v", lineNum, code, date, err))
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}
