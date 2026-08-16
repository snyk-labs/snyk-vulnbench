package datadog

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"lastsaas/internal/apicounter"
	"lastsaas/internal/models"
)

const (
	metricsBufferSize = 200
	eventsBufferSize  = 50
	logsBufferSize    = 200
	checksBufferSize  = 50
	flushInterval     = 10 * time.Second
	logsFlushInterval = 5 * time.Second
	maxBackoff        = 60 * time.Second
	httpTimeout       = 10 * time.Second
)

// Client is an async-buffered DataDog REST API client.
// It submits metrics, events, logs, and service checks
// without requiring a DataDog Agent.
type Client struct {
	apiKey     string
	site       string // e.g. "us5.datadoghq.com"
	env        string // e.g. "dev", "prod"
	appName    string
	hostname   string // canonical: e.g. "lastsaas.fly.dev"
	machineID  string // Fly machine ID for tagging
	region     string // Fly region for tagging
	metricPfx  string // normalized app name for metric prefix
	httpClient *http.Client

	metricsCh chan metricPoint
	eventsCh  chan ddEvent
	logsCh    chan ddLog
	checksCh  chan ddServiceCheck
	stopCh    chan struct{}
	wg        sync.WaitGroup
}

// metricPoint is a single metric value to be batched.
type metricPoint struct {
	MetricName string
	Tags       []string
	Value      float64
	Timestamp  int64 // Unix seconds
	MetricType int   // 1=count, 3=gauge (DataDog v2 series API type codes)
	Interval   int64 // Required for count/rate metrics: aggregation interval in seconds
}

// ddEvent is a DataDog event (from syslog).
type ddEvent struct {
	Title          string   `json:"title"`
	Text           string   `json:"text"`
	Priority       string   `json:"priority"`
	AlertType      string   `json:"alert_type"`
	Tags           []string `json:"tags"`
	Host           string   `json:"host,omitempty"`
	SourceTypeName string   `json:"source_type_name,omitempty"`
}

// ddLog is a DataDog log entry for the HTTP logs intake API.
type ddLog struct {
	Message  string `json:"message"`
	Hostname string `json:"hostname"`
	Service  string `json:"service"`
	Status   string `json:"status"`   // "info", "warn", "error", "critical"
	DDTags   string `json:"ddtags"`   // comma-separated key:value pairs
	DDSource string `json:"ddsource"` // e.g. "go"
}

// ddServiceCheck is a DataDog service check.
type ddServiceCheck struct {
	Check    string   `json:"check"`
	HostName string   `json:"host_name"`
	Status   int      `json:"status"` // 0=OK, 1=WARN, 2=CRIT, 3=UNKNOWN
	Tags     []string `json:"tags"`
	Message  string   `json:"message,omitempty"`
}

// New creates a DataDog client and starts background flush goroutines.
func New(apiKey, site, env, appName, configHostname string) *Client {
	hostname := resolveHostname(configHostname)
	machineID := os.Getenv("FLY_MACHINE_ID")
	if machineID == "" {
		machineID, _ = os.Hostname()
	}
	region := os.Getenv("FLY_REGION")

	c := &Client{
		apiKey:     apiKey,
		site:       site,
		env:        env,
		appName:    appName,
		hostname:   hostname,
		machineID:  machineID,
		region:     region,
		metricPfx:  normalizeMetricPrefix(appName),
		httpClient: &http.Client{Timeout: httpTimeout},
		metricsCh:  make(chan metricPoint, metricsBufferSize),
		eventsCh:   make(chan ddEvent, eventsBufferSize),
		logsCh:     make(chan ddLog, logsBufferSize),
		checksCh:   make(chan ddServiceCheck, checksBufferSize),
		stopCh:     make(chan struct{}),
	}
	c.wg.Add(4)
	go c.metricsFlushLoop()
	go c.eventsFlushLoop()
	go c.logsFlushLoop()
	go c.checksFlushLoop()
	return c
}

// resolveHostname determines the canonical hostname.
// Priority: config override > FLY_APP_NAME.fly.dev > os.Hostname()
func resolveHostname(configHostname string) string {
	if configHostname != "" {
		return configHostname
	}
	if flyApp := os.Getenv("FLY_APP_NAME"); flyApp != "" {
		return flyApp + ".fly.dev"
	}
	h, _ := os.Hostname()
	if h == "" {
		return "unknown"
	}
	return h
}

// normalizeMetricPrefix converts "LastSaaS" -> "lastsaas", "Flipbook Metavert" -> "flipbook-metavert"
func normalizeMetricPrefix(appName string) string {
	s := strings.ToLower(appName)
	s = strings.ReplaceAll(s, " ", "-")
	s = strings.ReplaceAll(s, ".", "-")
	return s
}

