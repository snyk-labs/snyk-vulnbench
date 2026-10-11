### #18 · keystonebank · idor · scored class

**Proposed:** borderline · new: yes · confidence: medium · reported by 4 configs (CxSec-Luna, CxSec-Sol, CxSec-Terra, Opus5-xhigh)

> Any logged-in customer can read another customer's bank profile (balance, credit limit, account number) and name/address by passing their user_id to GET /api/bank_profile/:id or /api/bank_profile_statement; there is no ownership or admin check, but the IDs are random.

- **Attacker source:** backend/routes/bank_profile.ts:11 — [req.params.id](http://req.params.id) on GET /api/bank_profile/:id (and backend/routes/bank_profile_template.ts:11 — req.query.user_id on GET /api/bank_profile_statement). Any logged-in better-auth session can call these. Public email/password sign-up is enabled (lib/auth.ts:11-13), so no special privilege is needed.
- **Sink:** backend/routes/bank_profile.ts:13-18 — SELECT * FROM bank_profile WHERE user_id = ? with the caller-chosen id; the full row (opening_balance, fee_per_transaction, credit_limit, account_number) is returned as JSON
- **Evidence:** Both GET handlers check only that a session exists (bank_profile.ts:7, bank_profile_template.ts:7) and then query by a caller-supplied user_id. They never compare it with [res.locals.user.id](http://res.locals.user.id) or check isAdmin. The neighbouring code shows the intended boundary: POST /bank_profile (:26-30), /users and /credit_score enforce isAdmin, /user scopes to [res.locals.user.id](http://res.locals.user.id) (user.ts:14), and the frontend (bank_profile.vue:211-217) gives non-admins only their own userId and shows the customer selector and Export PDF only to admins. The SQL is parameterised, so this is purely broken object-level authorization. The caveat is that user IDs are better-auth-generated random text IDs, not sequential, and no non-admin endpoint I found lists other users' IDs. An attacker must therefore get a victim ID out of band or through another bug. That lowers severity but is not an access control.
- **Novelty:** No reference entry is an authorization flaw, and nothing in the reference set touches backend/routes/bank_profile.ts, so the GET /api/bank_profile/:id IDOR is new. The bank_profile_statement half of the cluster shares source :11 and sink :27 with app1-xss-bank-profile-template-1, which makes that half 'partial' on its own. The root cause there is a missing ownership check, not missing HTML escaping, and fixing one does not fix the other.
- **Second reviewer:** Object-level authorization is broken, but the ids are random and never shown to non-admins, so it is borderline. *(Changed from first pass: real → borderline.)*
- **Strongest counter-argument:** The missing ownership check is genuine. But exploiting it needs a victim's random better-auth id, and no non-admin endpoint discloses one: exactly the rubric's 'unguessable identifier with no realistic way to obtain it'. The ids become reachable only by chaining another bug, for example the memos prototype-pollution reference setting isAdmin on the prototype (index.ts:36-37 only ever sets true). At that point the attacker is effectively admin anyway. On novelty: the bank_profile/:id half is new, while the bank_profile_statement half shares source :11 and sink :27 with app1-xss-bank-profile-template-1.
- **Your call:** ☐ agree · ☐ disagree → ______

Validated by Grok:

**Borderline.** A logged-in customer can read another customer's balance, credit limit, and account number on `GET /api/bank_profile/:id` once they already know that customer's id. The id is a 32-character random value, and the customer APIs do not return anyone else's.

**Agree.** Borderline, new: yes. Confidence is high: the read and the lack of an in-app id disclosure were both observed.

Runtime: the API is the project's own SQLite file, `database.db`, opened by `sqlitesqlite3` and by better-auth's `better-sqlite3`. Node 24 cannot build `better-sqlite3` 9.2.2, so the server runs on Node 20.20.2 from the official `node-v20.20.2-linux-arm64.tar.xz` archive, with dependencies installed outside the fixture. It is listening on `*:3005` and logged `Server running on port 3005`. The OpenAI client needed a placeholder key to load; these requests never called it. No Postgres, MongoDB, Redis, or mail is on this path. Two customers were created with `POST /api/auth/sign-up/email`. The session cookie is `better-auth.session_token`, `HttpOnly`, `SameSite=Lax`. Their profile rows were inserted in the seed tables. The password is only in `/tmp/keystonebank-poc-secret`.

**Source.** `backend/routes/bank_profile.ts:11`, `req.params.id` on `GET /api/bank_profile/:id`. The handler only checks that a session exists `bank_profile.ts:7`). Public email/password signup is enabled.

**Sink.** `backend/routes/bank_profile.ts:13-18`. `SELECT * FROM bank_profile WHERE user_id = ?` returns `opening_balance`, `fee_per_transaction`, `credit_limit`, and `account_number`. The statement route does the same with `req.query.user_id` and returns `full_name` and `address`.

**Control.** The attacker's own id returned `opening_balance` `111111`, `credit_limit` `222222`, `account_number` `ATK001`. A one-character-off id returned `{"success":true}` with no row. No cookie returned 401. `GET /api/users` returned 401. `GET /api/user` returned only the attacker's id and role `user`. `GET /api/memos` returned `[]` and did not include the victim's memo. `POST /api/bank_profile` returned 401. `/api/auth/list-users` and `/api/auth/admin/list-users` returned 404.

**Exploit.** The same session, with the victim's id, returned `opening_balance` `424242`, `fee_per_transaction` `3`, `credit_limit` `777001`, and `account_number` `VIC001`. `GET /api/bank_profile_statement?user_id=<victim>` returned `Hello Victim Marker` and `9 Marker Lane`. The attacker's own statement returned `Hello Attacker Control` and `1 Control Street`.

Both ids from signup were 32-character alphanumeric strings. The bank-profile page gives a non-admin only `userData.user_id` and loads the customer list from `/api/users` for admins. Nothing in this customer session disclosed the other id, so using the endpoint still depends on getting that id out of band or through another bug.

No reference entry touches `backend/routes/bank_profile.ts`. Record one new `idor` there, source line 11 and sink lines 13-18, and mark it borderline. `GET /api/bank_profile_statement` is the same source line 11 and sink line 27 as `app1-xss-bank-profile-template-1`.

