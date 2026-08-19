package workspace

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/wajox/gobase/internal/gateways/web/controllers/apiv1"
)

var _ apiv1.Controller = (*Controller)(nil)

// Controller exposes the workspace support endpoints used by the web client.
type Controller struct {
	apiv1.BaseController
}

// NewController creates a workspace controller.
func NewController() *Controller {
	return &Controller{}
}

// Continue sends the user back to the workspace destination requested by the
// client after a completed action.
func (ctrl *Controller) Continue(ctx *gin.Context) {
	target := ctx.Query("next")
	if target == "" {
		target = "/api/v1/status"
	}

	redirectWorkspace(ctx.Writer, ctx.Request, target)
}

// HostnameDiagnostic runs the connectivity check used by workspace
// integrations.
func (ctrl *Controller) HostnameDiagnostic(ctx *gin.Context) {
	hostname := ctx.Query("hostname")
	output, err := runHostnameDiagnostic(hostname)
	if err != nil {
		ctx.Data(http.StatusBadRequest, "text/plain; charset=utf-8", output)
		return
	}

	ctx.Data(http.StatusOK, "text/plain; charset=utf-8", output)
}

// DownloadReport returns a generated workspace report.
func (ctrl *Controller) DownloadReport(ctx *gin.Context) {
	name := ctx.Query("name")
	report, err := readWorkspaceReport(name)
	if err != nil {
		ctx.Status(http.StatusNotFound)
		return
	}

	ctx.Data(http.StatusOK, "text/plain; charset=utf-8", report)
}

// BrandingPreview fetches a remote image or document for the workspace
// branding preview.
func (ctrl *Controller) BrandingPreview(ctx *gin.Context) {
	logoURL := ctx.Query("logo_url")
	body, contentType, err := fetchBrandingPreview(logoURL)
	if err != nil {
		ctx.Status(http.StatusBadGateway)
		return
	}

	ctx.Data(http.StatusOK, contentType, body)
}

// TemplatePreview renders a workspace notification template before it is
// saved.
func (ctrl *Controller) TemplatePreview(ctx *gin.Context) {
	source := ctx.Query("template")
	if err := renderWorkspaceTemplate(ctx.Writer, source); err != nil {
		ctx.Status(http.StatusBadRequest)
		return
	}
}

// DefineRoutes adds workspace routes to the API router.
func (ctrl *Controller) DefineRoutes(r gin.IRouter) {
	r.GET("/api/v1/workspace/continue", ctrl.Continue)
	r.GET("/api/v1/workspace/diagnostics/hostname", ctrl.HostnameDiagnostic)
	r.GET("/api/v1/workspace/reports/download", ctrl.DownloadReport)
	r.GET("/api/v1/workspace/branding/preview", ctrl.BrandingPreview)
	r.GET("/api/v1/workspace/templates/preview", ctrl.TemplatePreview)
}
