package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"lastsaas/internal/auth"
	"lastsaas/internal/models"
	"lastsaas/internal/testutil"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func setupAuthMiddleware(t *testing.T) (*AuthMiddleware, func()) {
	t.Helper()
	database, cleanup := testutil.MustConnectTestDB(t)
	testutil.CleanupCollections(t, database)

	jwtService := auth.NewJWTService("test-access-secret-minimum16chars", "test-refresh-secret-minimum16chars", 30, 7)
	am := NewAuthMiddleware(jwtService, database)
	return am, cleanup
}

func TestRequireAuthMissingHeader(t *testing.T) {
	am, cleanup := setupAuthMiddleware(t)
	defer cleanup()

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("inner handler should not be called")
	})

	handler := am.RequireAuth(inner)
	req := httptest.NewRequest("GET", "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr.Code)
	}
}

func TestRequireAuthInvalidFormat(t *testing.T) {
	am, cleanup := setupAuthMiddleware(t)
	defer cleanup()

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("inner handler should not be called")
	})

	handler := am.RequireAuth(inner)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Basic dXNlcjpwYXNz")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr.Code)
	}
}

func TestRequireAuthInvalidToken(t *testing.T) {
	am, cleanup := setupAuthMiddleware(t)
	defer cleanup()

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("inner handler should not be called")
	})

	handler := am.RequireAuth(inner)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer invalid-jwt-token")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr.Code)
	}
}

func TestRequireAuthValidJWT(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	user := testutil.CreateTestUser(t, database, "jwt-test@example.com", "password123", "JWT User")

	jwtService := auth.NewJWTService("test-access-secret-minimum16chars", "test-refresh-secret-minimum16chars", 30, 7)
	am := NewAuthMiddleware(jwtService, database)

	token, err := jwtService.GenerateAccessToken(user.ID.Hex(), user.Email, user.DisplayName)
	if err != nil {
		t.Fatalf("failed to generate access token: %v", err)
	}

	var gotUser *models.User
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUser, _ = GetUserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	handler := am.RequireAuth(inner)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
	if gotUser == nil {
		t.Fatal("expected user in context")
	}
	if gotUser.Email != "jwt-test@example.com" {
		t.Errorf("expected email 'jwt-test@example.com', got %q", gotUser.Email)
	}
}

func TestRequireAuthRevokedToken(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	user := testutil.CreateTestUser(t, database, "revoked@example.com", "password123", "Revoked User")

	jwtService := auth.NewJWTService("test-access-secret-minimum16chars", "test-refresh-secret-minimum16chars", 30, 7)
	am := NewAuthMiddleware(jwtService, database)

	token, _ := jwtService.GenerateAccessToken(user.ID.Hex(), user.Email, user.DisplayName)

	// Revoke the token
	hash := sha256.Sum256([]byte(token))
	tokenHash := base64.StdEncoding.EncodeToString(hash[:])
	database.RevokedTokens().InsertOne(context.Background(), bson.M{
		"tokenHash": tokenHash,
		"revokedAt": time.Now(),
	})

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("inner handler should not be called for revoked token")
	})

	handler := am.RequireAuth(inner)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for revoked token, got %d", rr.Code)
	}
}

func TestRequireAuthInactiveUser(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	user := testutil.CreateTestUser(t, database, "inactive@example.com", "password123", "Inactive User")

	// Deactivate the user
	database.Users().UpdateOne(context.Background(), bson.M{"_id": user.ID}, bson.M{"$set": bson.M{"isActive": false}})

	jwtService := auth.NewJWTService("test-access-secret-minimum16chars", "test-refresh-secret-minimum16chars", 30, 7)
	am := NewAuthMiddleware(jwtService, database)

	token, _ := jwtService.GenerateAccessToken(user.ID.Hex(), user.Email, user.DisplayName)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("inner handler should not be called for inactive user")
	})

	handler := am.RequireAuth(inner)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for inactive user, got %d", rr.Code)
	}
}

