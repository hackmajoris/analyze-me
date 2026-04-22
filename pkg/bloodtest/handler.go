package bloodtest

import (
	"encoding/json"
	"net/http"
)

// Handler provides HTTP handlers for blood test endpoints
type Handler struct {
	store *Store
}

// NewHandler creates a new Handler
func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

// HandleMarkers dispatches GET (list), POST (create/update), and DELETE for markers.
func (h *Handler) HandleMarkers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.HandleGetMarkers(w, r)
	case http.MethodPost:
		h.handleCreateMarker(w, r)
	case http.MethodDelete:
		h.handleDeleteMarker(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// HandleGetMarkers returns all markers with their values
func (h *Handler) HandleGetMarkers(w http.ResponseWriter, r *http.Request) {
	markers, err := h.store.GetMarkers()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(markers)
}

// handleCreateMarker creates or updates a marker definition.
func (h *Handler) handleCreateMarker(w http.ResponseWriter, r *http.Request) {
	var req CreateMarkerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Code == "" || req.Name == "" {
		http.Error(w, "code and name are required", http.StatusBadRequest)
		return
	}
	if req.ValueType == "" {
		req.ValueType = "numeric"
	}

	merged, err := h.store.CreateOrUpdateMarker(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Merged bool `json:"merged"`
	}{Merged: merged})
}

func (h *Handler) handleDeleteMarker(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "code is required", http.StatusBadRequest)
		return
	}
	if err := h.store.DeleteMarker(code); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// HandleReadings dispatches POST (add) and DELETE (remove) for readings.
func (h *Handler) HandleReadings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		h.handleAddReading(w, r)
	case http.MethodDelete:
		h.handleDeleteReading(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) handleAddReading(w http.ResponseWriter, r *http.Request) {
	var req AddReadingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.MarkerCode == "" || req.Date == "" {
		http.Error(w, "markerCode and date are required", http.StatusBadRequest)
		return
	}
	if req.Lab == "" {
		req.Lab = "Manual"
	}
	if err := h.store.AddReading(req); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func (h *Handler) handleDeleteReading(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	date := r.URL.Query().Get("date")
	lab := r.URL.Query().Get("lab")
	if code == "" || date == "" || lab == "" {
		http.Error(w, "code, date and lab are required", http.StatusBadRequest)
		return
	}
	if err := h.store.DeleteReading(code, date, lab); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// HandleGetCategories returns all categories
func (h *Handler) HandleGetCategories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	categories, err := h.store.GetCategories()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(categories)
}

// HandleGetLabs returns the list of distinct lab names
func (h *Handler) HandleGetLabs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	labs, err := h.store.GetLabs()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(labs)
}

// HandleGetAnnotations returns all annotations
func (h *Handler) HandleGetAnnotations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	annotations, err := h.store.GetAnnotations()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(annotations)
}
