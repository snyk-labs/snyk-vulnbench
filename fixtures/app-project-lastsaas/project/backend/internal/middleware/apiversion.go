package middleware

import (
	"net/http"

	"lastsaas/internal/version"
)

// APIVersion sets the X-API-Version response header on all API responses.
func APIVersion(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-API-Version", version.Current)
		next.ServeHTTP(w, r)
	})
}
