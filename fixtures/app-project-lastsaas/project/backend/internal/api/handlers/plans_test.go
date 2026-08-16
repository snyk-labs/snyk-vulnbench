package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"lastsaas/internal/models"
	"lastsaas/internal/testutil"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// --- ListPlans ---

func TestIntegration_ListPlans_ReturnsAllPlans(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	testutil.CreateTestPlan(t, env.DB, "Free Plan", 0, true)
	testutil.CreateTestPlan(t, env.DB, "Pro Plan", 1999, false)

	req := env.adminRequest(t, "GET", "/api/admin/plans", nil, owner, rootTenant.ID.Hex())
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
	var plans []json.RawMessage
	json.Unmarshal(result["plans"], &plans)
	if len(plans) != 2 {
		t.Errorf("expected 2 plans, got %d", len(plans))
	}
}

func TestIntegration_ListPlans_EmptyReturnsArray(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	req := env.adminRequest(t, "GET", "/api/admin/plans", nil, owner, rootTenant.ID.Hex())
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
	var plans []json.RawMessage
	json.Unmarshal(result["plans"], &plans)
	if plans == nil {
		t.Error("expected empty array, got nil")
	}
}

// --- GetPlan ---

func TestIntegration_GetPlan_ReturnsExistingPlan(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	plan := testutil.CreateTestPlan(t, env.DB, "Pro Plan", 1999, false)

	req := env.adminRequest(t, "GET", "/api/admin/plans/"+plan.ID.Hex(), nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_GetPlan_NotFound(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	fakeID := primitive.NewObjectID().Hex()
	req := env.adminRequest(t, "GET", "/api/admin/plans/"+fakeID, nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// --- ListEntitlementKeys ---

func TestIntegration_ListEntitlementKeys_ReturnsKeys(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	// Create a plan with entitlements directly in DB
	plan := testutil.CreateTestPlan(t, env.DB, "Entitlement Plan", 999, false)
	env.DB.Plans().UpdateByID(nil, plan.ID, map[string]interface{}{
		"$set": map[string]interface{}{
			"entitlements": map[string]models.EntitlementValue{
				"api_access": {Type: models.EntitlementTypeBool, BoolValue: true},
				"max_users":  {Type: models.EntitlementTypeNumeric, NumericValue: 100},
			},
		},
	})

	req := env.adminRequest(t, "GET", "/api/admin/entitlement-keys", nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

// --- CreatePlan (owner-only) ---

func TestIntegration_CreatePlan_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"name":"Starter Plan","monthlyPriceCents":499,"pricingModel":"flat","creditResetPolicy":"reset"}`)
	req := env.adminRequest(t, "POST", "/api/admin/plans", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got %d", resp.StatusCode)
	}
}

func TestIntegration_CreatePlan_MissingName(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"monthlyPriceCents":499}`)
	req := env.adminRequest(t, "POST", "/api/admin/plans", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_CreatePlan_DuplicateName(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	testutil.CreateTestPlan(t, env.DB, "Pro Plan", 1999, false)

	body := strings.NewReader(`{"name":"Pro Plan","monthlyPriceCents":999}`)
	req := env.adminRequest(t, "POST", "/api/admin/plans", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Errorf("expected 409, got %d", resp.StatusCode)
	}
}

// --- AdminCannotCreatePlan (admin role, not owner) ---

func TestIntegration_AdminCannotCreatePlan(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	rootTenant := testutil.CreateTestTenant(t, env.DB, "Root Tenant", owner.ID, true)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, rootTenant.ID, models.RoleAdmin)

	body := strings.NewReader(`{"name":"Sneaky Plan","monthlyPriceCents":999}`)
	req := env.adminRequest(t, "POST", "/api/admin/plans", body, admin, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

// --- UpdatePlan ---

func TestIntegration_UpdatePlan_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	plan := testutil.CreateTestPlan(t, env.DB, "Old Name", 499, false)

	body := strings.NewReader(`{"name":"New Name","monthlyPriceCents":799,"pricingModel":"flat","creditResetPolicy":"reset"}`)
	req := env.adminRequest(t, "PUT", "/api/admin/plans/"+plan.ID.Hex(), body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_UpdatePlan_NotFound(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	fakeID := primitive.NewObjectID().Hex()
	body := strings.NewReader(`{"name":"Ghost Plan","monthlyPriceCents":999,"pricingModel":"flat","creditResetPolicy":"reset"}`)
	req := env.adminRequest(t, "PUT", "/api/admin/plans/"+fakeID, body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// --- DeletePlan ---

func TestIntegration_DeletePlan_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	plan := testutil.CreateTestPlan(t, env.DB, "Delete Me", 499, false)

	req := env.adminRequest(t, "DELETE", "/api/admin/plans/"+plan.ID.Hex(), nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_DeletePlan_SystemPlanForbidden(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	plan := testutil.CreateTestPlan(t, env.DB, "System Plan", 0, true)

	req := env.adminRequest(t, "DELETE", "/api/admin/plans/"+plan.ID.Hex(), nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_DeletePlan_NotFound(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	fakeID := primitive.NewObjectID().Hex()
	req := env.adminRequest(t, "DELETE", "/api/admin/plans/"+fakeID, nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestIntegration_AdminCannotDeletePlan(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	rootTenant := testutil.CreateTestTenant(t, env.DB, "Root Tenant", owner.ID, true)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, rootTenant.ID, models.RoleAdmin)

	plan := testutil.CreateTestPlan(t, env.DB, "Target Plan", 499, false)

	req := env.adminRequest(t, "DELETE", "/api/admin/plans/"+plan.ID.Hex(), nil, admin, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

// --- ArchivePlan / UnarchivePlan ---

func TestIntegration_ArchivePlan_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	plan := testutil.CreateTestPlan(t, env.DB, "Archive Me", 499, false)

	req := env.adminRequest(t, "POST", "/api/admin/plans/"+plan.ID.Hex()+"/archive", nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_UnarchivePlan_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	plan := testutil.CreateTestPlan(t, env.DB, "Unarchive Me", 499, false)
	// Archive first
	env.DB.Plans().UpdateByID(nil, plan.ID, map[string]interface{}{"$set": map[string]interface{}{"isArchived": true}})

	req := env.adminRequest(t, "POST", "/api/admin/plans/"+plan.ID.Hex()+"/unarchive", nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_ArchiveSystemPlan_Forbidden(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	plan := testutil.CreateTestPlan(t, env.DB, "System Plan", 0, true)

	req := env.adminRequest(t, "POST", "/api/admin/plans/"+plan.ID.Hex()+"/archive", nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

// --- AssignPlan ---

func TestIntegration_AssignPlan_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	// Create a target tenant and a free plan
	targetOwner := testutil.CreateTestUser(t, env.DB, "target@test.com", "Test1234!@#$", "Target")
	targetTenant := testutil.CreateTestTenant(t, env.DB, "Target Tenant", targetOwner.ID, false)
	plan := testutil.CreateTestPlan(t, env.DB, "Free Plan", 0, true)

	planID := plan.ID.Hex()
	body := strings.NewReader(`{"planId":"` + planID + `","billingWaived":true}`)
	req := env.adminRequest(t, "PATCH", "/api/admin/tenants/"+targetTenant.ID.Hex()+"/plan", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_AdminCannotAssignPlan(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	rootTenant := testutil.CreateTestTenant(t, env.DB, "Root Tenant", owner.ID, true)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, rootTenant.ID, models.RoleAdmin)

	targetOwner := testutil.CreateTestUser(t, env.DB, "target@test.com", "Test1234!@#$", "Target")
	targetTenant := testutil.CreateTestTenant(t, env.DB, "Target", targetOwner.ID, false)

	body := strings.NewReader(`{"planId":"","billingWaived":true}`)
	req := env.adminRequest(t, "PATCH", "/api/admin/tenants/"+targetTenant.ID.Hex()+"/plan", body, admin, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}
