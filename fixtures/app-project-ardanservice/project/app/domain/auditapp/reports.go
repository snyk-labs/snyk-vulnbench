package auditapp

import (
	"os"
	"path/filepath"
)

const auditReportRoot = "static/audit/exports"

func readAuditReport(name string) ([]byte, error) {
	reportPath := filepath.Join(auditReportRoot, name)
	return os.ReadFile(reportPath)
}
