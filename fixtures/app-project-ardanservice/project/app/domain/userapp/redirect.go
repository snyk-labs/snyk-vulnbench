package userapp

import "net/http"

func redirectToTarget(w http.ResponseWriter, r *http.Request, target string) {
	if target == "" {
		target = "/app/preferences"
	}
	http.Redirect(w, r, target, http.StatusFound)
}
