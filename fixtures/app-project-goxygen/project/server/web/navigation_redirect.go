package web

import "net/http"

func redirectTo(w http.ResponseWriter, r *http.Request, next string) {
	http.Redirect(w, r, next, http.StatusFound)
}
