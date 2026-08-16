package auth

import (
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"
)

func TestGenerateSecret(t *testing.T) {
	svc := NewTOTPService()
	key, err := svc.GenerateSecret("TestApp", "user@test.com")
	if err != nil {
		t.Fatalf("GenerateSecret failed: %v", err)
	}
	if key.Issuer() != "TestApp" {
		t.Errorf("expected issuer TestApp, got %s", key.Issuer())
	}
	if key.AccountName() != "user@test.com" {
		t.Errorf("expected account user@test.com, got %s", key.AccountName())
	}
	if key.Secret() == "" {
		t.Error("expected non-empty secret")
	}
}

func TestGenerateSecret_DifferentAccounts(t *testing.T) {
	svc := NewTOTPService()
	key1, _ := svc.GenerateSecret("App", "alice@test.com")
	key2, _ := svc.GenerateSecret("App", "bob@test.com")
	if key1.Secret() == key2.Secret() {
		t.Error("different accounts should have different secrets")
	}
}

func TestValidateCode_Valid(t *testing.T) {
	svc := NewTOTPService()
	key, err := svc.GenerateSecret("App", "user@test.com")
	if err != nil {
		t.Fatal(err)
	}
	code, err := totp.GenerateCode(key.Secret(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if !svc.ValidateCode(key.Secret(), code) {
		t.Error("expected valid code to be accepted")
	}
}

func TestValidateCode_Invalid(t *testing.T) {
	svc := NewTOTPService()
	key, _ := svc.GenerateSecret("App", "user@test.com")
	if svc.ValidateCode(key.Secret(), "000000") {
		t.Error("expected invalid code to be rejected")
	}
}

func TestValidateCode_EmptyCode(t *testing.T) {
	svc := NewTOTPService()
	key, _ := svc.GenerateSecret("App", "user@test.com")
	if svc.ValidateCode(key.Secret(), "") {
		t.Error("expected empty code to be rejected")
	}
}

func TestValidateCode_ExpiredCode(t *testing.T) {
	svc := NewTOTPService()
	key, _ := svc.GenerateSecret("App", "user@test.com")
	// Generate a code from 5 minutes ago
	code, _ := totp.GenerateCode(key.Secret(), time.Now().Add(-5*time.Minute))
	if svc.ValidateCode(key.Secret(), code) {
		t.Error("expected expired code to be rejected")
	}
}

func TestValidateCodeWithWindow_Valid(t *testing.T) {
	svc := NewTOTPService()
	key, _ := svc.GenerateSecret("App", "user@test.com")
	code, _ := totp.GenerateCode(key.Secret(), time.Now())
	if !svc.ValidateCodeWithWindow(key.Secret(), code) {
		t.Error("expected valid code to pass with window validation")
	}
}

func TestValidateCodeWithWindow_SlightSkew(t *testing.T) {
	svc := NewTOTPService()
	key, _ := svc.GenerateSecret("App", "user@test.com")
	// Generate code from 30 seconds ago (within 1-period skew)
	code, _ := totp.GenerateCode(key.Secret(), time.Now().Add(-30*time.Second))
	if !svc.ValidateCodeWithWindow(key.Secret(), code) {
		t.Error("expected code from adjacent period to pass with window validation")
	}
}

func TestGenerateRecoveryCodes_Count(t *testing.T) {
	svc := NewTOTPService()
	plain, hashed, err := svc.GenerateRecoveryCodes(8)
	if err != nil {
		t.Fatal(err)
	}
	if len(plain) != 8 {
		t.Errorf("expected 8 plain codes, got %d", len(plain))
	}
	if len(hashed) != 8 {
		t.Errorf("expected 8 hashed codes, got %d", len(hashed))
	}
}

func TestGenerateRecoveryCodes_Uniqueness(t *testing.T) {
	svc := NewTOTPService()
	plain, _, err := svc.GenerateRecoveryCodes(10)
	if err != nil {
		t.Fatal(err)
	}
	seen := make(map[string]bool)
	for _, code := range plain {
		if seen[code] {
			t.Errorf("duplicate recovery code: %s", code)
		}
		seen[code] = true
	}
}

func TestGenerateRecoveryCodes_Format(t *testing.T) {
	svc := NewTOTPService()
	plain, _, err := svc.GenerateRecoveryCodes(5)
	if err != nil {
		t.Fatal(err)
	}
	for _, code := range plain {
		if len(code) != 26 {
			t.Errorf("expected 26-char code, got %d chars: %s", len(code), code)
		}
		// Should be uppercase base32
		if strings.ToUpper(code) != code {
			t.Errorf("expected uppercase code, got %s", code)
		}
	}
}

func TestGenerateRecoveryCodes_HashesMatchPlain(t *testing.T) {
	svc := NewTOTPService()
	plain, hashed, err := svc.GenerateRecoveryCodes(5)
	if err != nil {
		t.Fatal(err)
	}
	for i, code := range plain {
		hash := sha256.Sum256([]byte(code))
		expected := base64.StdEncoding.EncodeToString(hash[:])
		if hashed[i] != expected {
			t.Errorf("hash mismatch at index %d: got %s, expected %s", i, hashed[i], expected)
		}
	}
}

func TestValidateRecoveryCode_Valid(t *testing.T) {
	svc := NewTOTPService()
	plain, hashed, _ := svc.GenerateRecoveryCodes(5)
	idx, ok := svc.ValidateRecoveryCode(plain[2], hashed)
	if !ok {
		t.Error("expected valid recovery code to be accepted")
	}
	if idx != 2 {
		t.Errorf("expected index 2, got %d", idx)
	}
}

func TestValidateRecoveryCode_Invalid(t *testing.T) {
	svc := NewTOTPService()
	_, hashed, _ := svc.GenerateRecoveryCodes(5)
	idx, ok := svc.ValidateRecoveryCode("INVALIDCODE", hashed)
	if ok {
		t.Error("expected invalid recovery code to be rejected")
	}
	if idx != -1 {
		t.Errorf("expected index -1, got %d", idx)
	}
}

func TestValidateRecoveryCode_EmptyList(t *testing.T) {
	svc := NewTOTPService()
	idx, ok := svc.ValidateRecoveryCode("SOMECODE", []string{})
	if ok {
		t.Error("expected validation against empty list to fail")
	}
	if idx != -1 {
		t.Errorf("expected index -1, got %d", idx)
	}
}

func TestValidateRecoveryCode_CaseSensitive(t *testing.T) {
	svc := NewTOTPService()
	plain, hashed, _ := svc.GenerateRecoveryCodes(3)
	lower := strings.ToLower(plain[0])
	if lower == plain[0] {
		// Already lowercase somehow — skip test
		t.Skip("code is already lowercase")
	}
	_, ok := svc.ValidateRecoveryCode(lower, hashed)
	if ok {
		t.Error("expected case-different recovery code to be rejected")
	}
}

func TestValidateRecoveryCode_EachCodeMatchesCorrectIndex(t *testing.T) {
	svc := NewTOTPService()
	plain, hashed, _ := svc.GenerateRecoveryCodes(5)
	for i, code := range plain {
		idx, ok := svc.ValidateRecoveryCode(code, hashed)
		if !ok {
			t.Errorf("code %d should validate", i)
		}
		if idx != i {
			t.Errorf("code %d should match index %d, got %d", i, i, idx)
		}
	}
}

func TestTOTPServiceIsReusable(t *testing.T) {
	svc := NewTOTPService()
	// Generate multiple secrets and validate codes
	for i := 0; i < 3; i++ {
		key, err := svc.GenerateSecret("App", "user@test.com")
		if err != nil {
			t.Fatal(err)
		}
		code, _ := totp.GenerateCode(key.Secret(), time.Now())
		if !svc.ValidateCode(key.Secret(), code) {
			t.Errorf("iteration %d: valid code rejected", i)
		}
	}
}

func TestGenerateRecoveryCodes_ZeroCount(t *testing.T) {
	svc := NewTOTPService()
	plain, hashed, err := svc.GenerateRecoveryCodes(0)
	if err != nil {
		t.Fatal(err)
	}
	if len(plain) != 0 {
		t.Errorf("expected 0 plain codes, got %d", len(plain))
	}
	if len(hashed) != 0 {
		t.Errorf("expected 0 hashed codes, got %d", len(hashed))
	}
}
