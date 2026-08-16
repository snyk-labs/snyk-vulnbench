package main

import (
	"context"
	"fmt"
	"time"

	"lastsaas/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func cmdStats() {
	database, _, cleanup := connectDB()
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// Counts
	userCount, _ := database.Users().EstimatedDocumentCount(ctx)
	tenantCount, _ := database.Tenants().EstimatedDocumentCount(ctx)
	activeUsers, _ := database.Users().CountDocuments(ctx, bson.M{"isActive": true})

	// Active subscriptions
	activeSubs, _ := database.Tenants().CountDocuments(ctx, bson.M{
		"billingStatus": bson.M{"$in": []string{"active", "past_due"}},
	})

	// Log severity counts (last 24h)
	since24h := time.Now().Add(-24 * time.Hour)
	logFilter := bson.M{"createdAt": bson.M{"$gte": since24h}}
	pipeline := bson.A{
		bson.M{"$match": logFilter},
		bson.M{"$group": bson.M{"_id": "$severity", "count": bson.M{"$sum": 1}}},
	}
	logCursor, _ := database.SystemLogs().Aggregate(ctx, pipeline)
	logCounts := map[string]int64{}
	if logCursor != nil {
		type sevCount struct {
			Severity string `bson:"_id"`
			Count    int64  `bson:"count"`
		}
		var results []sevCount
		logCursor.All(ctx, &results)
		logCursor.Close(ctx)
		for _, r := range results {
			logCounts[r.Severity] = r.Count
		}
	}

	// Latest daily metric (revenue, ARR)
	var latestMetric models.DailyMetric
	database.DailyMetrics().FindOne(ctx, bson.M{},
		options.FindOne().SetSort(bson.D{{Key: "date", Value: -1}})).Decode(&latestMetric)

	// Total revenue
	revPipeline := bson.A{
		bson.M{"$match": bson.M{"type": bson.M{"$ne": "refund"}}},
		bson.M{"$group": bson.M{"_id": nil, "total": bson.M{"$sum": "$amountCents"}}},
	}
	revCursor, _ := database.FinancialTransactions().Aggregate(ctx, revPipeline)
	var totalRevenue int64
	if revCursor != nil {
		type revResult struct {
			Total int64 `bson:"total"`
		}
		var res []revResult
		revCursor.All(ctx, &res)
		revCursor.Close(ctx)
		if len(res) > 0 {
			totalRevenue = res[0].Total
		}
	}

	if jsonOutput {
		printJSON(map[string]interface{}{
			"users":               userCount,
			"activeUsers":         activeUsers,
			"tenants":             tenantCount,
			"activeSubscriptions": activeSubs,
			"totalRevenue":        totalRevenue,
			"arr":                 latestMetric.ARR,
			"logs24h":             logCounts,
			"latestMetricDate":    latestMetric.Date,
		})
		return
	}

	fmt.Printf("%s\n\n", bold("Dashboard Stats"))

	fmt.Printf("  Users:           %s (%d active)\n", bold(fmt.Sprintf("%d", userCount)), activeUsers)
	fmt.Printf("  Tenants:         %s\n", bold(fmt.Sprintf("%d", tenantCount)))
	fmt.Printf("  Subscriptions:   %s active\n", bold(fmt.Sprintf("%d", activeSubs)))

	if totalRevenue > 0 {
		fmt.Printf("\n  Total Revenue:   %s\n", bold(formatCents(totalRevenue, "usd")))
	}
	if latestMetric.ARR > 0 {
		fmt.Printf("  ARR:             %s\n", bold(formatCents(latestMetric.ARR, "usd")))
	}
	if latestMetric.Date != "" {
		fmt.Printf("  DAU/MAU:         %d / %d (as of %s)\n", latestMetric.DAU, latestMetric.MAU, latestMetric.Date)
	}

	totalLogs := int64(0)
	for _, c := range logCounts {
		totalLogs += c
	}
	if totalLogs > 0 {
		fmt.Printf("\n  %s (last 24h: %d total)\n", bold("Log Activity"), totalLogs)
		for _, sev := range []string{"critical", "high", "medium", "low", "debug"} {
			if c := logCounts[sev]; c > 0 {
				fmt.Printf("    %s %d\n", severityClr(sev), c)
			}
		}
	}
}
