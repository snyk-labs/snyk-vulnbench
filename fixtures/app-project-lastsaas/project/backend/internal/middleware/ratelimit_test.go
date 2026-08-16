package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiterAllow(t *testing.T) {
	rl := NewRateLimiter()
	defer rl.Stop()

	config := RateLimitConfig{MaxRequests: 3, Window: time.Minute}

	// First 3 requests should be allowed.
	for i := 0; i < 3; i++ {
		allowed, remaining, _ := rl.Allow("test-key", config)
		if !allowed {
			t.Fatalf("request %d should be allowed", i+1)
		}
		expected := 3 - (i + 1)
		if remaining != expected {
			t.Fatalf("request %d: expected remaining=%d, got %d", i+1, expected, remaining)
		}
	}

	// 4th request should be denied.
	allowed, remaining, _ := rl.Allow("test-key", config)
	if allowed {
		t.Fatal("4th request should be denied")
	}
	if remaining != 0 {
		t.Fatalf("expected remaining=0, got %d", remaining)
	}
}

func TestRateLimiterSeparateKeys(t *testing.T) {
	rl := NewRateLimiter()
	defer rl.Stop()

	config := RateLimitConfig{MaxRequests: 1, Window: time.Minute}

	allowed, _, _ := rl.Allow("key-a", config)
	if !allowed {
		t.Fatal("key-a should be allowed")
	}

	allowed, _, _ = rl.Allow("key-b", config)
	if !allowed {
		t.Fatal("key-b should be allowed (separate key)")
	}

	allowed, _, _ = rl.Allow("key-a", config)
	if allowed {
		t.Fatal("key-a second request should be denied")
	}
}

func TestRateLimiterWindowReset(t *testing.T) {
	rl := NewRateLimiter()
	defer rl.Stop()

	config := RateLimitConfig{MaxRequests: 1, Window: 50 * time.Millisecond}

	allowed, _, _ := rl.Allow("reset-key", config)
	if !allowed {
		t.Fatal("first request should be allowed")
	}

	allowed, _, _ = rl.Allow("reset-key", config)
	if allowed {
		t.Fatal("second request should be denied")
	}

	// Wait for window to expire.
	time.Sleep(60 * time.Millisecond)

	allowed, _, _ = rl.Allow("reset-key", config)
	if !allowed {
		t.Fatal("request after window reset should be allowed")
	}
}

func TestRateLimitHandler(t *testing.T) {
	rl := NewRateLimiter()
	defer rl.Stop()

	config := RateLimitConfig{MaxRequests: 2, Window: time.Minute}

	handlerCalled := 0
	innerHandler := func(w http.ResponseWriter, r *http.Request) {
		handlerCalled++
		w.WriteHeader(http.StatusOK)
	}

	handler := rl.RateLimitHandler(config, func(r *http.Request) string {
		return "handler-key"
	}, innerHandler)

	// First two requests pass through.
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest("GET", "/test", nil)
		rr := httptest.NewRecorder()
		handler(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d", i+1, rr.Code)
		}
	}
	if handlerCalled != 2 {
		t.Fatalf("expected handler called 2 times, got %d", handlerCalled)
	}

	// Third request gets rate limited.
	req := httptest.NewRequest("GET", "/test", nil)
	rr := httptest.NewRecorder()
	handler(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", rr.Code)
	}
	if handlerCalled != 2 {
		t.Fatalf("handler should not have been called a 3rd time")
	}

	// Check rate limit headers.
	if rr.Header().Get("X-RateLimit-Limit") != "2" {
		t.Fatalf("expected X-RateLimit-Limit=2, got %s", rr.Header().Get("X-RateLimit-Limit"))
	}
	if rr.Header().Get("Retry-After") == "" {
		t.Fatal("expected Retry-After header")
	}
}

func TestGetClientIP(t *testing.T) {
	tests := []struct {
		name       string
		xff        string
		xri        string
		remoteAddr string
		expected   string
	}{
		{
			name:       "X-Forwarded-For single IP",
			xff:        "1.2.3.4",
			remoteAddr: "5.6.7.8:1234",
			expected:   "1.2.3.4",
		},
		{
			name:       "X-Forwarded-For multiple IPs",
			xff:        "1.2.3.4, 5.6.7.8",
			remoteAddr: "9.0.0.1:1234",
			expected:   "1.2.3.4",
		},
		{
			name:       "X-Real-IP",
			xri:        "10.0.0.1",
			remoteAddr: "5.6.7.8:1234",
			expected:   "10.0.0.1",
		},
		{
			name:       "RemoteAddr fallback",
			remoteAddr: "192.168.1.1:4567",
			expected:   "192.168.1.1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			req.RemoteAddr = tt.remoteAddr
			if tt.xff != "" {
				req.Header.Set("X-Forwarded-For", tt.xff)
			}
			if tt.xri != "" {
				req.Header.Set("X-Real-IP", tt.xri)
			}
			got := GetClientIP(req)
			if got != tt.expected {
				t.Fatalf("expected %q, got %q", tt.expected, got)
			}
		})
	}
}
