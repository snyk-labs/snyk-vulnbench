package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Announcement struct {
	ID          primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	Title       string             `json:"title" bson:"title" validate:"required,min=1,max=200"`
	Body        string             `json:"body" bson:"body" validate:"required,min=1"`
	IsPublished bool               `json:"isPublished" bson:"isPublished"`
	PublishedAt *time.Time         `json:"publishedAt,omitempty" bson:"publishedAt,omitempty"`
	CreatedAt   time.Time          `json:"createdAt" bson:"createdAt" validate:"required"`
	UpdatedAt   time.Time          `json:"updatedAt" bson:"updatedAt" validate:"required"`
}
