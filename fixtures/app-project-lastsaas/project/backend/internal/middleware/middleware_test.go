package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"lastsaas/internal/models"
)

func TestSecurityHeaders(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := SecurityHeaders(inner)
	req := httptest.NewRequest("GET", "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	expectedHeaders := map[string]string{
		"X-Content-Type-Options":    "nosniff",
		"X-Frame-Options":           "DENY",
		"X-XSS-Protection":          "1; mode=block",
		"Referrer-Policy":            "strict-origin-when-cross-origin",
		"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
		"Permissions-Policy":        "camera=(), microphone=(), geolocation=()",
	}

	for header, expected := range expectedHeaders {
		got := rr.Header().Get(header)
		if got != expected {
			t.Errorf("header %s: expected %q, got %q", header, expected, got)
		}
	}

	// CSP should be present.
	csp := rr.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Error("Content-Security-Policy header should be set")
	}
}

func TestRequireRole(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	tests := []struct {
		name         string
		userRole     models.MemberRole
		requiredRole models.MemberRole
		expectCode   int
	}{
		{"owner accessing owner route", models.RoleOwner, models.RoleOwner, http.StatusOK},
		{"admin accessing admin route", models.RoleAdmin, models.RoleAdmin, http.StatusOK},
		{"owner accessing admin route", models.RoleOwner, models.RoleAdmin, http.StatusOK},
		{"user accessing user route", models.RoleUser, models.RoleUser, http.StatusOK},
		{"user accessing admin route", models.RoleUser, models.RoleAdmin, http.StatusForbidden},
		{"admin accessing owner route", models.RoleAdmin, models.RoleOwner, http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			handler := RequireRole(tt.requiredRole)(inner)

			req := httptest.NewRequest("GET", "/", nil)
			ctx := context.WithValue(req.Context(), MembershipContextKey, &models.TenantMembership{
				Role: tt.userRole,
			})
			req = req.WithContext(ctx)

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			if rr.Code != tt.expectCode {
				t.Errorf("expected %d, got %d", tt.expectCode, rr.Code)
			}
		})
	}
}

func TestRequireRoleMissingContext(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireRole(models.RoleUser)(inner)

	req := httptest.NewRequest("GET", "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403 when membership context missing, got %d", rr.Code)
	}
}

func TestRequireRootTenant(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireRootTenant()(inner)

	t.Run("root tenant allowed", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		ctx := context.WithValue(req.Context(), TenantContextKey, &models.Tenant{IsRoot: true})
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rr.Code)
		}
	})

	t.Run("non-root tenant denied", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		ctx := context.WithValue(req.Context(), TenantContextKey, &models.Tenant{IsRoot: false})
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Errorf("expected 403, got %d", rr.Code)
		}
	})

	t.Run("missing tenant context denied", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Errorf("expected 403, got %d", rr.Code)
		}
	})
}

func TestContextHelpers(t *testing.T) {
	t.Run("GetUserFromContext", func(t *testing.T) {
		user := &models.User{Email: "test@example.com"}
		ctx := context.WithValue(context.Background(), UserContextKey, user)

		got, ok := GetUserFromContext(ctx)
		if !ok || got.Email != "test@example.com" {
			t.Error("expected user from context")
		}

		_, ok = GetUserFromContext(context.Background())
		if ok {
			t.Error("expected no user from empty context")
		}
	})

	t.Run("GetTenantFromContext", func(t *testing.T) {
		tenant := &models.Tenant{IsRoot: true}
		ctx := context.WithValue(context.Background(), TenantContextKey, tenant)

		got, ok := GetTenantFromContext(ctx)
		if !ok || !got.IsRoot {
			t.Error("expected tenant from context")
		}
	})

	t.Run("GetImpersonatedBy", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), ImpersonatedByContextKey, "admin-123")
		got := GetImpersonatedBy(ctx)
		if got != "admin-123" {
			t.Errorf("expected admin-123, got %s", got)
		}

		got = GetImpersonatedBy(context.Background())
		if got != "" {
			t.Errorf("expected empty string, got %s", got)
		}
	})
}
