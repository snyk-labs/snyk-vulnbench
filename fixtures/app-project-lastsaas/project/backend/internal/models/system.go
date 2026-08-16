package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type SystemConfig struct {
	ID            primitive.ObjectID  `json:"id" bson:"_id,omitempty"`
	Initialized   bool                `json:"initialized" bson:"initialized"`
	InitializedAt *time.Time          `json:"initializedAt,omitempty" bson:"initializedAt,omitempty"`
	InitializedBy *primitive.ObjectID `json:"-" bson:"initializedBy,omitempty"`
	Version       string              `json:"version" bson:"version"`
}
