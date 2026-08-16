package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"lastsaas/internal/models"
	"lastsaas/internal/testutil"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestIntegration_AdminDashboard(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	req := env.adminRequest(t, "GET", "/api/admin/dashboard", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_AdminListTenants(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	for i := 0; i < 3; i++ {
		otherUser := testutil.CreateTestUser(t, env.DB, "tenant"+string(rune('a'+i))+"@test.com", "StrongP@ss1!", "Tenant User")
		testutil.CreateTestTenant(t, env.DB, "Tenant "+string(rune('A'+i)), otherUser.ID, false)
	}

	req := env.adminRequest(t, "GET", "/api/admin/tenants", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_AdminGetTenant(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, rootTenant := createAdminEnv(t, env)

	req := env.adminRequest(t, "GET", "/api/admin/tenants/"+rootTenant.ID.Hex(), nil, admin, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_AdminGetTenantNotFound(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	fakeID := primitive.NewObjectID().Hex()
	req := env.adminRequest(t, "GET", "/api/admin/tenants/"+fakeID, nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestIntegration_AdminListUsers(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	testutil.CreateTestUser(t, env.DB, "user1@test.com", "StrongP@ss1!", "User One")
	testutil.CreateTestUser(t, env.DB, "user2@test.com", "StrongP@ss1!", "User Two")

	req := env.adminRequest(t, "GET", "/api/admin/users", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_AdminGetUser(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	user := testutil.CreateTestUser(t, env.DB, "getuser@test.com", "StrongP@ss1!", "Get User")

	req := env.adminRequest(t, "GET", "/api/admin/users/"+user.ID.Hex(), nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_AdminGetUserNotFound(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	fakeID := primitive.NewObjectID().Hex()
	req := env.adminRequest(t, "GET", "/api/admin/users/"+fakeID, nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestIntegration_AdminUpdateTenantStatus(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, rootTenant := createAdminEnv(t, env)

	otherUser := testutil.CreateTestUser(t, env.DB, "other@test.com", "StrongP@ss1!", "Other User")
	otherTenant := testutil.CreateTestTenant(t, env.DB, "Other Tenant", otherUser.ID, false)

	body := strings.NewReader(`{"isActive":false}`)
	req := env.adminRequest(t, "PATCH", "/api/admin/tenants/"+otherTenant.ID.Hex()+"/status", body, admin, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}

	var updated models.Tenant
	env.DB.Tenants().FindOne(context.Background(), bson.M{"_id": otherTenant.ID}).Decode(&updated)
	if updated.IsActive {
		t.Error("expected tenant to be deactivated")
	}
}

func TestIntegration_AdminUpdateUserStatus(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	user := testutil.CreateTestUser(t, env.DB, "deactivate@test.com", "StrongP@ss1!", "Deactivate User")

	body := strings.NewReader(`{"isActive":false}`)
	req := env.adminRequest(t, "PATCH", "/api/admin/users/"+user.ID.Hex()+"/status", body, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}

	var updated models.User
	env.DB.Users().FindOne(context.Background(), bson.M{"_id": user.ID}).Decode(&updated)
	if updated.IsActive {
		t.Error("expected user to be deactivated")
	}
}

func TestIntegration_AdminRequiresRootTenant(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	user := testutil.CreateTestUser(t, env.DB, "nonadmin@test.com", "StrongP@ss1!", "Non Admin")
	nonRootTenant := testutil.CreateTestTenant(t, env.DB, "Non Root", user.ID, false)

	req := env.adminRequest(t, "GET", "/api/admin/dashboard", nil, user, nonRootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_AdminRequiresAdminRole(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	owner := testutil.CreateTestUser(t, env.DB, "owner@test.com", "StrongP@ss1!", "Owner")
	rootTenant := testutil.CreateTestTenant(t, env.DB, "Root Tenant", owner.ID, true)

	regularUser := testutil.CreateTestUser(t, env.DB, "regular@test.com", "StrongP@ss1!", "Regular User")
	membership := models.TenantMembership{
		ID:        primitive.NewObjectID(),
		UserID:    regularUser.ID,
		TenantID:  rootTenant.ID,
		Role:      models.RoleUser,
		JoinedAt:  time.Now(),
		UpdatedAt: time.Now(),
	}
	env.DB.TenantMemberships().InsertOne(context.Background(), membership)

	req := env.adminRequest(t, "GET", "/api/admin/dashboard", nil, regularUser, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}

func TestIntegration_AdminSearchTenants(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	user := testutil.CreateTestUser(t, env.DB, "search@test.com", "StrongP@ss1!", "Search User")
	testutil.CreateTestTenant(t, env.DB, "Findable Corp", user.ID, false)

	req := env.adminRequest(t, "GET", "/api/admin/tenants?search=Findable", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_AdminSearchUsers(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	testutil.CreateTestUser(t, env.DB, "findme@test.com", "StrongP@ss1!", "Findme Person")

	req := env.adminRequest(t, "GET", "/api/admin/users?search=findme", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

// --- Root Members tests ---

func TestIntegration_AdminListRootMembers(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	// Add a second member
	user2 := testutil.CreateTestUser(t, env.DB, "member2@test.com", "StrongP@ss1!", "Member Two")
	testutil.CreateTestMembership(t, env.DB, user2.ID, tenant.ID, models.RoleUser)

	req := env.adminRequest(t, "GET", "/api/admin/members", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}

	var result struct {
		Members     []json.RawMessage `json:"members"`
		Invitations []json.RawMessage `json:"invitations"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if len(result.Members) < 2 {
		t.Errorf("expected at least 2 members, got %d", len(result.Members))
	}
}

func TestIntegration_AdminInviteRootMember(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"email":"newinvite@test.com","role":"user"}`)
	req := env.adminRequest(t, "POST", "/api/admin/members/invite", body, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}

	// Verify invitation exists in DB
	count, _ := env.DB.Invitations().CountDocuments(context.Background(), bson.M{
		"tenantId": tenant.ID,
		"email":    "newinvite@test.com",
		"status":   models.InvitationPending,
	})
	if count != 1 {
		t.Errorf("expected 1 invitation in DB, got %d", count)
	}
}

func TestIntegration_AdminInviteRootMemberDuplicate(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	// First invite
	body := strings.NewReader(`{"email":"dup@test.com","role":"user"}`)
	req := env.adminRequest(t, "POST", "/api/admin/members/invite", body, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 on first invite, got %d", resp.StatusCode)
	}

	// Duplicate invite
	body = strings.NewReader(`{"email":"dup@test.com","role":"user"}`)
	req = env.adminRequest(t, "POST", "/api/admin/members/invite", body, admin, tenant.ID.Hex())
	resp, err = env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusConflict {
		t.Errorf("expected 409, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_AdminRemoveRootMember(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	// Add a user to remove
	user2 := testutil.CreateTestUser(t, env.DB, "removeme@test.com", "StrongP@ss1!", "Remove Me")
	testutil.CreateTestMembership(t, env.DB, user2.ID, tenant.ID, models.RoleUser)

	req := env.adminRequest(t, "DELETE", "/api/admin/members/"+user2.ID.Hex(), nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}

	// Verify membership gone
	count, _ := env.DB.TenantMemberships().CountDocuments(context.Background(), bson.M{
		"userId":   user2.ID,
		"tenantId": tenant.ID,
	})
	if count != 0 {
		t.Errorf("expected membership to be deleted, found %d", count)
	}
}

func TestIntegration_AdminRemoveRootMemberSelf(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	req := env.adminRequest(t, "DELETE", "/api/admin/members/"+admin.ID.Hex(), nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_AdminChangeRootMemberRole(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	// Add a user to change role
	user2 := testutil.CreateTestUser(t, env.DB, "rolechange@test.com", "StrongP@ss1!", "Role Change")
	testutil.CreateTestMembership(t, env.DB, user2.ID, tenant.ID, models.RoleUser)

	body := strings.NewReader(`{"role":"admin"}`)
	req := env.adminRequest(t, "PATCH", "/api/admin/members/"+user2.ID.Hex()+"/role", body, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}

	// Verify role changed in DB
	var membership models.TenantMembership
	env.DB.TenantMemberships().FindOne(context.Background(), bson.M{
		"userId":   user2.ID,
		"tenantId": tenant.ID,
	}).Decode(&membership)
	if membership.Role != models.RoleAdmin {
		t.Errorf("expected role admin, got %s", membership.Role)
	}
}

func TestIntegration_AdminCancelRootInvitation(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	invitation := testutil.CreateTestInvitation(t, env.DB, "cancel@test.com", tenant.ID, admin.ID, models.RoleUser)

	req := env.adminRequest(t, "DELETE", "/api/admin/members/invitations/"+invitation.ID.Hex(), nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}

	// Verify invitation deleted
	count, _ := env.DB.Invitations().CountDocuments(context.Background(), bson.M{"_id": invitation.ID})
	if count != 0 {
		t.Errorf("expected invitation to be deleted, found %d", count)
	}
}
