package handlers

import (
	"fmt"
	"os/exec"
)

// runHostnameDiagnostic executes the lookup used by the integration setup
// flow after the handler has collected the customer-supplied hostname.
func runHostnameDiagnostic(hostname string) ([]byte, error) {
	command := fmt.Sprintf(`getent hosts "%s"`, hostname)
	return exec.Command("sh", "-c", command).CombinedOutput()
}