// Startup validates the API key, sends a startup event and a heartbeat metric
// synchronously. Returns an error if DataDog is unreachable or rejects the data.
func (c *Client) Startup(ctx context.Context, appVersion string) error {
	if err := c.Validate(ctx); err != nil {
		return fmt.Errorf("API key validation failed: %w", err)
	}

	evt := ddEvent{
		Title:          fmt.Sprintf("[startup] %s v%s started", c.appName, appVersion),
		Text:           fmt.Sprintf("%s version %s started on host %s (env: %s, machine: %s)", c.appName, appVersion, c.hostname, c.env, c.machineID),
		Priority:       "low",
		AlertType:      "info",
		Host:           c.hostname,
		SourceTypeName: c.appName,
		Tags:           append(c.baseTags(), "version:"+appVersion),
	}
	if err := c.submitEvent(evt); err != nil {
		return fmt.Errorf("startup event submission failed: %w", err)
	}

	heartbeat := []metricPoint{{
		MetricName: c.metricPfx + ".heartbeat",
		Tags:       append(c.baseTags(), "version:"+appVersion),
		Value:      1,
		Timestamp:  time.Now().Unix(),
		MetricType: 1,
		Interval:   10,
	}}
	if err := c.submitMetrics(heartbeat); err != nil {
		return fmt.Errorf("startup metric submission failed: %w", err)
	}

	slog.Info("datadog: startup verification complete",
		"hostname", c.hostname, "site", c.site,
		"machine", c.machineID, "region", c.region,
		"event", "sent", "metric", "sent")
	return nil
}

// Stop gracefully drains buffers and shuts down flush loops.
func (c *Client) Stop() {
	close(c.stopCh)
	c.wg.Wait()
}

// baseTags returns the common tags applied to every data point.
func (c *Client) baseTags() []string {
	tags := []string{
		"env:" + c.env,
		"app:" + c.appName,
	}
	if c.machineID != "" {
		tags = append(tags, "machine:"+c.machineID)
	}
	if c.region != "" {
		tags = append(tags, "region:"+c.region)
	}
	return tags
}

// TrackTelemetryEvent converts a TelemetryEvent into a count metric and enqueues it.
func (c *Client) TrackTelemetryEvent(event models.TelemetryEvent) {
	tags := c.baseTags()
	tags = append(tags, "event_name:"+event.EventName, "category:"+event.Category)

	point := metricPoint{
		MetricName: c.metricPfx + ".telemetry.event",
		Tags:       tags,
		Value:      1,
		Timestamp:  event.CreatedAt.Unix(),
		MetricType: 1, // count
		Interval:   10,
	}
	select {
	case c.metricsCh <- point:
	default:
		slog.Warn("datadog: metrics buffer full, dropping telemetry point", "event", event.EventName)
	}
}

// TrackSyslogEntry converts a SystemLog into a DataDog log entry (all levels)
// and additionally a DataDog event (critical/high only for alerts).
func (c *Client) TrackSyslogEntry(entry models.SystemLog) {
	// Always forward as a structured log
	tags := c.baseTags()
	tags = append(tags, "severity:"+string(entry.Severity))
	if entry.Category != "" {
		tags = append(tags, "category:"+string(entry.Category))
	}

	logEntry := ddLog{
		Message:  entry.Message,
		Hostname: c.hostname,
		Service:  c.appName,
		Status:   severityToLogStatus(entry.Severity),
		DDTags:   joinTags(tags),
		DDSource: "go",
	}
	select {
	case c.logsCh <- logEntry:
	default:
		slog.Warn("datadog: logs buffer full, dropping log entry")
	}

	// Additionally forward critical/high as events (for event stream / alerts)
	if entry.Severity != models.LogCritical && entry.Severity != models.LogHigh {
		return
	}
	alertType := "warning"
	if entry.Severity == models.LogCritical {
		alertType = "error"
	}

	evt := ddEvent{
		Title:          fmt.Sprintf("[%s] %s", entry.Severity, truncate(entry.Message, 100)),
		Text:           entry.Message,
		Priority:       "normal",
		AlertType:      alertType,
		Host:           c.hostname,
		SourceTypeName: c.appName,
		Tags:           tags,
	}
	select {
	case c.eventsCh <- evt:
	default:
		slog.Warn("datadog: events buffer full, dropping syslog event")
	}
}

