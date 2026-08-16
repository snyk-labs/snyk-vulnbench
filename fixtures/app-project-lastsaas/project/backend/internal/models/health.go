package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Node status constants
type NodeStatus string

const (
	NodeStatusActive NodeStatus = "active"
	NodeStatusStale  NodeStatus = "stale"
)

// SystemNode represents a registered server instance.
type SystemNode struct {
	ID        primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	MachineID string             `json:"machineId" bson:"machineId"`
	Hostname  string             `json:"hostname" bson:"hostname"`
	Status    NodeStatus         `json:"status" bson:"status"`
	StartedAt time.Time          `json:"startedAt" bson:"startedAt"`
	LastSeen  time.Time          `json:"lastSeen" bson:"lastSeen"`
	Version   string             `json:"version" bson:"version"`
	GoVersion string             `json:"goVersion" bson:"goVersion"`
}

// SystemMetric represents a point-in-time metrics snapshot from a single node.
type SystemMetric struct {
	ID        primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	NodeID    string             `json:"nodeId" bson:"nodeId"`
	Timestamp time.Time          `json:"timestamp" bson:"timestamp"`
	CPU       CPUMetrics         `json:"cpu" bson:"cpu"`
	Memory    MemoryMetrics      `json:"memory" bson:"memory"`
	Disk      DiskMetrics        `json:"disk" bson:"disk"`
	Network   NetworkMetrics     `json:"network" bson:"network"`
	HTTP      HTTPMetrics        `json:"http" bson:"http"`
	Mongo     MongoMetrics       `json:"mongo" bson:"mongo"`
	GoRuntime    GoRuntimeMetrics        `json:"goRuntime" bson:"goRuntime"`
	Integrations IntegrationCountMetrics `json:"integrations" bson:"integrations"`
}

type CPUMetrics struct {
	UsagePercent float64 `json:"usagePercent" bson:"usagePercent"`
	NumCPU       int     `json:"numCpu" bson:"numCpu"`
}

type MemoryMetrics struct {
	UsedBytes   uint64  `json:"usedBytes" bson:"usedBytes"`
	TotalBytes  uint64  `json:"totalBytes" bson:"totalBytes"`
	UsedPercent float64 `json:"usedPercent" bson:"usedPercent"`
}

type DiskMetrics struct {
	UsedBytes   uint64  `json:"usedBytes" bson:"usedBytes"`
	TotalBytes  uint64  `json:"totalBytes" bson:"totalBytes"`
	UsedPercent float64 `json:"usedPercent" bson:"usedPercent"`
}

type NetworkMetrics struct {
	BytesSent uint64 `json:"bytesSent" bson:"bytesSent"`
	BytesRecv uint64 `json:"bytesRecv" bson:"bytesRecv"`
}

type HTTPMetrics struct {
	RequestCount int64            `json:"requestCount" bson:"requestCount"`
	LatencyP50   float64          `json:"latencyP50" bson:"latencyP50"`
	LatencyP95   float64          `json:"latencyP95" bson:"latencyP95"`
	LatencyP99   float64          `json:"latencyP99" bson:"latencyP99"`
	StatusCodes  map[string]int64 `json:"statusCodes" bson:"statusCodes"`
	ErrorRate4xx float64          `json:"errorRate4xx" bson:"errorRate4xx"`
	ErrorRate5xx float64          `json:"errorRate5xx" bson:"errorRate5xx"`
}

type MongoMetrics struct {
	CurrentConnections   int32            `json:"currentConnections" bson:"currentConnections"`
	AvailableConnections int32            `json:"availableConnections" bson:"availableConnections"`
	DataSizeBytes        int64            `json:"dataSizeBytes" bson:"dataSizeBytes"`
	IndexSizeBytes       int64            `json:"indexSizeBytes" bson:"indexSizeBytes"`
	Collections          int32            `json:"collections" bson:"collections"`
	OpCounters           map[string]int64 `json:"opCounters" bson:"opCounters"`
}

type GoRuntimeMetrics struct {
	NumGoroutine int    `json:"numGoroutine" bson:"numGoroutine"`
	HeapAlloc    uint64 `json:"heapAlloc" bson:"heapAlloc"`
	HeapSys      uint64 `json:"heapSys" bson:"heapSys"`
	GCPauseNs    uint64 `json:"gcPauseNs" bson:"gcPauseNs"`
	NumGC        uint32 `json:"numGC" bson:"numGC"`
}

type IntegrationCountMetrics struct {
	StripeAPICalls  int64 `json:"stripeApiCalls" bson:"stripeApiCalls"`
	ResendEmails    int64 `json:"resendEmails" bson:"resendEmails"`
	DataDogAPICalls int64 `json:"datadogApiCalls" bson:"datadogApiCalls"`
}

// Integration health check types (in-memory only, no BSON persistence)

type IntegrationStatus string

const (
	IntegrationHealthy       IntegrationStatus = "healthy"
	IntegrationUnhealthy     IntegrationStatus = "unhealthy"
	IntegrationNotConfigured IntegrationStatus = "not_configured"
)

type IntegrationCheck struct {
	Name       string            `json:"name"`
	Status     IntegrationStatus `json:"status"`
	Message    string            `json:"message"`
	LastCheck  time.Time         `json:"lastCheck"`
	ResponseMs int64             `json:"responseMs"`
	Calls24h   int64             `json:"calls24h"`
}
