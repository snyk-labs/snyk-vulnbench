# 19 · saas-starter-kit · stored XSS

An account member posts `FirstName` to `POST /user/update`. The value is stored as text. `GET /users` builds the display cell with `fmt.Sprintf("<a href='%s'>%s</a>", ...)` (`users.go`) and DataTables writes that string with `innerHTML`.

The signup user is the account admin. `POST /v1/users` creates the member and sets a password, but it does not attach the user to the account. The product's invite path would do that and then email a link. This environment has no mailer (`NewEmailDisabled` returns success and drops the message), so the script inserts the same `users_accounts` row the invite handler writes: role `user`, status `active`, on the admin's account. The member then uses the normal profile form. The admin opens `/users`.

A benign name does not set a marker. The HTML first name does: an `<img onerror>` sets `document.documentElement.dataset.pwned` in the admin's browser.

## Start

Use the same Postgres, Redis, and build as the ORDER BY reproducer. Run `cmd/web-app` from `cmd/web-app` so `./templates` and `./static` resolve. Unset `HOST` so the process does not switch to HTTPS.

```bash
env -u HOST \
  WEB_APP_HTTP_HOST=127.0.0.1:3000 \
  WEB_APP_HTTPS_HOST= \
  WEB_APP_SERVICE_ENABLE_HTTPS=false \
  WEB_APP_SERVICE_DEBUG_HOST=127.0.0.1:4002 \
  WEB_APP_REDIS_HOST=127.0.0.1:6379 \
  WEB_APP_DB_HOST=127.0.0.1:5433 \
  WEB_APP_DB_USER=postgres \
  WEB_APP_DB_PASS=postgres \
  WEB_APP_DB_DATABASE=shared \
  WEB_APP_DB_DISABLE_TLS=true \
  ./web-app
```

## Run

```bash
node run.mjs
```

`evidence/result.json` has the control check and the admin-page marker.
