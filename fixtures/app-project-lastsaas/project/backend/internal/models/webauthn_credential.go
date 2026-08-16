package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type WebAuthnCredential struct {
	ID              primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	UserID          primitive.ObjectID `json:"userId" bson:"userId"`
	CredentialID    string             `json:"-" bson:"credentialId"`
	PublicKey       []byte             `json:"-" bson:"publicKey"`
	AttestationType string             `json:"-" bson:"attestationType"`
	Transport       []string           `json:"-" bson:"transport"`
	SignCount       uint32             `json:"-" bson:"signCount"`
	Name            string             `json:"name" bson:"name"`
	CreatedAt       time.Time          `json:"createdAt" bson:"createdAt"`
	LastUsedAt      *time.Time         `json:"lastUsedAt,omitempty" bson:"lastUsedAt,omitempty"`
}
