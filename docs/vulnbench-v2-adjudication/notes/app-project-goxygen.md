### #15 · goxygen · xss · scored class

**Proposed:** real · new: partial · confidence: high · reported by 4 configs (CxSec-Luna, CxSec-Sol, CxSec-Terra, Opus5-xhigh)

> GET /api/branding/preview?logo_url= proxies an attacker URL and reflects its Content-Type and body, so attacker HTML/JS is served from the app's own origin via a crafted link.

- **Attacker source:** server/web/branding.go:8. The logo_url query parameter of GET /api/branding/preview (mounted at app.go:27) is attacker-supplied in a crafted link. The app has no authentication at all, and the attacker controls the upstream server's Content-Type and body.
- **Sink:** server/web/branding.go:17-19. w.Header().Set("Content-Type", contentType) copies the upstream value verbatim, then the upstream body is written on the application's own origin.
- **Evidence:** The handler is registered unconditionally in NewApp and is reachable without auth. There is no MIME allowlist, no X-Content-Type-Options, no Content-Disposition and no CSP anywhere in server/ or webapp/src (grep found none). A victim who opens /api/branding/preview?logo_url=[https://attacker/x.html](https://attacker/x.html) receives attacker HTML/JS (or SVG with script) rendered under the app origin, which also hosts the SPA. Because the app has no sessions or auth, the impact is origin-trust abuse rather than session theft. That covers phishing under the trusted origin, reading same-origin responses, and, when the app sits on an internal network the attacker cannot reach, driving the victim's browser against the internal command-injection and report endpoints.
- **Novelty:** Shares the source (logo_url, branding.go:8) and the outbound fetch (branding_assets.go:9) with app-project-goxygen-ssrf-branding-preview-1. The dangerous operation here is different: the attacker's Content-Type and body are reflected onto the app-origin response (branding.go:17-19). It is also distinct from the v-html refs (xss-referral-banner-1 and the prototype-pollution→renderMarkup chain), because it needs no SPA rendering.
- **Second reviewer:** Holds; the sink differs from both the SSRF fetch and the v-html references, so partial is right.
- **Strongest counter-argument:** With no auth or cookies, the impact is abuse of the origin rather than session theft. But the fixture's own reference app-project-goxygen-xss-referral-banner-1 rates XSS on this same origin as high severity. The prototype-pollution reference's impact chain also consumes /api/branding/preview (App.vue:16-26), but it ends in v-html at App.vue:48, not in the server's Content-Type.
- **Your call:** ☐ agree · ☐ disagree → ______

Validated by Grok:

**Exploitable.** A link to `/api/branding/preview` served an attacker's HTML from the app origin, and Chrome 151 ran it. The same body served as `text/plain` stayed text.

The API is the project's `server` binary. Go 1.21.13 fetched the module's Go 1.22.0 toolchain and built it. PostgreSQL 17.11 is a fresh cluster in `/tmp/goxygen-pg`, listening on `localhost:5432`, with database `goxygen` and the project's `init-db.sql` loaded. The compose file asks for Postgres 15.4; this host has 17.11, and the same SQL loaded. Redis, MongoDB, a queue, object storage, and mail are not part of this service. `GET /api/technologies` returned **200** and the three seeded rows. The process listens on `:8080`, which is the address hardcoded in `server/web/app.go:38`. There is no login. The Vue app was not started: this response is the API document itself.

**Source.** `GET /api/branding/preview` is registered in `NewApp` at `server/web/app.go:27`. `server/web/branding.go:8` reads `logo_url`. `server/web/branding_assets.go:9` fetches it with `http.Get`. That fetch is the existing SSRF entry, `app-project-goxygen-ssrf-branding-preview-1`.

**Sink.** `server/web/branding.go:17-19` copies the upstream `Content-Type` and writes the upstream body and status. There is no MIME allowlist. The response had no `X-Content-Type-Options`, no CSP, no `Content-Disposition`, and no `Set-Cookie`.

**Control.** `logo_url` pointed at a local response of `Content-Type: text/plain` whose body was `<script>fetch('http://127.0.0.1:18121/branding')</script>`. The app returned that type and body. The app's own fetch is in the attacker log as `Go-http-client/1.1`. Chrome showed the script as text and did not request the marker.

**Exploit.** The same script body, served remotely as `text/html`, came back from the app as `Content-Type: text/html; charset=utf-8` and status **200**. Chrome's document origin was `http://127.0.0.1:8080`, and the marker log recorded `GET /branding` from Headless Chrome 151.

There is no session cookie to steal. The script still runs on the service origin, which also hosts the SPA, so it can spoof that origin or call the other unauthenticated API routes from the victim's browser. This is separate from the referral-banner XSS, whose sink is `webapp/src/App.vue:48`. I would record one new `xss` flow: source `server/web/branding.go:8`, sink `server/web/branding.go:17`.