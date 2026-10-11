### #5 · gobase · xss · scored class

**Proposed:** real · new: partial · confidence: medium · reported by 5 configs (CxSec-Luna, CxSec-Sol, CxSec-Terra, DeepSec-Claude, Opus5-xhigh)

> Two reflected XSS flows on gobase's unauthenticated workspace API, both real: (a) branding preview re-serves attacker HTML with the attacker's Content-Type (partly novel vs the SSRF reference); (b) template preview's text/template output is sniffed as HTML (same flow as the SSTI reference, not novel).

- **Attacker source:** internal/gateways/web/controllers/apiv1/workspace/controller.go:61 — logo_url query param on GET /api/v1/workspace/branding/preview (registered at controller.go:86 and mounted in initializers/router.go:30). No authentication; the gin router only uses Recovery and Logger middleware.
- **Sink:** internal/gateways/web/controllers/apiv1/workspace/controller.go:68 — [ctx.Data](http://ctx.Data)(http.StatusOK, contentType, body), where both contentType and body come from the attacker-chosen remote server (branding.go:15-20)
- **Evidence:** Both routes are registered, unauthenticated and reachable with a GET link, so a victim only has to click a crafted URL. For (a), gin's [ctx.Data](http://ctx.Data) writes the given content type with no allowlist, and no nosniff, CSP or Content-Disposition is set anywhere, so attacker HTML with Content-Type: text/html executes on the app origin. For (b), text/template does no escaping, and no Content-Type is set before Execute writes to ctx.Writer, so Go's DetectContentType classifies a leading <script>/<html> as text/html. Confidence is medium rather than high only because of impact: gobase has no cookies, sessions or auth, so same-origin script cannot steal credentials. Its impact is origin-level script, content spoofing, and using a victim's browser to reach an internally deployed instance's other endpoints. DeepSec's 'stored XSS' label for (a) is wrong: it is a reflected/proxied XSS, not a stored one.
- **Novelty:** The cluster mixes two flows. (a) Branding-preview XSS shares its source and endpoint (logo_url, controller.go:61) with app-project-gobase-ssrf-branding-preview-1, but its sink is different: [ctx.Data](http://ctx.Data) at controller.go:68 serves the fetched body with the upstream Content-Type, whereas the SSRF sink is http.Get at branding.go:9. That makes it partial. (b) Template-preview XSS is not novel: it uses the same source (controller.go:74) and the same text/template Parse/Execute (templates.go:9/14) as app-project-gobase-template-injection-preview-1, and reflected HTML is simply that SSTI's practical impact.
- **Second reviewer:** Both flows run script, but only the branding-preview Content-Type passthrough is partly new; the template-preview members repeat the SSTI reference.
- **Strongest counter-argument:** Impact is thin. gobase has no auth, cookies or sessions (grep), so script on its origin has nothing victim-specific to steal; the gain is content spoofing on a trusted origin, or reading internal-only responses when the instance is deployed internally. That does not sink it, because the sibling goxygen fixture's reference set rates the same no-auth-origin XSS as high severity. A single verdict is defensible only if it rests on flow (a), the branding-preview Content-Type passthrough. Flow (b) has the same source and the same Parse/Execute sink as app-project-gobase-template-injection-preview-1, so it is not novel.
- **Your call:** ☐ agree · ☐ disagree → ______



Validated by Grok:

**Exploitable.** Both unauthenticated GET links run JavaScript on the app origin in Chrome 151. The branding preview is the new result: it re-serves the remote body with the remote `Content-Type`. The template preview is the existing template-injection flow, and Go then sniffs that output as HTML.

GoBase does not use PostgreSQL, Redis, MongoDB, a queue, object storage, or mail. The migrate command is a stub, and `docker-compose-test.yml` starts nothing. I built `cmd/app` with Go 1.21.13 and started `serve` on `127.0.0.1:8010`. `GET /api/v1/status` returned **200** with `"status":"OK"`. There is no login. The router only installs Recovery and Logger.

**Branding preview.** `GET /api/v1/workspace/branding/preview` reads `logo_url` at `internal/gateways/web/controllers/apiv1/workspace/controller.go:61`. `branding.go:9` fetches it with `http.Get`, and `branding.go:20` copies that response's `Content-Type`. `controller.go:68` writes both through `ctx.Data`. No `X-Content-Type-Options`, CSP, or `Content-Disposition` is set.

**Control.** `logo_url` pointed at a local response of `Content-Type: text/plain` whose body was `<script>fetch('http://127.0.0.1:18111/branding')</script>`. The app returned that type and body. Chrome showed the script as text and did not request the marker. The app's own fetch of the logo URL is in the attacker log as `Go-http-client/1.1`.

**Exploit.** The same script body, served remotely as `text/html`, came back from the app as `Content-Type: text/html; charset=utf-8`. Chrome's document origin was `http://127.0.0.1:8010`, and the marker log recorded `GET /branding` from Headless Chrome 151.

**Template preview.** `template` is read at `controller.go:74` and parsed at `templates.go:9`, the sink already recorded as `app-project-gobase-template-injection-preview-1`. `templates.go:14` executes it with `text/template` and does not set a content type.

**Control.** `template=hello {{.WorkspaceName}}` returned `text/plain` and the body `hello GoBase workspace`. Chrome did not run a script.

**Exploit.** This template:

```text

<script>fetch('[http://127.0.0.1:18111/template')</script>{{.WorkspaceName](http://127.0.0.1:18111/template')</script>{{.WorkspaceName)}}

```

returned `Content-Type: text/html; charset=utf-8` and the body `<script>fetch('http://127.0.0.1:18111/template')</script>GoBase workspace`. Chrome requested `GET /template`. The substituted name shows the template ran; the marker shows the sniffed HTML ran in the browser.

There is no session cookie to steal. The script still runs on the service origin, which is enough to spoof that origin or call its other unauthenticated endpoints from the victim's browser. I would record one new `xss` flow: source `controller.go:61`, sink `controller.go:68`. I would leave the template preview on the existing template-injection entry.