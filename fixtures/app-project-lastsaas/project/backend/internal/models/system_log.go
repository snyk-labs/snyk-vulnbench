package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type LogSeverity string

const (
	LogCritical LogSeverity = "critical"
	LogHigh     LogSeverity = "high"
	LogMedium   LogSeverity = "medium"
	LogLow      LogSeverity = "low"
	LogDebug    LogSeverity = "debug"
)

type LogCategory string

const (
	LogCatAuth     LogCategory = "auth"
	LogCatBilling  LogCategory = "billing"
	LogCatAdmin    LogCategory = "admin"
	LogCatSystem   LogCategory = "system"
	LogCatSecurity LogCategory = "security"
	LogCatTenant   LogCategory = "tenant"
)

type SystemLog struct {
	ID        primitive.ObjectID     `json:"id" bson:"_id,omitempty"`
	Severity  LogSeverity            `json:"severity" bson:"severity"`
	Category  LogCategory            `json:"category,omitempty" bson:"category,omitempty"`
	Message   string                 `json:"message" bson:"message"`
	UserID    *primitive.ObjectID    `json:"userId,omitempty" bson:"userId,omitempty"`
	TenantID  *primitive.ObjectID    `json:"tenantId,omitempty" bson:"tenantId,omitempty"`
	Action    string                 `json:"action,omitempty" bson:"action,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty" bson:"metadata,omitempty"`
	CreatedAt time.Time              `json:"createdAt" bson:"createdAt"`
}
