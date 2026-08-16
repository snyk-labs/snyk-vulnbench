package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// TelemetryEvent represents a single telemetry event for product analytics.
type TelemetryEvent struct {
	ID         primitive.ObjectID     `json:"id" bson:"_id,omitempty"`
	EventName  string                 `json:"eventName" bson:"eventName"`
	Category   string                 `json:"category" bson:"category"`
	UserID     *primitive.ObjectID    `json:"userId,omitempty" bson:"userId,omitempty"`
	TenantID   *primitive.ObjectID    `json:"tenantId,omitempty" bson:"tenantId,omitempty"`
	SessionID  string                 `json:"sessionId,omitempty" bson:"sessionId,omitempty"`
	Properties map[string]interface{} `json:"properties,omitempty" bson:"properties,omitempty"`
	CreatedAt  time.Time              `json:"createdAt" bson:"createdAt"`
}

// Telemetry categories.
const (
	TelemetryCategoryFunnel     = "funnel"
	TelemetryCategoryEngagement = "engagement"
	TelemetryCategoryCustom     = "custom"
)

// Built-in telemetry event names.
const (
	TelemetryPageView             = "page.view"
	TelemetryUserRegistered       = "user.registered"
	TelemetryUserVerified         = "user.verified"
	TelemetryUserLogin            = "user.login"
	TelemetryCheckoutStarted      = "checkout.started"
	TelemetrySubscriptionActivated = "subscription.activated"
	TelemetrySubscriptionCanceled = "subscription.canceled"
	TelemetryPlanChanged          = "plan.changed"
)
