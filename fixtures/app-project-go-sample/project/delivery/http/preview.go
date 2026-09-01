package http

// renderSearchPreview builds the HTML fragment that the search-as-you-
// type widget swaps into the dashboard. The caller-supplied query text
// is echoed back inside a short results heading so the operator sees
// exactly what they typed.
func renderSearchPreview(query string) string {
	return "<div class=\"search-preview\"><p>Search results for: " + query + "</p></div>"
}
