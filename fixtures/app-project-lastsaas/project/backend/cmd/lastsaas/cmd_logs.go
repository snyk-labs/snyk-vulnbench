package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"lastsaas/internal/db"
	"lastsaas/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func cmdLogs() {
	fs := flag.NewFlagSet("logs", flag.ExitOnError)
	severity := fs.String("severity", "", "Filter by severity (comma-separated: critical,high,medium,low,debug)")
	category := fs.String("category", "", "Filter by category (auth,billing,admin,system,security,tenant)")
	search := fs.String("search", "", "Full-text search")
	tail := fs.Int("tail", 50, "Number of recent entries to show")
	follow := fs.Bool("follow", false, "Follow mode: continuously poll for new entries")
	from := fs.String("from", "", "Start date (RFC3339 or relative: 1h, 24h, 7d)")
	to := fs.String("to", "", "End date (RFC3339)")
	fs.Parse(os.Args[2:])

	database, _, cleanup := connectDB()
	defer cleanup()

	filter := buildLogFilter(*severity, *category, *search, *from, *to)
	limit := int64(*tail)
	if limit < 1 || limit > 1000 {
		limit = 50
	}

	ctx := context.Background()

	if *follow {
		logsFollow(ctx, database, filter, limit)
		return
	}

	logs := queryLogs(ctx, database, filter, limit)

	if jsonOutput {
		printJSON(logs)
		return
	}

	if len(logs) == 0 {
		fmt.Println("No log entries found.")
		return
	}

	for _, log := range logs {
		printLogEntry(log)
	}
	fmt.Printf("\n%s %d entries shown\n", clr(cGray, "---"), len(logs))
}

func buildLogFilter(severity, category, search, from, to string) bson.M {
	filter := bson.M{}

	if severity != "" {
		parts := strings.Split(severity, ",")
		var valid []string
		for _, p := range parts {
			p = strings.TrimSpace(p)
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
	}

	if category != "" {
		filter["category"] = category
	}

	if search != "" {
		filter["$text"] = bson.M{"$search": search}
	}

	dateFilter := bson.M{}
	if from != "" {
		if t := parseTimeArg(from); !t.IsZero() {
			dateFilter["$gte"] = t
		}
	}
	if to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			dateFilter["$lte"] = t
		}
	}
	if len(dateFilter) > 0 {
		filter["createdAt"] = dateFilter
	}

	return filter
}

func parseTimeArg(s string) time.Time {
	// Try RFC3339 first
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t
	}
	// Try relative format: 1h, 24h, 7d, 30d
	s = strings.TrimSpace(strings.ToLower(s))
	now := time.Now()
	if strings.HasSuffix(s, "h") {
		var h int
		if _, err := fmt.Sscanf(s, "%dh", &h); err == nil && h > 0 {
			return now.Add(-time.Duration(h) * time.Hour)
		}
	}
	if strings.HasSuffix(s, "d") {
		var d int
		if _, err := fmt.Sscanf(s, "%dd", &d); err == nil && d > 0 {
			return now.Add(-time.Duration(d) * 24 * time.Hour)
		}
	}
	return time.Time{}
}

func queryLogs(ctx context.Context, database *db.MongoDB, filter bson.M, limit int64) []models.SystemLog {
	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetLimit(limit)

	cursor, err := database.SystemLogs().Find(ctx, filter, opts)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to query logs: %v\n", err)
		os.Exit(1)
	}
	defer cursor.Close(ctx)

	var logs []models.SystemLog
	if err := cursor.All(ctx, &logs); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to read logs: %v\n", err)
		os.Exit(1)
	}

	// Reverse to show oldest first (we queried newest first for LIMIT)
	for i, j := 0, len(logs)-1; i < j; i, j = i+1, j-1 {
		logs[i], logs[j] = logs[j], logs[i]
	}
	return logs
}

func logsFollow(ctx context.Context, database *db.MongoDB, filter bson.M, initialLimit int64) {
	// Show initial batch
	logs := queryLogs(ctx, database, filter, initialLimit)
	for _, log := range logs {
		printLogEntry(log)
	}

	if len(logs) > 0 {
		fmt.Printf("\n%s following new entries (Ctrl+C to stop)...\n\n", clr(cGray, "---"))
	} else {
		fmt.Printf("Waiting for log entries (Ctrl+C to stop)...\n\n")
	}

	var lastTime time.Time
	if len(logs) > 0 {
		lastTime = logs[len(logs)-1].CreatedAt
	} else {
		lastTime = time.Now()
	}

	for {
		time.Sleep(2 * time.Second)

		followFilter := bson.M{}
		for k, v := range filter {
			followFilter[k] = v
		}
		followFilter["createdAt"] = bson.M{"$gt": lastTime}

		opts := options.Find().
			SetSort(bson.D{{Key: "createdAt", Value: 1}}).
			SetLimit(100)

		cursor, err := database.SystemLogs().Find(ctx, followFilter, opts)
		if err != nil {
			continue
		}

		var newLogs []models.SystemLog
		cursor.All(ctx, &newLogs)
		cursor.Close(ctx)

		for _, log := range newLogs {
			printLogEntry(log)
			lastTime = log.CreatedAt
		}
	}
}

func printLogEntry(log models.SystemLog) {
	ts := log.CreatedAt.Local().Format("2006-01-02 15:04:05")
	sev := severityClr(string(log.Severity))
	cat := ""
	if log.Category != "" {
		cat = clr(cCyan, fmt.Sprintf("[%s]", log.Category))
	}

	msg := log.Message
	if len(msg) > 120 && isTTY() {
		msg = msg[:117] + "..."
	}

	if cat != "" {
		fmt.Printf("%s %s %s %s\n", clr(cGray, ts), sev, cat, msg)
	} else {
		fmt.Printf("%s %s %s\n", clr(cGray, ts), sev, msg)
	}
}
