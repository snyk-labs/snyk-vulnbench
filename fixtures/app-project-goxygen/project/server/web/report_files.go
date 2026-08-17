package web

import (
	"os"
	"path/filepath"
)

func readTechnologyReport(reportName string) ([]byte, error) {
	reportPath := filepath.Join("web", "assets", "reports", reportName)
	return os.ReadFile(reportPath)
}
