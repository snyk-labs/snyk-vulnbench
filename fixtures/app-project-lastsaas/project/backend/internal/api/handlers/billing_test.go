package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"lastsaas/internal/testutil"
)

// --- GetConfig (nil Stripe) ---

func TestIntegration_BillingConfig_NilStripe_ReturnsEmptyKey(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)

	req := env.tenantRequest(t, "GET", "/api/billing/config", nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var result map[string]string
	json.NewDecoder(resp.Body).Decode(&result)
	if result["publishableKey"] != "" {
		t.Errorf("expected empty publishableKey with nil Stripe, got %s", result["publishableKey"])
	}
}

// --- ListTransactions ---

func TestIntegration_ListTransactions_Empty(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)

	req := env.tenantRequest(t, "GET", "/api/billing/transactions", nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var result map[string]json.RawMessage
	json.NewDecoder(resp.Body).Decode(&result)
	var total float64
	json.Unmarshal(result["total"], &total)
	if total != 0 {
		t.Errorf("expected 0 total, got %v", total)
	}
}

// --- Portal (nil Stripe) ---

func TestIntegration_Portal_NilStripe_NoAccount(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)

	req := env.tenantRequest(t, "POST", "/api/billing/portal", nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	// Should return 400 because tenant has no StripeCustomerID
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// --- CancelSubscription (nil Stripe) ---

func TestIntegration_CancelSubscription_NoSubscription(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)

	req := env.tenantRequest(t, "POST", "/api/billing/cancel", nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	// Should return 400 because tenant has no StripeSubscriptionID
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// --- Checkout (nil Stripe) ---

func TestIntegration_Checkout_NilStripe(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	plan := testutil.CreateTestPlan(t, env.DB, "Pro", 1999, false)

	body := strings.NewReader(`{"planId":"` + plan.ID.Hex() + `","billingInterval":"month"}`)
	req := env.tenantRequest(t, "POST", "/api/billing/checkout", body, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	// With nil Stripe, should return an error (503 or 500)
	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		t.Errorf("expected error status with nil Stripe, got %d", resp.StatusCode)
	}
}

// --- AdminListTransactions ---

func TestIntegration_AdminListTransactions_Empty(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	req := env.adminRequest(t, "GET", "/api/admin/financial/transactions", nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var result map[string]json.RawMessage
	json.NewDecoder(resp.Body).Decode(&result)
	var total float64
	json.Unmarshal(result["total"], &total)
	if total != 0 {
		t.Errorf("expected 0 total, got %v", total)
	}
}

// --- AdminGetMetrics ---

func TestIntegration_AdminGetMetrics_Returns(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	req := env.adminRequest(t, "GET", "/api/admin/financial/metrics", nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

// --- Billing accessible by non-root tenant ---

func TestIntegration_Billing_NonRootTenantCanAccess(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "nonroot@test.com", "Test1234!@#$", "NonRoot")
	tenant := testutil.CreateTestTenant(t, env.DB, "NonRoot Tenant", owner.ID, false)

	req := env.tenantRequest(t, "GET", "/api/billing/config", nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 (billing accessible by any tenant), got %d", resp.StatusCode)
	}
}

// --- Admin billing endpoints require root tenant ---

func TestIntegration_AdminBilling_NonRootTenantForbidden(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "nonroot@test.com", "Test1234!@#$", "NonRoot")
	tenant := testutil.CreateTestTenant(t, env.DB, "NonRoot Tenant", owner.ID, false)

	req := env.adminRequest(t, "GET", "/api/admin/financial/transactions", nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

// --- Unauthenticated billing access ---

func TestIntegration_Billing_UnauthenticatedForbidden(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	req, _ := http.NewRequest("GET", env.Server.URL+"/api/billing/config", nil)
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

// --- Billing with waiver logic ---

func TestIntegration_Checkout_BillingWaiver_FreePlan(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	// Mark tenant as billing waived
	env.DB.Tenants().UpdateByID(nil, tenant.ID, map[string]interface{}{
		"$set": map[string]interface{}{"billingWaived": true},
	})
	plan := testutil.CreateTestPlan(t, env.DB, "Free", 0, true)

	body := strings.NewReader(`{"planId":"` + plan.ID.Hex() + `","billingInterval":"month"}`)
	req := env.tenantRequest(t, "POST", "/api/billing/checkout", body, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	// Free plan with waiver should work even without Stripe
	if resp.StatusCode == http.StatusServiceUnavailable {
		t.Errorf("free plan with waiver should not require Stripe, got %d", resp.StatusCode)
	}
}
