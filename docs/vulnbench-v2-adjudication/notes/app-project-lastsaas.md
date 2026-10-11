### #10 · lastsaas · ssrf · scored class

**Proposed:** borderline · new: yes · confidence: high · reported by 4 configs (CxSec-Sol, CxSec-Terra, DeepSec-Claude, Sonnet5-xhigh)

> Webhook SSRF guard is bypassable via redirects or DNS rebinding, and the test delivery returns the response body, but only a root-tenant platform admin can set webhook URLs. Borderline (high privilege); novel vs the branding-logo SSRF reference.

- **Attacker source:** backend/internal/api/handlers/webhooks.go:212-216/136 — 'url' in the JSON body of POST/PUT /api/admin/webhooks (cmd/server/main.go:751-752). This requires an authenticated user in the ROOT tenant with the Admin role (main.go:657-661 RequireRootTenant + main.go:721-722 RequireRole(RoleAdmin)).
- **Sink:** backend/internal/webhooks/dispatcher.go:394 (DeliverTest) and :259 (deliverWithRetry) — [d.client.Do](http://d.client.Do)(req) using a default http.Client (dispatcher.go:50-52) that follows redirects and re-resolves DNS. Up to 4096 bytes of the response are stored and returned (dispatcher.go:281-283, 412-415; webhooks.go:417).
- **Evidence:** The code-level bypass is real. The SSRF guard validates only the submitted hostname's resolution at create/update time. Delivery uses Go's default redirect policy (up to 10 hops, no re-validation) and a fresh DNS lookup, and I found no CheckRedirect, DialContext or egress proxy anywhere in the backend. Test delivery returns the first 4096 bytes synchronously, so an attacker could read cloud metadata. However, every webhook write route sits behind RequireRootTenant + RequireRole(RoleAdmin): the attacker has to be an administrator of the platform-operator (root) tenant, not an ordinary customer user or tenant admin. That is the 'already highly privileged' case, so this is a defence-in-depth gap: an app admin can escalate to infrastructure (IAM credentials, internal services).
- **Depends on:** Attacker must already hold Admin role in the root/platform-operator tenant (or an admin-authority credential for it). There is no path for an unauthenticated or ordinary tenant user to create or test webhooks.
- **Novelty:** The SSRF reference app-project-lastsaas-ssrf-remote-logo-1 is the owner-only branding preview (branding.go:154 -> branding_assets.go:19). This cluster has a different source (the stored webhook URL) and a different sink (Dispatcher [http.Client.Do](http://http.Client.Do) in webhooks/dispatcher.go), so they share neither source nor sink.
- **Second reviewer:** The guard bypass is real but needs a root-tenant admin; borderline stands, even though the reference SSRF is gated higher still.
- **Strongest counter-argument:** Root-tenant admin is a platform-operator role, so borderline is correct under the rubric. Metadata theft is also narrower than claimed: a 302 turns the POST into a GET without the Metadata-Flavor or Metadata headers or an IMDSv2 token, so only IMDSv1-style or header-less internal endpoints can be read. Consistency caveat: the reference SSRF (branding remote-preview, main.go:770) sits on the even more privileged adminOwner tier and was still admitted as a reference, so the reference set does not apply this privilege bar.
- **Your call:** ☐ agree · ☐ disagree → ______

Validated by Grok:

**Exploitable, for a root-tenant administrator.** The create-time address check rejected a loopback URL, then the same admin stored a name that first resolved to `8.8.8.8`. Delivery resolved it again, followed a redirect, and returned the internal response body. A customer-tenant owner was refused.

MongoDB 8.0.15 is the `mongod` at `~/.local/mongodb`, with a fresh database path `/tmp/lastsaas-mongo/db`, bound to `127.0.0.1:27017`, and no authentication on that local URI. The database name is `lastsaas-poc`. Go 1.21.13 fetched the module's Go 1.25.0 toolchain and built `cmd/server` and `cmd/lastsaas`. PostgreSQL, Redis, a queue, object storage, and mail are not used here: Resend and Stripe are unset, and the log says both are not configured. `lastsaas setup` created the root tenant through the CLI. `GET http://127.0.0.1:4290/health` returned **200** `{"status":"ok"}`, and `/api/bootstrap/status` returned `{"initialized":true}`. The root password is only in `/tmp/lastsaas-poc-creds`.

**Source.** `POST /api/admin/webhooks` is behind `RequireRootTenant` and `RequireRole(RoleAdmin)` `backend/cmd/server/main.go:660` and `:722`). `backend/internal/api/handlers/webhooks.go:212-216` reads `url`. `validateWebhookURL` at `webhooks.go:136` checks that hostname once, at create time, and rejects loopback, private, and link-local addresses.

**Sink.** `NewDispatcher` uses a default `http.Client` `backend/internal/webhooks/dispatcher.go:50-52`) with no `CheckRedirect`. `DeliverTest` calls `d.client.Do` at `dispatcher.go:394`, and normal delivery does the same at `dispatcher.go:259`. Each reads the first 4096 bytes. `TestWebhook` returns that record at `webhooks.go:417`. This is a different route from the reference SSRF, `GET /api/admin/branding/remote-preview`, which is on the owner-only tier.

**Control.** With no token, `POST /api/admin/webhooks` returned **401** `Authorization header required`. After login, the root membership is `role=owner`, `tenantSlug=root`, `isRoot=true`. This URL was rejected and the marker server received nothing:

```text

[http://127.0.0.1:18131/secret](http://127.0.0.1:18131/secret)

```

The response was **400** `URL cannot point to a private or internal address`. A self-registered customer, owner of a non-root tenant, posted a webhook and received **403** `Admin access required`.

**Exploit.** The root owner created a webhook whose URL was `http://webhook.poc.test:18130/start`. The first lookup returned `8.8.8.8`, so create returned **201**. The next lookup returned `127.0.0.1`. That local server answered **302** to `http://127.0.0.1:18131/secret`, whose body is `SSRF-MARKER-lastsaas-9f3c`. `POST /api/admin/webhooks/{id}/test` returned **200**, `responseCode` **200**, and that marker in `delivery.responseBody`. The redirect server logged `POST /start` from `Go-http-client/1.1`. The secret server logged `GET /secret` from the same client: the redirect turned the webhook POST into a GET, and the body still came back. Registering the customer then emitted `tenant.created`, and the server fetched the same URL again through `deliverWithRetry`.

The guard is real, and so is the bypass. The caller has to already be an administrator of the platform root tenant. I would record it as a new `ssrf` flow: source `backend/internal/api/handlers/webhooks.go:216`, sink `backend/internal/webhooks/dispatcher.go:394`.

---



### #23 · lastsaas · xss · scored class

**Proposed:** real · new: no · confidence: high · reported by 3 configs (CxSec-Sol, CxSec-Terra, DeepSec-Claude)

> Real DOM XSS (javascript: in ?returnTo= on /login runs after login and can steal the localStorage JWTs), but it is the same returnTo -> window.location.href bug as the reference open-redirect entry, so it is not novel.

- **Attacker source:** frontend/src/pages/auth/LoginPage.tsx:28 — the returnTo query parameter of the public /login route (App.tsx:140; no auth needed to reach the page). The attacker sends the victim a link such as /login?returnTo=javascript:...
- **Sink:** frontend/src/pages/auth/LoginPage.tsx:29 — window.location.href = returnTo (a javascript: URL runs in the app origin)
- **Evidence:** returnTo is read directly from the URL and assigned to window.location.href with no validation. React's JSX escaping does not apply because this is a DOM navigation sink. ProtectedRoute.tsx:18-19 generates only relative returnTo values, but nothing on the receiving side enforces that. The SPA is served by the Go backend wrapped in SecurityHeaders (main.go:783-809). Its CSP includes 'unsafe-inline' in script-src, so the browser does not block a javascript: navigation, and index.html has no meta CSP that would. The payload runs after a successful login, when the access and refresh JWTs are in localStorage, so it can steal them and take over the account. It needs one victim interaction: opening the crafted link and logging in.
- **Novelty:** This is the same source (returnTo at LoginPage.tsx:28) and the same sink (window.location.href = returnTo at :29) as reference app-project-lastsaas-open-redirect-login-1. Using a javascript: URL instead of an https: URL is a second impact of that one unvalidated-redirect bug, and a same-origin path check fixes both. The reference entry is typed open-redirect with no aliases, so XSS-typed reports of it fall outside the reference set. This looks like a missing type alias rather than a new vulnerability.
- **Second reviewer:** Real DOM XSS, but it is the reference open-redirect bug with a javascript: payload.
- **Strongest counter-argument:** No counter-argument holds. It has the same source and sink as app-project-lastsaas-open-redirect-login-1, whose typeAliases list is empty, so an XSS-typed report cannot match it.
- **Your call:** ☐ agree · ☐ disagree → ______

Validated by Grok:

**Exploitable.** A `javascript:` value in `returnTo` runs in the app origin after a real login and can read both JWTs already stored in `localStorage`. This is the same source and sink as `app-project-lastsaas-open-redirect-login-1`.

**Agree.** Real, new: no, confidence: high.

Runtime: MongoDB 8.0.15 `~/.local/mongodb/bin/mongod`) on `127.0.0.1:27017`, database `lastsaas-poc`, no auth. The existing Go API was restarted from `/tmp/lastsaas-server` with the temp config at `/tmp/lastsaas-run/config/dev.yaml` and `static_dir` pointed at a production build of the SPA `Node 24.14.0`, Vite 7.3.1, 2637 modules). `GET /health` returned `{"status":"ok"}`. `GET /login` returned the SPA with the Go `SecurityHeaders` policy: `script-src 'self' 'unsafe-inline'`. `index.html` has no meta CSP. Login uses the local password account created earlier through the app; mail, Redis, and Postgres are not on this path. Chrome was Chromium 151.0.7922.34.

