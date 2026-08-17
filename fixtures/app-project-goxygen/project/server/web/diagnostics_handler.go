package web

import "net/http"

func (a *App) hostnameDiagnostic(w http.ResponseWriter, r *http.Request) {
	hostname := r.URL.Query().Get("hostname")
	output, err := runHostnameDiagnostic(hostname)
	if err != nil {
		http.Error(w, string(output), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write(output)
}
