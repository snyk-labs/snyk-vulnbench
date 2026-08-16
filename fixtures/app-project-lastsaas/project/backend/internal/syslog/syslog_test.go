package syslog

import (
	"context"
	"strings"
	"testing"
	"time"

	"lastsaas/internal/models"
	"lastsaas/internal/testutil"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// --- Unit tests (no DB required) ---

func TestSanitizePassthrough(t *testing.T) {
	input := "Normal log message with no issues"
	result := sanitize(input)
	if result != input {
		t.Errorf("expected passthrough, got %q", result)
	}
}

func TestSanitizePreservesNewlines(t *testing.T) {
	input := "Line 1\nLine 2\tTabbed"
	result := sanitize(input)
	if result != input {
		t.Errorf("expected newlines/tabs preserved, got %q", result)
	}
}

func TestSanitizeStripsControlChars(t *testing.T) {
	input := "Hello\x00World\x07"
	result := sanitize(input)
	if result != "HelloWorld" {
		t.Errorf("expected control chars stripped, got %q", result)
	}
}

func TestSanitizeTruncatesLongMessage(t *testing.T) {
	input := strings.Repeat("a", 3000)
	result := sanitize(input)
	if len(result) != maxMessageLen {
		t.Errorf("expected length %d, got %d", maxMessageLen, len(result))
	}
}

func TestSanitizeInvalidUTF8(t *testing.T) {
	input := "Hello\xc3\x28World"
	result := sanitize(input)
	// Should produce valid UTF-8 without panic
	if strings.Contains(result, "\xc3\x28") {
		t.Error("expected invalid UTF-8 to be cleaned")
	}
}

func TestDetectInjectionScript(t *testing.T) {
	if detectInjection("<script>alert('xss')</script>") == "" {
		t.Error("expected script tag to be detected")
	}
}

func TestDetectInjectionJavascript(t *testing.T) {
	if detectInjection("javascript:alert(1)") == "" {
		t.Error("expected javascript: to be detected")
	}
}

func TestDetectInjectionOnError(t *testing.T) {
	if detectInjection(`<img onerror="alert(1)">`) == "" {
		t.Error("expected onerror to be detected")
	}
}

func TestDetectInjectionIframe(t *testing.T) {
	if detectInjection(`<iframe src="evil.com">`) == "" {
		t.Error("expected iframe to be detected")
	}
}

func TestDetectInjectionCleanString(t *testing.T) {
	if detectInjection("Normal log message about user login") != "" {
		t.Error("expected clean string to pass")
	}
}

func TestDetectInjectionObject(t *testing.T) {
	if detectInjection(`<object data="evil.swf">`) == "" {
		t.Error("expected object tag to be detected")
	}
}

func TestDetectInjectionEmbed(t *testing.T) {
	if detectInjection(`<embed src="evil.swf">`) == "" {
		t.Error("expected embed tag to be detected")
	}
}

func TestShouldLogDefaultAll(t *testing.T) {
	l := New(nil, nil) // nil getConfig → log everything
	if !l.shouldLog(models.LogDebug) {
		t.Error("expected debug to be logged with nil getConfig")
	}
}

func TestShouldLogMinLevelNone(t *testing.T) {
	l := New(nil, func(key string) string {
		if key == "log.min_level" {
			return "none"
		}
		return ""
	})
	if l.shouldLog(models.LogCritical) {
		t.Error("expected 'none' to suppress all logging")
	}
}

func TestShouldLogMinLevelFilters(t *testing.T) {
	l := New(nil, func(key string) string {
		if key == "log.min_level" {
			return "medium"
		}
		return ""
	})
	if l.shouldLog(models.LogLow) {
		t.Error("expected low to be filtered when min_level is medium")
	}
	if l.shouldLog(models.LogDebug) {
		t.Error("expected debug to be filtered when min_level is medium")
	}
	if !l.shouldLog(models.LogMedium) {
		t.Error("expected medium to pass when min_level is medium")
	}
	if !l.shouldLog(models.LogHigh) {
		t.Error("expected high to pass when min_level is medium")
	}
	if !l.shouldLog(models.LogCritical) {
		t.Error("expected critical to pass when min_level is medium")
	}
}

// --- Integration tests (require DB) ---

func TestIntegration_LogWritesToDB(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	logger := New(database, nil)
	ctx := context.Background()

	logger.Log(ctx, models.LogMedium, "Test integration log")

	count := testutil.CountDocuments(t, database, "system_logs", bson.M{"severity": "medium"})
	if count != 1 {
		t.Errorf("expected 1 log entry, got %d", count)
	}
}

func TestIntegration_LogWithUser(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	logger := New(database, nil)
	ctx := context.Background()

	userID := primitive.NewObjectID()
	logger.LogWithUser(ctx, models.LogHigh, "User did something", userID)

	count := testutil.CountDocuments(t, database, "system_logs", bson.M{"userId": userID})
	if count != 1 {
		t.Errorf("expected 1 log entry with userID, got %d", count)
	}
}

func TestIntegration_LogCatWritesCategory(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	logger := New(database, nil)
	ctx := context.Background()

	logger.LogCat(ctx, models.LogMedium, models.LogCatAuth, "Auth event")

	count := testutil.CountDocuments(t, database, "system_logs", bson.M{"category": "auth"})
	if count != 1 {
		t.Errorf("expected 1 log entry with category 'auth', got %d", count)
	}
}

func TestIntegration_InjectionTriggersSecurityAlert(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	logger := New(database, nil)
	ctx := context.Background()

	logger.Log(ctx, models.LogLow, `<script>alert("xss")</script>`)

	// Should have created 2 entries: the sanitized log and the security alert
	total := testutil.CountDocuments(t, database, "system_logs", bson.M{})
	if total != 2 {
		t.Errorf("expected 2 log entries (original + alert), got %d", total)
	}

	alerts := testutil.CountDocuments(t, database, "system_logs", bson.M{
		"severity": "critical",
		"category": "security",
	})
	if alerts != 1 {
		t.Errorf("expected 1 security alert, got %d", alerts)
	}
}

func TestIntegration_SeverityFiltering(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	logger := New(database, func(key string) string {
		if key == "log.min_level" {
			return "high"
		}
		return ""
	})
	ctx := context.Background()

	logger.Log(ctx, models.LogDebug, "Should be filtered")
	logger.Log(ctx, models.LogLow, "Should be filtered")
	logger.Log(ctx, models.LogMedium, "Should be filtered")
	logger.Log(ctx, models.LogHigh, "Should pass")
	logger.Log(ctx, models.LogCritical, "Should pass")

	total := testutil.CountDocuments(t, database, "system_logs", bson.M{})
	if total != 2 {
		t.Errorf("expected 2 log entries (high + critical), got %d", total)
	}
}

func TestIntegration_LogTenantActivity(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	logger := New(database, nil)
	ctx := context.Background()

	userID := primitive.NewObjectID()
	tenantID := primitive.NewObjectID()
	logger.LogTenantActivity(ctx, models.LogMedium, "User changed role", userID, tenantID, "role_change", map[string]interface{}{"oldRole": "user", "newRole": "admin"})

	// Wait a moment for DB write
	time.Sleep(50 * time.Millisecond)

	count := testutil.CountDocuments(t, database, "system_logs", bson.M{
		"tenantId": tenantID,
		"action":   "role_change",
		"category": "tenant",
	})
	if count != 1 {
		t.Errorf("expected 1 tenant activity log, got %d", count)
	}
}

func TestIntegration_ConvenienceMethods(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	database, cleanup := testutil.MustConnectTestDB(t)
	defer cleanup()
	testutil.CleanupCollections(t, database)

	logger := New(database, nil)
	ctx := context.Background()

	logger.Critical(ctx, "critical msg")
	logger.High(ctx, "high msg")
	logger.Medium(ctx, "medium msg")
	logger.Low(ctx, "low msg")
	logger.Debug(ctx, "debug msg")

	total := testutil.CountDocuments(t, database, "system_logs", bson.M{})
	if total != 5 {
		t.Errorf("expected 5 log entries, got %d", total)
	}
}
