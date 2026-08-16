package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"lastsaas/internal/email"
	"lastsaas/internal/health"
	"lastsaas/internal/models"
)

type HealthHandler struct {
	service      *health.Service
	emailService *email.ResendService
}

func NewHealthHandler(service *health.Service) *HealthHandler {
	return &HealthHandler{service: service}
}

func (h *HealthHandler) SetEmailService(svc *email.ResendService) {
	h.emailService = svc
}

// ListNodes handles GET /api/admin/health/nodes
func (h *HealthHandler) ListNodes(w http.ResponseWriter, r *http.Request) {
	nodes, err := h.service.ListNodes(r.Context())
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to list nodes")
		return
	}
	if nodes == nil {
		nodes = []models.SystemNode{}
	}
	respondWithJSON(w, http.StatusOK, map[string]interface{}{"nodes": nodes})
}

// GetMetrics handles GET /api/admin/health/metrics?node=<id>&range=<1h|6h|24h|7d|30d>
func (h *HealthHandler) GetMetrics(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	nodeID := q.Get("node")
	rangeStr := q.Get("range")

	to := time.Now()
	from := parseTimeRange(rangeStr, to)

	var metrics []models.SystemMetric
	var err error

	if nodeID != "" {
		metrics, err = h.service.GetMetrics(r.Context(), nodeID, from, to)
	} else {
		metrics, err = h.service.GetAggregateMetrics(r.Context(), from, to)
	}

	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to query metrics")
		return
	}
	if metrics == nil {
		metrics = []models.SystemMetric{}
	}
	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"metrics": metrics,
		"from":    from,
		"to":      to,
	})
}

// GetCurrent handles GET /api/admin/health/current
func (h *HealthHandler) GetCurrent(w http.ResponseWriter, r *http.Request) {
	metrics, err := h.service.GetCurrentMetrics(r.Context())
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to get current metrics")
		return
	}
	if metrics == nil {
		metrics = []models.SystemMetric{}
	}
	respondWithJSON(w, http.StatusOK, map[string]interface{}{"metrics": metrics})
}

// GetIntegrations handles GET /api/admin/health/integrations
func (h *HealthHandler) GetIntegrations(w http.ResponseWriter, r *http.Request) {
	results := h.service.GetIntegrationStatus()
	if results == nil {
		results = []models.IntegrationCheck{}
	}

	// Enrich with 24h call counts
	stripeCalls, resendEmails := h.service.GetIntegrationCounts24h(r.Context())
	for i := range results {
		switch results[i].Name {
		case "stripe":
			results[i].Calls24h = stripeCalls
		case "resend":
			results[i].Calls24h = resendEmails
		}
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{"integrations": results})
}

// SendTestEmail handles POST /api/admin/health/test-email
func (h *HealthHandler) SendTestEmail(w http.ResponseWriter, r *http.Request) {
	if h.emailService == nil {
		respondWithError(w, http.StatusBadRequest, "Email service not configured")
		return
	}

	var req struct {
		To string `json:"to"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if !isValidEmail(req.To) {
		respondWithError(w, http.StatusBadRequest, "Invalid email address")
		return
	}

	subject := "Test Email"
	body := fmt.Sprintf(
		`<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
			<h2 style="margin: 0 0 12px;">Email Delivery Test</h2>
			<p style="color: #555;">This is a test email sent from the admin health dashboard.</p>
			<p style="color: #555;">If you received this, your email configuration is working correctly.</p>
			<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
			<p style="font-size: 12px; color: #999;">Sent at %s</p>
		</div>`, time.Now().UTC().Format(time.RFC3339))

	if err := h.emailService.SendEmail(req.To, subject, body); err != nil {
		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

func parseTimeRange(rangeStr string, to time.Time) time.Time {
	switch rangeStr {
	case "1h":
		return to.Add(-1 * time.Hour)
	case "6h":
		return to.Add(-6 * time.Hour)
	case "24h":
		return to.Add(-24 * time.Hour)
	case "7d":
		return to.Add(-7 * 24 * time.Hour)
	case "30d":
		return to.Add(-30 * 24 * time.Hour)
	default:
		return to.Add(-24 * time.Hour)
	}
}
