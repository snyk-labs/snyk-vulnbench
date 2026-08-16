package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"golang.org/x/oauth2"
)

// mockTransport intercepts all HTTP requests and routes them to a handler.
type mockTransport struct {
	handler http.HandlerFunc
}

func (t *mockTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	rr := httptest.NewRecorder()
	t.handler(rr, req)
	return rr.Result(), nil
}

// mockToken creates a simple valid oauth2.Token for testing.
func mockToken() *oauth2.Token {
	return &oauth2.Token{
		AccessToken: "mock-access-token",
		TokenType:   "Bearer",
	}
}

// --- Google OAuth ---

func TestNewGoogleOAuthService(t *testing.T) {
	svc := NewGoogleOAuthService("client-id", "client-secret", "http://localhost/callback")
	if svc == nil {
		t.Fatal("expected non-nil service")
	}
	if svc.config.ClientID != "client-id" {
		t.Errorf("expected client-id, got %q", svc.config.ClientID)
	}
}

func TestGoogleGetAuthURL(t *testing.T) {
	svc := NewGoogleOAuthService("client-id", "client-secret", "http://localhost/callback")
	url := svc.GetAuthURL("test-state")
	if !strings.Contains(url, "test-state") {
		t.Errorf("expected URL to contain state, got %q", url)
	}
	if !strings.Contains(url, "client_id=client-id") {
		t.Errorf("expected URL to contain client_id, got %q", url)
	}
}

func TestGoogleExchangeCodeSuccess(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token":  "mock-access-token",
			"token_type":    "Bearer",
			"expires_in":    3600,
			"refresh_token": "mock-refresh-token",
		})
	}))
	defer ts.Close()

	svc := &GoogleOAuthService{
		config: &oauth2.Config{
			ClientID:     "client-id",
			ClientSecret: "client-secret",
			RedirectURL:  "http://localhost/callback",
			Endpoint: oauth2.Endpoint{
				TokenURL: ts.URL,
			},
		},
	}

	token, err := svc.ExchangeCode(context.Background(), "mock-code")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if token.AccessToken != "mock-access-token" {
		t.Errorf("expected mock-access-token, got %q", token.AccessToken)
	}
}

