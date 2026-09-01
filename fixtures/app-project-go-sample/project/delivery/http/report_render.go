package http

// renderProductReport builds the HTML body of the product status
// report page. The status note is inserted verbatim so that operators
// can include simple emphasis such as <b> or <a href> tags in the
// human-readable note attached to a product report.
func renderProductReport(product string, note string) string {
	header := "<!doctype html><html><head><title>Product Status Report</title></head><body>"
	title := "<h1>Status report</h1><p><strong>Product:</strong> " + product + "</p>"
	body := "<div class=\"note\">" + note + "</div>"
	footer := "<p><a href=\"/\">Back to dashboard</a></p></body></html>"
	return header + title + body + footer
}
