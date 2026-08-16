package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// EventDefinition represents a user-defined event type with optional parent dependency.
type EventDefinition struct {
	ID          primitive.ObjectID  `json:"id" bson:"_id,omitempty"`
	Name        string              `json:"name" bson:"name" validate:"required,min=1,max=128"`
	Description string              `json:"description" bson:"description" validate:"max=256"`
	ParentID    *primitive.ObjectID `json:"parentId,omitempty" bson:"parentId,omitempty"`
	CreatedAt   time.Time           `json:"createdAt" bson:"createdAt"`
	UpdatedAt   time.Time           `json:"updatedAt" bson:"updatedAt"`
}
