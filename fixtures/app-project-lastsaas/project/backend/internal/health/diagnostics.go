package health

import (
	"fmt"
	"os/exec"
)

// RunHostnameDiagnostic runs the hostname check exposed by the health dashboard.
func RunHostnameDiagnostic(hostname string) ([]byte, error) {
	command := fmt.Sprintf(`getent hosts "%s"`, hostname)
	return exec.Command("sh", "-c", command).CombinedOutput()
}