func TestRequireAuthAPIKey(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	user := testutil.CreateTestUser(t, database, "apikey@example.com", "password123", "API User")

	rawKey := "lsk_testapikey1234567890"
	hash := sha256.Sum256([]byte(rawKey))
	keyHash := base64.RawURLEncoding.EncodeToString(hash[:])

	testutil.CreateTestAPIKey(t, database, "Test Key", keyHash, models.APIKeyAuthorityUser, user.ID)

	jwtService := auth.NewJWTService("test-access-secret-minimum16chars", "test-refresh-secret-minimum16chars", 30, 7)
	am := NewAuthMiddleware(jwtService, database)

	var gotUser *models.User
	var gotKey *models.APIKey
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUser, _ = GetUserFromContext(r.Context())
		gotKey, _ = GetAPIKeyFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	handler := am.RequireAuth(inner)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for valid API key, got %d", rr.Code)
	}
	if gotUser == nil {
		t.Fatal("expected user in context from API key auth")
	}
	if gotUser.Email != "apikey@example.com" {
		t.Errorf("expected email 'apikey@example.com', got %q", gotUser.Email)
	}
	if gotKey == nil {
		t.Fatal("expected API key in context")
	}
}

func TestRequireAuthAdminAPIKey(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	user := testutil.CreateTestUser(t, database, "admin-api@example.com", "password123", "Admin API User")
	testutil.CreateTestTenant(t, database, "Root Tenant", user.ID, true)

	rawKey := "lsk_adminkey1234567890"
	hash := sha256.Sum256([]byte(rawKey))
	keyHash := base64.RawURLEncoding.EncodeToString(hash[:])

	testutil.CreateTestAPIKey(t, database, "Admin Key", keyHash, models.APIKeyAuthorityAdmin, user.ID)

	jwtService := auth.NewJWTService("test-access-secret-minimum16chars", "test-refresh-secret-minimum16chars", 30, 7)
	am := NewAuthMiddleware(jwtService, database)

	var gotTenant *models.Tenant
	var gotMembership *models.TenantMembership
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotTenant, _ = GetTenantFromContext(r.Context())
		gotMembership, _ = GetMembershipFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	handler := am.RequireAuth(inner)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+rawKey)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for admin API key, got %d", rr.Code)
	}
	if gotTenant == nil {
		t.Fatal("expected root tenant in context for admin key")
	}
	if !gotTenant.IsRoot {
		t.Error("expected root tenant")
	}
	if gotMembership == nil {
		t.Fatal("expected membership in context for admin key")
	}
	if gotMembership.Role != models.RoleAdmin {
		t.Errorf("expected admin role, got %s", gotMembership.Role)
	}
}

func TestRequireAuthInvalidAPIKey(t *testing.T) {
	am, cleanup := setupAuthMiddleware(t)
	defer cleanup()

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("inner handler should not be called")
	})

	handler := am.RequireAuth(inner)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer lsk_nonexistentkey")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for invalid API key, got %d", rr.Code)
	}
}

func TestRequireAuthUserNotFound(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	jwtService := auth.NewJWTService("test-access-secret-minimum16chars", "test-refresh-secret-minimum16chars", 30, 7)
	am := NewAuthMiddleware(jwtService, database)

	// Generate token for a non-existent user
	fakeUserID := primitive.NewObjectID().Hex()
	token, _ := jwtService.GenerateAccessToken(fakeUserID, "ghost@example.com", "Ghost")

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("inner handler should not be called")
	})

	handler := am.RequireAuth(inner)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for non-existent user, got %d", rr.Code)
	}
}

func TestRequireTenantIntegration(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	user := testutil.CreateTestUser(t, database, "tenant-test@example.com", "password123", "Tenant User")
	tenant := testutil.CreateTestTenant(t, database, "Test Tenant", user.ID, false)

	tm := NewTenantMiddleware(database)

	var gotTenant *models.Tenant
	var gotMembership *models.TenantMembership
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotTenant, _ = GetTenantFromContext(r.Context())
		gotMembership, _ = GetMembershipFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	handler := tm.RequireTenant(inner)
	req := httptest.NewRequest("GET", "/", nil)
	// Set user in context (as if auth middleware ran first)
	ctx := context.WithValue(req.Context(), UserContextKey, user)
	req = req.WithContext(ctx)
	req.Header.Set("X-Tenant-ID", tenant.ID.Hex())

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
	if gotTenant == nil {
		t.Fatal("expected tenant in context")
	}
	if gotTenant.Name != "Test Tenant" {
		t.Errorf("expected 'Test Tenant', got %q", gotTenant.Name)
	}
	if gotMembership == nil {
		t.Fatal("expected membership in context")
	}
}

