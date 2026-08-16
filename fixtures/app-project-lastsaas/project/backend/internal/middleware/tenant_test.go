package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"lastsaas/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestGetTenantFromContextMissing(t *testing.T) {
	_, ok := GetTenantFromContext(context.Background())
	if ok {
		t.Error("expected no tenant from empty context")
	}
}

func TestGetMembershipFromContext(t *testing.T) {
	membership := &models.TenantMembership{Role: models.RoleAdmin}
	ctx := context.WithValue(context.Background(), MembershipContextKey, membership)

	got, ok := GetMembershipFromContext(ctx)
	if !ok {
		t.Fatal("expected membership from context")
	}
	if got.Role != models.RoleAdmin {
		t.Errorf("expected admin, got %s", got.Role)
	}
}

func TestGetMembershipFromContextMissing(t *testing.T) {
	_, ok := GetMembershipFromContext(context.Background())
	if ok {
		t.Error("expected no membership from empty context")
	}
}

func TestRequireActiveBillingActiveStatus(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireActiveBilling()(inner)

	tenant := &models.Tenant{BillingStatus: models.BillingStatusActive}
	req := httptest.NewRequest("GET", "/", nil)
	ctx := context.WithValue(req.Context(), TenantContextKey, tenant)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for active billing, got %d", rr.Code)
	}
}

func TestRequireActiveBillingNoneStatus(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireActiveBilling()(inner)

	tenant := &models.Tenant{BillingStatus: models.BillingStatusNone}
	req := httptest.NewRequest("GET", "/", nil)
	ctx := context.WithValue(req.Context(), TenantContextKey, tenant)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for none billing, got %d", rr.Code)
	}
}

func TestRequireActiveBillingInactiveStatus(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireActiveBilling()(inner)

	tenant := &models.Tenant{BillingStatus: models.BillingStatusPastDue}
	req := httptest.NewRequest("GET", "/", nil)
	ctx := context.WithValue(req.Context(), TenantContextKey, tenant)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusPaymentRequired {
		t.Errorf("expected 402 for past_due billing, got %d", rr.Code)
	}
}

func TestRequireActiveBillingRootExempt(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireActiveBilling()(inner)

	tenant := &models.Tenant{IsRoot: true, BillingStatus: models.BillingStatusPastDue}
	req := httptest.NewRequest("GET", "/", nil)
	ctx := context.WithValue(req.Context(), TenantContextKey, tenant)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for root tenant (exempt), got %d", rr.Code)
	}
}

func TestRequireActiveBillingWaivedExempt(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireActiveBilling()(inner)

	tenant := &models.Tenant{BillingWaived: true, BillingStatus: models.BillingStatusPastDue}
	req := httptest.NewRequest("GET", "/", nil)
	ctx := context.WithValue(req.Context(), TenantContextKey, tenant)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for billing-waived tenant (exempt), got %d", rr.Code)
	}
}

func TestRequireActiveBillingNoTenantContext(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireActiveBilling()(inner)

	req := httptest.NewRequest("GET", "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing tenant context, got %d", rr.Code)
	}
}

func TestRequireEntitlementRootExempt(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireEntitlement(nil, "custom_branding")(inner)

	tenant := &models.Tenant{IsRoot: true}
	req := httptest.NewRequest("GET", "/", nil)
	ctx := context.WithValue(req.Context(), TenantContextKey, tenant)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for root tenant, got %d", rr.Code)
	}
}

func TestRequireEntitlementBillingWaivedExempt(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireEntitlement(nil, "custom_branding")(inner)

	tenant := &models.Tenant{BillingWaived: true}
	req := httptest.NewRequest("GET", "/", nil)
	ctx := context.WithValue(req.Context(), TenantContextKey, tenant)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for billing-waived tenant, got %d", rr.Code)
	}
}

func TestRequireEntitlementNoPlan(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireEntitlement(nil, "custom_branding")(inner)

	tenant := &models.Tenant{
		ID:    primitive.NewObjectID(),
		IsRoot: false,
	}
	req := httptest.NewRequest("GET", "/", nil)
	ctx := context.WithValue(req.Context(), TenantContextKey, tenant)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403 for tenant with no plan, got %d", rr.Code)
	}
}

func TestRequireEntitlementNoTenantContext(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireEntitlement(nil, "feature")(inner)

	req := httptest.NewRequest("GET", "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing tenant context, got %d", rr.Code)
	}
}

func TestSecurityHeadersApiDocsPath(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := SecurityHeaders(inner)
	req := httptest.NewRequest("GET", "/api/docs/index.html", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	xfo := rr.Header().Get("X-Frame-Options")
	if xfo != "ALLOW-FROM https://metavert.io" {
		t.Errorf("expected ALLOW-FROM for /api/docs, got %q", xfo)
	}

	csp := rr.Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Error("expected CSP header for /api/docs path")
	}
}

func TestGetAPIKeyFromContext(t *testing.T) {
	key := &models.APIKey{Name: "test-key"}
	ctx := context.WithValue(context.Background(), APIKeyContextKey, key)

	got, ok := GetAPIKeyFromContext(ctx)
	if !ok {
		t.Fatal("expected API key from context")
	}
	if got.Name != "test-key" {
		t.Errorf("expected 'test-key', got %q", got.Name)
	}
}

func TestGetAPIKeyFromContextMissing(t *testing.T) {
	_, ok := GetAPIKeyFromContext(context.Background())
	if ok {
		t.Error("expected no API key from empty context")
	}
}
