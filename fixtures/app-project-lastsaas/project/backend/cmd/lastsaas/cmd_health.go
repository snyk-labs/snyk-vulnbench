package main

import (
	"context"
	"fmt"
	"time"

	"lastsaas/internal/models"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func cmdHealth() {
	database, cfg, cleanup := connectDB()
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if jsonOutput {
		type nodeInfo struct {
			MachineID string `json:"machineId"`
			Hostname  string `json:"hostname"`
			Status    string `json:"status"`
			Version   string `json:"version"`
			LastSeen  string `json:"lastSeen"`
		}
		type metricsInfo struct {
			CPU     float64 `json:"cpuPercent"`
			Memory  float64 `json:"memoryPercent"`
			Disk    float64 `json:"diskPercent"`
			ReqRate int64   `json:"requestCount"`
			P95Ms   float64 `json:"latencyP95Ms"`
			Err5xx  float64 `json:"errorRate5xx"`
		}
		type healthJSON struct {
			MongoDB    string       `json:"mongodb"`
			Database   string       `json:"database"`
			Nodes      []nodeInfo   `json:"nodes"`
			Metrics    *metricsInfo `json:"latestMetrics,omitempty"`
		}

		h := healthJSON{
			MongoDB:  "connected",
			Database: cfg.Database.Name,
		}

		// Nodes
		cursor, _ := database.SystemNodes().Find(ctx, bson.M{},
			options.Find().SetSort(bson.D{{Key: "lastSeen", Value: -1}}))
		if cursor != nil {
			var nodes []models.SystemNode
			cursor.All(ctx, &nodes)
			cursor.Close(ctx)
			for _, n := range nodes {
				status := "active"
				if time.Since(n.LastSeen) > 60*time.Second {
					status = "stale"
				}
				h.Nodes = append(h.Nodes, nodeInfo{
					MachineID: n.MachineID,
					Hostname:  n.Hostname,
					Status:    status,
					Version:   n.Version,
					LastSeen:  n.LastSeen.Format(time.RFC3339),
				})
			}
		}

		// Latest metric
		var metric models.SystemMetric
		err := database.SystemMetrics().FindOne(ctx, bson.M{},
			options.FindOne().SetSort(bson.D{{Key: "timestamp", Value: -1}})).Decode(&metric)
		if err == nil {
			h.Metrics = &metricsInfo{
				CPU:     metric.CPU.UsagePercent,
				Memory:  metric.Memory.UsedPercent,
				Disk:    metric.Disk.UsedPercent,
				ReqRate: metric.HTTP.RequestCount,
				P95Ms:   metric.HTTP.LatencyP95,
				Err5xx:  metric.HTTP.ErrorRate5xx,
			}
		}

		printJSON(h)
		return
	}

	fmt.Printf("%s\n\n", bold("System Health"))

	// MongoDB
	fmt.Printf("  MongoDB:    %s (%s)\n", clr(cGreen, "connected"), cfg.Database.Name)

	// Nodes
	cursor, err := database.SystemNodes().Find(ctx, bson.M{},
		options.Find().SetSort(bson.D{{Key: "lastSeen", Value: -1}}))
	if err == nil {
		var nodes []models.SystemNode
		cursor.All(ctx, &nodes)
		cursor.Close(ctx)

		if len(nodes) > 0 {
			fmt.Printf("\n  %s (%d)\n", bold("Nodes"), len(nodes))
			for _, n := range nodes {
				status := clr(cGreen, "active")
				if time.Since(n.LastSeen) > 60*time.Second {
					status = clr(cRed, "stale")
				}
				fmt.Printf("    %-20s  %s  v%s  last seen %s\n",
					n.Hostname, status, n.Version, timeAgo(n.LastSeen))
			}
		} else {
			fmt.Printf("\n  Nodes:      %s\n", clr(cGray, "none registered (server not running?)"))
		}
	}

	// Latest metrics
	var metric models.SystemMetric
	err = database.SystemMetrics().FindOne(ctx, bson.M{},
		options.FindOne().SetSort(bson.D{{Key: "timestamp", Value: -1}})).Decode(&metric)
	if err == nil {
		fmt.Printf("\n  %s (from %s)\n", bold("Latest Metrics"), timeAgo(metric.Timestamp))
		cpuClr := cGreen
		if metric.CPU.UsagePercent > 80 {
			cpuClr = cRed
		} else if metric.CPU.UsagePercent > 60 {
			cpuClr = cYellow
		}
		memClr := cGreen
		if metric.Memory.UsedPercent > 80 {
			memClr = cRed
		} else if metric.Memory.UsedPercent > 60 {
			memClr = cYellow
		}
		diskClr := cGreen
		if metric.Disk.UsedPercent > 90 {
			diskClr = cRed
		} else if metric.Disk.UsedPercent > 75 {
			diskClr = cYellow
		}

		fmt.Printf("    CPU:      %s\n", clr(cpuClr, fmt.Sprintf("%.1f%%", metric.CPU.UsagePercent)))
		fmt.Printf("    Memory:   %s (%s / %s)\n",
			clr(memClr, fmt.Sprintf("%.1f%%", metric.Memory.UsedPercent)),
			formatBytes(int64(metric.Memory.UsedBytes)),
			formatBytes(int64(metric.Memory.TotalBytes)))
		fmt.Printf("    Disk:     %s\n", clr(diskClr, fmt.Sprintf("%.1f%%", metric.Disk.UsedPercent)))
		fmt.Printf("    Requests: %d (p95: %.0fms, 5xx: %.1f%%)\n",
			metric.HTTP.RequestCount, metric.HTTP.LatencyP95, metric.HTTP.ErrorRate5xx)
		fmt.Printf("    MongoDB:  %d connections\n", metric.Mongo.CurrentConnections)
		fmt.Printf("    Runtime:  %d goroutines, %s heap\n",
			metric.GoRuntime.NumGoroutine, formatBytes(int64(metric.GoRuntime.HeapAlloc)))
	}
}