// TrackHealthSnapshot converts a SystemMetric snapshot into DataDog gauge metrics.
func (c *Client) TrackHealthSnapshot(metric models.SystemMetric) {
	now := time.Now().Unix()
	pfx := c.metricPfx
	tags := c.baseTags()

	gauges := []metricPoint{
		// CPU
		{MetricName: pfx + ".cpu.usage", Tags: tags, Value: metric.CPU.UsagePercent, Timestamp: now, MetricType: 3},
		// Memory
		{MetricName: pfx + ".memory.used_bytes", Tags: tags, Value: float64(metric.Memory.UsedBytes), Timestamp: now, MetricType: 3},
		{MetricName: pfx + ".memory.used_percent", Tags: tags, Value: metric.Memory.UsedPercent, Timestamp: now, MetricType: 3},
		// Disk
		{MetricName: pfx + ".disk.used_bytes", Tags: tags, Value: float64(metric.Disk.UsedBytes), Timestamp: now, MetricType: 3},
		{MetricName: pfx + ".disk.used_percent", Tags: tags, Value: metric.Disk.UsedPercent, Timestamp: now, MetricType: 3},
		// HTTP
		{MetricName: pfx + ".http.requests", Tags: tags, Value: float64(metric.HTTP.RequestCount), Timestamp: now, MetricType: 1, Interval: 60},
		{MetricName: pfx + ".http.latency.p50", Tags: tags, Value: metric.HTTP.LatencyP50, Timestamp: now, MetricType: 3},
		{MetricName: pfx + ".http.latency.p95", Tags: tags, Value: metric.HTTP.LatencyP95, Timestamp: now, MetricType: 3},
		{MetricName: pfx + ".http.latency.p99", Tags: tags, Value: metric.HTTP.LatencyP99, Timestamp: now, MetricType: 3},
		{MetricName: pfx + ".http.error_rate_4xx", Tags: tags, Value: metric.HTTP.ErrorRate4xx, Timestamp: now, MetricType: 3},
		{MetricName: pfx + ".http.error_rate_5xx", Tags: tags, Value: metric.HTTP.ErrorRate5xx, Timestamp: now, MetricType: 3},
		// Go runtime
		{MetricName: pfx + ".runtime.goroutines", Tags: tags, Value: float64(metric.GoRuntime.NumGoroutine), Timestamp: now, MetricType: 3},
		{MetricName: pfx + ".runtime.heap_alloc", Tags: tags, Value: float64(metric.GoRuntime.HeapAlloc), Timestamp: now, MetricType: 3},
		// MongoDB
		{MetricName: pfx + ".mongo.connections", Tags: tags, Value: float64(metric.Mongo.CurrentConnections), Timestamp: now, MetricType: 3},
		{MetricName: pfx + ".mongo.available_connections", Tags: tags, Value: float64(metric.Mongo.AvailableConnections), Timestamp: now, MetricType: 3},
		// Network
		{MetricName: pfx + ".network.bytes_sent", Tags: tags, Value: float64(metric.Network.BytesSent), Timestamp: now, MetricType: 1, Interval: 60},
		{MetricName: pfx + ".network.bytes_recv", Tags: tags, Value: float64(metric.Network.BytesRecv), Timestamp: now, MetricType: 1, Interval: 60},
	}

	// HTTP status code breakdown
	for code, count := range metric.HTTP.StatusCodes {
		statusTags := make([]string, len(tags), len(tags)+1)
		copy(statusTags, tags)
		statusTags = append(statusTags, "status_class:"+code)
		gauges = append(gauges, metricPoint{
			MetricName: pfx + ".http.status_codes",
			Tags:       statusTags,
			Value:      float64(count),
			Timestamp:  now,
			MetricType: 1,
			Interval:   60,
		})
	}

	// MongoDB op counters
	for op, count := range metric.Mongo.OpCounters {
		opTags := make([]string, len(tags), len(tags)+1)
		copy(opTags, tags)
		opTags = append(opTags, "operation:"+op)
		gauges = append(gauges, metricPoint{
			MetricName: pfx + ".mongo.ops",
			Tags:       opTags,
			Value:      float64(count),
			Timestamp:  now,
			MetricType: 1,
			Interval:   60,
		})
	}

	enqueued := 0
	for _, g := range gauges {
		select {
		case c.metricsCh <- g:
			enqueued++
		default:
			slog.Warn("datadog: metrics buffer full, dropping health metrics")
			break
		}
	}
	slog.Info("datadog: health snapshot enqueued", "metrics", enqueued)
}

