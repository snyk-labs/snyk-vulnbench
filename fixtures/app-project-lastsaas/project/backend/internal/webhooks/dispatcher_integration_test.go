package webhooks

import (
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"lastsaas/internal/events"
	"lastsaas/internal/models"
	"lastsaas/internal/testutil"
)

func TestDispatcherEmitAndDeliver(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	var received atomic.Int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received.Add(1)
		if r.Header.Get("Content-Type") != "application/json" {
			t.Error("expected Content-Type: application/json")
		}
		if r.Header.Get("X-Webhook-Event") == "" {
			t.Error("expected X-Webhook-Event header")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	user := testutil.CreateTestUser(t, database, "webhook@example.com", "password123", "Webhook User")
	testutil.CreateTestWebhook(t, database, "Test Hook", ts.URL, "test-secret",
		[]models.WebhookEventType{models.WebhookEventTenantCreated}, user.ID)

	d := NewDispatcher(database, nil)
	defer d.Stop()

	d.Emit(events.Event{
		Type:      events.EventTenantCreated,
		Timestamp: time.Now(),
		Data:      map[string]interface{}{"tenantId": "test123"},
	})

	// Wait for async dispatch
	time.Sleep(500 * time.Millisecond)

	if received.Load() != 1 {
		t.Errorf("expected 1 delivery, got %d", received.Load())
	}

	// Verify delivery was recorded in DB
	count := testutil.CountDocuments(t, database, "webhook_deliveries", nil)
	if count != 1 {
		t.Errorf("expected 1 delivery record, got %d", count)
	}
}

func TestDispatcherEmitUnmappedEvent(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	d := NewDispatcher(database, nil)
	defer d.Stop()

	// Emit an event that has no webhook mapping
	d.Emit(events.Event{
		Type:      events.EventUserLoggedIn,
		Timestamp: time.Now(),
		Data:      map[string]interface{}{},
	})

	time.Sleep(200 * time.Millisecond)

	count := testutil.CountDocuments(t, database, "webhook_deliveries", nil)
	if count != 0 {
		t.Errorf("expected 0 deliveries for unmapped event, got %d", count)
	}
}

func TestDispatcherSignature(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	var gotSignature string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSignature = r.Header.Get("X-Webhook-Signature")
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	user := testutil.CreateTestUser(t, database, "sig@example.com", "password123", "Sig User")
	testutil.CreateTestWebhook(t, database, "Signed Hook", ts.URL, "my-signing-secret",
		[]models.WebhookEventType{models.WebhookEventUserRegistered}, user.ID)

	d := NewDispatcher(database, nil)
	defer d.Stop()

	d.Emit(events.Event{
		Type:      events.EventUserRegistered,
		Timestamp: time.Now(),
		Data:      map[string]interface{}{"email": "new@example.com"},
	})

	time.Sleep(500 * time.Millisecond)

	if gotSignature == "" {
		t.Error("expected non-empty signature header")
	}
	if len(gotSignature) < 10 || gotSignature[:7] != "sha256=" {
		t.Errorf("expected sha256= prefix, got %q", gotSignature)
	}
}

func TestDispatcherEncryptedSecret(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	key, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	encryptedSecret, err := EncryptSecret("encrypted-signing-key", key)
	if err != nil {
		t.Fatalf("failed to encrypt secret: %v", err)
	}

	var gotSignature string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSignature = r.Header.Get("X-Webhook-Signature")
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	user := testutil.CreateTestUser(t, database, "enc@example.com", "password123", "Enc User")
	testutil.CreateTestWebhook(t, database, "Encrypted Hook", ts.URL, encryptedSecret,
		[]models.WebhookEventType{models.WebhookEventPaymentReceived}, user.ID)

	d := NewDispatcher(database, key)
	defer d.Stop()

	d.Emit(events.Event{
		Type:      events.EventPaymentReceived,
		Timestamp: time.Now(),
		Data:      map[string]interface{}{"amount": 1000},
	})

	time.Sleep(500 * time.Millisecond)

	if gotSignature == "" {
		t.Error("expected non-empty signature header with encrypted secret")
	}
}

func TestDispatcherRetryOnFailure(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	var attempts atomic.Int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts.Add(1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()

	user := testutil.CreateTestUser(t, database, "retry@example.com", "password123", "Retry User")
	testutil.CreateTestWebhook(t, database, "Failing Hook", ts.URL, "",
		[]models.WebhookEventType{models.WebhookEventPaymentFailed}, user.ID)

	d := NewDispatcher(database, nil)
	defer d.Stop()

	d.Emit(events.Event{
		Type:      events.EventPaymentFailed,
		Timestamp: time.Now(),
		Data:      map[string]interface{}{},
	})

	// Wait for initial delivery
	time.Sleep(500 * time.Millisecond)

	if attempts.Load() < 1 {
		t.Error("expected at least 1 attempt")
	}

	// First delivery should be recorded as failed
	count := testutil.CountDocuments(t, database, "webhook_deliveries", nil)
	if count < 1 {
		t.Errorf("expected at least 1 delivery record, got %d", count)
	}
}

func TestDispatcherStop(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	d := NewDispatcher(database, nil)

	// Should not hang
	done := make(chan struct{})
	go func() {
		d.Stop()
		close(done)
	}()

	select {
	case <-done:
		// OK
	case <-time.After(3 * time.Second):
		t.Fatal("Stop() did not return within 3 seconds")
	}
}

func TestDispatcherDeliverTest(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	var gotTestHeader string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotTestHeader = r.Header.Get("X-Webhook-Test")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	user := testutil.CreateTestUser(t, database, "test-deliver@example.com", "password123", "Test Deliver")
	webhook := testutil.CreateTestWebhook(t, database, "Test Delivery Hook", ts.URL, "test-secret",
		[]models.WebhookEventType{models.WebhookEventTenantCreated}, user.ID)

	d := NewDispatcher(database, nil)
	defer d.Stop()

	delivery := d.DeliverTest(t.Context(), *webhook)

	if !delivery.Success {
		t.Errorf("expected successful test delivery, got success=%v", delivery.Success)
	}
	if delivery.ResponseCode != 200 {
		t.Errorf("expected 200, got %d", delivery.ResponseCode)
	}
	if gotTestHeader != "true" {
		t.Errorf("expected X-Webhook-Test=true, got %q", gotTestHeader)
	}
}

func TestDispatcherDeliverTestBadURL(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	user := testutil.CreateTestUser(t, database, "badurl@example.com", "password123", "Bad URL")
	webhook := testutil.CreateTestWebhook(t, database, "Bad URL Hook", "http://127.0.0.1:1", "",
		[]models.WebhookEventType{models.WebhookEventTenantCreated}, user.ID)

	d := NewDispatcher(database, nil)
	defer d.Stop()

	delivery := d.DeliverTest(t.Context(), *webhook)

	if delivery.Success {
		t.Error("expected failed delivery for bad URL")
	}
}

func TestDispatcherNoMatchingWebhooks(t *testing.T) {
	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	user := testutil.CreateTestUser(t, database, "no-match@example.com", "password123", "No Match")
	// Webhook subscribes to tenant.created but we'll emit user.registered
	testutil.CreateTestWebhook(t, database, "Wrong Event Hook", "http://localhost:1", "",
		[]models.WebhookEventType{models.WebhookEventTenantCreated}, user.ID)

	d := NewDispatcher(database, nil)
	defer d.Stop()

	d.Emit(events.Event{
		Type:      events.EventUserRegistered,
		Timestamp: time.Now(),
		Data:      map[string]interface{}{"email": "new@example.com"},
	})

	time.Sleep(500 * time.Millisecond)

	// No deliveries should be recorded because the webhook doesn't subscribe to user.registered
	count := testutil.CountDocuments(t, database, "webhook_deliveries", nil)
	if count != 0 {
		t.Errorf("expected 0 deliveries for non-matching event, got %d", count)
	}
}
