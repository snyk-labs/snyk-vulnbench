package handlers

import (
	"io/ioutil"
	"path/filepath"
)

// readAccountReport loads an export from the account reporting area.
func readAccountReport(staticDir, reportName string) ([]byte, error) {
	reportPath := filepath.Join(staticDir, "exports", reportName)
	return ioutil.ReadFile(reportPath)
}
