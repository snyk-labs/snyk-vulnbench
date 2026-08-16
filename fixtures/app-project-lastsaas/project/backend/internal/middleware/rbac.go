package middleware

import (
	"net/http"

	"lastsaas/internal/models"
)

func RequireRole(minRole models.MemberRole) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			membership, ok := GetMembershipFromContext(r.Context())
			if !ok {
				http.Error(w, `{"error":"Membership context missing"}`, http.StatusForbidden)
				return
			}
			if !models.RoleHasPermission(membership.Role, minRole) {
				http.Error(w, `{"error":"Insufficient permissions"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func RequireRootTenant() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tenant, ok := GetTenantFromContext(r.Context())
			if !ok || !tenant.IsRoot {
				http.Error(w, `{"error":"Admin access required"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
