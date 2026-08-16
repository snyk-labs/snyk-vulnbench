package handlers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"lastsaas/internal/middleware"
	"lastsaas/internal/models"
	"lastsaas/internal/telemetry"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	maxEventNameLen    = 128
	maxSessionIDLen    = 128
	maxPropertiesCount = 50
)

// validEventName allows alphanumeric, dots, underscores, and hyphens.
var validEventName = regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)

// validSessionID allows alphanumeric, hyphens, and underscores (UUIDs, nanoids, etc.).
var validSessionID = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// sanitizeProperties caps the number of top-level keys and truncates long string values.
func sanitizeProperties(props map[string]interface{}) map[string]interface{} {
	if props == nil {
		return nil
	}
	out := make(map[string]interface{}, len(props))
	count := 0
	for k, v := range props {
		if count >= maxPropertiesCount {
			break
		}
		if len(k) > 128 {
			k = k[:128]
		}
		if s, ok := v.(string); ok && len(s) > 1024 {
			v = s[:1024]
		}
		out[k] = v
		count++
	}
	return out
}

type TelemetryHandler struct {
	telemetry *telemetry.Service
}

func NewTelemetryHandler(telemetrySvc *telemetry.Service) *TelemetryHandler {
	return &TelemetryHandler{telemetry: telemetrySvc}
}

// TrackAnonymous handles anonymous telemetry events (page views).
// Rate-limited by IP, no authentication required.
func (h *TelemetryHandler) TrackAnonymous(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID  string                 `json:"sessionId"`
		Event      string                 `json:"event"`
		Properties map[string]interface{} `json:"properties"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.SessionID == "" || req.Event == "" {
		respondWithError(w, http.StatusBadRequest, "sessionId and event are required")
		return
	}

	if len(req.SessionID) > maxSessionIDLen || !validSessionID.MatchString(req.SessionID) {
		respondWithError(w, http.StatusBadRequest, "Invalid sessionId format")
		return
	}

	// Only allow page.view for anonymous tracking
	if req.Event != models.TelemetryPageView {
		respondWithError(w, http.StatusBadRequest, "Anonymous tracking only supports page.view events")
		return
	}

	event := models.TelemetryEvent{
		EventName:  req.Event,
		Category:   models.TelemetryCategoryFunnel,
		SessionID:  req.SessionID,
		Properties: sanitizeProperties(req.Properties),
		CreatedAt:  time.Now(),
	}

	if err := h.telemetry.Track(r.Context(), event); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to track event")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// TrackAuthenticated handles authenticated telemetry events (custom events).
// Requires JWT + tenant context.
func (h *TelemetryHandler) TrackAuthenticated(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		respondWithError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}
	tenant, _ := middleware.GetTenantFromContext(r.Context())

	var req struct {
		Event      string                 `json:"event"`
		Properties map[string]interface{} `json:"properties"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Event == "" {
		respondWithError(w, http.StatusBadRequest, "event is required")
		return
	}

	if len(req.Event) > maxEventNameLen || !validEventName.MatchString(req.Event) {
		respondWithError(w, http.StatusBadRequest, "Invalid event name: use alphanumeric, dots, underscores, hyphens (max 128 chars)")
		return
	}

	// Custom events must use "custom." prefix
	if !strings.HasPrefix(req.Event, "custom.") {
		respondWithError(w, http.StatusBadRequest, "Custom events must use 'custom.' prefix")
		return
	}

	event := models.TelemetryEvent{
		EventName:  req.Event,
		Category:   models.TelemetryCategoryCustom,
		UserID:     &user.ID,
		Properties: sanitizeProperties(req.Properties),
		CreatedAt:  time.Now(),
	}
	if tenant != nil {
		event.TenantID = &tenant.ID
	}

	if err := h.telemetry.Track(r.Context(), event); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to track event")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// TrackBatch handles batch telemetry event ingestion.
// Requires JWT + tenant context.
func (h *TelemetryHandler) TrackBatch(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		respondWithError(w, http.StatusUnauthorized, "Not authenticated")
		return
	}
	tenant, _ := middleware.GetTenantFromContext(r.Context())

	var req struct {
		Events []struct {
			Event      string                 `json:"event"`
			Properties map[string]interface{} `json:"properties"`
		} `json:"events"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.Events) == 0 {
		respondWithError(w, http.StatusBadRequest, "events array is required")
		return
	}
	if len(req.Events) > 100 {
		respondWithError(w, http.StatusBadRequest, "Maximum 100 events per batch")
		return
	}

	now := time.Now()
	events := make([]models.TelemetryEvent, 0, len(req.Events))
	for _, e := range req.Events {
		if e.Event == "" {
			continue
		}
		if len(e.Event) > maxEventNameLen || !validEventName.MatchString(e.Event) {
			continue
		}
		if !strings.HasPrefix(e.Event, "custom.") {
			continue
		}
		event := models.TelemetryEvent{
			ID:         primitive.NewObjectID(),
			EventName:  e.Event,
			Category:   models.TelemetryCategoryCustom,
			UserID:     &user.ID,
			Properties: sanitizeProperties(e.Properties),
			CreatedAt:  now,
		}
		if tenant != nil {
			event.TenantID = &tenant.ID
		}
		events = append(events, event)
	}

	if len(events) == 0 {
		respondWithError(w, http.StatusBadRequest, "No valid events in batch")
		return
	}

	if err := h.telemetry.TrackBatch(r.Context(), events); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to track events")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"tracked": len(events),
	})
}
