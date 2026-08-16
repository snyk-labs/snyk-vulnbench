package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"

	"lastsaas/internal/events"
	"lastsaas/internal/models"
)

func TestComputeSignature(t *testing.T) {
	payload := []byte(`{"event":"tenant.created","data":{}}`)
	secret := "test-secret-key"

	sig := computeSignature(payload, secret)

	// Verify it starts with sha256=.
	if len(sig) < 8 || sig[:7] != "sha256=" {
		t.Fatalf("signature should start with 'sha256=', got: %s", sig)
	}

	// Verify the HMAC is correct.
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expected := fmt.Sprintf("sha256=%s", hex.EncodeToString(mac.Sum(nil)))
	if sig != expected {
		t.Fatalf("expected %s, got %s", expected, sig)
	}
}

func TestComputeSignatureDifferentSecrets(t *testing.T) {
	payload := []byte(`{"event":"test"}`)

	sig1 := computeSignature(payload, "secret-1")
	sig2 := computeSignature(payload, "secret-2")

	if sig1 == sig2 {
		t.Fatal("different secrets should produce different signatures")
	}
}

func TestMapEventType(t *testing.T) {
	tests := []struct {
		input    events.EventType
		expected models.WebhookEventType
	}{
		{events.EventSubscriptionActivated, models.WebhookEventSubscriptionActivated},
		{events.EventPaymentReceived, models.WebhookEventPaymentReceived},
		{events.EventMemberInvited, models.WebhookEventMemberInvited},
		{events.EventUserRegistered, models.WebhookEventUserRegistered},
		{events.EventTenantCreated, models.WebhookEventTenantCreated},
		{events.EventAPIKeyCreated, models.WebhookEventAPIKeyCreated},
		{"unknown.event", ""},
	}

	for _, tt := range tests {
		t.Run(string(tt.input), func(t *testing.T) {
			got := mapEventType(tt.input)
			if got != tt.expected {
				t.Errorf("mapEventType(%s) = %s, want %s", tt.input, got, tt.expected)
			}
		})
	}
}
