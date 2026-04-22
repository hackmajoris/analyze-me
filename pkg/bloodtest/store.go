package bloodtest

import (
	"database/sql"
	"fmt"
	"sort"
	"time"
)

func nullFloat(n sql.NullFloat64) *float64 {
	if !n.Valid {
		return nil
	}
	v := n.Float64
	return &v
}

// Store provides data access to blood test records
type Store struct {
	db *sql.DB
}

// NewStore creates a new Store
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// GetMarkers retrieves all markers with their historical values
func (s *Store) GetMarkers() ([]Marker, error) {
	query := `
		SELECT DISTINCT
			test_code,
			test_name,
			unit,
			category,
			ref_min,
			ref_max
		FROM test_results
		WHERE (result_numeric IS NOT NULL OR result_text IS NOT NULL)
		  AND test_name NOT IN ('Sex', 'Centrul Medical Unirea SRL')
		ORDER BY category, test_name
	`

	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query markers: %w", err)
	}
	defer rows.Close()

	markers := []Marker{}
	testCodeMap := make(map[string]*Marker)

	// First pass: get marker definitions
	for rows.Next() {
		var code, name, unit, category sql.NullString
		var refMin, refMax sql.NullFloat64

		if err := rows.Scan(&code, &name, &unit, &category, &refMin, &refMax); err != nil {
			return nil, fmt.Errorf("scan marker: %w", err)
		}

		// Skip if test_code is null
		if !code.Valid {
			continue
		}

		m := &Marker{
			ID:       code.String,
			Name:     name.String,
			Short:    code.String,
			Unit:     unit.String,
			Category: category.String,
			RefLow:   nullFloat(refMin),
			RefHigh:  nullFloat(refMax),
			Values:   []DataPoint{},
		}
		// Only add to markers slice if this is the first time we've seen this test code
		if _, exists := testCodeMap[code.String]; !exists {
			markers = append(markers, *m)
		}
		testCodeMap[code.String] = m
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	// Second pass: get all values per report (preserving lab and per-entry ref ranges)
	valueQuery := `
		SELECT
			tr.test_code,
			r.collection_date,
			r.lab_name,
			COALESCE(AVG(tr.result_numeric), 0) as avg_value,
			AVG(tr.ref_min) as avg_ref_min,
			AVG(tr.ref_max) as avg_ref_max,
			MAX(tr.result_text) as result_text,
			MAX(tr.expected_text) as expected_text,
			MAX(CASE WHEN tr.result_numeric IS NOT NULL THEN 1 ELSE 0 END) as has_numeric,
			MAX(tr.is_flagged) as is_flagged
		FROM test_results tr
		JOIN reports r ON tr.report_id = r.id
		WHERE tr.result_numeric IS NOT NULL OR tr.result_text IS NOT NULL
		GROUP BY tr.test_code, r.id, r.collection_date, r.lab_name
		ORDER BY tr.test_code, r.collection_date
	`

	valueRows, err := s.db.Query(valueQuery)
	if err != nil {
		return nil, fmt.Errorf("query values: %w", err)
	}
	defer valueRows.Close()

	for valueRows.Next() {
		var code, date, lab, resultText, expectedText sql.NullString
		var value float64
		var hasNumeric, isFlagged int
		var refMin, refMax sql.NullFloat64

		if err := valueRows.Scan(&code, &date, &lab, &value, &refMin, &refMax, &resultText, &expectedText, &hasNumeric, &isFlagged); err != nil {
			return nil, fmt.Errorf("scan value: %w", err)
		}

		if !code.Valid || !date.Valid {
			continue
		}

		if marker, ok := testCodeMap[code.String]; ok {
			// Only include numeric value if we have actual numeric data
			var dataValue float64
			if hasNumeric == 1 {
				dataValue = value
			}
			marker.Values = append(marker.Values, DataPoint{
				Date:         date.String,
				Value:        dataValue,
				Lab:          lab.String,
				RefLow:       nullFloat(refMin),
				RefHigh:      nullFloat(refMax),
				Label:        resultText.String,
				ExpectedText: expectedText.String,
				Flagged:      isFlagged == 1,
			})
		}
	}

	if err := valueRows.Err(); err != nil {
		return nil, fmt.Errorf("values rows error: %w", err)
	}

	// Third pass: merge custom marker definitions from the markers table
	customRows, err := s.db.Query(`SELECT code, name, unit, category, ref_min, ref_max, description FROM markers`)
	if err != nil {
		return nil, fmt.Errorf("query custom markers: %w", err)
	}
	defer customRows.Close()

	for customRows.Next() {
		var code, name, unit, cat, desc string
		var refMin, refMax sql.NullFloat64
		if err := customRows.Scan(&code, &name, &unit, &cat, &refMin, &refMax, &desc); err != nil {
			return nil, fmt.Errorf("scan custom marker: %w", err)
		}
		if marker, ok := testCodeMap[code]; ok {
			// Override metadata with user-defined values
			marker.Name = name
			marker.Unit = unit
			marker.Category = cat
			marker.RefLow = nullFloat(refMin)
			marker.RefHigh = nullFloat(refMax)
			marker.Description = desc
		} else {
			// Marker defined but not yet in any test_results
			nm := &Marker{
				ID:          code,
				Name:        name,
				Short:       code,
				Unit:        unit,
				Category:    cat,
				RefLow:      nullFloat(refMin),
				RefHigh:     nullFloat(refMax),
				Description: desc,
				Values:      []DataPoint{},
			}
			markers = append(markers, *nm)
			testCodeMap[code] = nm
		}
	}
	if err := customRows.Err(); err != nil {
		return nil, fmt.Errorf("custom markers rows error: %w", err)
	}

	// Convert map values to final slice and sort by date
	result := []Marker{}
	for _, m := range markers {
		marker := testCodeMap[m.ID]
		sort.Slice(marker.Values, func(i, j int) bool {
			return marker.Values[i].Date < marker.Values[j].Date
		})
		result = append(result, *marker)
	}

	return result, nil
}

