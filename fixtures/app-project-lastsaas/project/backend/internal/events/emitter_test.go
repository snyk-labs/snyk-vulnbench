package events

import (
	"testing"
	"time"
)

func TestNoopEmitterEmit(t *testing.T) {
	emitter := NewNoopEmitter()
	// Should not panic
	emitter.Emit(Event{
		Type:      EventUserRegistered,
		Timestamp: time.Now(),
		Data:      map[string]interface{}{"email": "test@example.com"},
	})
}

func TestNoopEmitterImplementsInterface(t *testing.T) {
	var _ Emitter = &NoopEmitter{}
	var _ Emitter = NewNoopEmitter()
}

func TestEventTypeConstants(t *testing.T) {
	types := []EventType{
		EventSystemInitialized, EventUserRegistered, EventUserVerified,
		EventUserLoggedIn, EventUserDeactivated, EventUserDeleted,
		EventTenantCreated, EventTenantDeleted, EventTenantDeactivated,
		EventMemberInvited, EventMemberJoined, EventMemberRemoved,
		EventMemberRoleChanged, EventOwnershipTransferred,
		EventSubscriptionActivated, EventSubscriptionCanceled,
		EventPaymentReceived, EventPaymentFailed,
		EventCreditsPurchased, EventPlanChanged,
		EventAPIKeyCreated, EventAPIKeyRevoked,
	}
	seen := make(map[EventType]bool)
	for _, et := range types {
		if et == "" {
			t.Error("event type should not be empty")
		}
		if seen[et] {
			t.Errorf("duplicate event type: %s", et)
		}
		seen[et] = true
	}
}

func TestEventStruct(t *testing.T) {
	now := time.Now()
	e := Event{
		Type:      EventUserRegistered,
		Timestamp: now,
		Data:      map[string]interface{}{"key": "value"},
	}
	if e.Type != EventUserRegistered {
		t.Errorf("expected %s, got %s", EventUserRegistered, e.Type)
	}
	if e.Timestamp != now {
		t.Error("timestamp mismatch")
	}
	if e.Data["key"] != "value" {
		t.Error("data mismatch")
	}
}
