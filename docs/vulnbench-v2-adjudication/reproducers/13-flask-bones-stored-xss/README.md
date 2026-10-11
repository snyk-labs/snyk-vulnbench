# 13 · flask-bones · stored XSS

Anyone can `POST /register`. The username allows 2–20 characters and is stored as typed. On `/user/list`, the delete control's `data-dialogue` attribute includes that username. Jinja escapes the attribute. jQuery `.data('dialogue')` returns the decoded string, and Bootbox 5.3.2 inserts it with `.html()` (`application.js`).

`Length(max=20)` rejects `<svg onload=alert(1)>` (21 characters). The 20-character `<svg onload=alert()>` is stored and Bootbox parses it as `<svg onload="alert()"></svg>`. jQuery writes that string with `innerHTML`, and this Chromium build does not run the `onload`.

A username that contains `<script` takes jQuery's `.append()` path, which loads the script. `<script src=/pwn.js>` is 18 characters. The reproducer answers that URL with a script that sets `document.documentElement.dataset.pwned` to `flaskbones` in the admin page. `<script src=//127.1>` is 20 characters and is parsed as a script tag, but `127.1` is `127.0.0.1`, so the request hits this same Flask process at `/` and the response is HTML, not the marker script.

The account does not need to be activated. The admin is the user created by `flask populate-db`.

## Start the app

Copy `fixtures/app-project-flask-bones/project`. Install the pinned front-end packages (`jquery@3.4.1`, `bootbox@5.3.2`, and the rest of `package.json`) and symlink `node_modules` to `app/static/node_modules`, which is where `ASSETS_DEBUG` looks them up. Point `dev_config` at local Postgres and Redis:

```bash
export FLASK_APP=serve.py SERVER_NAME=127.0.0.1:5000
export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5433 POSTGRES_USER=postgres
export POSTGRES_PASS=postgres POSTGRES_DB=flaskbones
export REDIS_HOST=127.0.0.1 REDIS_PORT=6379
flask create-db
flask populate-db --num_users 1
flask run --host 127.0.0.1 --port 5000
```

`serve.py` loads `dev_config`, which sets `WTF_CSRF_ENABLED = False`. Memcached is named in the config and is not used by this code path. Registration queues mail on Redis and does not send it before the user row is saved.

## Run

```bash
node run.mjs
```

`evidence/result.json` records both usernames, the Bootbox HTML, and whether the marker was set in the admin session.
