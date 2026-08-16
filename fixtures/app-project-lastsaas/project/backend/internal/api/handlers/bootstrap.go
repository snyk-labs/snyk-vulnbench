package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"lastsaas/internal/db"
	"lastsaas/internal/models"

	"go.mongodb.org/mongo-driver/bson"
)

type BootstrapHandler struct {
	db *db.MongoDB

	mu          sync.RWMutex
	initialized bool
}

func NewBootstrapHandler(database *db.MongoDB) *BootstrapHandler {
	h := &BootstrapHandler{
		db: database,
	}
	// Check initial state
	h.refreshInitialized()
	return h
}

func (h *BootstrapHandler) refreshInitialized() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var sys models.SystemConfig
	err := h.db.SystemConfig().FindOne(ctx, bson.M{}).Decode(&sys)
	if err == nil && sys.Initialized {
		h.mu.Lock()
		h.initialized = true
		h.mu.Unlock()
	}
}

func (h *BootstrapHandler) IsInitialized() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.initialized
}

type bootstrapStatusResponse struct {
	Initialized bool `json:"initialized"`
}

func (h *BootstrapHandler) Status(w http.ResponseWriter, r *http.Request) {
	if h.IsInitialized() {
		respondWithJSON(w, http.StatusOK, bootstrapStatusResponse{Initialized: true})
		return
	}
	// Re-check DB in case CLI initialized since startup
	h.refreshInitializedFromContext(r)
	respondWithJSON(w, http.StatusOK, bootstrapStatusResponse{Initialized: h.IsInitialized()})
}

func (h *BootstrapHandler) refreshInitializedFromContext(r *http.Request) {
	var sys models.SystemConfig
	err := h.db.SystemConfig().FindOne(r.Context(), bson.M{}).Decode(&sys)
	if err == nil && sys.Initialized {
		h.mu.Lock()
		h.initialized = true
		h.mu.Unlock()
	}
}

// BootstrapGuard returns middleware that blocks non-bootstrap routes when system is not initialized.
func (h *BootstrapHandler) BootstrapGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h.IsInitialized() {
			next.ServeHTTP(w, r)
			return
		}
		// Re-check DB
		h.refreshInitializedFromContext(r)
		if h.IsInitialized() {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":    "System not initialized",
			"redirect": "/setup",
		})
	})
}
