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

// --- ListAPIKeys ---

func TestIntegration_ListAPIKeys_ReturnsKeys(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	testutil.CreateTestAPIKey(t, env.DB, "Test Key", "hash123", models.APIKeyAuthorityAdmin, owner.ID)

	req := env.adminRequest(t, "GET", "/api/admin/api-keys", nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var result map[string][]json.RawMessage
	json.NewDecoder(resp.Body).Decode(&result)
	if len(result["apiKeys"]) != 1 {
		t.Errorf("expected 1 key, got %d", len(result["apiKeys"]))
	}
}

func TestIntegration_ListAPIKeys_EmptyReturnsArray(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	req := env.adminRequest(t, "GET", "/api/admin/api-keys", nil, owner, rootTenant.ID.Hex())
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
	if string(result["apiKeys"]) == "null" {
		t.Error("expected empty array, got null")
	}
}

// --- CreateAPIKey ---

func TestIntegration_CreateAPIKey_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"name":"My Key","authority":"admin"}`)
	req := env.adminRequest(t, "POST", "/api/admin/api-keys", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	rawKey, ok := result["rawKey"].(string)
	if !ok || !strings.HasPrefix(rawKey, "lsk_") {
		t.Errorf("expected rawKey starting with lsk_, got %v", result["rawKey"])
	}
}

func TestIntegration_CreateAPIKey_MissingName(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"authority":"admin"}`)
	req := env.adminRequest(t, "POST", "/api/admin/api-keys", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_CreateAPIKey_InvalidAuthority(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"name":"Bad Key","authority":"superadmin"}`)
	req := env.adminRequest(t, "POST", "/api/admin/api-keys", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_CreateAPIKey_UserAuthority(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"name":"User Key","authority":"user"}`)
	req := env.adminRequest(t, "POST", "/api/admin/api-keys", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got %d", resp.StatusCode)
	}
}

// --- DeleteAPIKey ---

func TestIntegration_DeleteAPIKey_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	key := testutil.CreateTestAPIKey(t, env.DB, "Delete Me", "hash123", models.APIKeyAuthorityAdmin, owner.ID)

	req := env.adminRequest(t, "DELETE", "/api/admin/api-keys/"+key.ID.Hex(), nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_DeleteAPIKey_NotFound(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	fakeID := primitive.NewObjectID().Hex()
	req := env.adminRequest(t, "DELETE", "/api/admin/api-keys/"+fakeID, nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// --- Non-root tenant cannot access ---

func TestIntegration_APIKeys_NonRootTenantForbidden(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	nonRootOwner := testutil.CreateTestUser(t, env.DB, "nonroot@test.com", "Test1234!@#$", "NonRoot")
	nonRootTenant := testutil.CreateTestTenant(t, env.DB, "NonRoot", nonRootOwner.ID, false)

	req := env.adminRequest(t, "GET", "/api/admin/api-keys", nil, nonRootOwner, nonRootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}
