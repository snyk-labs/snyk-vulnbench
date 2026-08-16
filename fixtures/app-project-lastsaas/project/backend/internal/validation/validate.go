package validation

import (
	"fmt"
	"strings"

	"lastsaas/internal/models"

	"github.com/go-playground/validator/v10"
)

var v *validator.Validate

func init() {
	v = validator.New()

	v.RegisterValidation("valid_role", func(fl validator.FieldLevel) bool {
		return models.ValidRole(models.MemberRole(fl.Field().String()))
	})
	v.RegisterValidation("valid_api_authority", func(fl validator.FieldLevel) bool {
		return models.ValidAPIKeyAuthority(models.APIKeyAuthority(fl.Field().String()))
	})
	v.RegisterValidation("valid_config_type", func(fl validator.FieldLevel) bool {
		return models.ValidConfigVarType(models.ConfigVarType(fl.Field().String()))
	})
	v.RegisterValidation("valid_webhook_event", func(fl validator.FieldLevel) bool {
		return models.ValidWebhookEventType(models.WebhookEventType(fl.Field().String()))
	})
	v.RegisterValidation("valid_billing_status", func(fl validator.FieldLevel) bool {
		s := models.BillingStatus(fl.Field().String())
		return s == "" || s == models.BillingStatusNone || s == models.BillingStatusActive ||
			s == models.BillingStatusPastDue || s == models.BillingStatusCanceled
	})
	v.RegisterValidation("valid_pricing_model", func(fl validator.FieldLevel) bool {
		s := models.PricingModel(fl.Field().String())
		return s == models.PricingModelFlat || s == models.PricingModelPerSeat
	})
	v.RegisterValidation("valid_credit_reset", func(fl validator.FieldLevel) bool {
		s := models.CreditResetPolicy(fl.Field().String())
		return s == models.CreditResetPolicyReset || s == models.CreditResetPolicyAccrue
	})
	v.RegisterValidation("valid_auth_method", func(fl validator.FieldLevel) bool {
		switch models.AuthMethod(fl.Field().String()) {
		case models.AuthMethodPassword, models.AuthMethodGoogle, models.AuthMethodGitHub,
			models.AuthMethodMicrosoft, models.AuthMethodMagicLink, models.AuthMethodPasskey:
			return true
		}
		return false
	})
	v.RegisterValidation("valid_invitation_status", func(fl validator.FieldLevel) bool {
		s := models.InvitationStatus(fl.Field().String())
		return s == models.InvitationPending || s == models.InvitationAccepted
	})
	v.RegisterValidation("valid_logo_mode", func(fl validator.FieldLevel) bool {
		s := fl.Field().String()
		return s == "" || s == "text" || s == "image" || s == "both"
	})
}

// Validate validates a struct using go-playground/validator tags.
func Validate(s interface{}) error {
	err := v.Struct(s)
	if err == nil {
		return nil
	}
	validationErrors, ok := err.(validator.ValidationErrors)
	if !ok {
		return err
	}
	var msgs []string
	for _, fe := range validationErrors {
		msgs = append(msgs, formatFieldError(fe))
	}
	return fmt.Errorf("validation failed: %s", strings.Join(msgs, "; "))
}

func formatFieldError(fe validator.FieldError) string {
	switch fe.Tag() {
	case "required":
		return fmt.Sprintf("%s is required", fe.Field())
	case "email":
		return fmt.Sprintf("%s must be a valid email", fe.Field())
	case "min":
		return fmt.Sprintf("%s must be at least %s", fe.Field(), fe.Param())
	case "max":
		return fmt.Sprintf("%s must be at most %s", fe.Field(), fe.Param())
	case "gte":
		return fmt.Sprintf("%s must be >= %s", fe.Field(), fe.Param())
	case "gt":
		return fmt.Sprintf("%s must be > %s", fe.Field(), fe.Param())
	case "len":
		return fmt.Sprintf("%s must be exactly %s characters", fe.Field(), fe.Param())
	case "url":
		return fmt.Sprintf("%s must be a valid URL", fe.Field())
	case "oneof":
		return fmt.Sprintf("%s must be one of: %s", fe.Field(), fe.Param())
	default:
		return fmt.Sprintf("%s failed %s validation", fe.Field(), fe.Tag())
	}
}
