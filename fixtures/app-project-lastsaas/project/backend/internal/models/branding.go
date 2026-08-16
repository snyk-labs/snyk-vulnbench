package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// NavItem represents a navigation item in the app sidebar.
type NavItem struct {
	ID              string `json:"id" bson:"id"`
	Label           string `json:"label" bson:"label"`
	Icon            string `json:"icon" bson:"icon"`
	Target          string `json:"target" bson:"target"`                                       // internal route or "/p/slug"
	EntitlementGate string `json:"entitlementGate,omitempty" bson:"entitlementGate,omitempty"` // entitlement key required
	IsBuiltIn       bool   `json:"isBuiltIn" bson:"isBuiltIn"`
	Visible         bool   `json:"visible" bson:"visible"`
	SortOrder       int    `json:"sortOrder" bson:"sortOrder"`
}

// BrandingConfig stores the global branding settings.
type BrandingConfig struct {
	ID primitive.ObjectID `json:"id" bson:"_id,omitempty"`

	// Identity
	AppName  string `json:"appName" bson:"appName" validate:"required,min=1,max=200"`
	Tagline  string `json:"tagline" bson:"tagline"`
	LogoMode string `json:"logoMode" bson:"logoMode" validate:"omitempty,valid_logo_mode"` // "text", "image", "both"

	// Theme
	PrimaryColor    string `json:"primaryColor" bson:"primaryColor"`
	AccentColor     string `json:"accentColor" bson:"accentColor"`
	BackgroundColor string `json:"backgroundColor" bson:"backgroundColor"`
	SurfaceColor    string `json:"surfaceColor" bson:"surfaceColor"`
	TextColor       string `json:"textColor" bson:"textColor"`
	FontFamily      string `json:"fontFamily" bson:"fontFamily"`
	HeadingFont     string `json:"headingFont" bson:"headingFont"`

	// Landing page
	LandingEnabled     bool   `json:"landingEnabled" bson:"landingEnabled"`
	LandingTitle       string `json:"landingTitle" bson:"landingTitle"`
	LandingMeta        string `json:"landingMeta" bson:"landingMeta"`
	LandingHTML        string `json:"landingHtml" bson:"landingHtml"`

	// Dashboard
	DashboardHTML string `json:"dashboardHtml" bson:"dashboardHtml"`

	// Auth pages
	LoginHeading   string `json:"loginHeading" bson:"loginHeading"`
	LoginSubtext   string `json:"loginSubtext" bson:"loginSubtext"`
	SignupHeading  string `json:"signupHeading" bson:"signupHeading"`
	SignupSubtext  string `json:"signupSubtext" bson:"signupSubtext"`

	// Custom head/CSS
	CustomCSS string `json:"customCss" bson:"customCss"`
	HeadHTML  string `json:"headHtml" bson:"headHtml"`

	// Social
	OgImageURL string `json:"ogImageUrl" bson:"ogImageUrl"`

	// Navigation
	NavItems []NavItem `json:"navItems" bson:"navItems"`

	CreatedAt time.Time `json:"createdAt" bson:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt" bson:"updatedAt"`
}

// BrandingAsset stores binary assets (logo, favicon, etc.).
type BrandingAsset struct {
	ID          primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	Key         string             `json:"key" bson:"key"`                 // "logo", "favicon", or unique media ID
	Filename    string             `json:"filename" bson:"filename"`
	ContentType string             `json:"contentType" bson:"contentType"`
	Data        []byte             `json:"-" bson:"data"`
	Size        int64              `json:"size" bson:"size"`
	CreatedAt   time.Time          `json:"createdAt" bson:"createdAt"`
}

// CustomPage stores user-created pages with arbitrary HTML content.
type CustomPage struct {
	ID              primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	Slug            string             `json:"slug" bson:"slug" validate:"required,min=1,max=200"`
	Title           string             `json:"title" bson:"title" validate:"required,min=1,max=200"`
	HTMLBody        string             `json:"htmlBody" bson:"htmlBody"`
	MetaDescription string             `json:"metaDescription" bson:"metaDescription"`
	OgImage         string             `json:"ogImage" bson:"ogImage"`
	IsPublished     bool               `json:"isPublished" bson:"isPublished"`
	SortOrder       int                `json:"sortOrder" bson:"sortOrder"`
	CreatedAt       time.Time          `json:"createdAt" bson:"createdAt"`
	UpdatedAt       time.Time          `json:"updatedAt" bson:"updatedAt"`
}
