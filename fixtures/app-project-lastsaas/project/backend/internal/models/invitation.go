package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type InvitationStatus string

const (
	InvitationPending  InvitationStatus = "pending"
	InvitationAccepted InvitationStatus = "accepted"
)

type Invitation struct {
	ID        primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	TenantID  primitive.ObjectID `json:"tenantId" bson:"tenantId" validate:"required"`
	Email     string             `json:"email" bson:"email" validate:"required,email"`
	Role      MemberRole         `json:"role" bson:"role" validate:"required,valid_role"`
	Token     string             `json:"-" bson:"token" validate:"required"`
	Status    InvitationStatus   `json:"status" bson:"status" validate:"required,valid_invitation_status"`
	InvitedBy primitive.ObjectID `json:"invitedBy" bson:"invitedBy" validate:"required"`
	ExpiresAt time.Time          `json:"expiresAt" bson:"expiresAt" validate:"required"`
	CreatedAt time.Time          `json:"createdAt" bson:"createdAt" validate:"required"`
}
