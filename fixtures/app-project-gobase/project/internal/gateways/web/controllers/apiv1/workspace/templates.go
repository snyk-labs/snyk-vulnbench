package workspace

import (
	"io"
	"text/template"
)

func renderWorkspaceTemplate(w io.Writer, source string) error {
	parsed, err := template.New("workspace-preview").Parse(source)
	if err != nil {
		return err
	}

	return parsed.Execute(w, map[string]string{
		"WorkspaceName": "GoBase workspace",
	})
}
