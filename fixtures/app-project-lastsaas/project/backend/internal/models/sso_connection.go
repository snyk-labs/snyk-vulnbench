package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type SSOConnection struct {
	ID               primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	TenantID         primitive.ObjectID `json:"tenantId" bson:"tenantId" validate:"required"`
	IdPMetadataURL   string             `json:"idpMetadataUrl" bson:"idpMetadataUrl"`
	IdPMetadataXML   string             `json:"-" bson:"idpMetadataXml,omitempty"`
	IdPEntityID      string             `json:"idpEntityId" bson:"idpEntityId" validate:"required"`
	IdPSSOURL        string             `json:"idpSsoUrl" bson:"idpSsoUrl" validate:"required,url"`
	IdPCertificate   string             `json:"-" bson:"idpCertificate" validate:"required"`
	AttributeMapping SSOAttributeMap    `json:"attributeMapping" bson:"attributeMapping"`
	IsActive         bool               `json:"isActive" bson:"isActive"`
	CreatedAt        time.Time          `json:"createdAt" bson:"createdAt" validate:"required"`
	UpdatedAt        time.Time          `json:"updatedAt" bson:"updatedAt" validate:"required"`
}

type SSOAttributeMap struct {
	Email       string `json:"email" bson:"email"`
	DisplayName string `json:"displayName" bson:"displayName"`
	FirstName   string `json:"firstName" bson:"firstName"`
	LastName    string `json:"lastName" bson:"lastName"`
}