func TestGoogleExchangeCodeFailure(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"invalid_grant"}`))
	}))
	defer ts.Close()

	svc := &GoogleOAuthService{
		config: &oauth2.Config{
			ClientID:     "client-id",
			ClientSecret: "client-secret",
			Endpoint: oauth2.Endpoint{
				TokenURL: ts.URL,
			},
		},
	}

	_, err := svc.ExchangeCode(context.Background(), "bad-code")
	if err == nil {
		t.Fatal("expected error for bad code")
	}
	if err != ErrOAuthCodeExchange {
		t.Errorf("expected ErrOAuthCodeExchange, got %v", err)
	}
}

func TestGoogleGetUserInfo(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(GoogleUserInfo{
			ID:            "12345",
			Email:         "user@gmail.com",
			VerifiedEmail: true,
			Name:          "Test User",
		})
	}))
	defer ts.Close()

	// Create a service with a config whose client will work with our mock
	svc := &GoogleOAuthService{
		config: &oauth2.Config{
			ClientID:     "client-id",
			ClientSecret: "client-secret",
			Endpoint: oauth2.Endpoint{
				TokenURL: ts.URL,
			},
		},
	}

	// Create a token and use the userinfo endpoint
	// We need to override the Google userinfo URL — since it's hardcoded,
	// we test via the raw HTTP path instead
	client := &http.Client{}
	resp, err := client.Get(ts.URL)
	if err != nil {
		t.Fatalf("mock request failed: %v", err)
	}
	defer resp.Body.Close()

	var info GoogleUserInfo
	json.NewDecoder(resp.Body).Decode(&info)
	if info.Email != "user@gmail.com" {
		t.Errorf("expected user@gmail.com, got %q", info.Email)
	}

	// At least verify the service was constructed
	_ = svc
}

// --- GitHub OAuth ---

func TestNewGitHubOAuthService(t *testing.T) {
	svc := NewGitHubOAuthService("gh-client-id", "gh-client-secret", "http://localhost/gh-callback")
	if svc == nil {
		t.Fatal("expected non-nil service")
	}
	if svc.config.ClientID != "gh-client-id" {
		t.Errorf("expected gh-client-id, got %q", svc.config.ClientID)
	}
}

func TestGitHubGetAuthURL(t *testing.T) {
	svc := NewGitHubOAuthService("gh-client-id", "gh-client-secret", "http://localhost/callback")
	url := svc.GetAuthURL("gh-state")
	if !strings.Contains(url, "gh-state") {
		t.Errorf("expected URL to contain state, got %q", url)
	}
	if !strings.Contains(url, "client_id=gh-client-id") {
		t.Errorf("expected URL to contain client_id, got %q", url)
	}
}

func TestGitHubExchangeCodeSuccess(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token": "gh-mock-token",
			"token_type":   "Bearer",
		})
	}))
	defer ts.Close()

	svc := &GitHubOAuthService{
		config: &oauth2.Config{
			ClientID:     "gh-client-id",
			ClientSecret: "gh-client-secret",
			Endpoint: oauth2.Endpoint{
				TokenURL: ts.URL,
			},
		},
	}

	token, err := svc.ExchangeCode(context.Background(), "gh-mock-code")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if token.AccessToken != "gh-mock-token" {
		t.Errorf("expected gh-mock-token, got %q", token.AccessToken)
	}
}

func TestGitHubExchangeCodeFailure(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"bad_verification_code"}`))
	}))
	defer ts.Close()

	svc := &GitHubOAuthService{
		config: &oauth2.Config{
			ClientID: "client-id",
			Endpoint: oauth2.Endpoint{TokenURL: ts.URL},
		},
	}

	_, err := svc.ExchangeCode(context.Background(), "bad-code")
	if err != ErrOAuthCodeExchange {
		t.Errorf("expected ErrOAuthCodeExchange, got %v", err)
	}
}

// --- Microsoft OAuth ---

func TestNewMicrosoftOAuthService(t *testing.T) {
	svc := NewMicrosoftOAuthService("ms-client-id", "ms-client-secret", "http://localhost/ms-callback")
	if svc == nil {
		t.Fatal("expected non-nil service")
	}
	if svc.config.ClientID != "ms-client-id" {
		t.Errorf("expected ms-client-id, got %q", svc.config.ClientID)
	}
}

func TestMicrosoftGetAuthURL(t *testing.T) {
	svc := NewMicrosoftOAuthService("ms-client-id", "ms-client-secret", "http://localhost/callback")
	url := svc.GetAuthURL("ms-state")
	if !strings.Contains(url, "ms-state") {
		t.Errorf("expected URL to contain state, got %q", url)
	}
	if !strings.Contains(url, "client_id=ms-client-id") {
		t.Errorf("expected URL to contain client_id, got %q", url)
	}
}

func TestMicrosoftExchangeCodeSuccess(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token": "ms-mock-token",
			"token_type":   "Bearer",
		})
	}))
	defer ts.Close()

	svc := &MicrosoftOAuthService{
		config: &oauth2.Config{
			ClientID:     "ms-client-id",
			ClientSecret: "ms-client-secret",
			Endpoint: oauth2.Endpoint{
				TokenURL: ts.URL,
			},
		},
	}

	token, err := svc.ExchangeCode(context.Background(), "ms-mock-code")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if token.AccessToken != "ms-mock-token" {
		t.Errorf("expected ms-mock-token, got %q", token.AccessToken)
	}
}

func TestMicrosoftExchangeCodeFailure(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":"invalid_grant"}`))
	}))
	defer ts.Close()

	svc := &MicrosoftOAuthService{
		config: &oauth2.Config{
			ClientID: "client-id",
			Endpoint: oauth2.Endpoint{TokenURL: ts.URL},
		},
	}

	_, err := svc.ExchangeCode(context.Background(), "bad-code")
	if err != ErrOAuthCodeExchange {
		t.Errorf("expected ErrOAuthCodeExchange, got %v", err)
	}
}

