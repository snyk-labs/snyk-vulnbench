package web

import "net/http"

func (a *App) continueTo(w http.ResponseWriter, r *http.Request) {
	next := r.URL.Query().Get("next")
	if next == "" {
		next = "/"
	}
	redirectTo(w, r, next)
}
