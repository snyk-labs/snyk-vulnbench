package workspace

import (
	"os"
	"path/filepath"
)

const workspaceReportsDir = "var/reports"

func readWorkspaceReport(name string) ([]byte, error) {
	reportPath := filepath.Join(workspaceReportsDir, name)
	return os.ReadFile(reportPath)
}