func TestMicrosoftUserInfoGetEmail(t *testing.T) {
	t.Run("mail field present", func(t *testing.T) {
		info := &MicrosoftUserInfo{
			Mail:              "user@company.com",
			UserPrincipalName: "user@onmicrosoft.com",
		}
		email := info.GetEmail()
		if email != "user@company.com" {
			t.Errorf("expected Mail field, got %q", email)
		}
	})

	t.Run("fallback to UPN", func(t *testing.T) {
		info := &MicrosoftUserInfo{
			Mail:              "",
			UserPrincipalName: "user@onmicrosoft.com",
		}
		email := info.GetEmail()
		if email != "user@onmicrosoft.com" {
			t.Errorf("expected UserPrincipalName fallback, got %q", email)
		}
	})
}

// --- GetUserInfo tests using mock transport ---

func TestGoogleGetUserInfoSuccess(t *testing.T) {
	transport := &mockTransport{
		handler: func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(GoogleUserInfo{
				ID:            "12345",
				Email:         "user@gmail.com",
				VerifiedEmail: true,
				Name:          "Google User",
			})
		},
	}

	svc := &GoogleOAuthService{
		config: &oauth2.Config{
			ClientID:     "client-id",
			ClientSecret: "client-secret",
			Endpoint: oauth2.Endpoint{
				TokenURL: "http://mock/token",
			},
		},
	}

	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, &http.Client{Transport: transport})
	info, err := svc.GetUserInfo(ctx, mockToken())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if info.Email != "user@gmail.com" {
		t.Errorf("expected user@gmail.com, got %q", info.Email)
	}
	if info.Name != "Google User" {
		t.Errorf("expected Google User, got %q", info.Name)
	}
}

func TestGoogleGetUserInfoError(t *testing.T) {
	transport := &mockTransport{
		handler: func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("not-json"))
		},
	}

	svc := &GoogleOAuthService{
		config: &oauth2.Config{
			ClientID: "client-id",
			Endpoint: oauth2.Endpoint{TokenURL: "http://mock/token"},
		},
	}

	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, &http.Client{Transport: transport})
	_, err := svc.GetUserInfo(ctx, mockToken())
	if err != ErrOAuthUserInfo {
		t.Errorf("expected ErrOAuthUserInfo, got %v", err)
	}
}

func TestGitHubGetUserInfoSuccess(t *testing.T) {
	transport := &mockTransport{
		handler: func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(GitHubUserInfo{
				ID:    42,
				Login: "testuser",
				Name:  "Test User",
				Email: "test@github.com",
			})
		},
	}

	svc := &GitHubOAuthService{
		config: &oauth2.Config{
			ClientID: "client-id",
			Endpoint: oauth2.Endpoint{TokenURL: "http://mock/token"},
		},
	}

	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, &http.Client{Transport: transport})
	info, err := svc.GetUserInfo(ctx, mockToken())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if info.Email != "test@github.com" {
		t.Errorf("expected test@github.com, got %q", info.Email)
	}
}

func TestGitHubGetUserInfoFallbackToEmails(t *testing.T) {
	callCount := 0
	transport := &mockTransport{
		handler: func(w http.ResponseWriter, r *http.Request) {
			callCount++
			if strings.Contains(r.URL.Path, "/emails") || callCount > 1 {
				// Second call: email list endpoint
				json.NewEncoder(w).Encode([]GitHubEmail{
					{Email: "secondary@github.com", Primary: false, Verified: true},
					{Email: "primary@github.com", Primary: true, Verified: true},
				})
			} else {
				// First call: user endpoint, email empty
				json.NewEncoder(w).Encode(GitHubUserInfo{
					ID:    42,
					Login: "testuser",
					Name:  "Test User",
					Email: "", // empty, will trigger emails fallback
				})
			}
		},
	}

	svc := &GitHubOAuthService{
		config: &oauth2.Config{
			ClientID: "client-id",
			Endpoint: oauth2.Endpoint{TokenURL: "http://mock/token"},
		},
	}

	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, &http.Client{Transport: transport})
	info, err := svc.GetUserInfo(ctx, mockToken())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if info.Email != "primary@github.com" {
		t.Errorf("expected primary@github.com, got %q", info.Email)
	}
}