// GetCategories returns category metadata with colors
func (s *Store) GetCategories() (map[string]Category, error) {
	// Static category mappings - can be extended as needed
	categories := map[string]Category{
		"Biochimie": {
			Label: "Biochemistry",
			Color: "oklch(0.72 0.14 65)",
			Tint:  "oklch(0.965 0.025 65)",
		},
		"CBC": {
			Label: "Complete Blood Count",
			Color: "oklch(0.68 0.14 25)",
			Tint:  "oklch(0.96 0.025 25)",
		},
		"Hematologie": {
			Label: "Hematology",
			Color: "oklch(0.68 0.14 25)",
			Tint:  "oklch(0.96 0.025 25)",
		},
		"Imunologie": {
			Label: "Immunology",
			Color: "oklch(0.68 0.14 145)",
			Tint:  "oklch(0.965 0.025 145)",
		},
		"Hormonologie": {
			Label: "Endocrinology",
			Color: "oklch(0.62 0.14 250)",
			Tint:  "oklch(0.965 0.022 250)",
		},
	}

	// Query for actual categories from both imported results and user-defined markers
	query := `
		SELECT DISTINCT category FROM test_results WHERE category != ''
		UNION
		SELECT DISTINCT category FROM markers WHERE category != ''
		ORDER BY category
	`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query categories: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cat string
		if err := rows.Scan(&cat); err != nil {
			return nil, fmt.Errorf("scan category: %w", err)
		}

		// Add default category if not already defined
		if _, ok := categories[cat]; !ok {
			categories[cat] = Category{
				Label: cat,
				Color: "oklch(0.65 0.12 195)",
				Tint:  "oklch(0.965 0.022 195)",
			}
		}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("categories rows error: %w", err)
	}

	return categories, nil
}

// GetLabs returns the distinct list of lab names present in the database
func (s *Store) GetLabs() ([]string, error) {
	query := `SELECT DISTINCT lab_name FROM reports WHERE lab_name IS NOT NULL AND lab_name != '' ORDER BY lab_name`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query labs: %w", err)
	}
	defer rows.Close()

	var labs []string
	for rows.Next() {
		var lab string
		if err := rows.Scan(&lab); err != nil {
			return nil, fmt.Errorf("scan lab: %w", err)
		}
		labs = append(labs, lab)
	}
	return labs, rows.Err()
}

