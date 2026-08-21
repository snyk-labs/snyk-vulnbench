package checkapp

import (
	"fmt"
	"os/exec"
)

func runHostnameDiagnostic(hostname string) (string, error) {
	command := fmt.Sprintf(`getent hosts "%s"`, hostname)
	out, err := exec.Command("sh", "-c", command).CombinedOutput()
	if err != nil {
		return string(out), err
	}
	return string(out), nil
}