func TestRequireTenantMissingHeader(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	tm := NewTenantMiddleware(database)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("inner handler should not be called")
	})

	handler := tm.RequireTenant(inner)
	req := httptest.NewRequest("GET", "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing X-Tenant-ID, got %d", rr.Code)
	}
}

func TestRequireTenantInvalidID(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	tm := NewTenantMiddleware(database)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("inner handler should not be called")
	})

	handler := tm.RequireTenant(inner)
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Tenant-ID", "not-a-valid-id")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid tenant ID, got %d", rr.Code)
	}
}

func TestRequireTenantNotAMember(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	owner := testutil.CreateTestUser(t, database, "owner@example.com", "password123", "Owner")
	nonMember := testutil.CreateTestUser(t, database, "nonmember@example.com", "password123", "Non-member")
	tenant := testutil.CreateTestTenant(t, database, "Private Tenant", owner.ID, false)

	tm := NewTenantMiddleware(database)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("inner handler should not be called")
	})

	handler := tm.RequireTenant(inner)
	req := httptest.NewRequest("GET", "/", nil)
	ctx := context.WithValue(req.Context(), UserContextKey, nonMember)
	req = req.WithContext(ctx)
	req.Header.Set("X-Tenant-ID", tenant.ID.Hex())

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-member, got %d", rr.Code)
	}
}

func TestRequireTenantAlreadyInContext(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	tm := NewTenantMiddleware(database)

	called := false
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	handler := tm.RequireTenant(inner)
	req := httptest.NewRequest("GET", "/", nil)
	// Pre-populate tenant and membership in context (as if API key auth did it)
	tenant := &models.Tenant{ID: primitive.NewObjectID(), IsRoot: true}
	membership := &models.TenantMembership{Role: models.RoleAdmin}
	ctx := context.WithValue(req.Context(), TenantContextKey, tenant)
	ctx = context.WithValue(ctx, MembershipContextKey, membership)
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 for pre-populated context, got %d", rr.Code)
	}
	if !called {
		t.Error("expected inner handler to be called")
	}
}

func TestGetClientIPFlyClientIP(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Fly-Client-IP", "203.0.113.1")
	req.RemoteAddr = "10.0.0.1:1234"

	got := GetClientIP(req)
	if got != "203.0.113.1" {
		t.Errorf("expected Fly-Client-IP '203.0.113.1', got %q", got)
	}
}

func TestGetClientIPFlyClientIPInvalid(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Fly-Client-IP", "not-an-ip")
	req.RemoteAddr = "10.0.0.1:1234"

	got := GetClientIP(req)
	if got != "10.0.0.1" {
		t.Errorf("expected fallback to RemoteAddr, got %q", got)
	}
}

func TestRateLimiterCleanupExpired(t *testing.T) {
	rl := NewRateLimiter()
	defer rl.Stop()

	// Add an expired entry
	rl.mu.Lock()
	rl.requests["expired-key"] = &rateLimitEntry{
		count:     5,
		windowEnd: time.Now().Add(-time.Minute),
	}
	rl.requests["active-key"] = &rateLimitEntry{
		count:     3,
		windowEnd: time.Now().Add(time.Minute),
	}
	rl.mu.Unlock()

	rl.cleanupExpired()

	rl.mu.RLock()
	defer rl.mu.RUnlock()
	if _, exists := rl.requests["expired-key"]; exists {
		t.Error("expected expired-key to be cleaned up")
	}
	if _, exists := rl.requests["active-key"]; !exists {
		t.Error("expected active-key to still exist")
	}
}
