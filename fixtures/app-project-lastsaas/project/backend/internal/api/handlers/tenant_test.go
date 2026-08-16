package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"lastsaas/internal/models"
	"lastsaas/internal/testutil"
)

// --- ListMembers ---

func TestIntegration_ListMembers_ReturnsTenantMembers(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	member := testutil.CreateTestUser(t, env.DB, "member@test.com", "Test1234!@#$", "Member")
	testutil.CreateTestMembership(t, env.DB, member.ID, tenant.ID, models.RoleUser)

	req := env.tenantRequest(t, "GET", "/api/tenant/members", nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var result map[string][]MemberResponse
	json.NewDecoder(resp.Body).Decode(&result)
	if len(result["members"]) != 2 {
		t.Errorf("expected 2 members, got %d", len(result["members"]))
	}
}

func TestIntegration_ListMembers_DifferentTenantsDifferentMembers(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner1 := testutil.CreateTestUser(t, env.DB, "owner1@test.com", "Test1234!@#$", "Owner1")
	tenant1 := testutil.CreateTestTenant(t, env.DB, "Tenant1", owner1.ID, false)

	owner2 := testutil.CreateTestUser(t, env.DB, "owner2@test.com", "Test1234!@#$", "Owner2")
	tenant2 := testutil.CreateTestTenant(t, env.DB, "Tenant2", owner2.ID, false)
	// Add 2 extra members to tenant2
	for _, email := range []string{"a@test.com", "b@test.com"} {
		u := testutil.CreateTestUser(t, env.DB, email, "Test1234!@#$", email)
		testutil.CreateTestMembership(t, env.DB, u.ID, tenant2.ID, models.RoleUser)
	}

	// Tenant1 should have 1 member (owner)
	req1 := env.tenantRequest(t, "GET", "/api/tenant/members", nil, owner1, tenant1.ID.Hex())
	resp1, _ := env.Client.Do(req1)
	defer resp1.Body.Close()
	var result1 map[string][]MemberResponse
	json.NewDecoder(resp1.Body).Decode(&result1)
	if len(result1["members"]) != 1 {
		t.Errorf("tenant1 expected 1 member, got %d", len(result1["members"]))
	}

	// Tenant2 should have 3 members (owner + 2)
	req2 := env.tenantRequest(t, "GET", "/api/tenant/members", nil, owner2, tenant2.ID.Hex())
	resp2, _ := env.Client.Do(req2)
	defer resp2.Body.Close()
	var result2 map[string][]MemberResponse
	json.NewDecoder(resp2.Body).Decode(&result2)
	if len(result2["members"]) != 3 {
		t.Errorf("tenant2 expected 3 members, got %d", len(result2["members"]))
	}
}

// --- GetActivity ---

func TestIntegration_GetActivity_ReturnsScopedActivity(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)

	req := env.tenantRequest(t, "GET", "/api/tenant/activity", nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

// --- UpdateTenantSettings ---

func TestIntegration_UpdateTenantSettings_OwnerCanUpdate(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)

	body := strings.NewReader(`{"name":"Updated Tenant Name"}`)
	req := env.tenantRequest(t, "PATCH", "/api/tenant/settings", body, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_UpdateTenantSettings_AdminCanUpdate(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, tenant.ID, models.RoleAdmin)

	body := strings.NewReader(`{"name":"Updated by Admin"}`)
	req := env.tenantRequest(t, "PATCH", "/api/tenant/settings", body, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_UpdateTenantSettings_RegularUserCannot(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	user := testutil.CreateTestUser(t, env.DB, "user@test.com", "Test1234!@#$", "User")
	testutil.CreateTestMembership(t, env.DB, user.ID, tenant.ID, models.RoleUser)

	body := strings.NewReader(`{"name":"Hacked Name"}`)
	req := env.tenantRequest(t, "PATCH", "/api/tenant/settings", body, user, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

// --- InviteMember ---

func TestIntegration_InviteMember_AdminInvitesUser(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, tenant.ID, models.RoleAdmin)

	body := strings.NewReader(`{"email":"new@test.com","role":"user"}`)
	req := env.tenantRequest(t, "POST", "/api/tenant/members/invite", body, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got %d", resp.StatusCode)
	}
}

func TestIntegration_InviteMember_OwnerInvitesAdmin(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)

	body := strings.NewReader(`{"email":"newadmin@test.com","role":"admin"}`)
	req := env.tenantRequest(t, "POST", "/api/tenant/members/invite", body, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got %d", resp.StatusCode)
	}
}

func TestIntegration_InviteMember_AdminCannotInviteAdmin(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, tenant.ID, models.RoleAdmin)

	body := strings.NewReader(`{"email":"newadmin@test.com","role":"admin"}`)
	req := env.tenantRequest(t, "POST", "/api/tenant/members/invite", body, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_InviteMember_CannotInviteOwner(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)

	body := strings.NewReader(`{"email":"newowner@test.com","role":"owner"}`)
	req := env.tenantRequest(t, "POST", "/api/tenant/members/invite", body, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_InviteMember_DuplicateEmail(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	existing := testutil.CreateTestUser(t, env.DB, "existing@test.com", "Test1234!@#$", "Existing")
	testutil.CreateTestMembership(t, env.DB, existing.ID, tenant.ID, models.RoleUser)

	body := strings.NewReader(`{"email":"existing@test.com","role":"user"}`)
	req := env.tenantRequest(t, "POST", "/api/tenant/members/invite", body, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Errorf("expected 409, got %d", resp.StatusCode)
	}
}

func TestIntegration_InviteMember_EmptyEmail(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)

	body := strings.NewReader(`{"email":"","role":"user"}`)
	req := env.tenantRequest(t, "POST", "/api/tenant/members/invite", body, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// --- RemoveMember ---

func TestIntegration_RemoveMember_AdminRemovesUser(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, tenant.ID, models.RoleAdmin)
	user := testutil.CreateTestUser(t, env.DB, "user@test.com", "Test1234!@#$", "User")
	testutil.CreateTestMembership(t, env.DB, user.ID, tenant.ID, models.RoleUser)

	req := env.tenantRequest(t, "DELETE", "/api/tenant/members/"+user.ID.Hex(), nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_RemoveMember_OwnerRemovesAdmin(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, tenant.ID, models.RoleAdmin)

	req := env.tenantRequest(t, "DELETE", "/api/tenant/members/"+admin.ID.Hex(), nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_RemoveMember_CannotRemoveSelf(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, tenant.ID, models.RoleAdmin)

	req := env.tenantRequest(t, "DELETE", "/api/tenant/members/"+admin.ID.Hex(), nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_RemoveMember_CannotRemoveOwner(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, tenant.ID, models.RoleAdmin)

	req := env.tenantRequest(t, "DELETE", "/api/tenant/members/"+owner.ID.Hex(), nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_RemoveMember_AdminCannotRemoveAdmin(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin1 := testutil.CreateTestUser(t, env.DB, "admin1@test.com", "Test1234!@#$", "Admin1")
	testutil.CreateTestMembership(t, env.DB, admin1.ID, tenant.ID, models.RoleAdmin)
	admin2 := testutil.CreateTestUser(t, env.DB, "admin2@test.com", "Test1234!@#$", "Admin2")
	testutil.CreateTestMembership(t, env.DB, admin2.ID, tenant.ID, models.RoleAdmin)

	req := env.tenantRequest(t, "DELETE", "/api/tenant/members/"+admin2.ID.Hex(), nil, admin1, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

// --- ChangeRole ---

func TestIntegration_ChangeRole_OwnerChangesUserToAdmin(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	user := testutil.CreateTestUser(t, env.DB, "user@test.com", "Test1234!@#$", "User")
	testutil.CreateTestMembership(t, env.DB, user.ID, tenant.ID, models.RoleUser)

	body := strings.NewReader(`{"role":"admin"}`)
	req := env.tenantRequest(t, "PATCH", "/api/tenant/members/"+user.ID.Hex()+"/role", body, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_ChangeRole_OwnerChangesAdminToUser(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, tenant.ID, models.RoleAdmin)

	body := strings.NewReader(`{"role":"user"}`)
	req := env.tenantRequest(t, "PATCH", "/api/tenant/members/"+admin.ID.Hex()+"/role", body, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_ChangeRole_AdminCannotChangeRoles(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, tenant.ID, models.RoleAdmin)
	user := testutil.CreateTestUser(t, env.DB, "user@test.com", "Test1234!@#$", "User")
	testutil.CreateTestMembership(t, env.DB, user.ID, tenant.ID, models.RoleUser)

	body := strings.NewReader(`{"role":"admin"}`)
	req := env.tenantRequest(t, "PATCH", "/api/tenant/members/"+user.ID.Hex()+"/role", body, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_ChangeRole_CannotChangeOwnRole(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)

	body := strings.NewReader(`{"role":"admin"}`)
	req := env.tenantRequest(t, "PATCH", "/api/tenant/members/"+owner.ID.Hex()+"/role", body, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_ChangeRole_CannotSetToOwner(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	user := testutil.CreateTestUser(t, env.DB, "user@test.com", "Test1234!@#$", "User")
	testutil.CreateTestMembership(t, env.DB, user.ID, tenant.ID, models.RoleUser)

	body := strings.NewReader(`{"role":"owner"}`)
	req := env.tenantRequest(t, "PATCH", "/api/tenant/members/"+user.ID.Hex()+"/role", body, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// --- TransferOwnership ---

func TestIntegration_TransferOwnership_OwnerTransfersToMember(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, tenant.ID, models.RoleAdmin)

	req := env.tenantRequest(t, "POST", "/api/tenant/members/"+admin.ID.Hex()+"/transfer-ownership", nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_TransferOwnership_NonOwnerCannot(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	admin := testutil.CreateTestUser(t, env.DB, "admin@test.com", "Test1234!@#$", "Admin")
	testutil.CreateTestMembership(t, env.DB, admin.ID, tenant.ID, models.RoleAdmin)
	user := testutil.CreateTestUser(t, env.DB, "user@test.com", "Test1234!@#$", "User")
	testutil.CreateTestMembership(t, env.DB, user.ID, tenant.ID, models.RoleUser)

	req := env.tenantRequest(t, "POST", "/api/tenant/members/"+user.ID.Hex()+"/transfer-ownership", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_TransferOwnership_CannotTransferToSelf(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)

	req := env.tenantRequest(t, "POST", "/api/tenant/members/"+owner.ID.Hex()+"/transfer-ownership", nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_TransferOwnership_NonMemberTarget(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "Test1234!@#$", "Owner")
	tenant := testutil.CreateTestTenant(t, env.DB, "TestTenant", owner.ID, false)
	outsider := testutil.CreateTestUser(t, env.DB, "outsider@test.com", "Test1234!@#$", "Outsider")

	req := env.tenantRequest(t, "POST", "/api/tenant/members/"+outsider.ID.Hex()+"/transfer-ownership", nil, owner, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}
