package handlers

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"strings"
	"time"

	"lastsaas/internal/db"
	"lastsaas/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type LogHandler struct {
	db *db.MongoDB
}

func NewLogHandler(database *db.MongoDB) *LogHandler {
	return &LogHandler{db: database}
}

type logListResponse struct {
	Logs  []models.SystemLog `json:"logs"`
	Total int64              `json:"total"`
}

func (h *LogHandler) buildFilter(q map[string][]string) bson.M {
	filter := bson.M{}

	// Severity filter (supports comma-separated multi-select, e.g. "critical,high,medium")
	if sev := getFirst(q, "severity"); sev != "" {
		parts := strings.Split(sev, ",")
		var valid []string
		for _, p := range parts {
			switch models.LogSeverity(p) {
			case models.LogCritical, models.LogHigh, models.LogMedium, models.LogLow, models.LogDebug:
				valid = append(valid, p)
			}
		}
		if len(valid) == 1 {
			filter["severity"] = valid[0]
		} else if len(valid) > 1 && len(valid) < 5 {
			filter["severity"] = bson.M{"$in": valid}
		}
		// All 5 selected or none valid → no filter (fastest path)
	}

	// Category filter
	if cat := getFirst(q, "category"); cat != "" {
		filter["category"] = cat
	}

	// User filter
	if uid := getFirst(q, "userId"); uid != "" {
		if userOID, err := primitive.ObjectIDFromHex(uid); err == nil {
			filter["userId"] = userOID
		}
	}

	// Text search
	if search := getFirst(q, "search"); search != "" {
		filter["$text"] = bson.M{"$search": search}
	}

	// Date range filters
	dateFilter := bson.M{}
	if from := getFirst(q, "fromDate"); from != "" {
		if t, err := time.Parse(time.RFC3339, from); err == nil {
			dateFilter["$gte"] = t
		}
	}
	if to := getFirst(q, "toDate"); to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			dateFilter["$lte"] = t
		}
	}
	if len(dateFilter) > 0 {
		filter["createdAt"] = dateFilter
	}

	return filter
}

func (h *LogHandler) ListLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	// Pagination
	page, _ := strconv.Atoi(q.Get("page"))
	if page < 1 {
		page = 1
	}
	perPage, _ := strconv.Atoi(q.Get("perPage"))
	if perPage < 1 || perPage > 100 {
		perPage = 50
	}
	skip := int64((page - 1) * perPage)

	filter := h.buildFilter(q)
	ctx := r.Context()

	// Use estimated count when no filter is applied, exact count otherwise
	var total int64
	var err error
	if len(filter) == 0 {
		total, err = h.db.SystemLogs().EstimatedDocumentCount(ctx)
	} else {
		total, err = h.db.SystemLogs().CountDocuments(ctx, filter)
	}
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to count logs")
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetSkip(skip).
		SetLimit(int64(perPage))

	cursor, err := h.db.SystemLogs().Find(ctx, filter, opts)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to query logs")
		return
	}
	defer cursor.Close(ctx)

	logs := []models.SystemLog{}
	if err := cursor.All(ctx, &logs); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to read logs")
		return
	}

	respondWithJSON(w, http.StatusOK, logListResponse{Logs: logs, Total: total})
}

// SeverityCounts returns the count of logs per severity level, respecting date/category filters.
func (h *LogHandler) SeverityCounts(w http.ResponseWriter, r *http.Request) {
	filter := h.buildFilter(r.URL.Query())

	// Remove severity from filter since we're grouping by it
	delete(filter, "severity")

	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: filter}},
		{{Key: "$group", Value: bson.D{
			{Key: "_id", Value: "$severity"},
			{Key: "count", Value: bson.M{"$sum": 1}},
		}}},
	}

	cursor, err := h.db.SystemLogs().Aggregate(r.Context(), pipeline)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to aggregate severity counts")
		return
	}
	defer cursor.Close(r.Context())

	type sevCount struct {
		Severity string `bson:"_id" json:"severity"`
		Count    int64  `bson:"count" json:"count"`
	}
	var results []sevCount
	if err := cursor.All(r.Context(), &results); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to read severity counts")
		return
	}

	counts := map[string]int64{
		"critical": 0,
		"high":     0,
		"medium":   0,
		"low":      0,
		"debug":    0,
	}
	for _, r := range results {
		counts[r.Severity] = r.Count
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{"counts": counts})
}

// ExportCSV streams all logs matching filters as a CSV download.
func (h *LogHandler) ExportCSV(w http.ResponseWriter, r *http.Request) {
	filter := h.buildFilter(r.URL.Query())
	ctx := r.Context()

	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetLimit(10000) // cap export to 10k rows

	cursor, err := h.db.SystemLogs().Find(ctx, filter, opts)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to query logs")
		return
	}
	defer cursor.Close(ctx)

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=system_logs.csv")

	writer := csv.NewWriter(w)
	writer.Write([]string{"Timestamp", "Severity", "Category", "Message", "UserID", "TenantID", "Action"})

	for cursor.Next(ctx) {
		var log models.SystemLog
		if err := cursor.Decode(&log); err != nil {
			continue
		}
		userID := ""
		if log.UserID != nil {
			userID = log.UserID.Hex()
		}
		tenantID := ""
		if log.TenantID != nil {
			tenantID = log.TenantID.Hex()
		}
		writer.Write([]string{
			log.CreatedAt.Format(time.RFC3339),
			string(log.Severity),
			string(log.Category),
			sanitizeCSVField(log.Message),
			userID,
			tenantID,
			sanitizeCSVField(log.Action),
		})
	}
	writer.Flush()
}

func getFirst(q map[string][]string, key string) string {
	if vals, ok := q[key]; ok && len(vals) > 0 {
		return vals[0]
	}
	return ""
}

