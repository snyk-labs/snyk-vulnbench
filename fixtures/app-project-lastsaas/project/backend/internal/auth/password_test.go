package auth

import (
	"testing"
)

func TestPasswordHashing(t *testing.T) {
	svc := &PasswordService{cost: 4} // Low cost for fast tests.

	password := "TestPassword123!"
	hash, err := svc.HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	if hash == "" {
		t.Fatal("hash should not be empty")
	}

	// Correct password should match.
	if err := svc.ComparePassword(hash, password); err != nil {
		t.Fatalf("ComparePassword should succeed for correct password: %v", err)
	}

	// Wrong password should not match.
	if err := svc.ComparePassword(hash, "WrongPassword123!"); err == nil {
		t.Fatal("ComparePassword should fail for wrong password")
	}
}

func TestPasswordValidation(t *testing.T) {
	svc := NewPasswordService()

	tests := []struct {
		name     string
		password string
		wantErr  error
	}{
		{"valid strong password", "MyStr0ng!Pass", nil},
		{"too short", "Ab1!", ErrPasswordTooShort},
		{"no uppercase", "mystr0ng!pass", ErrPasswordTooWeak},
		{"no lowercase", "MYSTR0NG!PASS", ErrPasswordTooWeak},
		{"no number", "MyStrong!Pass", ErrPasswordTooWeak},
		{"no special char", "MyStr0ngPasss", ErrPasswordTooWeak},
		{"common password", "password123", ErrPasswordCommon},
		{"short common password hits length first", "p@ssw0rd", ErrPasswordTooShort},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := svc.ValidatePasswordStrength(tt.password)
			if err != tt.wantErr {
				t.Errorf("expected error %v, got %v", tt.wantErr, err)
			}
		})
	}
}
