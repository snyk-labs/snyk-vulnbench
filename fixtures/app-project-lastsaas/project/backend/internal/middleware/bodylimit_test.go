package middleware

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBodySizeLimitAllowsSmallBody(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("unexpected read error: %v", err)
		}
		if string(body) != "hello" {
			t.Errorf("expected 'hello', got %q", string(body))
		}
		w.WriteHeader(http.StatusOK)
	})

	handler := BodySizeLimit(inner)
	req := httptest.NewRequest("POST", "/", bytes.NewReader([]byte("hello")))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

func TestBodySizeLimitBlocksOversizedBody(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err == nil {
			t.Fatal("expected error reading oversized body")
		}
	})

	handler := BodySizeLimit(inner)
	// Create body larger than 1MB
	bigBody := bytes.Repeat([]byte("a"), MaxBodySize+1)
	req := httptest.NewRequest("POST", "/", bytes.NewReader(bigBody))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
}

func TestBodySizeLimitNilBody(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := BodySizeLimit(inner)
	req := httptest.NewRequest("GET", "/", nil)
	req.Body = nil
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

func TestMaxBodySizeConstant(t *testing.T) {
	if MaxBodySize != 1<<20 {
		t.Errorf("expected MaxBodySize to be 1MB (1048576), got %d", MaxBodySize)
	}
}
