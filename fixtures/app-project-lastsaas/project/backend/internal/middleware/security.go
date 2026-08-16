package middleware

import (
	"net/http"
	"strings"
)

func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		// Allow /api/docs to be embedded by metavert.io; deny framing for everything else
		frameAncestors := "'none'"
		xFrameOptions := "DENY"
		if strings.HasPrefix(r.URL.Path, "/api/docs") {
			frameAncestors = "https://metavert.io"
			xFrameOptions = "ALLOW-FROM https://metavert.io"
		}
		w.Header().Set("X-Frame-Options", xFrameOptions)

		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self' 'unsafe-inline'; "+
				"style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data: https:; "+
				"font-src 'self' https:; "+
				"connect-src 'self' https:; "+
				"object-src 'none'; "+
				"base-uri 'self'; "+
				"frame-ancestors "+frameAncestors+"; "+
				"form-action 'self';")
		next.ServeHTTP(w, r)
	})
}
