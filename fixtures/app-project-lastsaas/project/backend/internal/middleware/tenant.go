package middleware

import (
	"context"
	"fmt"
	"net/http"

	"lastsaas/internal/db"
	"lastsaas/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	TenantContextKey     contextKey = "tenant"
	MembershipContextKey contextKey = "membership"
)

type TenantMiddleware struct {
	db *db.MongoDB
}

func NewTenantMiddleware(database *db.MongoDB) *TenantMiddleware {
	return &TenantMiddleware{db: database}
}

func (m *TenantMiddleware) RequireTenant(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// If API key auth already populated tenant context, pass through
		if _, ok := GetTenantFromContext(r.Context()); ok {
			if _, ok := GetMembershipFromContext(r.Context()); ok {
				next.ServeHTTP(w, r)
				return
			}
		}

		tenantIDStr := r.Header.Get("X-Tenant-ID")
		if tenantIDStr == "" {
			http.Error(w, `{"error":"X-Tenant-ID header required"}`, http.StatusBadRequest)
			return
		}

		tenantID, err := primitive.ObjectIDFromHex(tenantIDStr)
		if err != nil {
			http.Error(w, `{"error":"Invalid tenant ID"}`, http.StatusBadRequest)
			return
		}

		var tenant models.Tenant
		err = m.db.Tenants().FindOne(r.Context(), bson.M{"_id": tenantID, "isActive": true}).Decode(&tenant)
		if err != nil {
			http.Error(w, `{"error":"Tenant not found"}`, http.StatusNotFound)
			return
		}

		user, ok := GetUserFromContext(r.Context())
		if !ok {
			http.Error(w, `{"error":"Not authenticated"}`, http.StatusUnauthorized)
			return
		}

		var membership models.TenantMembership
		err = m.db.TenantMemberships().FindOne(r.Context(), bson.M{
			"userId":   user.ID,
			"tenantId": tenantID,
		}).Decode(&membership)
		if err != nil {
			http.Error(w, `{"error":"Not a member of this tenant"}`, http.StatusForbidden)
			return
		}

		ctx := context.WithValue(r.Context(), TenantContextKey, &tenant)
		ctx = context.WithValue(ctx, MembershipContextKey, &membership)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetTenantFromContext(ctx context.Context) (*models.Tenant, bool) {
	tenant, ok := ctx.Value(TenantContextKey).(*models.Tenant)
	return tenant, ok
}

func GetMembershipFromContext(ctx context.Context) (*models.TenantMembership, bool) {
	membership, ok := ctx.Value(MembershipContextKey).(*models.TenantMembership)
	return membership, ok
}

// RequireActiveBilling returns middleware that blocks requests when the tenant's
// billing status is not active (and not waived/root). This prevents users from
// accessing paid features after subscription expiration or cancellation.
func RequireActiveBilling() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tenant, ok := GetTenantFromContext(r.Context())
			if !ok {
				http.Error(w, `{"error":"No tenant context"}`, http.StatusBadRequest)
				return
			}

			// Root tenant and billing-waived tenants are exempt
			if tenant.IsRoot || tenant.BillingWaived {
				next.ServeHTTP(w, r)
				return
			}

			// Allow if billing status is active or none (free/unsubscribed tenants)
			if tenant.BillingStatus == models.BillingStatusActive || tenant.BillingStatus == models.BillingStatusNone {
				next.ServeHTTP(w, r)
				return
			}

			http.Error(w, `{"error":"subscription_required","code":"BILLING_INACTIVE"}`, http.StatusPaymentRequired)
		})
	}
}

// RequireEntitlement returns middleware that checks whether the tenant's plan
// grants a specific boolean entitlement. Requires a DB handle to look up the plan.
func RequireEntitlement(database *db.MongoDB, feature string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tenant, ok := GetTenantFromContext(r.Context())
			if !ok {
				http.Error(w, `{"error":"No tenant context"}`, http.StatusBadRequest)
				return
			}

			// Root tenant and billing-waived tenants get all features
			if tenant.IsRoot || tenant.BillingWaived {
				next.ServeHTTP(w, r)
				return
			}

			if tenant.PlanID == nil {
				http.Error(w, fmt.Sprintf(`{"error":"Feature '%s' requires an active plan","code":"ENTITLEMENT_REQUIRED"}`, feature), http.StatusForbidden)
				return
			}

			var plan models.Plan
			if err := database.Plans().FindOne(r.Context(), bson.M{"_id": *tenant.PlanID}).Decode(&plan); err != nil {
				http.Error(w, `{"error":"Plan not found"}`, http.StatusInternalServerError)
				return
			}

			ent, exists := plan.Entitlements[feature]
			if !exists || (ent.Type == models.EntitlementTypeBool && !ent.BoolValue) {
				http.Error(w, fmt.Sprintf(`{"error":"Feature '%s' is not included in your plan","code":"ENTITLEMENT_REQUIRED"}`, feature), http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
