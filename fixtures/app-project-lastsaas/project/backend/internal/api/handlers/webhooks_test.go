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

// --- ListWebhooks ---

func TestIntegration_ListWebhooks_ReturnsWebhooks(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	testutil.CreateTestWebhook(t, env.DB, "Test Hook", "https://example.com/hook", "whsec_test",
		[]models.WebhookEventType{models.WebhookEventUserRegistered}, owner.ID)

	req := env.adminRequest(t, "GET", "/api/admin/webhooks", nil, owner, rootTenant.ID.Hex())
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
	var hooks []json.RawMessage
	json.Unmarshal(result["webhooks"], &hooks)
	if len(hooks) != 1 {
		t.Errorf("expected 1 webhook, got %d", len(hooks))
	}
}

func TestIntegration_ListWebhooks_EmptyReturnsArray(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	req := env.adminRequest(t, "GET", "/api/admin/webhooks", nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

// --- ListEventTypes ---

func TestIntegration_ListEventTypes_ReturnsTypes(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	req := env.adminRequest(t, "GET", "/api/admin/webhooks/event-types", nil, owner, rootTenant.ID.Hex())
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
	if len(result["eventTypes"]) == 0 {
		t.Error("expected non-empty event types list")
	}
}

// --- CreateWebhook ---

func TestIntegration_CreateWebhook_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"name":"My Hook","url":"https://example.com/hook","events":["user.registered"]}`)
	req := env.adminRequest(t, "POST", "/api/admin/webhooks", body, owner, rootTenant.ID.Hex())
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
	secret, ok := result["secret"].(string)
	if !ok || !strings.HasPrefix(secret, "whsec_") {
		t.Errorf("expected secret starting with whsec_, got %v", result["secret"])
	}
}

func TestIntegration_CreateWebhook_MissingName(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"url":"https://example.com/hook","events":["user.registered"]}`)
	req := env.adminRequest(t, "POST", "/api/admin/webhooks", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_CreateWebhook_MissingURL(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"name":"Hook","events":["user.registered"]}`)
	req := env.adminRequest(t, "POST", "/api/admin/webhooks", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_CreateWebhook_InvalidURL(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"name":"Hook","url":"not-a-url","events":["user.registered"]}`)
	req := env.adminRequest(t, "POST", "/api/admin/webhooks", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_CreateWebhook_MissingEvents(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	body := strings.NewReader(`{"name":"Hook","url":"https://example.com/hook","events":[]}`)
	req := env.adminRequest(t, "POST", "/api/admin/webhooks", body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// --- GetWebhook ---

func TestIntegration_GetWebhook_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	hook := testutil.CreateTestWebhook(t, env.DB, "Get Me", "https://example.com", "whsec_test",
		[]models.WebhookEventType{models.WebhookEventUserRegistered}, owner.ID)

	req := env.adminRequest(t, "GET", "/api/admin/webhooks/"+hook.ID.Hex(), nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_GetWebhook_NotFound(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	fakeID := primitive.NewObjectID().Hex()
	req := env.adminRequest(t, "GET", "/api/admin/webhooks/"+fakeID, nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// --- UpdateWebhook ---

func TestIntegration_UpdateWebhook_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	hook := testutil.CreateTestWebhook(t, env.DB, "Update Me", "https://old.com", "whsec_test",
		[]models.WebhookEventType{models.WebhookEventUserRegistered}, owner.ID)

	body := strings.NewReader(`{"name":"Updated Hook","url":"https://new.com/hook","events":["user.registered","user.verified"]}`)
	req := env.adminRequest(t, "PUT", "/api/admin/webhooks/"+hook.ID.Hex(), body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_UpdateWebhook_NotFound(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	fakeID := primitive.NewObjectID().Hex()
	body := strings.NewReader(`{"name":"Ghost","url":"https://example.com","events":["user.registered"]}`)
	req := env.adminRequest(t, "PUT", "/api/admin/webhooks/"+fakeID, body, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// --- DeleteWebhook ---

func TestIntegration_DeleteWebhook_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	hook := testutil.CreateTestWebhook(t, env.DB, "Delete Me", "https://example.com", "whsec_test",
		[]models.WebhookEventType{models.WebhookEventUserRegistered}, owner.ID)

	req := env.adminRequest(t, "DELETE", "/api/admin/webhooks/"+hook.ID.Hex(), nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_DeleteWebhook_NotFound(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	fakeID := primitive.NewObjectID().Hex()
	req := env.adminRequest(t, "DELETE", "/api/admin/webhooks/"+fakeID, nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// --- RegenerateSecret ---

func TestIntegration_RegenerateSecret_Success(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	owner, rootTenant := createAdminEnv(t, env)

	hook := testutil.CreateTestWebhook(t, env.DB, "Regen Me", "https://example.com", "whsec_old",
		[]models.WebhookEventType{models.WebhookEventUserRegistered}, owner.ID)

	req := env.adminRequest(t, "POST", "/api/admin/webhooks/"+hook.ID.Hex()+"/regenerate-secret", nil, owner, rootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	newSecret, ok := result["secret"].(string)
	if !ok || newSecret == "whsec_old" {
		t.Error("expected a new secret different from old")
	}
}

// --- Non-root tenant cannot access ---

func TestIntegration_Webhooks_NonRootTenantForbidden(t *testing.T) {
	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	nonRootOwner := testutil.CreateTestUser(t, env.DB, "nonroot@test.com", "Test1234!@#$", "NonRoot")
	nonRootTenant := testutil.CreateTestTenant(t, env.DB, "NonRoot", nonRootOwner.ID, false)

	req := env.adminRequest(t, "GET", "/api/admin/webhooks", nil, nonRootOwner, nonRootTenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("expected 403, got %d", resp.StatusCode)
	}
}
