package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"lastsaas/internal/testutil"
)

func TestIntegration_RegisterSuccess(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	body := `{"email":"newuser@test.com","password":"StrongP@ss1!","displayName":"New User"}`
	resp, err := env.Client.Post(env.Server.URL+"/api/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_RegisterResponseContainsTokens(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	body := `{"email":"tokens@test.com","password":"StrongP@ss1!","displayName":"Token User"}`
	resp, err := env.Client.Post(env.Server.URL+"/api/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	var authResp AuthResponse
	json.NewDecoder(resp.Body).Decode(&authResp)

	if authResp.AccessToken == "" {
		t.Error("expected non-empty access token")
	}
	if authResp.RefreshToken == "" {
		t.Error("expected non-empty refresh token")
	}
	if authResp.User == nil || authResp.User.Email != "tokens@test.com" {
		t.Error("expected user in response")
	}
}

func TestIntegration_RegisterDuplicateEmail(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	body := `{"email":"dupe@test.com","password":"StrongP@ss1!","displayName":"User 1"}`
	resp, _ := env.Client.Post(env.Server.URL+"/api/auth/register", "application/json", strings.NewReader(body))
	resp.Body.Close()

	resp2, err := env.Client.Post(env.Server.URL+"/api/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusConflict {
		t.Errorf("expected 409, got %d", resp2.StatusCode)
	}
}

func TestIntegration_RegisterMissingFields(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	tests := []struct {
		name string
		body string
	}{
		{"missing email", `{"password":"StrongP@ss1!","displayName":"User"}`},
		{"missing password", `{"email":"test@test.com","displayName":"User"}`},
		{"missing displayName", `{"email":"test@test.com","password":"StrongP@ss1!"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp, err := env.Client.Post(env.Server.URL+"/api/auth/register", "application/json", strings.NewReader(tt.body))
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			resp.Body.Close()
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("expected 400, got %d", resp.StatusCode)
			}
		})
	}
}

func TestIntegration_RegisterWeakPassword(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	body := `{"email":"weak@test.com","password":"short","displayName":"User"}`
	resp, err := env.Client.Post(env.Server.URL+"/api/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_RegisterInvalidEmail(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	body := `{"email":"notanemail","password":"StrongP@ss1!","displayName":"User"}`
	resp, err := env.Client.Post(env.Server.URL+"/api/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestIntegration_LoginSuccess(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)
	testutil.CreateTestUser(t, env.DB, "login@test.com", "StrongP@ss1!", "Login User")

	body := `{"email":"login@test.com","password":"StrongP@ss1!"}`
	resp, err := env.Client.Post(env.Server.URL+"/api/auth/login", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_LoginWrongPassword(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)
	testutil.CreateTestUser(t, env.DB, "wrong@test.com", "StrongP@ss1!", "Wrong Pass User")

	body := `{"email":"wrong@test.com","password":"WrongPassword1!"}`
	resp, err := env.Client.Post(env.Server.URL+"/api/auth/login", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestIntegration_LoginNonexistentUser(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	body := `{"email":"noone@test.com","password":"StrongP@ss1!"}`
	resp, err := env.Client.Post(env.Server.URL+"/api/auth/login", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestIntegration_GetMe(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	user := testutil.CreateTestUser(t, env.DB, "me@test.com", "StrongP@ss1!", "Me User")
	req := env.authenticatedRequest(t, "GET", "/api/auth/me", nil, user)
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_GetMeNoToken(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	resp, err := env.Client.Get(env.Server.URL + "/api/auth/me")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestIntegration_ChangePassword(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	user := testutil.CreateTestUser(t, env.DB, "changepw@test.com", "StrongP@ss1!", "Change PW User")
	body := strings.NewReader(`{"currentPassword":"StrongP@ss1!","newPassword":"NewStr0ng!Pass"}`)
	req := env.authenticatedRequest(t, "POST", "/api/auth/change-password", body, user)
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_ChangePasswordWrongCurrent(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	user := testutil.CreateTestUser(t, env.DB, "wrongcur@test.com", "StrongP@ss1!", "Wrong Current User")
	body := strings.NewReader(`{"currentPassword":"WrongP@ss1!","newPassword":"NewStr0ng!Pass"}`)
	req := env.authenticatedRequest(t, "POST", "/api/auth/change-password", body, user)
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		t.Error("expected error for wrong current password")
	}
}

func TestIntegration_Logout(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	user := testutil.CreateTestUser(t, env.DB, "logout@test.com", "StrongP@ss1!", "Logout User")
	req := env.authenticatedRequest(t, "POST", "/api/auth/logout", nil, user)
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_RefreshToken(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	regBody := `{"email":"refresh@test.com","password":"StrongP@ss1!","displayName":"Refresh User"}`
	regResp, _ := env.Client.Post(env.Server.URL+"/api/auth/register", "application/json", strings.NewReader(regBody))
	var authResp AuthResponse
	json.NewDecoder(regResp.Body).Decode(&authResp)
	regResp.Body.Close()

	refreshBody := `{"refreshToken":"` + authResp.RefreshToken + `"}`
	resp, err := env.Client.Post(env.Server.URL+"/api/auth/refresh", "application/json", strings.NewReader(refreshBody))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
	}
}

func TestIntegration_RefreshInvalidToken(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	body := `{"refreshToken":"invalid-refresh-token"}`
	resp, err := env.Client.Post(env.Server.URL+"/api/auth/refresh", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestIntegration_SystemNotInitialized(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()

	body := `{"email":"test@test.com","password":"StrongP@ss1!","displayName":"User"}`
	resp, err := env.Client.Post(env.Server.URL+"/api/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", resp.StatusCode)
	}
}

func TestIntegration_BootstrapStatus(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()

	resp, err := env.Client.Get(env.Server.URL + "/api/bootstrap/status")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	var status struct {
		Initialized bool `json:"initialized"`
	}
	json.NewDecoder(resp.Body).Decode(&status)
	if status.Initialized {
		t.Error("expected initialized=false for fresh DB")
	}
}

func TestIntegration_BootstrapStatusAfterInit(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	testutil.MarkSystemInitialized(t, env.DB)

	resp, err := env.Client.Get(env.Server.URL + "/api/bootstrap/status")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	var status struct {
		Initialized bool `json:"initialized"`
	}
	json.NewDecoder(resp.Body).Decode(&status)
	if !status.Initialized {
		t.Error("expected initialized=true after marking system initialized")
	}
}