**Source.** `frontend/src/pages/auth/LoginPage.tsx:28`. The public `/login` route `App.tsx:140`) reads `returnTo` from the query string. `ProtectedRoute.tsx:18-19` only emits a relative value, and the login page does not check it.

**Sink.** `frontend/src/pages/auth/LoginPage.tsx:29`, `window.location.href = returnTo`, called from `finishLoginRedirect()` after `login()` has written `lastsaas_access_token` and `lastsaas_refresh_token`. The built bundle contains that assignment.

**Control.** `http://127.0.0.1:4290/login?returnTo=/dashboard`. Login returned 200. The browser landed on `http://127.0.0.1:4290/dashboard` with title `LastSaaS`. Both token keys were present (lengths 304 and 199). No script marker ran.

**Exploit.** The same login with `returnTo=javascript:document.title='XSS:'+…;void 0`. Login returned 200. The document stayed on the login URL and its title became `XSS:access/refresh`, so the URL ran in the app origin while both JWTs were in `localStorage`. The payload only reported that the keys existed.

One victim action is required: open the link and sign in. A same-origin path check on `returnTo` closes this and the recorded open redirect together. The reference entry is type `open-redirect` and has no `typeAliases`, so an XSS-typed report cannot match it. Add `xss` as an alias on `app-project-lastsaas-open-redirect-login-1` rather than a second finding.