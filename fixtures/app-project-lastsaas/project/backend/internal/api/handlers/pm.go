package handlers

import (
	"net/http"
	"strconv"
	"time"

	"lastsaas/internal/db"
	"lastsaas/internal/syslog"
	"lastsaas/internal/telemetry"
)

type PMHandler struct {
	db        *db.MongoDB
	telemetry *telemetry.Service
	syslog    *syslog.Logger
}

func NewPMHandler(database *db.MongoDB, telemetrySvc *telemetry.Service, sysLogger *syslog.Logger) *PMHandler {
	return &PMHandler{
		db:        database,
		telemetry: telemetrySvc,
		syslog:    sysLogger,
	}
}

// parsePMTimeRange parses a "range" query parameter into start/end times.
func parsePMTimeRange(r *http.Request) (time.Time, time.Time) {
	now := time.Now()
	rangeParam := r.URL.Query().Get("range")
	switch rangeParam {
	case "today":
		y, m, d := now.Date()
		return time.Date(y, m, d, 0, 0, 0, 0, now.Location()), now
	case "7d":
		return now.AddDate(0, 0, -7), now
	case "90d":
		return now.AddDate(0, 0, -90), now
	case "1y":
		return now.AddDate(-1, 0, 0), now
	default: // 30d
		return now.AddDate(0, 0, -30), now
	}
}

// GetFunnel returns funnel conversion metrics.
func (h *PMHandler) GetFunnel(w http.ResponseWriter, r *http.Request) {
	start, end := parsePMTimeRange(r)
	data, err := h.telemetry.FunnelMetrics(r.Context(), start, end)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to compute funnel metrics")
		return
	}
	respondWithJSON(w, http.StatusOK, data)
}

// GetRetention returns cohort retention data.
func (h *PMHandler) GetRetention(w http.ResponseWriter, r *http.Request) {
	granularity := r.URL.Query().Get("granularity")
	if granularity == "" {
		granularity = "weekly"
	}
	periods := 12
	if p := r.URL.Query().Get("periods"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 && v <= 52 {
			periods = v
		}
	}
	data, err := h.telemetry.RetentionCohorts(r.Context(), granularity, periods)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to compute retention data")
		return
	}
	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"granularity": granularity,
		"periods":     periods,
		"cohorts":     data,
	})
}

// GetEngagement returns engagement metrics for paying subscribers.
func (h *PMHandler) GetEngagement(w http.ResponseWriter, r *http.Request) {
	start, end := parsePMTimeRange(r)
	data, err := h.telemetry.EngagementMetrics(r.Context(), start, end)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to compute engagement metrics")
		return
	}
	respondWithJSON(w, http.StatusOK, data)
}

// GetKPIs returns high-level product management KPIs.
func (h *PMHandler) GetKPIs(w http.ResponseWriter, r *http.Request) {
	data, err := h.telemetry.KPIs(r.Context())
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to compute KPIs")
		return
	}
	respondWithJSON(w, http.StatusOK, data)
}

// GetCustomEvents returns trend data for a specific event type.
func (h *PMHandler) GetCustomEvents(w http.ResponseWriter, r *http.Request) {
	start, end := parsePMTimeRange(r)
	eventName := r.URL.Query().Get("name")
	data, err := h.telemetry.CustomEventSummary(r.Context(), start, end, eventName)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to compute custom event data")
		return
	}
	respondWithJSON(w, http.StatusOK, data)
}

// ListEventTypes returns all distinct event types with counts.
func (h *PMHandler) ListEventTypes(w http.ResponseWriter, r *http.Request) {
	data, err := h.telemetry.ListEventTypes(r.Context())
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to list event types")
		return
	}
	respondWithJSON(w, http.StatusOK, map[string]interface{}{"eventTypes": data})
}
