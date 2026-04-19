package bloodtest

// DataPoint represents a single measurement at a point in time
type DataPoint struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

// Marker represents a lab test marker with historical data
type Marker struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	Short       string      `json:"short"`
	Unit        string      `json:"unit"`
	Category    string      `json:"category"`
	RefLow      float64     `json:"refLow"`
	RefHigh     float64     `json:"refHigh"`
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
