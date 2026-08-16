package auth

import (
	"errors"
	"strings"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

const (
	bcryptCost        = 12
	minPasswordLength = 10
)

var (
	ErrPasswordTooShort = errors.New("password must be at least 10 characters")
	ErrPasswordTooWeak  = errors.New("password must contain at least one uppercase letter, one lowercase letter, one number, and one special character")
	ErrPasswordCommon   = errors.New("this password is too common, please choose a more unique password")
)

var commonPasswords = map[string]bool{
	"password": true, "password1": true, "password123": true,
	"123456": true, "1234567": true, "12345678": true,
	"123456789": true, "1234567890": true, "qwerty": true,
	"qwerty123": true, "abc123": true, "monkey": true,
	"dragon": true, "letmein": true, "trustno1": true,
	"baseball": true, "iloveyou": true, "master": true,
	"sunshine": true, "ashley": true, "michael": true,
	"shadow": true, "123123": true, "654321": true,
	"superman": true, "qazwsx": true, "football": true,
	"password12": true, "starwars": true, "admin": true,
	"welcome": true, "hello": true, "charlie": true,
	"donald": true, "login": true, "princess": true,
	"master123": true, "welcome1": true, "p@ssw0rd": true,
	"passw0rd": true, "pa$$word": true, "changeme": true,
}

// dummyHash is a pre-computed bcrypt hash used to maintain constant-time
// behavior when comparing passwords for non-existent users.
var dummyHash string

func init() {
	h, _ := bcrypt.GenerateFromPassword([]byte("dummy-timing-safe"), bcryptCost)
	dummyHash = string(h)
}

type PasswordService struct {
	cost int
}

func NewPasswordService() *PasswordService {
	return &PasswordService{cost: bcryptCost}
}

// NewTestPasswordService returns a PasswordService with minimal bcrypt cost for fast tests.
func NewTestPasswordService() *PasswordService {
	return &PasswordService{cost: 4}
}

func (s *PasswordService) HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), s.cost)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func (s *PasswordService) ComparePassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}

// DummyCompare performs a bcrypt comparison against a dummy hash to equalize
// response timing for non-existent user lookups, preventing account enumeration.
func (s *PasswordService) DummyCompare(password string) {
	_ = bcrypt.CompareHashAndPassword([]byte(dummyHash), []byte(password))
}

func (s *PasswordService) ValidatePasswordStrength(password string) error {
	if len(password) < minPasswordLength {
		return ErrPasswordTooShort
	}
	if commonPasswords[strings.ToLower(password)] {
		return ErrPasswordCommon
	}

	var hasUpper, hasLower, hasNumber, hasSpecial bool
	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsNumber(char):
			hasNumber = true
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			hasSpecial = true
		}
	}

	if !hasUpper || !hasLower || !hasNumber || !hasSpecial {
		return ErrPasswordTooWeak
	}
	return nil
}
