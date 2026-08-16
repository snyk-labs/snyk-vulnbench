package events

import "time"

type EventType string

const (
	EventSystemInitialized    EventType = "system.initialized"
	EventUserRegistered       EventType = "user.registered"
	EventUserVerified         EventType = "user.verified"
	EventUserLoggedIn         EventType = "user.logged_in"
	EventUserDeactivated      EventType = "user.deactivated"
	EventUserDeleted          EventType = "user.deleted"
	EventTenantCreated        EventType = "tenant.created"
	EventTenantDeleted        EventType = "tenant.deleted"
	EventTenantDeactivated    EventType = "tenant.deactivated"
	EventMemberInvited        EventType = "member.invited"
	EventMemberJoined         EventType = "member.joined"
	EventMemberRemoved        EventType = "member.removed"
	EventMemberRoleChanged    EventType = "member.role_changed"
	EventOwnershipTransferred EventType = "member.ownership_transferred"

	// Billing events
	EventSubscriptionActivated EventType = "subscription.activated"
	EventSubscriptionCanceled  EventType = "subscription.canceled"
	EventPaymentReceived       EventType = "payment.received"
	EventPaymentFailed         EventType = "payment.failed"
	EventCreditsPurchased      EventType = "credits.purchased"
	EventPlanChanged           EventType = "plan.changed"

	// Audit events
	EventAPIKeyCreated EventType = "api_key.created"
	EventAPIKeyRevoked EventType = "api_key.revoked"
)

type Event struct {
	Type      EventType
	Timestamp time.Time
	Data      map[string]interface{}
}

type Emitter interface {
	Emit(event Event)
}

type NoopEmitter struct{}

func (n *NoopEmitter) Emit(_ Event) {}

func NewNoopEmitter() Emitter {
	return &NoopEmitter{}
}