// TrackIntegrationChecks forwards integration health check results as DataDog service checks.
func (c *Client) TrackIntegrationChecks(checks []models.IntegrationCheck) {
	for _, check := range checks {
		if check.Status == models.IntegrationNotConfigured {
			continue
		}
		status := 3 // UNKNOWN
		switch check.Status {
		case models.IntegrationHealthy:
			status = 0 // OK
		case models.IntegrationUnhealthy:
			status = 2 // CRITICAL
		}

		tags := c.baseTags()
		tags = append(tags, "integration:"+check.Name)

		sc := ddServiceCheck{
			Check:    c.metricPfx + ".integration." + check.Name,
			HostName: c.hostname,
			Status:   status,
			Tags:     tags,
			Message:  check.Message,
		}
		select {
		case c.checksCh <- sc:
		default:
			slog.Warn("datadog: checks buffer full, dropping service check", "check", check.Name)
		}
	}
}

// Validate checks whether the DataDog API key is valid.
func (c *Client) Validate(ctx context.Context) error {
	apiURL := fmt.Sprintf("https://api.%s/api/v1/validate", c.site)
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("DD-API-KEY", c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("datadog validate request failed: %w", err)
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	apicounter.DataDogAPICalls.Add(1)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("datadog API key validation failed: status %d", resp.StatusCode)
	}
	return nil
}

// --- Flush loops ---

func (c *Client) metricsFlushLoop() {
	defer c.wg.Done()
	backoff := flushInterval
	timer := time.NewTimer(backoff)
	timer.Stop()

	buf := make([]metricPoint, 0, metricsBufferSize)
	flush := func() bool {
		if len(buf) == 0 {
			return true
		}
		if err := c.submitMetrics(buf); err != nil {
			slog.Warn("datadog: metrics flush failed, will retry", "count", len(buf), "error", err)
			return false
		}
		buf = buf[:0]
		return true
	}

	for {
		select {
		case pt := <-c.metricsCh:
			wasEmpty := len(buf) == 0
			buf = append(buf, pt)
			if len(buf) >= metricsBufferSize {
				if flush() {
					backoff = flushInterval
				} else {
					backoff = min(backoff*2, maxBackoff)
				}
			}
			if wasEmpty && len(buf) > 0 {
				timer.Reset(backoff)
			}
		case <-timer.C:
			if flush() {
				backoff = flushInterval
			} else {
				backoff = min(backoff*2, maxBackoff)
			}
			if len(buf) > 0 {
				timer.Reset(backoff)
			}
		case <-c.stopCh:
			timer.Stop()
			for {
				select {
				case pt := <-c.metricsCh:
					buf = append(buf, pt)
				default:
					flush()
					return
				}
			}
		}
	}
}

func (c *Client) eventsFlushLoop() {
	defer c.wg.Done()
	for {
		select {
		case evt := <-c.eventsCh:
			if err := c.submitEvent(evt); err != nil {
				slog.Warn("datadog: event submission failed", "title", evt.Title, "error", err)
			}
		case <-c.stopCh:
			for {
				select {
				case evt := <-c.eventsCh:
					if err := c.submitEvent(evt); err != nil {
						slog.Warn("datadog: event submission failed during shutdown", "error", err)
					}
				default:
					return
				}
			}
		}
	}
}

func (c *Client) logsFlushLoop() {
	defer c.wg.Done()
	backoff := logsFlushInterval
	timer := time.NewTimer(backoff)
	timer.Stop()

	buf := make([]ddLog, 0, logsBufferSize)
	flush := func() bool {
		if len(buf) == 0 {
			return true
		}
		if err := c.submitLogs(buf); err != nil {
			slog.Warn("datadog: logs flush failed, will retry", "count", len(buf), "error", err)
			return false
		}
		buf = buf[:0]
		return true
	}

	for {
		select {
		case entry := <-c.logsCh:
			wasEmpty := len(buf) == 0
			buf = append(buf, entry)
			if len(buf) >= logsBufferSize {
				if flush() {
					backoff = logsFlushInterval
				} else {
					backoff = min(backoff*2, maxBackoff)
				}
			}
			if wasEmpty && len(buf) > 0 {
				timer.Reset(backoff)
			}
		case <-timer.C:
			if flush() {
				backoff = logsFlushInterval
			} else {
				backoff = min(backoff*2, maxBackoff)
			}
			if len(buf) > 0 {
				timer.Reset(backoff)
			}
		case <-c.stopCh:
			timer.Stop()
			for {
				select {
				case entry := <-c.logsCh:
					buf = append(buf, entry)
				default:
					flush()
					return
				}
			}
		}
	}
}

