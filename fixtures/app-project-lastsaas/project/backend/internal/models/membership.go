package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type MemberRole string

const (
	RoleOwner MemberRole = "owner"
	RoleAdmin MemberRole = "admin"
	RoleUser  MemberRole = "user"
)

type TenantMembership struct {
	ID        primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	UserID    primitive.ObjectID `json:"userId" bson:"userId" validate:"required"`
	TenantID  primitive.ObjectID `json:"tenantId" bson:"tenantId" validate:"required"`
	Role      MemberRole         `json:"role" bson:"role" validate:"required,valid_role"`
	JoinedAt  time.Time          `json:"joinedAt" bson:"joinedAt" validate:"required"`
	UpdatedAt time.Time          `json:"updatedAt" bson:"updatedAt" validate:"required"`
}

var roleHierarchy = map[MemberRole]int{
	RoleUser:  1,
	RoleAdmin: 2,
	RoleOwner: 3,
}

func RoleHasPermission(userRole MemberRole, requiredRole MemberRole) bool {
	return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}

func ValidRole(role MemberRole) bool {
	_, ok := roleHierarchy[role]
	return ok
}
