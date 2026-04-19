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

// HandleGetMarkers returns all markers with their values
func (h *Handler) HandleGetMarkers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	markers, err := h.store.GetMarkers()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(markers)
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
