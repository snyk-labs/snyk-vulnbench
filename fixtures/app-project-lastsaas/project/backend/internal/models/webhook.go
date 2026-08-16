package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type WebhookEventType string

const (
	// Billing events (Tier 1)
	WebhookEventSubscriptionActivated WebhookEventType = "subscription.activated"
	WebhookEventSubscriptionCanceled  WebhookEventType = "subscription.canceled"
	WebhookEventPaymentReceived       WebhookEventType = "payment.received"
	WebhookEventPaymentFailed         WebhookEventType = "payment.failed"

	// Team lifecycle events (Tier 2)
	WebhookEventMemberInvited        WebhookEventType = "member.invited"
	WebhookEventMemberJoined         WebhookEventType = "member.joined"
	WebhookEventMemberRemoved        WebhookEventType = "member.removed"
	WebhookEventMemberRoleChanged    WebhookEventType = "member.role_changed"
	WebhookEventOwnershipTransferred WebhookEventType = "ownership.transferred"

	// User lifecycle events (Tier 3)
	WebhookEventUserRegistered  WebhookEventType = "user.registered"
	WebhookEventUserVerified    WebhookEventType = "user.verified"
	WebhookEventUserDeactivated WebhookEventType = "user.deactivated"

	// Credits & billing details (Tier 4)
	WebhookEventCreditsPurchased  WebhookEventType = "credits.purchased"
	WebhookEventPlanChanged       WebhookEventType = "plan.changed"
	WebhookEventTenantCreated     WebhookEventType = "tenant.created"
	WebhookEventTenantDeactivated WebhookEventType = "tenant.deactivated"

	// Audit & security events (Tier 5)
	WebhookEventUserDeleted    WebhookEventType = "user.deleted"
	WebhookEventTenantDeleted  WebhookEventType = "tenant.deleted"
	WebhookEventAPIKeyCreated  WebhookEventType = "api_key.created"
	WebhookEventAPIKeyRevoked  WebhookEventType = "api_key.revoked"
)

// AllWebhookEventTypes lists every supported webhook event type.
var AllWebhookEventTypes = []WebhookEventType{
	// Tier 1: Billing
	WebhookEventSubscriptionActivated,
	WebhookEventSubscriptionCanceled,
	WebhookEventPaymentReceived,
	WebhookEventPaymentFailed,
	// Tier 2: Team lifecycle
	WebhookEventMemberInvited,
	WebhookEventMemberJoined,
	WebhookEventMemberRemoved,
	WebhookEventMemberRoleChanged,
	WebhookEventOwnershipTransferred,
	// Tier 3: User lifecycle
	WebhookEventUserRegistered,
	WebhookEventUserVerified,
	WebhookEventUserDeactivated,
	// Tier 4: Credits & billing details
	WebhookEventCreditsPurchased,
	WebhookEventPlanChanged,
	WebhookEventTenantCreated,
	WebhookEventTenantDeactivated,
	// Tier 5: Audit & security
	WebhookEventUserDeleted,
	WebhookEventTenantDeleted,
	WebhookEventAPIKeyCreated,
	WebhookEventAPIKeyRevoked,
}

func ValidWebhookEventType(e WebhookEventType) bool {
	for _, t := range AllWebhookEventTypes {
		if t == e {
			return true
		}
	}
	return false
}

type Webhook struct {
	ID            primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	Name          string             `json:"name" bson:"name" validate:"required,min=1,max=100"`
	Description   string             `json:"description" bson:"description"`
	URL           string             `json:"url" bson:"url" validate:"required,url"`
	Secret        string             `json:"-" bson:"secret" validate:"required"`
	SecretPreview string             `json:"secretPreview" bson:"secretPreview" validate:"required"`
	Events        []WebhookEventType `json:"events" bson:"events" validate:"required,min=1,dive,valid_webhook_event"`
	IsActive      bool               `json:"isActive" bson:"isActive"`
	CreatedBy     primitive.ObjectID `json:"createdBy" bson:"createdBy" validate:"required"`
	CreatedAt     time.Time          `json:"createdAt" bson:"createdAt" validate:"required"`
	UpdatedAt     time.Time          `json:"updatedAt" bson:"updatedAt" validate:"required"`
}

type WebhookDelivery struct {
	ID           primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	WebhookID    primitive.ObjectID `json:"webhookId" bson:"webhookId"`
	EventType    WebhookEventType   `json:"eventType" bson:"eventType"`
	Payload      string             `json:"payload" bson:"payload"`
	ResponseCode int                `json:"responseCode" bson:"responseCode"`
	ResponseBody string             `json:"responseBody" bson:"responseBody"`
	Success      bool               `json:"success" bson:"success"`
	Duration     int64              `json:"durationMs" bson:"durationMs"`
	RetryCount   int                `json:"retryCount" bson:"retryCount"`
	MaxRetries   int                `json:"maxRetries" bson:"maxRetries"`
	CreatedAt    time.Time          `json:"createdAt" bson:"createdAt"`
}
