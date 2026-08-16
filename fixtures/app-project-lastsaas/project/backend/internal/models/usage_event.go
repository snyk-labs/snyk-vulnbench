package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type UsageEvent struct {
	ID        primitive.ObjectID     `json:"id" bson:"_id,omitempty"`
	TenantID  primitive.ObjectID     `json:"tenantId" bson:"tenantId" validate:"required"`
	UserID    primitive.ObjectID     `json:"userId" bson:"userId" validate:"required"`
	Type      string                 `json:"type" bson:"type" validate:"required,min=1,max=100"`
	Quantity  int                    `json:"quantity" bson:"quantity" validate:"required,gte=1"`
	Metadata  map[string]string `json:"metadata,omitempty" bson:"metadata,omitempty"`
	CreatedAt time.Time              `json:"createdAt" bson:"createdAt" validate:"required"`
}