func TestGitHubGetUserInfoNoEmail(t *testing.T) {
	callCount := 0
	transport := &mockTransport{
		handler: func(w http.ResponseWriter, r *http.Request) {
			callCount++
			if callCount > 1 {
				// Return emails with none verified
				json.NewEncoder(w).Encode([]GitHubEmail{
					{Email: "unverified@github.com", Primary: true, Verified: false},
				})
			} else {
				json.NewEncoder(w).Encode(GitHubUserInfo{
					ID:    42,
					Login: "testuser",
					Email: "",
				})
			}
		},
	}

	svc := &GitHubOAuthService{
		config: &oauth2.Config{
			ClientID: "client-id",
			Endpoint: oauth2.Endpoint{TokenURL: "http://mock/token"},
		},
	}

	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, &http.Client{Transport: transport})
	_, err := svc.GetUserInfo(ctx, mockToken())
	if err == nil {
		t.Fatal("expected error when no email found")
	}
}

func TestGitHubGetUserInfoInvalidJSON(t *testing.T) {
	transport := &mockTransport{
		handler: func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("not-json"))
		},
	}

	svc := &GitHubOAuthService{
		config: &oauth2.Config{
			ClientID: "client-id",
			Endpoint: oauth2.Endpoint{TokenURL: "http://mock/token"},
		},
	}

	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, &http.Client{Transport: transport})
	_, err := svc.GetUserInfo(ctx, mockToken())
	if err != ErrOAuthUserInfo {
		t.Errorf("expected ErrOAuthUserInfo, got %v", err)
	}
}

func TestMicrosoftGetUserInfoSuccess(t *testing.T) {
	transport := &mockTransport{
		handler: func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(MicrosoftUserInfo{
				ID:          "ms-12345",
				DisplayName: "MS User",
				Mail:        "user@company.com",
			})
		},
	}

	svc := &MicrosoftOAuthService{
		config: &oauth2.Config{
			ClientID: "client-id",
			Endpoint: oauth2.Endpoint{TokenURL: "http://mock/token"},
		},
	}

	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, &http.Client{Transport: transport})
	info, err := svc.GetUserInfo(ctx, mockToken())
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if info.Mail != "user@company.com" {
		t.Errorf("expected user@company.com, got %q", info.Mail)
	}
}

func TestMicrosoftGetUserInfoInvalidJSON(t *testing.T) {
	transport := &mockTransport{
		handler: func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("invalid"))
		},
	}

	svc := &MicrosoftOAuthService{
		config: &oauth2.Config{
			ClientID: "client-id",
			Endpoint: oauth2.Endpoint{TokenURL: "http://mock/token"},
		},
	}

	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, &http.Client{Transport: transport})
	_, err := svc.GetUserInfo(ctx, mockToken())
	if err != ErrOAuthUserInfo {
		t.Errorf("expected ErrOAuthUserInfo, got %v", err)
	}
}

// --- Error constants ---

func TestOAuthErrorConstants(t *testing.T) {
	if ErrInvalidOAuthState.Error() != "invalid oauth state" {
		t.Error("wrong ErrInvalidOAuthState message")
	}
	if ErrOAuthCodeExchange.Error() != "failed to exchange code" {
		t.Error("wrong ErrOAuthCodeExchange message")
	}
	if ErrOAuthUserInfo.Error() != "failed to get user info" {
		t.Error("wrong ErrOAuthUserInfo message")
	}
}

func TestNewTestPasswordService(t *testing.T) {
	svc := NewTestPasswordService()
	if svc == nil {
		t.Fatal("expected non-nil service")
	}
}

