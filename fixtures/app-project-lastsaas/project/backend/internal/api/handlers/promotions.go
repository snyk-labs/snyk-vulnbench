package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"lastsaas/internal/apicounter"
	"lastsaas/internal/configstore"
	"lastsaas/internal/db"
	"lastsaas/internal/models"
	stripeservice "lastsaas/internal/stripe"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	stripe "github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/coupon"
	"github.com/stripe/stripe-go/v82/promotioncode"
)

type PromotionsHandler struct {
	db     *db.MongoDB
	stripe *stripeservice.Service
	store  *configstore.Store
}

func NewPromotionsHandler(database *db.MongoDB, stripeSvc *stripeservice.Service, store *configstore.Store) *PromotionsHandler {
	return &PromotionsHandler{
		db:     database,
		stripe: stripeSvc,
		store:  store,
	}
}

// ListPromotions returns all Stripe promotion codes.
func (h *PromotionsHandler) ListPromotions(w http.ResponseWriter, r *http.Request) {
	params := &stripe.PromotionCodeListParams{}
	params.Limit = stripe.Int64(100)
	params.AddExpand("data.coupon")
	params.AddExpand("data.coupon.applies_to")

	iter := promotioncode.List(params)
	apicounter.StripeAPICalls.Add(1)

	type promoResponse struct {
		ID              string   `json:"id"`
		Code            string   `json:"code"`
		Active          bool     `json:"active"`
		CouponID        string   `json:"couponId"`
		CouponName      string   `json:"couponName"`
		PercentOff      float64  `json:"percentOff"`
		AmountOff       int64    `json:"amountOff"`
		Currency        string   `json:"currency"`
		TimesRedeemed   int64    `json:"timesRedeemed"`
		MaxRedemptions  int64    `json:"maxRedemptions"`
		ExpiresAt       int64    `json:"expiresAt"`
		Created         int64    `json:"created"`
		AppliesToProducts []string `json:"appliesToProducts"`
	}

	var promos []promoResponse
	for iter.Next() {
		pc := iter.PromotionCode()
		p := promoResponse{
			ID:            pc.ID,
			Code:          pc.Code,
			Active:        pc.Active,
			TimesRedeemed: pc.TimesRedeemed,
			ExpiresAt:     pc.ExpiresAt,
			Created:       pc.Created,
		}
		if pc.MaxRedemptions > 0 {
			p.MaxRedemptions = pc.MaxRedemptions
		}
		if pc.Coupon != nil {
			p.CouponID = pc.Coupon.ID
			p.CouponName = pc.Coupon.Name
			p.PercentOff = pc.Coupon.PercentOff
			p.AmountOff = pc.Coupon.AmountOff
			p.Currency = string(pc.Coupon.Currency)
			if pc.Coupon.AppliesTo != nil && len(pc.Coupon.AppliesTo.Products) > 0 {
				p.AppliesToProducts = pc.Coupon.AppliesTo.Products
			}
		}
		promos = append(promos, p)
	}
	if err := iter.Err(); err != nil {
		slog.Error("Promotions: list error", "error", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to list promotion codes")
		return
	}
	if promos == nil {
		promos = []promoResponse{}
	}

	// Build a map of Stripe Product IDs → internal plan/bundle names for display.
	productNames := h.buildProductNameMap(r.Context())

	respondWithJSON(w, http.StatusOK, map[string]interface{}{
		"promotions":   promos,
		"productNames": productNames,
	})
}

// buildProductNameMap returns a map of Stripe Product ID → friendly name by
// joining StripeMappings with Plans and CreditBundles.
func (h *PromotionsHandler) buildProductNameMap(ctx context.Context) map[string]string {
	nameMap := make(map[string]string)

	// Get all stripe mappings.
	cursor, err := h.db.StripeMappings().Find(ctx, bson.M{})
	if err != nil {
		return nameMap
	}
	defer cursor.Close(ctx)

	var mappings []models.StripeMapping
	if err := cursor.All(ctx, &mappings); err != nil {
		return nameMap
	}

	// Collect plan and bundle IDs to look up names.
	planIDs := make(map[primitive.ObjectID]bool)
	bundleIDs := make(map[primitive.ObjectID]bool)
	for _, m := range mappings {
		if strings.HasPrefix(m.EntityType, "plan_") {
			planIDs[m.EntityID] = true
		} else if m.EntityType == "bundle" {
			bundleIDs[m.EntityID] = true
		}
	}

	// Look up plan names.
	planNames := make(map[primitive.ObjectID]string)
	if len(planIDs) > 0 {
		ids := make([]primitive.ObjectID, 0, len(planIDs))
		for id := range planIDs {
			ids = append(ids, id)
		}
		cur, _ := h.db.Plans().Find(ctx, bson.M{"_id": bson.M{"$in": ids}})
		if cur != nil {
			var plans []models.Plan
			cur.All(ctx, &plans)
			for _, p := range plans {
				planNames[p.ID] = p.Name
			}
			cur.Close(ctx)
		}
	}

	// Look up bundle names.
	bundleNames := make(map[primitive.ObjectID]string)
	if len(bundleIDs) > 0 {
		ids := make([]primitive.ObjectID, 0, len(bundleIDs))
		for id := range bundleIDs {
			ids = append(ids, id)
		}
		cur, _ := h.db.CreditBundles().Find(ctx, bson.M{"_id": bson.M{"$in": ids}})
		if cur != nil {
			var bundles []models.CreditBundle
			cur.All(ctx, &bundles)
			for _, b := range bundles {
				bundleNames[b.ID] = b.Name
			}
			cur.Close(ctx)
		}
	}

	// Map Stripe Product ID → display name.
	for _, m := range mappings {
		if strings.HasPrefix(m.EntityType, "plan_") {
			if name, ok := planNames[m.EntityID]; ok {
				nameMap[m.StripeProductID] = name + " (Plan)"
			}
		} else if m.EntityType == "bundle" {
			if name, ok := bundleNames[m.EntityID]; ok {
				nameMap[m.StripeProductID] = name + " (Credits)"
			}
		}
	}

	return nameMap
}

// ListEligibleProducts returns plans and credit bundles that can be associated with a promotion code.
func (h *PromotionsHandler) ListEligibleProducts(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// List active plans.
	planCursor, err := h.db.Plans().Find(ctx, bson.M{"isArchived": bson.M{"$ne": true}})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to list plans")
		return
	}
	defer planCursor.Close(ctx)

	type eligibleItem struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Type string `json:"type"` // "plan" or "bundle"
	}

	var items []eligibleItem
	var plans []models.Plan
	if err := planCursor.All(ctx, &plans); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to read plans")
		return
	}
	for _, p := range plans {
		if p.MonthlyPriceCents > 0 || p.PerSeatPriceCents > 0 {
			items = append(items, eligibleItem{ID: p.ID.Hex(), Name: p.Name, Type: "plan"})
		}
	}

	// List active bundles.
	bundleCursor, err := h.db.CreditBundles().Find(ctx, bson.M{"isActive": true})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to list bundles")
		return
	}
	defer bundleCursor.Close(ctx)

	var bundles []models.CreditBundle
	if err := bundleCursor.All(ctx, &bundles); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to read bundles")
		return
	}
	for _, b := range bundles {
		items = append(items, eligibleItem{ID: b.ID.Hex(), Name: b.Name, Type: "bundle"})
	}

	if items == nil {
		items = []eligibleItem{}
	}
	respondWithJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}

