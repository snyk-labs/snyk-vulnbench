package web

import (
	"net/http"
)

func (a *App) downloadReport(w http.ResponseWriter, r *http.Request) {
	reportName := r.URL.Query().Get("name")
	content, err := readTechnologyReport(reportName)
	if err != nil {
		http.Error(w, "report not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write(content)
}