// AddReading inserts a manual data point for a marker, creating a report row if needed.
func (s *Store) AddReading(req AddReadingRequest) error {
	// Look up marker metadata: prefer markers table, fall back to test_results
	var testName, testUnit, testCategory string
	err := s.db.QueryRow(
		`SELECT COALESCE(name,''), COALESCE(unit,''), COALESCE(category,'') FROM markers WHERE code = ?`,
		req.MarkerCode,
	).Scan(&testName, &testUnit, &testCategory)
	if err == sql.ErrNoRows {
		err = s.db.QueryRow(
			`SELECT COALESCE(test_name,''), COALESCE(unit,''), COALESCE(category,'')
			 FROM test_results WHERE test_code = ? ORDER BY id DESC LIMIT 1`,
			req.MarkerCode,
		).Scan(&testName, &testUnit, &testCategory)
		if err == sql.ErrNoRows {
			testName = req.MarkerCode // last-resort fallback
		} else if err != nil {
			return fmt.Errorf("look up marker info: %w", err)
		}
	} else if err != nil {
		return fmt.Errorf("look up marker: %w", err)
	}

	// Find an existing report for this date+lab, or create one
	var reportID int64
	err = s.db.QueryRow(
		`SELECT id FROM reports WHERE collection_date = ? AND lab_name = ?`,
		req.Date, req.Lab,
	).Scan(&reportID)
	if err == sql.ErrNoRows {
		sampleID := fmt.Sprintf("manual-%s-%s-%d", req.MarkerCode, req.Date, time.Now().UnixNano())
		res, insErr := s.db.Exec(
			`INSERT INTO reports (collection_date, lab_name, sample_id) VALUES (?, ?, ?)`,
			req.Date, req.Lab, sampleID,
		)
		if insErr != nil {
			return fmt.Errorf("create report: %w", insErr)
		}
		reportID, _ = res.LastInsertId()
	} else if err != nil {
		return fmt.Errorf("find report: %w", err)
	}

	// Inherit ref range from marker definition if not supplied
	if req.RefMin == nil || req.RefMax == nil {
		var rMin, rMax sql.NullFloat64
		_ = s.db.QueryRow(`SELECT ref_min, ref_max FROM markers WHERE code = ?`, req.MarkerCode).Scan(&rMin, &rMax)
		if !rMin.Valid {
			_ = s.db.QueryRow(
				`SELECT ref_min, ref_max FROM test_results WHERE test_code = ? AND ref_min IS NOT NULL ORDER BY id DESC LIMIT 1`,
				req.MarkerCode,
			).Scan(&rMin, &rMax)
		}
		if req.RefMin == nil && rMin.Valid {
			v := rMin.Float64
			req.RefMin = &v
		}
		if req.RefMax == nil && rMax.Valid {
			v := rMax.Float64
			req.RefMax = &v
		}
	}

	isFlagged := 0
	if req.Value != nil && req.RefMin != nil && req.RefMax != nil {
		if *req.Value < *req.RefMin || *req.Value > *req.RefMax {
			isFlagged = 1
		}
	}

	var valueText *string
	if req.ValueText != "" {
		valueText = &req.ValueText
	}

	_, err = s.db.Exec(`
		INSERT INTO test_results
			(report_id, category, test_name, test_code, result_numeric, result_text, unit, ref_min, ref_max, is_flagged)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(report_id, test_name) DO UPDATE SET
			result_numeric = excluded.result_numeric,
			result_text    = excluded.result_text,
			ref_min        = excluded.ref_min,
			ref_max        = excluded.ref_max,
			is_flagged     = excluded.is_flagged
	`, reportID, testCategory, testName, req.MarkerCode,
		req.Value, valueText, testUnit, req.RefMin, req.RefMax, isFlagged)
	if err != nil {
		return fmt.Errorf("upsert test result: %w", err)
	}
	return nil
}

// DeleteReading removes a specific test result identified by marker code, date, and lab.
// If the parent report becomes empty after deletion it is also removed.
func (s *Store) DeleteReading(markerCode, date, lab string) error {
	var reportID int64
	err := s.db.QueryRow(
		`SELECT id FROM reports WHERE collection_date = ? AND lab_name = ?`,
		date, lab,
	).Scan(&reportID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("reading not found")
	}
	if err != nil {
		return fmt.Errorf("find report: %w", err)
	}

	res, err := s.db.Exec(
		`DELETE FROM test_results WHERE report_id = ? AND test_code = ?`,
		reportID, markerCode,
	)
	if err != nil {
		return fmt.Errorf("delete reading: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("reading not found")
	}

	// Remove the report if it is now empty
	var remaining int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM test_results WHERE report_id = ?`, reportID).Scan(&remaining)
	if remaining == 0 {
		_, _ = s.db.Exec(`DELETE FROM reports WHERE id = ?`, reportID)
	}
	return nil
}

// CreateOrUpdateMarker upserts a marker definition.
// Returns merged=true when an existing marker was updated.
func (s *Store) CreateOrUpdateMarker(req CreateMarkerRequest) (merged bool, err error) {
	var count int
	if err = s.db.QueryRow(`SELECT COUNT(*) FROM markers WHERE code = ?`, req.Code).Scan(&count); err != nil {
		return false, fmt.Errorf("check marker: %w", err)
	}
	merged = count > 0

	_, err = s.db.Exec(`
		INSERT INTO markers (code, name, unit, category, ref_min, ref_max, description, value_type)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(code) DO UPDATE SET
			name        = excluded.name,
			unit        = excluded.unit,
			category    = excluded.category,
			ref_min     = excluded.ref_min,
			ref_max     = excluded.ref_max,
			description = excluded.description,
			value_type  = excluded.value_type
	`, req.Code, req.Name, req.Unit, req.Category, req.RefMin, req.RefMax, req.Description, req.ValueType)
	if err != nil {
		return false, fmt.Errorf("upsert marker: %w", err)
	}
	return merged, nil
}

// DeleteMarker removes a marker and all its associated test results.
func (s *Store) DeleteMarker(code string) error {
	// Delete all test results for this marker code
	if _, err := s.db.Exec(`DELETE FROM test_results WHERE test_code = ?`, code); err != nil {
		return fmt.Errorf("delete test results: %w", err)
	}
	// Delete from user-defined markers table (may not exist, ignore)
	if _, err := s.db.Exec(`DELETE FROM markers WHERE code = ?`, code); err != nil {
		return fmt.Errorf("delete marker: %w", err)
	}
	// Clean up any reports that are now empty
	if _, err := s.db.Exec(`DELETE FROM reports WHERE id NOT IN (SELECT DISTINCT report_id FROM test_results)`); err != nil {
		return fmt.Errorf("prune empty reports: %w", err)
	}
	return nil
}

// GetAnnotations returns timeline annotations (empty for now, can be extended)
func (s *Store) GetAnnotations() ([]Annotation, error) {
	// For now, return empty list
	// Can be extended to fetch from a database table or configuration
	return []Annotation{}, nil
}