// CreatePromotion creates a new Stripe coupon + promotion code.
func (h *PromotionsHandler) CreatePromotion(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code           string  `json:"code"`
		Name           string  `json:"name"`
		PercentOff     float64 `json:"percentOff"`
		AmountOff      int64   `json:"amountOff"`
		Currency       string  `json:"currency"`
		MaxRedemptions int64   `json:"maxRedemptions"`
		ExpiresAt      string  `json:"expiresAt"` // ISO 8601 date string (e.g. "2025-12-31")
		// Product restrictions: array of {type: "plan"|"bundle", id: "ObjectID hex"}
		AppliesTo []struct {
			Type string `json:"type"`
			ID   string `json:"id"`
		} `json:"appliesTo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Code == "" {
		respondWithError(w, http.StatusBadRequest, "Promotion code is required")
		return
	}
	if req.PercentOff <= 0 && req.AmountOff <= 0 {
		respondWithError(w, http.StatusBadRequest, "Either percentOff or amountOff is required")
		return
	}

	ctx := r.Context()

	// Resolve Stripe Product IDs for product restrictions.
	var stripeProductIDs []string
	if len(req.AppliesTo) > 0 {
		currency := strings.ToLower(h.store.Get("billing.default_currency"))
		if currency == "" {
			currency = "usd"
		}

		for _, item := range req.AppliesTo {
			objID, err := primitive.ObjectIDFromHex(item.ID)
			if err != nil {
				respondWithError(w, http.StatusBadRequest, "Invalid product ID: "+item.ID)
				return
			}

			productIDs, err := h.resolveStripeProducts(ctx, item.Type, objID, currency)
			if err != nil {
				slog.Warn("Failed to resolve Stripe product", "type", item.Type, "id", item.ID, "error", err)
			respondWithError(w, http.StatusInternalServerError, "Failed to resolve Stripe product")
				return
			}
			stripeProductIDs = append(stripeProductIDs, productIDs...)
		}
	}

	// Create the coupon.
	couponParams := &stripe.CouponParams{}
	if req.Name != "" {
		couponParams.Name = stripe.String(req.Name)
	} else {
		couponParams.Name = stripe.String(req.Code)
	}
	if req.PercentOff > 0 {
		couponParams.PercentOff = stripe.Float64(req.PercentOff)
	} else {
		couponParams.AmountOff = stripe.Int64(req.AmountOff)
		cur := req.Currency
		if cur == "" {
			cur = "usd"
		}
		couponParams.Currency = stripe.String(cur)
	}

	// Product restrictions go on the coupon.
	if len(stripeProductIDs) > 0 {
		couponParams.AppliesTo = &stripe.CouponAppliesToParams{
			Products: stripe.StringSlice(stripeProductIDs),
		}
	}

	c, err := coupon.New(couponParams)
	apicounter.StripeAPICalls.Add(1)
	if err != nil {
		slog.Error("Promotions: coupon create error", "error", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to create coupon")
		return
	}

	// Create the promotion code.
	promoParams := &stripe.PromotionCodeParams{
		Coupon: stripe.String(c.ID),
		Code:   stripe.String(req.Code),
	}
	if req.MaxRedemptions > 0 {
		promoParams.MaxRedemptions = stripe.Int64(req.MaxRedemptions)
	}

	// Expiration date.
	if req.ExpiresAt != "" {
		t, err := time.Parse("2006-01-02", req.ExpiresAt)
		if err != nil {
			respondWithError(w, http.StatusBadRequest, "Invalid expiration date format (use YYYY-MM-DD)")
			return
		}
		// Set to end of day UTC.
		expiresUnix := time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, 0, time.UTC).Unix()
		promoParams.ExpiresAt = stripe.Int64(expiresUnix)
	}

	pc, err := promotioncode.New(promoParams)
	apicounter.StripeAPICalls.Add(1)
	if err != nil {
		slog.Error("Promotions: promo code create error", "error", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to create promotion code")
		return
	}

	respondWithJSON(w, http.StatusCreated, map[string]interface{}{
		"id":   pc.ID,
		"code": pc.Code,
	})
}

// resolveStripeProducts returns the Stripe Product IDs for a given plan or bundle,
// creating the Stripe Product/Price if they don't exist yet.
func (h *PromotionsHandler) resolveStripeProducts(ctx context.Context, itemType string, itemID primitive.ObjectID, currency string) ([]string, error) {
	var productIDs []string

	if itemType == "plan" {
		// A plan can have up to 2 Stripe products (monthly + annual).
		var plan models.Plan
		if err := h.db.Plans().FindOne(ctx, bson.M{"_id": itemID}).Decode(&plan); err != nil {
			return nil, err
		}

		for _, interval := range []string{"month", "year"} {
			entityType := "plan_" + interval
			amountCents := plan.MonthlyPriceCents
			if interval == "year" && plan.AnnualDiscountPct > 0 {
				annual := float64(plan.MonthlyPriceCents*12) * (1 - float64(plan.AnnualDiscountPct)/100)
				amountCents = int64(annual)
			} else if interval == "year" {
				amountCents = plan.MonthlyPriceCents * 12
			}

			// Per-seat uses per-seat price.
			if plan.PricingModel == models.PricingModelPerSeat {
				amountCents = plan.PerSeatPriceCents
				if interval == "year" && plan.AnnualDiscountPct > 0 {
					annual := float64(plan.PerSeatPriceCents*12) * (1 - float64(plan.AnnualDiscountPct)/100)
					amountCents = int64(annual)
				} else if interval == "year" {
					amountCents = plan.PerSeatPriceCents * 12
				}
			}

			if amountCents <= 0 {
				continue
			}

			// GetOrCreatePrice returns a price ID but also creates the product.
			// We need the product ID, so look up or create the mapping.
			_, err := h.stripe.GetOrCreatePrice(ctx, entityType, itemID, plan.Name, amountCents, interval, currency)
			if err != nil {
				return nil, err
			}

			// Now read the mapping to get the product ID.
			var mapping models.StripeMapping
			if err := h.db.StripeMappings().FindOne(ctx, bson.M{
				"entityType": entityType,
				"entityId":   itemID,
			}).Decode(&mapping); err != nil {
				return nil, err
			}
			productIDs = append(productIDs, mapping.StripeProductID)
		}
	} else if itemType == "bundle" {
		var bundle models.CreditBundle
		if err := h.db.CreditBundles().FindOne(ctx, bson.M{"_id": itemID}).Decode(&bundle); err != nil {
			return nil, err
		}

		_, err := h.stripe.GetOrCreatePrice(ctx, "bundle", itemID, bundle.Name, int64(bundle.PriceCents), "", currency)
		if err != nil {
			return nil, err
		}

		var mapping models.StripeMapping
		if err := h.db.StripeMappings().FindOne(ctx, bson.M{
			"entityType": "bundle",
			"entityId":   itemID,
		}).Decode(&mapping); err != nil {
			return nil, err
		}
		productIDs = append(productIDs, mapping.StripeProductID)
	}

	return productIDs, nil
}

// UpdatePromotion updates an existing promotion code and/or its coupon.
// Stripe allows updating: promotion code active status, coupon name.
func (h *PromotionsHandler) UpdatePromotion(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID         string  `json:"id"`         // Promotion code ID
		CouponID   string  `json:"couponId"`   // Coupon ID
		CouponName *string `json:"couponName"` // Coupon display name (nil = no change)
		Active     *bool   `json:"active"`     // Promotion code active status (nil = no change)
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.ID == "" {
		respondWithError(w, http.StatusBadRequest, "Promotion code ID is required")
		return
	}

	// Update coupon name if provided.
	if req.CouponName != nil && req.CouponID != "" {
		_, err := coupon.Update(req.CouponID, &stripe.CouponParams{
			Name: stripe.String(*req.CouponName),
		})
		apicounter.StripeAPICalls.Add(1)
		if err != nil {
			slog.Error("Promotions: coupon update error", "error", err)
			respondWithError(w, http.StatusInternalServerError, "Failed to update coupon name")
			return
		}
	}

	// Update promotion code active status if provided.
	if req.Active != nil {
		_, err := promotioncode.Update(req.ID, &stripe.PromotionCodeParams{
			Active: stripe.Bool(*req.Active),
		})
		apicounter.StripeAPICalls.Add(1)
		if err != nil {
			slog.Error("Promotions: promo code update error", "error", err)
			respondWithError(w, http.StatusInternalServerError, "Failed to update promotion code")
			return
		}
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// DeactivatePromotion deactivates a Stripe promotion code.
func (h *PromotionsHandler) DeactivatePromotion(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.ID == "" {
		respondWithError(w, http.StatusBadRequest, "Promotion code ID is required")
		return
	}

	_, err := promotioncode.Update(req.ID, &stripe.PromotionCodeParams{
		Active: stripe.Bool(false),
	})
	apicounter.StripeAPICalls.Add(1)
	if err != nil {
		slog.Error("Promotions: deactivate error", "error", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to deactivate promotion code")
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]string{"status": "deactivated"})
}
