package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewMetricsCollector(t *testing.T) {
	mc := NewMetricsCollector()
	if mc == nil {
		t.Fatal("expected non-nil MetricsCollector")
	}
	snap := mc.Snapshot()
	if snap.RequestCount != 0 {
		t.Errorf("expected 0 requests, got %d", snap.RequestCount)
	}
}

func TestMetricsCollectorSnapshot(t *testing.T) {
	mc := NewMetricsCollector()

	// Simulate some latencies manually
	mc.mu.Lock()
	mc.latencies = append(mc.latencies, 10, 20, 30, 40, 50)
	mc.mu.Unlock()

	mc.requestCount.Add(5)
	mc.status2xx.Add(3)
	mc.status4xx.Add(1)
	mc.status5xx.Add(1)

	snap := mc.Snapshot()
	if snap.RequestCount != 5 {
		t.Errorf("expected 5 requests, got %d", snap.RequestCount)
	}
	if snap.Status2xx != 3 {
		t.Errorf("expected 3 2xx, got %d", snap.Status2xx)
	}
	if snap.Status4xx != 1 {
		t.Errorf("expected 1 4xx, got %d", snap.Status4xx)
	}
	if snap.Status5xx != 1 {
		t.Errorf("expected 1 5xx, got %d", snap.Status5xx)
	}
	if snap.LatencyP50 == 0 {
		t.Error("expected non-zero P50 latency")
	}
	if snap.LatencyP95 == 0 {
		t.Error("expected non-zero P95 latency")
	}
	if snap.LatencyP99 == 0 {
		t.Error("expected non-zero P99 latency")
	}

	// After snapshot, counters should be reset
	snap2 := mc.Snapshot()
	if snap2.RequestCount != 0 {
		t.Errorf("expected 0 after reset, got %d", snap2.RequestCount)
	}
	if snap2.LatencyP50 != 0 {
		t.Errorf("expected 0 P50 after reset, got %f", snap2.LatencyP50)
	}
}

func TestMetricsCollectorMiddleware(t *testing.T) {
	mc := NewMetricsCollector()

	tests := []struct {
		name         string
		statusCode   int
		expect2xx    int64
		expect3xx    int64
		expect4xx    int64
		expect5xx    int64
	}{
		{"200 OK", http.StatusOK, 1, 0, 0, 0},
		{"301 redirect", http.StatusMovedPermanently, 0, 1, 0, 0},
		{"404 not found", http.StatusNotFound, 0, 0, 1, 0},
		{"500 server error", http.StatusInternalServerError, 0, 0, 0, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Reset counters
			mc.Snapshot()

			inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
			})

			handler := mc.Middleware(inner)
			req := httptest.NewRequest("GET", "/test", nil)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			snap := mc.Snapshot()
			if snap.RequestCount != 1 {
				t.Errorf("expected 1 request, got %d", snap.RequestCount)
			}
			if snap.Status2xx != tt.expect2xx {
				t.Errorf("expected %d 2xx, got %d", tt.expect2xx, snap.Status2xx)
			}
			if snap.Status3xx != tt.expect3xx {
				t.Errorf("expected %d 3xx, got %d", tt.expect3xx, snap.Status3xx)
			}
			if snap.Status4xx != tt.expect4xx {
				t.Errorf("expected %d 4xx, got %d", tt.expect4xx, snap.Status4xx)
			}
			if snap.Status5xx != tt.expect5xx {
				t.Errorf("expected %d 5xx, got %d", tt.expect5xx, snap.Status5xx)
			}
		})
	}
}

func TestMetricsCollectorMiddlewareDefaultStatus(t *testing.T) {
	mc := NewMetricsCollector()

	// Handler that writes body without explicit WriteHeader (defaults to 200)
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	handler := mc.Middleware(inner)
	req := httptest.NewRequest("GET", "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	snap := mc.Snapshot()
	if snap.Status2xx != 1 {
		t.Errorf("expected 1 2xx for default status, got %d", snap.Status2xx)
	}
}

func TestPercentile(t *testing.T) {
	tests := []struct {
		name     string
		data     []float64
		p        float64
		expected float64
	}{
		{"empty", nil, 50, 0},
		{"single value", []float64{42.0}, 50, 42.0},
		{"single value p99", []float64{42.0}, 99, 42.0},
		{"two values p50", []float64{10.0, 20.0}, 50, 15.0},
		{"five values p50", []float64{10, 20, 30, 40, 50}, 50, 30.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := percentile(tt.data, tt.p)
			if got != tt.expected {
				t.Errorf("percentile(%v, %v) = %v, want %v", tt.data, tt.p, got, tt.expected)
			}
		})
	}
}

func TestMetricsResponseWriterWriteHeader(t *testing.T) {
	rr := httptest.NewRecorder()
	mrw := &metricsResponseWriter{ResponseWriter: rr, statusCode: 200}
	mrw.WriteHeader(http.StatusNotFound)
	if mrw.statusCode != http.StatusNotFound {
		t.Errorf("expected %d, got %d", http.StatusNotFound, mrw.statusCode)
	}
	if rr.Code != http.StatusNotFound {
		t.Errorf("expected underlying recorder to have %d, got %d", http.StatusNotFound, rr.Code)
	}
}
