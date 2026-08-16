package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// BillingStatus represents the current billing state of a tenant.
type BillingStatus string

const (
	BillingStatusNone     BillingStatus = "none"
	BillingStatusActive   BillingStatus = "active"
	BillingStatusPastDue  BillingStatus = "past_due"
	BillingStatusCanceled BillingStatus = "canceled"
)

// TransactionType categorizes financial transactions.
type TransactionType string

const (
	TransactionSubscription   TransactionType = "subscription"
	TransactionCreditPurchase TransactionType = "credit_purchase"
	TransactionRefund         TransactionType = "refund"
)

// FinancialTransaction records every payment event.
type FinancialTransaction struct {
	ID                   primitive.ObjectID  `json:"id" bson:"_id,omitempty"`
	TenantID             primitive.ObjectID  `json:"tenantId" bson:"tenantId" validate:"required"`
	UserID               primitive.ObjectID  `json:"userId" bson:"userId" validate:"required"`
	Type                 TransactionType     `json:"type" bson:"type" validate:"required,oneof=subscription credit_purchase refund"`
	AmountCents          int64               `json:"amountCents" bson:"amountCents"`
	SubtotalCents        int64               `json:"subtotalCents" bson:"subtotalCents"`
	TaxAmountCents       int64               `json:"taxAmountCents" bson:"taxAmountCents"`
	Currency             string              `json:"currency" bson:"currency" validate:"required,len=3"`
	Description          string              `json:"description" bson:"description"`
	InvoiceNumber        string              `json:"invoiceNumber" bson:"invoiceNumber" validate:"required"`
	StripeSessionID      string              `json:"stripeSessionId,omitempty" bson:"stripeSessionId,omitempty"`
	StripeInvoiceID      string              `json:"stripeInvoiceId,omitempty" bson:"stripeInvoiceId,omitempty"`
	StripeSubscriptionID string              `json:"stripeSubscriptionId,omitempty" bson:"stripeSubscriptionId,omitempty"`
	PlanID               *primitive.ObjectID `json:"planId,omitempty" bson:"planId,omitempty"`
	PlanName             string              `json:"planName,omitempty" bson:"planName,omitempty"`
	BundleID             *primitive.ObjectID `json:"bundleId,omitempty" bson:"bundleId,omitempty"`
	BundleName           string              `json:"bundleName,omitempty" bson:"bundleName,omitempty"`
	BillingInterval      string              `json:"billingInterval,omitempty" bson:"billingInterval,omitempty"`
	CreatedAt            time.Time           `json:"createdAt" bson:"createdAt" validate:"required"`
}

// StripeMapping maps internal entities (plans, bundles) to Stripe Products/Prices.
type StripeMapping struct {
	ID              primitive.ObjectID `bson:"_id,omitempty"`
	EntityType      string             `bson:"entityType"`
	EntityID        primitive.ObjectID `bson:"entityId"`
	StripePriceID   string             `bson:"stripePriceId"`
	StripeProductID string             `bson:"stripeProductId"`
	CreatedAt       time.Time          `bson:"createdAt"`
}

// InvoiceCounter is used for atomic invoice number generation.
type InvoiceCounter struct {
	ID    string `bson:"_id"`
	Value int64  `bson:"value"`
}

// DailyMetric stores daily business metrics for dashboard charts.
type DailyMetric struct {
	ID        primitive.ObjectID `bson:"_id,omitempty"`
	Date      string             `json:"date" bson:"date"`
	DAU       int64              `json:"dau" bson:"dau"`
	WAU       int64              `json:"wau" bson:"wau"`
	MAU       int64              `json:"mau" bson:"mau"`
	Revenue   int64              `json:"revenue" bson:"revenue"`
	ARR       int64              `json:"arr" bson:"arr"`
	CreatedAt time.Time          `json:"createdAt" bson:"createdAt"`
}
