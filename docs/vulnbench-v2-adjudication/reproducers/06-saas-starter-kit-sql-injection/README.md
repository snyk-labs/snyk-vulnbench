# 06 · saas-starter-kit · SQL injection in ORDER BY

A self-registered user calls `POST /v1/signup`, then `POST /v1/oauth/token`, then `GET /v1/users?order=...`. The handler splits `order` on commas and passes the tokens to `query.OrderBy` (`internal/user/user.go`). `go-sqlbuilder` v1.4.1 only doubles `$` in that string. Quotes, parentheses, and subqueries are concatenated into `ORDER BY`.

The tenant filter stays in the outer `WHERE`. A safe `order=email` returns only the caller's row. Two injected expressions show the clause is executed:

- `(CASE WHEN (SELECT 1 FROM pg_sleep(2))::int = 1 THEN email ELSE email END)` waits about two seconds and still returns 200. Both branches are `email`, so Postgres accepts the expression. `(SELECT 1 FROM pg_sleep(2))` as a branch fails with `CASE types character varying and integer cannot be matched` and does not sleep. `(CASE WHEN 1=0 THEN email ELSE email END)` returns immediately.
- `(SELECT CAST(first_name AS integer) FROM users WHERE email='<other account>')` makes Postgres cast the other account's stored first name. The dev error body contains that name. The other account is not in the JSON user list.

Payloads avoid `$` because the builder turns `$` into `$$`.

## Start the dependencies

Local Postgres (database `shared` on `127.0.0.1:5433`, user `postgres`, trust auth) and Redis on `127.0.0.1:6379`. Schema migrations for this fixture must already be applied, including geonames, because signup validates country, region, and zip.

Build from `fixtures/app-project-saas-starter-kit/project` with Go 1.21 (the module asks for 1.13) and run `cmd/web-api` with its working directory set to `cmd/web-api` so the template path resolves. Unset `HOST` if it is exported: envconfig maps it onto the HTTPS listen address and the process then tries TLS. Bind plain HTTP:

```bash
env -u HOST \
  WEB_API_HTTP_HOST=127.0.0.1:3001 \
  WEB_API_HTTPS_HOST= \
  WEB_API_SERVICE_ENABLE_HTTPS=false \
  WEB_API_SERVICE_DEBUG_HOST=127.0.0.1:4001 \
  WEB_API_REDIS_HOST=127.0.0.1:6379 \
  WEB_API_DB_HOST=127.0.0.1:5433 \
  WEB_API_DB_USER=postgres \
  WEB_API_DB_PASS=postgres \
  WEB_API_DB_DATABASE=shared \
  WEB_API_DB_DISABLE_TLS=true \
  ./web-api
```

Mail, MongoDB, and object storage are not on this path. With no AWS session the API uses the disabled mailer.

## Run

```bash
python3 run.py
```

`evidence/summary.json` has the timings and whether the other tenant's first name came back in the error. `evidence/transcript.json` stores each response body.