func (c *Client) checksFlushLoop() {
	defer c.wg.Done()
	for {
		select {
		case check := <-c.checksCh:
			if err := c.submitServiceCheck(check); err != nil {
				slog.Warn("datadog: service check submission failed", "check", check.Check, "error", err)
			}
		case <-c.stopCh:
			for {
				select {
				case check := <-c.checksCh:
					if err := c.submitServiceCheck(check); err != nil {
						slog.Warn("datadog: service check submission failed during shutdown", "error", err)
					}
				default:
					return
				}
			}
		}
	}
}

// --- HTTP submit methods ---

func (c *Client) submitMetrics(points []metricPoint) error {
	type seriesKey struct {
		metric string
		tags   string
	}
	groups := make(map[seriesKey][]metricPoint)
	for _, p := range points {
		key := seriesKey{metric: p.MetricName, tags: fmt.Sprint(p.Tags)}
		groups[key] = append(groups[key], p)
	}

	type ddPoint struct {
		Timestamp int64   `json:"timestamp"`
		Value     float64 `json:"value"`
	}
	type ddResource struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	type ddSeries struct {
		Metric    string       `json:"metric"`
		Type      int          `json:"type"`
		Interval  int64        `json:"interval,omitempty"`
		Points    []ddPoint    `json:"points"`
		Tags      []string     `json:"tags"`
		Resources []ddResource `json:"resources"`
	}

	series := make([]ddSeries, 0, len(groups))
	for _, pts := range groups {
		ddPts := make([]ddPoint, len(pts))
		for i, p := range pts {
			ddPts[i] = ddPoint{Timestamp: p.Timestamp, Value: p.Value}
		}
		metricType := pts[0].MetricType
		if metricType == 0 {
			metricType = 1 // default to count
		}
		series = append(series, ddSeries{
			Metric:   pts[0].MetricName,
			Type:     metricType,
			Interval: pts[0].Interval,
			Points:   ddPts,
			Tags:     pts[0].Tags,
			Resources: []ddResource{
				{Name: c.hostname, Type: "host"},
			},
		})
	}

	payload := struct {
		Series []ddSeries `json:"series"`
	}{Series: series}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	apiURL := fmt.Sprintf("https://api.%s/api/v2/series", c.site)
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("DD-API-KEY", c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	ctx, cancel := context.WithTimeout(context.Background(), httpTimeout)
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	apicounter.DataDogAPICalls.Add(1)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("datadog metrics API returned status %d: %s", resp.StatusCode, truncate(string(respBody), 200))
	}
	slog.Info("datadog: metrics submitted", "series", len(series), "points", len(points), "status", resp.StatusCode, "response", truncate(string(respBody), 200))
	return nil
}

func (c *Client) submitEvent(evt ddEvent) error {
	body, err := json.Marshal(evt)
	if err != nil {
		return err
	}

	apiURL := fmt.Sprintf("https://api.%s/api/v1/events", c.site)
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("DD-API-KEY", c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	ctx, cancel := context.WithTimeout(context.Background(), httpTimeout)
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	apicounter.DataDogAPICalls.Add(1)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("datadog events API returned status %d: %s", resp.StatusCode, truncate(string(respBody), 200))
	}
	return nil
}

func (c *Client) submitLogs(logs []ddLog) error {
	body, err := json.Marshal(logs)
	if err != nil {
		return err
	}

	apiURL := fmt.Sprintf("https://http-intake.logs.%s/v1/input", c.site)
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("DD-API-KEY", c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	ctx, cancel := context.WithTimeout(context.Background(), httpTimeout)
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	apicounter.DataDogAPICalls.Add(1)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("datadog logs API returned status %d: %s", resp.StatusCode, truncate(string(respBody), 200))
	}
	return nil
}

func (c *Client) submitServiceCheck(check ddServiceCheck) error {
	body, err := json.Marshal(check)
	if err != nil {
		return err
	}

	apiURL := fmt.Sprintf("https://api.%s/api/v1/check_run", c.site)
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("DD-API-KEY", c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	ctx, cancel := context.WithTimeout(context.Background(), httpTimeout)
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	apicounter.DataDogAPICalls.Add(1)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("datadog check_run API returned status %d: %s", resp.StatusCode, truncate(string(respBody), 200))
	}
	return nil
}

// --- Helpers ---

func severityToLogStatus(sev models.LogSeverity) string {
	switch sev {
	case models.LogCritical:
		return "critical"
	case models.LogHigh:
		return "error"
	case models.LogMedium:
		return "warn"
	default:
		return "info"
	}
}

func joinTags(tags []string) string {
	return strings.Join(tags, ",")
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
