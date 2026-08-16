package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ConfigVarType string

const (
	ConfigTypeString   ConfigVarType = "string"
	ConfigTypeNumeric  ConfigVarType = "numeric"
	ConfigTypeEnum     ConfigVarType = "enum"
	ConfigTypeTemplate ConfigVarType = "template"
)

type ConfigVar struct {
	ID          primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	Name        string             `json:"name" bson:"name" validate:"required,min=1,max=200"`
	Description string             `json:"description" bson:"description"`
	Type        ConfigVarType      `json:"type" bson:"type" validate:"required,valid_config_type"`
	Value       string             `json:"value" bson:"value"`
	Options     string             `json:"options,omitempty" bson:"options,omitempty"`
	IsSystem    bool               `json:"isSystem" bson:"isSystem"`
	CreatedAt   time.Time          `json:"createdAt" bson:"createdAt" validate:"required"`
	UpdatedAt   time.Time          `json:"updatedAt" bson:"updatedAt" validate:"required"`
}

func ValidConfigVarType(t ConfigVarType) bool {
	switch t {
	case ConfigTypeString, ConfigTypeNumeric, ConfigTypeEnum, ConfigTypeTemplate:
		return true
	}
	return false
}
