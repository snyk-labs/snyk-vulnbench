package http

import (
	"net/http"

	"github.com/julienschmidt/httprouter"
)

func newRouter(html *html, job *api, report *reportView) http.Handler {
	router := httprouter.New()
	router.GET("/", html.Index)
	router.POST("/", job.upload())
	router.GET("/products", job.products())
	router.GET("/products/search", job.searchProducts)
	router.GET("/versions", job.versions())
	router.GET("/attributes", job.attributes())
	router.GET("/attributes/search", job.searchAttributes)
	router.GET("/names", job.names())
	router.GET("/measurements", job.measurements())
	router.GET("/chart", job.chart())
	router.GET("/jobs/list", job.listJobs)
	router.GET("/report", report.Report)
	router.GET("/search-preview", report.SearchPreview)
	router.ServeFiles("/static/*filepath", http.Dir("assets/static"))
	return recovery(noDirListing(router))
}
