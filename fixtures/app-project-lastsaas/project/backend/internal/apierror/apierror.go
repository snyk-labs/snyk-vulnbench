// Package apierror provides structured API error types with machine-readable codes.
//
// Error responses maintain backward compatibility by always including the "error" field.
// The "code" field is additive — existing clients that only read "error" are unaffected.
//
// Response format:
//
//	{"error": "Human-readable message", "code": "MACHINE_CODE", "requestId": "abc123"}
package apierror

import (
	"encoding/json"
	"net/http"

	"lastsaas/internal/middleware"
)

// Code represents a machine-readable error code.
type Code string

const (
	CodeBadRequest       Code = "BAD_REQUEST"
	CodeUnauthorized     Code = "UNAUTHORIZED"
	CodeForbidden        Code = "FORBIDDEN"
	CodeNotFound         Code = "NOT_FOUND"
	CodeConflict         Code = "CONFLICT"
	CodeRateLimited      Code = "RATE_LIMITED"
	CodeValidation       Code = "VALIDATION_ERROR"
	CodePaymentRequired  Code = "PAYMENT_REQUIRED"
	CodeNotInitialized   Code = "NOT_INITIALIZED"
	CodeInternal         Code = "INTERNAL_ERROR"
	CodeServiceUnavail   Code = "SERVICE_UNAVAILABLE"
	CodeMFARequired      Code = "MFA_REQUIRED"
	CodeAccountLocked    Code = "ACCOUNT_LOCKED"
	CodeAccountInactive  Code = "ACCOUNT_INACTIVE"
	CodeTokenExpired     Code = "TOKEN_EXPIRED"
	CodeEmailNotVerified Code = "EMAIL_NOT_VERIFIED"
	CodePlanLimit        Code = "PLAN_LIMIT"
)

// Response is the JSON error response structure.
// The "error" field is always present for backward compatibility.
type Response struct {
	Error     string `json:"error"`
	Code      Code   `json:"code"`
	RequestID string `json:"requestId,omitempty"`
}

// Write sends a structured error response. It includes the request ID if available.
func Write(w http.ResponseWriter, status int, code Code, message string, r *http.Request) {
	resp := Response{
		Error:     message,
		Code:      code,
		RequestID: middleware.GetRequestID(r.Context()),
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(resp)
}

// BadRequest sends a 400 error.
func BadRequest(w http.ResponseWriter, r *http.Request, message string) {
	Write(w, http.StatusBadRequest, CodeBadRequest, message, r)
}

// Unauthorized sends a 401 error.
func Unauthorized(w http.ResponseWriter, r *http.Request, message string) {
	Write(w, http.StatusUnauthorized, CodeUnauthorized, message, r)
}

// Forbidden sends a 403 error.
func Forbidden(w http.ResponseWriter, r *http.Request, message string) {
	Write(w, http.StatusForbidden, CodeForbidden, message, r)
}

// NotFound sends a 404 error.
func NotFound(w http.ResponseWriter, r *http.Request, message string) {
	Write(w, http.StatusNotFound, CodeNotFound, message, r)
}

// Conflict sends a 409 error.
func Conflict(w http.ResponseWriter, r *http.Request, message string) {
	Write(w, http.StatusConflict, CodeConflict, message, r)
}

// Validation sends a 400 error with VALIDATION_ERROR code.
func Validation(w http.ResponseWriter, r *http.Request, message string) {
	Write(w, http.StatusBadRequest, CodeValidation, message, r)
}

// Internal sends a 500 error.
func Internal(w http.ResponseWriter, r *http.Request, message string) {
	Write(w, http.StatusInternalServerError, CodeInternal, message, r)
}

// RateLimited sends a 429 error.
func RateLimited(w http.ResponseWriter, r *http.Request, message string) {
	Write(w, http.StatusTooManyRequests, CodeRateLimited, message, r)
}
