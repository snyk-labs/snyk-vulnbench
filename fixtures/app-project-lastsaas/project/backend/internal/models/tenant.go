package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Tenant struct {
	ID        primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	Name      string             `json:"name" bson:"name" validate:"required,min=1,max=200"`
	Slug      string             `json:"slug" bson:"slug" validate:"required,min=1,max=100"`
	IsRoot    bool               `json:"isRoot" bson:"isRoot"`
	IsActive  bool                `json:"isActive" bson:"isActive"`
	PlanID               *primitive.ObjectID `json:"planId,omitempty" bson:"planId,omitempty"`
	BillingWaived        bool               `json:"billingWaived" bson:"billingWaived"`
	SubscriptionCredits  int64              `json:"subscriptionCredits" bson:"subscriptionCredits"`
	PurchasedCredits     int64              `json:"purchasedCredits" bson:"purchasedCredits"`
	StripeCustomerID     string             `json:"stripeCustomerId,omitempty" bson:"stripeCustomerId,omitempty"`
	BillingStatus        BillingStatus      `json:"billingStatus" bson:"billingStatus" validate:"omitempty,valid_billing_status"`
	StripeSubscriptionID string             `json:"stripeSubscriptionId,omitempty" bson:"stripeSubscriptionId,omitempty"`
	BillingInterval      string             `json:"billingInterval,omitempty" bson:"billingInterval,omitempty"`
	CurrentPeriodEnd     *time.Time         `json:"currentPeriodEnd,omitempty" bson:"currentPeriodEnd,omitempty"`
	CanceledAt           *time.Time         `json:"canceledAt,omitempty" bson:"canceledAt,omitempty"`
	TrialUsedAt          *time.Time         `json:"trialUsedAt,omitempty" bson:"trialUsedAt,omitempty"`
	SeatQuantity         int                `json:"seatQuantity" bson:"seatQuantity"`
	CreatedAt            time.Time          `json:"createdAt" bson:"createdAt" validate:"required"`
	UpdatedAt            time.Time          `json:"updatedAt" bson:"updatedAt" validate:"required"`
}
