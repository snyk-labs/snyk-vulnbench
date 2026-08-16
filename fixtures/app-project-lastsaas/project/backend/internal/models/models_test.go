package models

import (
	"testing"
	"time"
)

// --- User methods ---

func TestUserHasAuthMethod(t *testing.T) {
	user := &User{
		AuthMethods: []AuthMethod{AuthMethodPassword, AuthMethodGoogle},
	}

	if !user.HasAuthMethod(AuthMethodPassword) {
		t.Error("expected user to have password auth method")
	}
	if !user.HasAuthMethod(AuthMethodGoogle) {
		t.Error("expected user to have google auth method")
	}
	if user.HasAuthMethod(AuthMethodGitHub) {
		t.Error("expected user NOT to have github auth method")
	}
	if user.HasAuthMethod(AuthMethodMagicLink) {
		t.Error("expected user NOT to have magic_link auth method")
	}
}

func TestUserHasAuthMethodEmpty(t *testing.T) {
	user := &User{}
	if user.HasAuthMethod(AuthMethodPassword) {
		t.Error("expected empty user to have no auth methods")
	}
}

func TestUserIsLockedNil(t *testing.T) {
	user := &User{AccountLockedUntil: nil}
	if user.IsLocked() {
		t.Error("expected user with nil lock to not be locked")
	}
}

func TestUserIsLockedFuture(t *testing.T) {
	future := time.Now().Add(time.Hour)
	user := &User{AccountLockedUntil: &future}
	if !user.IsLocked() {
		t.Error("expected user with future lock to be locked")
	}
}

func TestUserIsLockedPast(t *testing.T) {
	past := time.Now().Add(-time.Hour)
	user := &User{AccountLockedUntil: &past}
	if user.IsLocked() {
		t.Error("expected user with past lock to not be locked")
	}
}

// --- Validator functions ---

func TestValidAPIKeyAuthority(t *testing.T) {
	if !ValidAPIKeyAuthority(APIKeyAuthorityAdmin) {
		t.Error("admin should be valid")
	}
	if !ValidAPIKeyAuthority(APIKeyAuthorityUser) {
		t.Error("user should be valid")
	}
	if ValidAPIKeyAuthority("superuser") {
		t.Error("superuser should not be valid")
	}
	if ValidAPIKeyAuthority("") {
		t.Error("empty should not be valid")
	}
}

func TestValidConfigVarType(t *testing.T) {
	valid := []ConfigVarType{ConfigTypeString, ConfigTypeNumeric, ConfigTypeEnum, ConfigTypeTemplate}
	for _, v := range valid {
		if !ValidConfigVarType(v) {
			t.Errorf("expected %q to be valid", v)
		}
	}
	if ValidConfigVarType("boolean") {
		t.Error("boolean should not be valid")
	}
	if ValidConfigVarType("") {
		t.Error("empty should not be valid")
	}
}

func TestValidWebhookEventType(t *testing.T) {
	// Test all known types are valid
	for _, et := range AllWebhookEventTypes {
		if !ValidWebhookEventType(et) {
			t.Errorf("expected %q to be valid", et)
		}
	}
	// Test unknown is invalid
	if ValidWebhookEventType("unknown.event") {
		t.Error("unknown.event should not be valid")
	}
	if ValidWebhookEventType("") {
		t.Error("empty should not be valid")
	}
}

func TestAllWebhookEventTypesNoDuplicates(t *testing.T) {
	seen := make(map[WebhookEventType]bool)
	for _, et := range AllWebhookEventTypes {
		if seen[et] {
			t.Errorf("duplicate webhook event type: %s", et)
		}
		seen[et] = true
	}
}

// --- BillingStatus constants ---

func TestBillingStatusConstants(t *testing.T) {
	statuses := []BillingStatus{BillingStatusNone, BillingStatusActive, BillingStatusPastDue, BillingStatusCanceled}
	seen := make(map[BillingStatus]bool)
	for _, s := range statuses {
		if s == "" {
			t.Error("billing status should not be empty")
		}
		if seen[s] {
			t.Errorf("duplicate billing status: %s", s)
		}
		seen[s] = true
	}
}

// --- AuthMethod constants ---

func TestAuthMethodConstants(t *testing.T) {
	methods := []AuthMethod{
		AuthMethodPassword, AuthMethodGoogle, AuthMethodGitHub,
		AuthMethodMicrosoft, AuthMethodMagicLink, AuthMethodPasskey,
	}
	seen := make(map[AuthMethod]bool)
	for _, m := range methods {
		if m == "" {
			t.Error("auth method should not be empty")
		}
		if seen[m] {
			t.Errorf("duplicate auth method: %s", m)
		}
		seen[m] = true
	}
}
