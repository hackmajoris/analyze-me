package bloodtest

// DataPoint represents a single measurement at a point in time
type DataPoint struct {
	Date         string   `json:"date"`
	Value        float64  `json:"value"`
	Lab          string   `json:"lab"`
	RefLow       *float64 `json:"refLow"`
	RefHigh      *float64 `json:"refHigh"`
	Label        string   `json:"label,omitempty"`        // for qualitative results e.g. "<75"
	ExpectedText string   `json:"expectedText,omitempty"` // for text results e.g. "Negativ"
	Flagged      bool     `json:"flagged"`                // whether result is outside normal range
}

// Marker represents a lab test marker with historical data
type Marker struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Short       string      `json:"short"`
	Unit        string      `json:"unit"`
	Category    string      `json:"category"`
	RefLow      *float64    `json:"refLow"`
	RefHigh     *float64    `json:"refHigh"`
	Description string      `json:"description"`
	Values      []DataPoint `json:"values"`
}

// Category describes a grouping of markers
type Category struct {
	Label string `json:"label"`
	Color string `json:"color"`
	Tint  string `json:"tint"`
}

// Annotation represents a timeline event
type Annotation struct {
	Date  string `json:"date"`
	Title string `json:"title"`
	Body  string `json:"body"`
}

// AddReadingRequest holds fields for adding a manual data point to a marker
type AddReadingRequest struct {
	MarkerCode string   `json:"markerCode"`
	Date       string   `json:"date"`      // YYYY-MM-DD
	Value      *float64 `json:"value"`     // nil for text-only markers
	ValueText  string   `json:"valueText"` // for qualitative results
	Lab        string   `json:"lab"`
	RefMin     *float64 `json:"refMin"`
	RefMax     *float64 `json:"refMax"`
}

// CreateMarkerRequest holds fields for creating or updating a marker definition
type CreateMarkerRequest struct {
	Code        string   `json:"code"`
	Name        string   `json:"name"`
	Unit        string   `json:"unit"`
	Category    string   `json:"category"`
	RefMin      *float64 `json:"refMin"`
	RefMax      *float64 `json:"refMax"`
	Description string   `json:"description"`
	ValueType   string   `json:"valueType"` // "numeric" or "text"
}
