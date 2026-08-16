package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"lastsaas/internal/models"
	"lastsaas/internal/testutil"
)

func TestIntegration_LogsListDefault(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	testutil.InsertTestLogs(t, env.DB, 5, models.LogMedium, models.LogCatSystem)

	req := env.adminRequest(t, "GET", "/api/admin/logs", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
		return
	}

	var result struct {
		Logs  []json.RawMessage `json:"logs"`
		Total int64             `json:"total"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Total != 5 {
		t.Errorf("expected total=5, got %d", result.Total)
	}
	if len(result.Logs) != 5 {
		t.Errorf("expected 5 logs, got %d", len(result.Logs))
	}
}

func TestIntegration_LogsFilterBySeverity(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	testutil.InsertTestLogs(t, env.DB, 3, models.LogCritical, models.LogCatSystem)
	testutil.InsertTestLogs(t, env.DB, 2, models.LogLow, models.LogCatSystem)

	req := env.adminRequest(t, "GET", "/api/admin/logs?severity=critical", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
		return
	}

	var result struct {
		Logs  []json.RawMessage `json:"logs"`
		Total int64             `json:"total"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Total != 3 {
		t.Errorf("expected total=3, got %d", result.Total)
	}
}

func TestIntegration_LogsFilterByCategory(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	testutil.InsertTestLogs(t, env.DB, 4, models.LogMedium, models.LogCatAuth)
	testutil.InsertTestLogs(t, env.DB, 2, models.LogMedium, models.LogCatBilling)

	req := env.adminRequest(t, "GET", "/api/admin/logs?category=auth", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
		return
	}

	var result struct {
		Total int64 `json:"total"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Total != 4 {
		t.Errorf("expected total=4, got %d", result.Total)
	}
}

func TestIntegration_LogsMultiSeverityFilter(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	testutil.InsertTestLogs(t, env.DB, 2, models.LogCritical, models.LogCatSystem)
	testutil.InsertTestLogs(t, env.DB, 3, models.LogHigh, models.LogCatSystem)
	testutil.InsertTestLogs(t, env.DB, 5, models.LogLow, models.LogCatSystem)

	req := env.adminRequest(t, "GET", "/api/admin/logs?severity=critical,high", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
		return
	}

	var result struct {
		Total int64 `json:"total"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Total != 5 {
		t.Errorf("expected total=5 (critical+high), got %d", result.Total)
	}
}

func TestIntegration_LogsSeverityCounts(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	testutil.InsertTestLogs(t, env.DB, 2, models.LogCritical, models.LogCatSystem)
	testutil.InsertTestLogs(t, env.DB, 3, models.LogHigh, models.LogCatSystem)
	testutil.InsertTestLogs(t, env.DB, 1, models.LogDebug, models.LogCatSystem)

	req := env.adminRequest(t, "GET", "/api/admin/logs/severity-counts", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", resp.StatusCode, testutil.ReadResponseBody(t, resp))
		return
	}

	var result struct {
		Counts map[string]int64 `json:"counts"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Counts["critical"] != 2 {
		t.Errorf("expected critical=2, got %d", result.Counts["critical"])
	}
	if result.Counts["high"] != 3 {
		t.Errorf("expected high=3, got %d", result.Counts["high"])
	}
	if result.Counts["debug"] != 1 {
		t.Errorf("expected debug=1, got %d", result.Counts["debug"])
	}
}

func TestIntegration_LogsEmptyResults(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	req := env.adminRequest(t, "GET", "/api/admin/logs", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
		return
	}

	var result struct {
		Logs  []json.RawMessage `json:"logs"`
		Total int64             `json:"total"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Total != 0 {
		t.Errorf("expected total=0, got %d", result.Total)
	}
}

func TestIntegration_LogsPagination(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	testutil.InsertTestLogs(t, env.DB, 15, models.LogMedium, models.LogCatSystem)

	req := env.adminRequest(t, "GET", "/api/admin/logs?page=1&perPage=5", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
		return
	}

	var result struct {
		Logs  []json.RawMessage `json:"logs"`
		Total int64             `json:"total"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Total != 15 {
		t.Errorf("expected total=15, got %d", result.Total)
	}
	if len(result.Logs) != 5 {
		t.Errorf("expected 5 logs per page, got %d", len(result.Logs))
	}
}

func TestIntegration_LogsDateRange(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	env := setupTestServer(t)
	defer env.Cleanup()
	admin, tenant := createAdminEnv(t, env)

	testutil.InsertTestLogs(t, env.DB, 5, models.LogMedium, models.LogCatSystem)

	// Use a date range that includes everything
	req := env.adminRequest(t, "GET", "/api/admin/logs?fromDate=2020-01-01T00:00:00Z&toDate=2030-01-01T00:00:00Z", nil, admin, tenant.ID.Hex())
	resp, err := env.Client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}
