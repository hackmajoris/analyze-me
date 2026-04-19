package bloodtest

import (
	"database/sql"
	"fmt"
	"sort"
)

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
		WHERE result_numeric IS NOT NULL
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
			RefLow:   refMin.Float64,
			RefHigh:  refMax.Float64,
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

	// Second pass: get all values for each test code, grouped by collection date
	valueQuery := `
		SELECT DISTINCT
			test_code,
			r.collection_date,
			AVG(result_numeric) as avg_value
		FROM test_results tr
		JOIN reports r ON tr.report_id = r.id
		WHERE result_numeric IS NOT NULL
		GROUP BY test_code, r.collection_date
		ORDER BY test_code, r.collection_date
	`

	valueRows, err := s.db.Query(valueQuery)
	if err != nil {
		return nil, fmt.Errorf("query values: %w", err)
	}
	defer valueRows.Close()

	for valueRows.Next() {
		var code, date sql.NullString
		var value float64

		if err := valueRows.Scan(&code, &date, &value); err != nil {
			return nil, fmt.Errorf("scan value: %w", err)
		}

		// Skip if test_code or date is null
		if !code.Valid || !date.Valid {
			continue
		}

		if marker, ok := testCodeMap[code.String]; ok {
			marker.Values = append(marker.Values, DataPoint{
				Date:  date.String,
				Value: value,
			})
		}
	}

	if err := valueRows.Err(); err != nil {
		return nil, fmt.Errorf("values rows error: %w", err)
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

	// Query for actual categories in database and create entries if missing
	query := `SELECT DISTINCT category FROM test_results ORDER BY category`
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

// GetAnnotations returns timeline annotations (empty for now, can be extended)
func (s *Store) GetAnnotations() ([]Annotation, error) {
	// For now, return empty list
	// Can be extended to fetch from a database table or configuration
	return []Annotation{}, nil
}
