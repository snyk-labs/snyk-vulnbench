package handlers

import (
	"net/http"
)

// loginRedirectTarget restores the page requested before authentication.
func loginRedirectTarget(r *http.Request) string {
	target := r.URL.Query().Get("redirect")
	if target == "" {
		return "/"
	}

	return target
}
