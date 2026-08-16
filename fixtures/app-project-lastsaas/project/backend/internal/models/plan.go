package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type EntitlementType string

const (
	EntitlementTypeBool    EntitlementType = "bool"
	EntitlementTypeNumeric EntitlementType = "numeric"
)

type CreditResetPolicy string

const (
	CreditResetPolicyReset  CreditResetPolicy = "reset"
	CreditResetPolicyAccrue CreditResetPolicy = "accrue"
)

type EntitlementValue struct {
	Type         EntitlementType `json:"type" bson:"type"`
	BoolValue    bool            `json:"boolValue" bson:"boolValue"`
	NumericValue int64           `json:"numericValue" bson:"numericValue"`
	Description  string          `json:"description" bson:"description"`
}

type PricingModel string

const (
	PricingModelFlat    PricingModel = "flat"
	PricingModelPerSeat PricingModel = "per_seat"
)

type Plan struct {
	ID                   primitive.ObjectID          `json:"id" bson:"_id,omitempty"`
	Name                 string                      `json:"name" bson:"name" validate:"required,min=1,max=200"`
	Description          string                      `json:"description" bson:"description"`
	PricingModel         PricingModel                `json:"pricingModel" bson:"pricingModel" validate:"required,valid_pricing_model"`
	MonthlyPriceCents    int64                       `json:"monthlyPriceCents" bson:"monthlyPriceCents" validate:"gte=0"`
	AnnualDiscountPct    int                         `json:"annualDiscountPct" bson:"annualDiscountPct" validate:"gte=0,lte=100"`
	PerSeatPriceCents    int64                       `json:"perSeatPriceCents" bson:"perSeatPriceCents" validate:"gte=0"`
	IncludedSeats        int                         `json:"includedSeats" bson:"includedSeats" validate:"gte=0"`
	MinSeats             int                         `json:"minSeats" bson:"minSeats" validate:"gte=0"`
	MaxSeats             int                         `json:"maxSeats" bson:"maxSeats" validate:"gte=0"`
	UsageCreditsPerMonth int64                       `json:"usageCreditsPerMonth" bson:"usageCreditsPerMonth" validate:"gte=0"`
	CreditResetPolicy    CreditResetPolicy           `json:"creditResetPolicy" bson:"creditResetPolicy" validate:"required,valid_credit_reset"`
	BonusCredits         int64                       `json:"bonusCredits" bson:"bonusCredits" validate:"gte=0"`
	UserLimit            int                         `json:"userLimit" bson:"userLimit" validate:"gte=0"`
	TrialDays            int                         `json:"trialDays" bson:"trialDays" validate:"gte=0"`
	Entitlements         map[string]EntitlementValue `json:"entitlements" bson:"entitlements"`
	IsSystem             bool                        `json:"isSystem" bson:"isSystem"`
	IsArchived           bool                        `json:"isArchived" bson:"isArchived"`
	CreatedAt            time.Time                   `json:"createdAt" bson:"createdAt" validate:"required"`
	UpdatedAt            time.Time                   `json:"updatedAt" bson:"updatedAt" validate:"required"`
}
