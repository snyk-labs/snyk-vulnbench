package webhooks

import (
	"encoding/hex"
	"testing"

	"lastsaas/internal/events"
	"lastsaas/internal/models"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	plaintext := "my-webhook-secret"

	encrypted, err := EncryptSecret(plaintext, key)
	if err != nil {
		t.Fatalf("encrypt failed: %v", err)
	}

	decrypted, err := DecryptSecret(encrypted, key)
	if err != nil {
		t.Fatalf("decrypt failed: %v", err)
	}

	if decrypted != plaintext {
		t.Errorf("expected %q, got %q", plaintext, decrypted)
	}
}

func TestEncryptDifferentCiphertexts(t *testing.T) {
	key, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	plaintext := "same-secret"

	enc1, _ := EncryptSecret(plaintext, key)
	enc2, _ := EncryptSecret(plaintext, key)

	if enc1 == enc2 {
		t.Error("two encryptions of the same plaintext should produce different ciphertexts (different nonces)")
	}
}

func TestEncryptInvalidKeyLength(t *testing.T) {
	shortKey := []byte("too-short")
	_, err := EncryptSecret("test", shortKey)
	if err == nil {
		t.Fatal("expected error for short key")
	}
}

func TestDecryptInvalidKeyLength(t *testing.T) {
	_, err := DecryptSecret("dGVzdA==", []byte("short"))
	if err == nil {
		t.Fatal("expected error for short key")
	}
}

func TestDecryptInvalidBase64(t *testing.T) {
	key, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	_, err := DecryptSecret("not-valid-base64!!!", key)
	if err == nil {
		t.Fatal("expected error for invalid base64")
	}
}

func TestDecryptTooShortCiphertext(t *testing.T) {
	key, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	_, err := DecryptSecret("YQ==", key) // base64 of "a" — too short for nonce
	if err == nil {
		t.Fatal("expected error for too-short ciphertext")
	}
}

func TestParseEncryptionKeyEmpty(t *testing.T) {
	key, err := ParseEncryptionKey("")
	if err != nil {
		t.Fatalf("expected nil error for empty key, got %v", err)
	}
	if key != nil {
		t.Error("expected nil key for empty input")
	}
}

func TestParseEncryptionKeyValid(t *testing.T) {
	hexKey := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	key, err := ParseEncryptionKey(hexKey)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if len(key) != 32 {
		t.Errorf("expected 32-byte key, got %d bytes", len(key))
	}
}

func TestParseEncryptionKeyInvalidHex(t *testing.T) {
	_, err := ParseEncryptionKey("zzzz")
	if err == nil {
		t.Fatal("expected error for invalid hex")
	}
}

func TestParseEncryptionKeyWrongLength(t *testing.T) {
	_, err := ParseEncryptionKey("0123456789abcdef") // 16 hex chars = 8 bytes, not 32
	if err == nil {
		t.Fatal("expected error for wrong key length")
	}
}

func TestResolveSecretPlaintext(t *testing.T) {
	d := &Dispatcher{encryptionKey: nil}
	got := d.resolveSecret("my-secret")
	if got != "my-secret" {
		t.Errorf("expected plaintext passthrough, got %q", got)
	}
}

func TestResolveSecretEmpty(t *testing.T) {
	key, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	d := &Dispatcher{encryptionKey: key}
	got := d.resolveSecret("")
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestResolveSecretEncrypted(t *testing.T) {
	key, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	encrypted, _ := EncryptSecret("real-secret", key)

	d := &Dispatcher{encryptionKey: key}
	got := d.resolveSecret(encrypted)
	if got != "real-secret" {
		t.Errorf("expected 'real-secret', got %q", got)
	}
}

func TestResolveSecretLegacyPlaintext(t *testing.T) {
	key, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	// A plaintext secret that isn't valid base64/AES will fall back to plaintext
	d := &Dispatcher{encryptionKey: key}
	got := d.resolveSecret("legacy-plaintext-secret")
	if got != "legacy-plaintext-secret" {
		t.Errorf("expected legacy fallback, got %q", got)
	}
}

func TestEncryptionKeyAccessor(t *testing.T) {
	key, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	d := &Dispatcher{encryptionKey: key}
	if len(d.EncryptionKey()) != 32 {
		t.Errorf("expected 32-byte key from accessor, got %d", len(d.EncryptionKey()))
	}

	d2 := &Dispatcher{encryptionKey: nil}
	if d2.EncryptionKey() != nil {
		t.Error("expected nil key from accessor")
	}
}

func TestMapEventTypeAllMappings(t *testing.T) {
	tests := []struct {
		input    events.EventType
		expected models.WebhookEventType
	}{
		{events.EventSubscriptionActivated, models.WebhookEventSubscriptionActivated},
		{events.EventSubscriptionCanceled, models.WebhookEventSubscriptionCanceled},
		{events.EventPaymentReceived, models.WebhookEventPaymentReceived},
		{events.EventPaymentFailed, models.WebhookEventPaymentFailed},
		{events.EventMemberInvited, models.WebhookEventMemberInvited},
		{events.EventMemberJoined, models.WebhookEventMemberJoined},
		{events.EventMemberRemoved, models.WebhookEventMemberRemoved},
		{events.EventMemberRoleChanged, models.WebhookEventMemberRoleChanged},
		{events.EventOwnershipTransferred, models.WebhookEventOwnershipTransferred},
		{events.EventUserRegistered, models.WebhookEventUserRegistered},
		{events.EventUserVerified, models.WebhookEventUserVerified},
		{events.EventUserDeactivated, models.WebhookEventUserDeactivated},
		{events.EventCreditsPurchased, models.WebhookEventCreditsPurchased},
		{events.EventPlanChanged, models.WebhookEventPlanChanged},
		{events.EventTenantCreated, models.WebhookEventTenantCreated},
		{events.EventTenantDeactivated, models.WebhookEventTenantDeactivated},
		{events.EventUserDeleted, models.WebhookEventUserDeleted},
		{events.EventTenantDeleted, models.WebhookEventTenantDeleted},
		{events.EventAPIKeyCreated, models.WebhookEventAPIKeyCreated},
		{events.EventAPIKeyRevoked, models.WebhookEventAPIKeyRevoked},
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
