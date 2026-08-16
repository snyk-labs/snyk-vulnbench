package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

const totpEncPrefix = "enc:"

type TOTPService struct {
	encryptionKey []byte // AES-256 key for encrypting TOTP secrets at rest (nil = plaintext)
}

func NewTOTPService() *TOTPService {
	return &TOTPService{}
}

// NewTOTPServiceWithEncryption creates a TOTPService that encrypts secrets at rest.
func NewTOTPServiceWithEncryption(key []byte) *TOTPService {
	return &TOTPService{encryptionKey: key}
}

// EncryptSecret encrypts a TOTP secret for storage. Returns as-is if no key is configured.
func (s *TOTPService) EncryptSecret(secret string) (string, error) {
	if s.encryptionKey == nil || len(s.encryptionKey) != 32 {
		return secret, nil
	}

	block, err := aes.NewCipher(s.encryptionKey)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}
	ciphertext := aesGCM.Seal(nonce, nonce, []byte(secret), nil)
	return totpEncPrefix + base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptSecret decrypts a TOTP secret from storage. Handles plaintext (legacy) secrets transparently.
func (s *TOTPService) DecryptSecret(stored string) string {
	if !strings.HasPrefix(stored, totpEncPrefix) {
		return stored // plaintext legacy secret
	}
	if s.encryptionKey == nil || len(s.encryptionKey) != 32 {
		return stored // encrypted but no key — return as-is (will fail validation)
	}

	data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, totpEncPrefix))
	if err != nil {
		return stored
	}
	block, err := aes.NewCipher(s.encryptionKey)
	if err != nil {
		return stored
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return stored
	}
	nonceSize := aesGCM.NonceSize()
	if len(data) < nonceSize {
		return stored
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return stored // decryption failed — may be corrupted
	}
	return string(plaintext)
}

func (s *TOTPService) GenerateSecret(issuer, email string) (*otp.Key, error) {
	return totp.Generate(totp.GenerateOpts{
		Issuer:      issuer,
		AccountName: email,
		Period:      30,
		Digits:      otp.DigitsSix,
		Algorithm:   otp.AlgorithmSHA1,
	})
}

func (s *TOTPService) ValidateCode(secret, code string) bool {
	return totp.Validate(code, secret)
}

// GenerateRecoveryCodes returns (plaintext codes, hashed codes).
func (s *TOTPService) GenerateRecoveryCodes(count int) ([]string, []string, error) {
	plain := make([]string, count)
	hashed := make([]string, count)
	for i := 0; i < count; i++ {
		b := make([]byte, 16)
		if _, err := rand.Read(b); err != nil {
			return nil, nil, fmt.Errorf("failed to generate recovery code: %w", err)
		}
		code := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
		plain[i] = code
		hash := sha256.Sum256([]byte(code))
		hashed[i] = base64.StdEncoding.EncodeToString(hash[:])
	}
	return plain, hashed, nil
}

func (s *TOTPService) ValidateRecoveryCode(code string, hashedCodes []string) (int, bool) {
	hash := sha256.Sum256([]byte(code))
	codeHash := base64.StdEncoding.EncodeToString(hash[:])
	for i, h := range hashedCodes {
		if subtle.ConstantTimeCompare([]byte(h), []byte(codeHash)) == 1 {
			return i, true
		}
	}
	return -1, false
}

// ValidateCodeWithWindow validates TOTP with a small time window for clock skew.
func (s *TOTPService) ValidateCodeWithWindow(secret, code string) bool {
	valid, _ := totp.ValidateCustom(code, secret, time.Now(), totp.ValidateOpts{
		Period:    30,
		Skew:     1,
		Digits:   otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	return valid
}
