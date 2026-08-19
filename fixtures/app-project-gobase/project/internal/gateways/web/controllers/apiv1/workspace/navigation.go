package workspace

import (
	"net/http"
)

func redirectWorkspace(w http.ResponseWriter, r *http.Request, target string) {
	http.Redirect(w, r, target, http.StatusFound)
}
