package workspace

import (
	"fmt"
	"os/exec"
)

func runHostnameDiagnostic(hostname string) ([]byte, error) {
	command := fmt.Sprintf(`getent hosts "%s"`, hostname)
	return exec.Command("sh", "-c", command).CombinedOutput()
}
