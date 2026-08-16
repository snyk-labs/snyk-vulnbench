package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"lastsaas/internal/db"
	"lastsaas/internal/middleware"
	"lastsaas/internal/models"
	"lastsaas/internal/validation"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

type UsageHandler struct {
	db *db.MongoDB
}

func NewUsageHandler(database *db.MongoDB) *UsageHandler {
	return &UsageHandler{db: database}
}

// RecordUsage records a usage event and deducts credits from the tenant.
func (h *UsageHandler) RecordUsage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenant, ok := middleware.GetTenantFromContext(ctx)
	if !ok {
		http.Error(w, `{"error":"Tenant context required"}`, http.StatusBadRequest)
		return
	}
	user, ok := middleware.GetUserFromContext(ctx)
	if !ok {
		http.Error(w, `{"error":"Not authenticated"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Type     string                 `json:"type"`
		Quantity int                    `json:"quantity"`
		Metadata map[string]string `json:"metadata"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"Invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Type == "" {
		http.Error(w, `{"error":"Type is required"}`, http.StatusBadRequest)
		return
	}
	if req.Quantity <= 0 {
		http.Error(w, `{"error":"Quantity must be positive"}`, http.StatusBadRequest)
		return
	}
	if req.Quantity > 10000 {
		http.Error(w, `{"error":"Quantity exceeds maximum of 10000 per request"}`, http.StatusBadRequest)
		return
	}

	// Use a MongoDB transaction to atomically deduct credits and record the usage event.
	// This prevents credits from being deducted without a corresponding usage record.
	event := models.UsageEvent{
		ID:        primitive.NewObjectID(),
		TenantID:  tenant.ID,
		UserID:    user.ID,
		Type:      req.Type,
		Quantity:  req.Quantity,
		Metadata:  req.Metadata,
		CreatedAt: time.Now(),
	}

	if err := validation.Validate(&event); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}

	session, err := h.db.Client.StartSession()
	if err != nil {
		http.Error(w, `{"error":"Failed to start session"}`, http.StatusInternalServerError)
		return
	}
	defer session.EndSession(ctx)

	insufficient := false
	_, txErr := session.WithTransaction(ctx, func(sc mongo.SessionContext) (interface{}, error) {
		// Try subscription credits first.
		result, err := h.db.Tenants().UpdateOne(sc,
			bson.M{"_id": tenant.ID, "subscriptionCredits": bson.M{"$gte": int64(req.Quantity)}},
			bson.M{"$inc": bson.M{"subscriptionCredits": -int64(req.Quantity)}},
		)
		if err != nil {
			return nil, err
		}

		if result.ModifiedCount == 0 {
			// Not enough subscription credits — try purchased credits.
			result, err = h.db.Tenants().UpdateOne(sc,
				bson.M{"_id": tenant.ID, "purchasedCredits": bson.M{"$gte": int64(req.Quantity)}},
				bson.M{"$inc": bson.M{"purchasedCredits": -int64(req.Quantity)}},
			)
			if err != nil {
				return nil, err
			}
			if result.ModifiedCount == 0 {
				insufficient = true
				return nil, fmt.Errorf("insufficient credits")
			}
		}

		// Record the usage event within the same transaction.
		if _, err := h.db.UsageEvents().InsertOne(sc, event); err != nil {
			return nil, err
		}
		return nil, nil
	})

	if insufficient {
		http.Error(w, `{"error":"Insufficient credits"}`, http.StatusPaymentRequired)
		return
	}
	if txErr != nil {
		http.Error(w, `{"error":"Failed to deduct credits"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":       event.ID.Hex(),
		"type":     event.Type,
		"quantity": event.Quantity,
	})
}

// GetSummary returns usage summary for the current billing period.
func (h *UsageHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenant, ok := middleware.GetTenantFromContext(ctx)
	if !ok {
		http.Error(w, `{"error":"Tenant context required"}`, http.StatusBadRequest)
		return
	}

	// Determine period start: use current month start as default.
	periodStart := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC)

	// If the tenant has a current period end, derive the period start from it.
	if tenant.CurrentPeriodEnd != nil && !tenant.CurrentPeriodEnd.IsZero() {
		// Billing period is typically one month, so period start = period end - 1 month.
		periodStart = tenant.CurrentPeriodEnd.AddDate(0, -1, 0)
	}

	// Aggregate usage by type for this period.
	pipeline := []bson.M{
		{"$match": bson.M{
			"tenantId":  tenant.ID,
			"createdAt": bson.M{"$gte": periodStart},
		}},
		{"$group": bson.M{
			"_id":           "$type",
			"totalQuantity": bson.M{"$sum": "$quantity"},
			"count":         bson.M{"$sum": 1},
		}},
		{"$sort": bson.M{"totalQuantity": -1}},
	}

	cursor, err := h.db.UsageEvents().Aggregate(ctx, pipeline)
	if err != nil {
		http.Error(w, `{"error":"Failed to aggregate usage"}`, http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	type usageSummaryItem struct {
		Type          string `json:"type" bson:"_id"`
		TotalQuantity int    `json:"totalQuantity" bson:"totalQuantity"`
		Count         int    `json:"count" bson:"count"`
	}

	var items []usageSummaryItem
	if err := cursor.All(ctx, &items); err != nil {
		http.Error(w, `{"error":"Failed to read usage data"}`, http.StatusInternalServerError)
		return
	}

	// Calculate total credits used this period.
	totalUsed := 0
	for _, item := range items {
		totalUsed += item.TotalQuantity
	}

	// Refresh tenant data for current credits.
	var currentTenant models.Tenant
	if err := h.db.Tenants().FindOne(ctx, bson.M{"_id": tenant.ID}).Decode(&currentTenant); err != nil {
		http.Error(w, `{"error":"Failed to fetch tenant"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"periodStart":         periodStart.Format(time.RFC3339),
		"usage":               items,
		"totalCreditsUsed":    totalUsed,
		"subscriptionCredits": currentTenant.SubscriptionCredits,
		"purchasedCredits":    currentTenant.PurchasedCredits,
	})
}
