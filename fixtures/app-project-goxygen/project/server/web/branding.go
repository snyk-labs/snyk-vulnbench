package web

import (
	"net/http"
)

func (a *App) logoPreview(w http.ResponseWriter, r *http.Request) {
	logoURL := r.URL.Query().Get("logo_url")
	body, contentType, status, err := fetchRemoteLogo(logoURL)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
