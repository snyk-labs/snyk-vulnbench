package validation

import (
	"strings"
	"testing"
	"time"

	"lastsaas/internal/models"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func validUser() models.User {
	return models.User{
		Email:       "test@example.com",
		DisplayName: "Test User",
		AuthMethods: []models.AuthMethod{models.AuthMethodPassword},
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
}

func TestValidate_ValidUser(t *testing.T) {
	u := validUser()
	if err := Validate(&u); err != nil {
		t.Errorf("expected valid user to pass: %v", err)
	}
}

func TestValidate_UserMissingEmail(t *testing.T) {
	u := validUser()
	u.Email = ""
	err := Validate(&u)
	if err == nil {
		t.Fatal("expected validation error for missing email")
	}
	if !strings.Contains(err.Error(), "Email") {
		t.Errorf("expected error to mention Email, got: %v", err)
	}
}

func TestValidate_UserInvalidEmail(t *testing.T) {
	u := validUser()
	u.Email = "not-an-email"
	if err := Validate(&u); err == nil {
		t.Fatal("expected validation error for invalid email")
	}
}

func TestValidate_UserMissingDisplayName(t *testing.T) {
	u := validUser()
	u.DisplayName = ""
	if err := Validate(&u); err == nil {
		t.Fatal("expected validation error for missing display name")
	}
}

func TestValidate_UserEmptyAuthMethods(t *testing.T) {
	u := validUser()
	u.AuthMethods = nil
	if err := Validate(&u); err == nil {
		t.Fatal("expected validation error for empty auth methods")
	}
}

func TestValidate_UserInvalidAuthMethod(t *testing.T) {
	u := validUser()
	u.AuthMethods = []models.AuthMethod{"carrier_pigeon"}
	if err := Validate(&u); err == nil {
		t.Fatal("expected validation error for invalid auth method")
	}
}

func TestValidate_UserValidThemePreference(t *testing.T) {
	for _, theme := range []string{"light", "dark", "system", ""} {
		u := validUser()
		u.ThemePreference = theme
		if err := Validate(&u); err != nil {
			t.Errorf("theme %q should be valid: %v", theme, err)
		}
	}
}

func TestValidate_UserInvalidThemePreference(t *testing.T) {
	u := validUser()
	u.ThemePreference = "neon"
	if err := Validate(&u); err == nil {
		t.Fatal("expected validation error for invalid theme preference")
	}
}

func TestValidate_ValidTenant(t *testing.T) {
	tenant := models.Tenant{
		Name:      "Acme Corp",
		Slug:      "acme-corp",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := Validate(&tenant); err != nil {
		t.Errorf("expected valid tenant to pass: %v", err)
	}
}

func TestValidate_TenantMissingName(t *testing.T) {
	tenant := models.Tenant{Slug: "slug", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := Validate(&tenant); err == nil {
		t.Fatal("expected validation error for missing tenant name")
	}
}

func TestValidate_TenantInvalidBillingStatus(t *testing.T) {
	tenant := models.Tenant{
		Name: "Test", Slug: "test", CreatedAt: time.Now(), UpdatedAt: time.Now(),
		BillingStatus: "bogus",
	}
	if err := Validate(&tenant); err == nil {
		t.Fatal("expected validation error for invalid billing status")
	}
}

func TestValidate_ValidMembership(t *testing.T) {
	m := models.TenantMembership{
		UserID:    primitive.NewObjectID(),
		TenantID:  primitive.NewObjectID(),
		Role:      models.RoleAdmin,
		JoinedAt:  time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := Validate(&m); err != nil {
		t.Errorf("expected valid membership to pass: %v", err)
	}
}

func TestValidate_MembershipInvalidRole(t *testing.T) {
	m := models.TenantMembership{
		UserID: primitive.NewObjectID(), TenantID: primitive.NewObjectID(),
		Role: "superadmin", JoinedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := Validate(&m); err == nil {
		t.Fatal("expected validation error for invalid role")
	}
}

func TestValidate_ValidAPIKey(t *testing.T) {
	k := models.APIKey{
		Name: "test-key", KeyHash: "hash", KeyPreview: "prev",
		Authority: models.APIKeyAuthorityAdmin,
		CreatedBy: primitive.NewObjectID(), CreatedAt: time.Now(),
	}
	if err := Validate(&k); err != nil {
		t.Errorf("expected valid API key to pass: %v", err)
	}
}

func TestValidate_APIKeyInvalidAuthority(t *testing.T) {
	k := models.APIKey{
		Name: "test-key", KeyHash: "hash", KeyPreview: "prev",
		Authority: "superuser",
		CreatedBy: primitive.NewObjectID(), CreatedAt: time.Now(),
	}
	if err := Validate(&k); err == nil {
		t.Fatal("expected validation error for invalid authority")
	}
}

func TestValidate_ValidPlan(t *testing.T) {
	p := models.Plan{
		Name: "Pro", PricingModel: models.PricingModelFlat,
		CreditResetPolicy: models.CreditResetPolicyReset,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := Validate(&p); err != nil {
		t.Errorf("expected valid plan to pass: %v", err)
	}
}

func TestValidate_PlanInvalidPricingModel(t *testing.T) {
	p := models.Plan{
		Name: "Bad", PricingModel: "usage_based",
		CreditResetPolicy: models.CreditResetPolicyReset,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := Validate(&p); err == nil {
		t.Fatal("expected validation error for invalid pricing model")
	}
}

func TestValidate_PlanNegativePrice(t *testing.T) {
	p := models.Plan{
		Name: "Bad", PricingModel: models.PricingModelFlat,
		CreditResetPolicy: models.CreditResetPolicyReset,
		MonthlyPriceCents: -100,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := Validate(&p); err == nil {
		t.Fatal("expected validation error for negative price")
	}
}

func TestValidate_ValidWebhook(t *testing.T) {
	w := models.Webhook{
		Name: "test", URL: "https://example.com/hook",
		Secret: "whsec_test", SecretPreview: "test1234",
		Events:    []models.WebhookEventType{models.WebhookEventPaymentReceived},
		CreatedBy: primitive.NewObjectID(),
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := Validate(&w); err != nil {
		t.Errorf("expected valid webhook to pass: %v", err)
	}
}

func TestValidate_WebhookInvalidEvent(t *testing.T) {
	w := models.Webhook{
		Name: "test", URL: "https://example.com/hook",
		Secret: "whsec_test", SecretPreview: "test1234",
		Events:    []models.WebhookEventType{"bogus.event"},
		CreatedBy: primitive.NewObjectID(),
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := Validate(&w); err == nil {
		t.Fatal("expected validation error for invalid webhook event")
	}
}

func TestValidate_ValidInvitation(t *testing.T) {
	inv := models.Invitation{
		TenantID: primitive.NewObjectID(), Email: "user@test.com",
		Role: models.RoleUser, Token: "tok123",
		Status: models.InvitationPending, InvitedBy: primitive.NewObjectID(),
		ExpiresAt: time.Now().Add(24 * time.Hour), CreatedAt: time.Now(),
	}
	if err := Validate(&inv); err != nil {
		t.Errorf("expected valid invitation to pass: %v", err)
	}
}

func TestValidate_InvitationInvalidStatus(t *testing.T) {
	inv := models.Invitation{
		TenantID: primitive.NewObjectID(), Email: "user@test.com",
		Role: models.RoleUser, Token: "tok123",
		Status: "expired", InvitedBy: primitive.NewObjectID(),
		ExpiresAt: time.Now(), CreatedAt: time.Now(),
	}
	if err := Validate(&inv); err == nil {
		t.Fatal("expected validation error for invalid invitation status")
	}
}

func TestValidate_ValidConfigVar(t *testing.T) {
	cv := models.ConfigVar{
		Name: "app.title", Type: models.ConfigTypeString,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := Validate(&cv); err != nil {
		t.Errorf("expected valid config var to pass: %v", err)
	}
}

func TestValidate_ConfigVarInvalidType(t *testing.T) {
	cv := models.ConfigVar{
		Name: "test", Type: "yaml",
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := Validate(&cv); err == nil {
		t.Fatal("expected validation error for invalid config var type")
	}
}

func TestValidate_CreditBundleZeroCredits(t *testing.T) {
	cb := models.CreditBundle{
		Name: "Small", Credits: 0, PriceCents: 100,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := Validate(&cb); err == nil {
		t.Fatal("expected validation error for zero credits")
	}
}

func TestValidate_ValidFinancialTransaction(t *testing.T) {
	ft := models.FinancialTransaction{
		TenantID: primitive.NewObjectID(), UserID: primitive.NewObjectID(),
		Type: models.TransactionSubscription, Currency: "usd",
		InvoiceNumber: "INV-000001", CreatedAt: time.Now(),
	}
	if err := Validate(&ft); err != nil {
		t.Errorf("expected valid transaction to pass: %v", err)
	}
}

func TestValidate_TransactionInvalidType(t *testing.T) {
	ft := models.FinancialTransaction{
		TenantID: primitive.NewObjectID(), UserID: primitive.NewObjectID(),
		Type: "chargeback", Currency: "usd",
		InvoiceNumber: "INV-000001", CreatedAt: time.Now(),
	}
	if err := Validate(&ft); err == nil {
		t.Fatal("expected validation error for invalid transaction type")
	}
}

func TestValidate_ErrorFormatting(t *testing.T) {
	u := models.User{} // all required fields missing
	err := Validate(&u)
	if err == nil {
		t.Fatal("expected validation error")
	}
	msg := err.Error()
	if !strings.HasPrefix(msg, "validation failed: ") {
		t.Errorf("expected 'validation failed:' prefix, got: %s", msg)
	}
}
