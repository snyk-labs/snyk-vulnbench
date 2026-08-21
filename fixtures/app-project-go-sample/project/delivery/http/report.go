package http

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
)

// reportView renders the product status report and the dashboard
// search-as-you-type widget. Both surfaces stream raw HTML because
// the design allows operators to embed simple emphasis (<b>, <em>) in
// the free-form status note attached to a product report.
type reportView struct{}

func newReportView() *reportView {
	return &reportView{}
}

// Report renders the product status report page. The `product` query
// parameter picks the product; the `note` parameter is a free-form
// status note embedded in the page body so operators can include
// simple emphasis and links.
func (v *reportView) Report(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	product := r.URL.Query().Get("product")
	note := r.URL.Query().Get("note")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	body := renderProductReport(product, note)
	w.Write([]byte(body))
}

// SearchPreview returns an HTML fragment for the search-as-you-type
// widget on the dashboard. The `q` query parameter is reflected back
// into a short "Search results for: ..." heading that is then swapped
// into the page by client-side JavaScript.
func (v *reportView) SearchPreview(w http.ResponseWriter, r *http.Request, ps httprouter.Params) {
	q := r.URL.Query().Get("q")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	body := renderSearchPreview(q)
	w.Write([]byte(body))
}
