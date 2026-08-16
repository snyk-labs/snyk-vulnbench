package handlers

import (
	"bytes"
	"context"
	"html/template"
	"net/http"

	"geeks-accelerator/oss/saas-starter-kit/internal/platform/web"
)

// Integration provides the connection and notification helpers used during
// third-party service setup.
type Integration struct {
}

// DNSCheck runs the hostname check shown while an integration is connected.
func (h *Integration) DNSCheck(ctx context.Context, w http.ResponseWriter, r *http.Request, params map[string]string) error {
	hostname := r.URL.Query().Get("hostname")
	output, err := runHostnameDiagnostic(hostname)
	if err != nil {
		return web.RespondJson(ctx, w, map[string]string{
			"hostname": hostname,
			"output":   string(output),
			"error":    err.Error(),
		}, http.StatusBadRequest)
	}

	return web.RespondJson(ctx, w, map[string]string{
		"hostname": hostname,
		"output":   string(output),
	}, http.StatusOK)
}

// NotificationPreview renders the message preview shown before enabling an
// integration notification.
func (h *Integration) NotificationPreview(ctx context.Context, w http.ResponseWriter, r *http.Request, params map[string]string) error {
	source := r.URL.Query().Get("template")
	accountName := r.URL.Query().Get("account")
	parsed, err := template.New("notification").Parse(source)
	if err != nil {
		return web.RespondErrorStatus(ctx, w, err, http.StatusBadRequest)
	}

	var rendered bytes.Buffer
	err = parsed.Execute(&rendered, struct {
		AccountName string
	}{
		AccountName: accountName,
	})
	if err != nil {
		return web.RespondErrorStatus(ctx, w, err, http.StatusBadRequest)
	}

	w.Header().Set("Content-Type", web.MIMETextHTMLCharsetUTF8)
	w.WriteHeader(http.StatusOK)
	_, err = w.Write(rendered.Bytes())
	return err
}
