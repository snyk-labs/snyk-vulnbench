package handlers

import (
	"net/http"
	"strings"
	"testing"

	"lastsaas/internal/models"
	"lastsaas/internal/testutil"
)

// isolationEnv holds users and tenants for cross-tenant isolation tests.
type isolationEnv struct {
	*testEnv
	rootOwner     *models.User
	rootTenant    *models.Tenant
	nonRootOwner  *models.User
	nonRootTenant *models.Tenant
	nonRootAdmin  *models.User
	nonRootUser   *models.User
}

func setupIsolationEnv(t *testing.T) *isolationEnv {
	t.Helper()
	env := setupTestServer(t)
	testutil.MarkSystemInitialized(t, env.DB)

	// Root tenant with owner
	rootOwner := testutil.CreateTestUser(t, env.DB, "root-owner@test.com", "Test1234!@#$", "Root Owner")
	rootTenant := testutil.CreateTestTenant(t, env.DB, "Root Tenant", rootOwner.ID, true)

	// Non-root tenant with owner, admin, and regular user
	nonRootOwner := testutil.CreateTestUser(t, env.DB, "nonroot-owner@test.com", "Test1234!@#$", "NonRoot Owner")
	nonRootTenant := testutil.CreateTestTenant(t, env.DB, "NonRoot Tenant", nonRootOwner.ID, false)

	nonRootAdmin := testutil.CreateTestUser(t, env.DB, "nonroot-admin@test.com", "Test1234!@#$", "NonRoot Admin")
	testutil.CreateTestMembership(t, env.DB, nonRootAdmin.ID, nonRootTenant.ID, models.RoleAdmin)

	nonRootUser := testutil.CreateTestUser(t, env.DB, "nonroot-user@test.com", "Test1234!@#$", "NonRoot User")
	testutil.CreateTestMembership(t, env.DB, nonRootUser.ID, nonRootTenant.ID, models.RoleUser)

	return &isolationEnv{
		testEnv:       env,
		rootOwner:     rootOwner,
		rootTenant:    rootTenant,
		nonRootOwner:  nonRootOwner,
		nonRootTenant: nonRootTenant,
		nonRootAdmin:  nonRootAdmin,
		nonRootUser:   nonRootUser,
	}
}

// --- Admin endpoint isolation: non-root admin → 403 ---

func TestIntegration_NonRootAdmin_CannotAccessDashboard(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	req := ie.adminRequest(t, "GET", "/api/admin/dashboard", nil, ie.nonRootOwner, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_NonRootAdmin_CannotListTenants(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	req := ie.adminRequest(t, "GET", "/api/admin/tenants", nil, ie.nonRootOwner, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_NonRootAdmin_CannotListUsers(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	req := ie.adminRequest(t, "GET", "/api/admin/users", nil, ie.nonRootOwner, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_NonRootAdmin_CannotListLogs(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	req := ie.adminRequest(t, "GET", "/api/admin/logs", nil, ie.nonRootOwner, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_NonRootAdmin_CannotListPlans(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	req := ie.adminRequest(t, "GET", "/api/admin/plans", nil, ie.nonRootOwner, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_NonRootAdmin_CannotListAPIKeys(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	req := ie.adminRequest(t, "GET", "/api/admin/api-keys", nil, ie.nonRootOwner, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_NonRootAdmin_CannotListWebhooks(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	req := ie.adminRequest(t, "GET", "/api/admin/webhooks", nil, ie.nonRootOwner, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

// --- Root admin positive control ---

func TestIntegration_RootAdmin_CanAccessDashboard(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	req := ie.adminRequest(t, "GET", "/api/admin/dashboard", nil, ie.rootOwner, ie.rootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_RootAdmin_CanListLogs(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	req := ie.adminRequest(t, "GET", "/api/admin/logs", nil, ie.rootOwner, ie.rootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

// --- Cross-tenant data isolation ---

func TestIntegration_TenantA_CannotSeeTenantB_Members(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	// nonRootOwner tries to access root tenant's members (they have no membership in root tenant)
	req := ie.tenantRequest(t, "GET", "/api/tenant/members", nil, ie.nonRootOwner, ie.rootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	// Should be 403 (no membership in root tenant)
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_TenantA_CannotSeeTenantB_Activity(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	req := ie.tenantRequest(t, "GET", "/api/tenant/activity", nil, ie.nonRootOwner, ie.rootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_TenantA_CannotInviteToTenantB(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	body := strings.NewReader(`{"email":"new@test.com","role":"user"}`)
	req := ie.tenantRequest(t, "POST", "/api/tenant/members/invite", body, ie.nonRootOwner, ie.rootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

// --- Role hierarchy within tenant ---

func TestIntegration_RegularUser_CannotInviteMembers(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	body := strings.NewReader(`{"email":"invite@test.com","role":"user"}`)
	req := ie.tenantRequest(t, "POST", "/api/tenant/members/invite", body, ie.nonRootUser, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_RegularUser_CannotRemoveMembers(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	req := ie.tenantRequest(t, "DELETE", "/api/tenant/members/"+ie.nonRootAdmin.ID.Hex(), nil, ie.nonRootUser, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_RegularUser_CannotChangeRoles(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	body := strings.NewReader(`{"role":"admin"}`)
	req := ie.tenantRequest(t, "PATCH", "/api/tenant/members/"+ie.nonRootAdmin.ID.Hex()+"/role", body, ie.nonRootUser, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_Admin_CanInviteUsers_NotAdmins(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	// Admin can invite users
	body := strings.NewReader(`{"email":"newuser@test.com","role":"user"}`)
	req := ie.tenantRequest(t, "POST", "/api/tenant/members/invite", body, ie.nonRootAdmin, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201 for admin inviting user, got %d", resp.StatusCode)
	}

	// Admin cannot invite admins
	body2 := strings.NewReader(`{"email":"newadmin@test.com","role":"admin"}`)
	req2 := ie.tenantRequest(t, "POST", "/api/tenant/members/invite", body2, ie.nonRootAdmin, ie.nonRootTenant.ID.Hex())
	resp2, err := ie.Client.Do(req2)
	if err != nil {
		t.Fatal(err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403 for admin inviting admin, got %d", resp2.StatusCode)
	}
}

func TestIntegration_Owner_CanInviteAdmins(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	body := strings.NewReader(`{"email":"newadmin@test.com","role":"admin"}`)
	req := ie.tenantRequest(t, "POST", "/api/tenant/members/invite", body, ie.nonRootOwner, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got %d", resp.StatusCode)
	}
}

// --- No membership rejection ---

func TestIntegration_UserWithoutMembership_CannotAccessTenantAPI(t *testing.T) {
	ie := setupIsolationEnv(t)
	defer ie.Cleanup()

	// Create a user with no tenant membership
	outsider := testutil.CreateTestUser(t, ie.DB, "outsider@test.com", "Test1234!@#$", "Outsider")

	req := ie.tenantRequest(t, "GET", "/api/tenant/members", nil, outsider, ie.nonRootTenant.ID.Hex())
	resp, err := ie.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}
