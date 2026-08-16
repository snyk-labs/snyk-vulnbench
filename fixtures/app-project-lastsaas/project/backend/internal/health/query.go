package health

import (
	"context"
	"strconv"
	"time"

	"lastsaas/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ListNodes returns all nodes, marking stale ones based on config threshold.
func (s *Service) ListNodes(ctx context.Context) ([]models.SystemNode, error) {
	staleSeconds, _ := strconv.Atoi(s.getConfig("health.node.stale_timeout_seconds"))
	if staleSeconds <= 0 {
		staleSeconds = 180
	}
	staleCutoff := time.Now().Add(-time.Duration(staleSeconds) * time.Second)

	// Mark stale nodes
	_, _ = s.db.SystemNodes().UpdateMany(ctx,
		bson.M{"lastSeen": bson.M{"$lt": staleCutoff}, "status": models.NodeStatusActive},
		bson.M{"$set": bson.M{"status": models.NodeStatusStale}},
	)

	cursor, err := s.db.SystemNodes().Find(ctx, bson.M{},
		options.Find().SetSort(bson.D{{Key: "startedAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var nodes []models.SystemNode
	if err := cursor.All(ctx, &nodes); err != nil {
		return nil, err
	}
	return nodes, nil
}

// GetMetrics returns metrics for a specific node within a time range.
func (s *Service) GetMetrics(ctx context.Context, nodeID string, from, to time.Time) ([]models.SystemMetric, error) {
	filter := bson.M{
		"nodeId":    nodeID,
		"timestamp": bson.M{"$gte": from, "$lte": to},
	}
	cursor, err := s.db.SystemMetrics().Find(ctx, filter,
		options.Find().SetSort(bson.D{{Key: "timestamp", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var metrics []models.SystemMetric
	if err := cursor.All(ctx, &metrics); err != nil {
		return nil, err
	}
	return metrics, nil
}

// GetAggregateMetrics returns metrics across all nodes within a time range.
func (s *Service) GetAggregateMetrics(ctx context.Context, from, to time.Time) ([]models.SystemMetric, error) {
	filter := bson.M{
		"timestamp": bson.M{"$gte": from, "$lte": to},
	}
	cursor, err := s.db.SystemMetrics().Find(ctx, filter,
		options.Find().SetSort(bson.D{{Key: "timestamp", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var metrics []models.SystemMetric
	if err := cursor.All(ctx, &metrics); err != nil {
		return nil, err
	}
	return metrics, nil
}

// GetCurrentMetrics returns the most recent metric for each node.
func (s *Service) GetCurrentMetrics(ctx context.Context) ([]models.SystemMetric, error) {
	nodes, err := s.ListNodes(ctx)
	if err != nil {
		return nil, err
	}

	var results []models.SystemMetric
	for _, node := range nodes {
		var metric models.SystemMetric
		err := s.db.SystemMetrics().FindOne(ctx,
			bson.M{"nodeId": node.MachineID},
			options.FindOne().SetSort(bson.D{{Key: "timestamp", Value: -1}}),
		).Decode(&metric)
		if err == nil {
			results = append(results, metric)
		}
	}
	return results, nil
}

// GetIntegrationCounts24h returns the total Stripe API calls and Resend emails over the last 24 hours.
func (s *Service) GetIntegrationCounts24h(ctx context.Context) (stripeCalls, resendEmails int64) {
	since := time.Now().Add(-24 * time.Hour)
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"timestamp": bson.M{"$gte": since}}}},
		{{Key: "$group", Value: bson.M{
			"_id":          nil,
			"stripeCalls":  bson.M{"$sum": "$integrations.stripeApiCalls"},
			"resendEmails": bson.M{"$sum": "$integrations.resendEmails"},
		}}},
	}
	cursor, err := s.db.SystemMetrics().Aggregate(ctx, pipeline)
	if err != nil {
		return 0, 0
	}
	defer cursor.Close(ctx)

	var result struct {
		StripeCalls  int64 `bson:"stripeCalls"`
		ResendEmails int64 `bson:"resendEmails"`
	}
	if cursor.Next(ctx) {
		if err := cursor.Decode(&result); err == nil {
			return result.StripeCalls, result.ResendEmails
		}
	}
	return 0, 0
}
