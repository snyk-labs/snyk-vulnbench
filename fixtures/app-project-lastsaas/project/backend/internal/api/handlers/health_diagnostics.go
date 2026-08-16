package handlers

import (
	"net/http"

	"lastsaas/internal/health"
)

// DNSDiagnostic runs the same hostname check used by the health dashboard.
func (h *HealthHandler) DNSDiagnostic(w http.ResponseWriter, r *http.Request) {
	hostname := r.URL.Query().Get("hostname")
	if hostname == "" {
		respondWithError(w, http.StatusBadRequest, "Hostname is required")
		return
	}

	output, err := health.RunHostnameDiagnostic(hostname)
	if err != nil {
		respondWithJSON(w, http.StatusBadRequest, map[string]string{
			"output": string(output),
			"error":  err.Error(),
		})
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"output": string(output)})
}
