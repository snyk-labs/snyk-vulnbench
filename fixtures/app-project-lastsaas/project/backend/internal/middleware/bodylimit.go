package middleware

import "net/http"

const MaxBodySize = 1 << 20 // 1MB

func BodySizeLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, MaxBodySize)
		}
		next.ServeHTTP(w, r)
	})
}
