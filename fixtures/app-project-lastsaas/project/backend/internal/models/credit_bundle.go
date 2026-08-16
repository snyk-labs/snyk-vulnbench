package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type CreditBundle struct {
	ID         primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	Name       string             `json:"name" bson:"name" validate:"required,min=1,max=200"`
	Credits    int64              `json:"credits" bson:"credits" validate:"required,gt=0"`
	PriceCents int64              `json:"priceCents" bson:"priceCents" validate:"required,gt=0"`
	IsActive   bool               `json:"isActive" bson:"isActive"`
	SortOrder  int                `json:"sortOrder" bson:"sortOrder"`
	CreatedAt  time.Time          `json:"createdAt" bson:"createdAt" validate:"required"`
	UpdatedAt  time.Time          `json:"updatedAt" bson:"updatedAt" validate:"required"`
}
