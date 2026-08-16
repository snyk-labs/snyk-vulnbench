package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type APIKeyAuthority string

const (
	APIKeyAuthorityAdmin APIKeyAuthority = "admin"
	APIKeyAuthorityUser  APIKeyAuthority = "user"
)

func ValidAPIKeyAuthority(a APIKeyAuthority) bool {
	return a == APIKeyAuthorityAdmin || a == APIKeyAuthorityUser
}

type APIKey struct {
	ID         primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	Name       string             `json:"name" bson:"name" validate:"required,min=1,max=100"`
	KeyHash    string             `json:"-" bson:"keyHash" validate:"required"`
	KeyPreview string             `json:"keyPreview" bson:"keyPreview" validate:"required"`
	Authority  APIKeyAuthority    `json:"authority" bson:"authority" validate:"required,valid_api_authority"`
	CreatedBy  primitive.ObjectID `json:"createdBy" bson:"createdBy" validate:"required"`
	CreatedAt  time.Time          `json:"createdAt" bson:"createdAt" validate:"required"`
	LastUsedAt *time.Time         `json:"lastUsedAt" bson:"lastUsedAt"`
	IsActive   bool               `json:"isActive" bson:"isActive"`
}
