---







---





### #7 · coffeeshop · mass-assignment · scored class

**Proposed:** real · new: yes · confidence: high · reported by 5 configs (CxSec-Luna, CxSec-Sol, Opus5-med+MCP, Opus5-xhigh, Sonnet5-xhigh)

> Any self-registered customer can POST /profile with roles=ROLE_ADMIN (or with another user's id), and Spring binds it straight onto the Person entity and saves it, giving privilege escalation and account takeover.

- **Attacker source:** src/main/java/nl/scottjohnson/coffeeshop/controller/ProfileController.java:33 — POST /profile binds a fresh Person from request params (roles, id, enable, encryptedPassword are all bindable). The only requirement is being authenticated (SecurityConfig.java:32 anyRequest().authenticated()), and anyone can self-register a CUSTOMER account via unauthenticated POST /register.
- **Sink:** src/main/java/nl/scottjohnson/coffeeshop/service/PersonService.java:44 — [personRepository.save](http://personRepository.save)(person) (JPA merge onto the attacker-supplied id, persisting the attacker-supplied roles)
- **Evidence:** The controller binds the JPA entity itself, with no DTO, no setAllowedFields/setDisallowedFields and no @SessionAttributes. Request params therefore populate roles and id directly, and save() merges them onto the existing row. Nothing re-derives the role or checks ownership. A customer can promote themselves to admin, or set id to another user's id (ids are listed by the unauthenticated GET /api/v1/person) and overwrite that user's username and password, which is account takeover. The /register variant (RegisterController.java:33 -> PersonService.java:67-81) is also reachable without auth: it forces ROLE_CUSTOMER but keeps the caller's id, so an anonymous user can overwrite any existing row, admin included, demoting and locking out that user and inheriting the orders tied to that person id.
- **Novelty:** No reference vuln covers this. The references are SQLi, path traversal, two reflected XSS in /products/direct and the description th:utext flow; none involves binding Person.roles or [Person.id](http://Person.id) into PersonService.savePerson.
- **Second reviewer:** Any registered customer can create or become an admin via POST /profile; holds.
- **Strongest counter-argument:** No counter-argument holds. The attack is, if anything, easier than described: if id is omitted, save() inserts a brand-new Person with roles=ROLE_ADMIN and a password the attacker chooses. When merging onto an existing id, the attacker has to send password and passwordConfirm, otherwise encryptedPassword is nulled.
- **Your call:** ☐ agree · ☐ disagree → ______

All four facts check out. My call: **agree** — real, new, high confidence. This is a textbook Spring mass-assignment, and unlike the saas ORDER BY case it rests entirely on in-repo code, so static tracing is conclusive.

What I verified:

1. **No binding allowlist exists.** There is no `@InitBinder`, `setAllowedFieldssetDisallowedFields`, or `@ControllerAdvice` anywhere in the source. The one `@ModelAttribute` is `OrderController` populating a product dropdown, unrelated. So Spring binds every matching request param onto the `Person` command object, and `Person` exposes public setters for `id`, `roles`, `enable`, `encryptedPassword`, `username`, and `email` — all attacker-settable.
2. `roles` *is trivially injectable.** `Role` is a plain enum `ROLE_CUSTOMER`, `ROLE_ADMIN`), so Spring's default String→enum converter turns `roles=ROLE_ADMIN` into `Role.ROLE_ADMIN`. It's a persistent column (no `@Transient`), so `save()` writes it.
3. **The persisted role is the authority.** `CustomUserDetailsService` builds the login identity as `new SimpleGrantedAuthority(user.getRoles().toString())`, i.e. authority `ROLE_ADMIN`. `SecurityConfig` gates `/products/`**,** `/orders/`, `/persons/`** behind `hasRole("ADMIN")`. So a promoted row reaches every admin page on next login.
4. **IDs leak to anonymous callers.** `/api/`** is `permitAll`, and `ApiController.getAllPersons()` at `GET /api/v1/person` returns every `Person` (id included). That hands an attacker the victim ids needed for targeted takeover.

The flow is exactly as reported — `ProfileController.saveProfile` `/profile`, reachable by any authenticated user, and anyone can self-register via the `permitAll` `/register`) binds a raw `Person` and calls:

```44:44:fixtures/app-project-coffeeshop/project/src/main/java/nl/scottjohnson/coffeeshop/service/[PersonService.java](http://PersonService.java)

        return [personRepository.save](http://personRepository.save)(person);

```

**It's new.** The five answer-key entries are SQLi `HomeControllerSearchRepository`), path traversal `UploadController`), two XSS and one template injection (all `ProductController`). None touches `ProfileControllerPersonService` or mass assignment. And `mass-assignment` is already a registered `VulnType` (used by the halloween fixture), so no new type registration is needed — just the entry: source `ProfileController.java:33`, sink `PersonService.java:44`. The `/register` variant is a second flow worth recording: source `RegisterController.java:33` → sink `PersonService.java:67-81` `registerNewPerson` forces `ROLE_CUSTOMER` but keeps the bound `id`, so anonymous overwrite/takeover of an existing row, admin included).

The agent's "strongest counter-argument" analysis is correct: omitting `id` inserts a brand-new admin, and merging onto an existing `id` nulls `encryptedPassword` unless `passwordpasswordConfirm` are sent. One small addition — `saveProfile` calls `password.isEmpty()` on the bound value, so the request must include a `password` param at all (even empty) or it NPEs into a 500; a real exploit sends a chosen password anyway. Cleanest self-escalation:

```text

POST /profile    (with a self-registered CUSTOMER session)

id=<my id>&username=<me>&email=<me@x.test>&password=new&passwordConfirm=new&roles=ROLE_ADMIN

# re-login with "new" -> ROLE_ADMIN -> /persons, /products, /orders

```

I adjudicated this statically rather than at runtime, since every step is visible in the repo. If you want the same running-app evidence we produced for saas-starter-kit, I can build it with JDK 17 + Maven (it uses in-memory H2, so no external datastore), register a customer, and show the role flip to admin. Want me to stand it up?

Validation by Grok: 

**Exploitable.** A self-registered customer changed their own role to admin and, in a second request, took over another account. Both were confirmed against the running app.

The project is Spring Boot 2.6 on Java 17, listening on port 8082. Its database is the configured in-memory H2 database `jdbc:h2:mem:testdb`), which is what the app ships with. It does not use PostgreSQL, Redis, MongoDB, a queue, object storage, or mail. The machine only had a Java 21 JRE, so I installed Temurin JDK 17.0.20.1 and Apache Maven 3.9.9 under `~/.local`, built `target/JavaCoffeeShop.jar`, and started it with that JDK. `GET /`, `GET /login`, and `GET /api/v1/person` all returned 200. Test passwords are only in `/tmp/coffeeshop-poc-creds`.

**Control.** After `POST /register` and a form login, `poc-customer` was `ROLE_CUSTOMER` (id 74). `GET /persons` returned **403**. Unauthenticated `GET /api/v1/person` already listed every person, including `Admin` as id 1 with `ROLE_ADMIN`.

**Self-promotion.** The same session posted to `/profile` with its own id and `roles=ROLE_ADMIN`, plus a matching password and password confirmation. The API then showed id 74 as `ROLE_ADMIN`. After logging in again, `GET /persons` returned **200** and the Persons admin page, which includes both `poc-customer` and `Admin`.

**Account takeover.** A second customer, `poc-takeover`, still got **403** on `/persons`. That account posted to `/profile` with `id=3`, which belonged to the seeded user `mauricio.kuphal`, and set a new username, email, and password. The row is now `poc-owned-victim`. The old username is gone, and logging in as `poc-owned-victim` with the attacker-chosen password opens that profile.

---



### #11 · coffeeshop · csrf · CSRF — outside the 14 scored types

**Proposed:** real · new: yes · confidence: high · reported by 4 configs (CxSec-Luna, CxSec-Sol, CxSec-Terra, Opus5-med+MCP)

> CSRF protection is disabled app-wide and deletes are GETs, so any page a logged-in admin visits can delete products or users (and forge profile/product POSTs).

- **Attacker source:** An attacker-hosted page makes a logged-in victim's browser issue cross-site requests carrying the ambient JSESSIONID form-login cookie, e.g. a top-level navigation to /products/delete/{id} or /persons/delete/{id}, or an auto-submitting form POST to /profile or /products/add. The attacker needs no account; the victim must be logged in (an admin for the delete/product routes, any user for /profile).
- **Sink:** src/main/java/nl/scottjohnson/coffeeshop/controller/ProductController.java:59-61 — GET /products/delete/{id} -> productService.delete(id); also PersonController.java:67-69 — GET /persons/delete/{id} -> personService.removePerson(id)
- **Evidence:** Spring Security enables CSRF protection by default, and this app turns it off globally. No SameSite attribute is configured ([application.properties](http://application.properties) sets none; Spring Boot 2.6.0). Because the deletes are GETs, a top-level cross-site navigation sends the session cookie even under browser Lax-by-default, so an admin who visits an attacker page deletes chosen products or users. Forged POSTs to /profile and /products/add succeed in browsers without Lax-by-default, and in Chrome's Lax+POST window. They let an attacker tamper with the victim's account or plant the stored XSS from cluster 3. The only precondition is ordinary victim interaction, which is inherent to CSRF.
- **Novelty:** No reference vuln is CSRF or covers the delete endpoints. It overlaps no reference sink, though it is the enabler that makes the admin-only write in coffeeshop-template-injection-1 (cluster 3) reachable by an outside attacker.
- **Second reviewer:** CSRF is disabled globally and deletes use GET; this is standard, real, and overlaps no reference.
- **Strongest counter-argument:** It needs a logged-in admin to open an attacker page, but that is inherent to CSRF, not an unrealistic precondition. The forged POSTs work only in browsers without Lax-by-default or inside Chrome's 2-minute window, but the GET deletes work under Lax as top-level navigations.
- **Your call:** ☐ agree · ☐ disagree → ______

My call: **agree** — real and new, high confidence. I confirmed the server-side mechanics against the running app; the only part that rests on documented browser behavior (rather than something `curl` can enforce) is the final cross-site cookie delivery.

What I verified at runtime (app still up on 8082):

- **CSRF protection is off app-wide.** `SecurityConfig.java:44` is `.csrf().disable()`, and it was already proven empirically last turn: every `/profile`, `/register`, and `/login` POST succeeded with no CSRF token. There are zero `_csrf` references in any template.
- **The session cookie has no** `SameSite` **attribute.** The real login response set `JSESSIONID=...; Path=/` — nothing else. `application.properties` sets no `server.servlet.session.cookie.same-site`, so browsers fall back to their own default (Lax on modern Chrome/Firefox). It also sets `http-only=false`, which is a separate weakness.
- **Deletes are state-changing GETs.** `GET /products/delete/9` as admin returned 302 and the product list went 16→15. `GET /persons/delete/76` returned 302 and removed that account. This is the key point: a Lax default still sends the session cookie on a top-level GET navigation, so an admin who merely opens an attacker page (or clicks a link/loads an `<img>`) triggers the delete.
- **Auth is still required** (so this is CSRF, not a missing-authz bug): the same `GET /persons/delete/2` with no cookie just redirected to `/login` and deleted nothing.

Two honest caveats, both consistent with the agent's write-up:

- The person-delete of a *seeded* customer returns 500 — an H2 foreign-key constraint `ORDERS.PERSON_ID → PERSON.ID`), not a CSRF defense. I confirmed the exception in the log and then deleted a fresh, order-less account cleanly. So the GET-delete vector works; it just fails on users who own orders.
- The forged **POST** vectors `/profile` mass-assignment, `/products/add` stored XSS) are real server-side but only fire cross-site in browsers without Lax-by-default or inside Chrome's ~2-minute "Lax+POST" window. The **GET deletes** are the reliable vector under today's Lax defaults.

On scope: this is correctly flagged as **outside the 14 scored types**, so it's informational rather than something to add to `findings-attacker-reachable.json`. It is genuinely new relative to the five scored entries (SQLi, path traversal, two XSS, template injection), and it compounds the mass-assignment finding from #7 — CSRF lets an attacker drive that `/profile` write from a victim's session. If you do want a record of it, I'd keep it as a documented non-scored note (e.g., in the fixture's extra-findings file) rather than in the scored ground truth.

One thing I did not do: a true browser-level proof that SameSite=Lax permits the cross-site GET. `curl` ignores SameSite entirely, so it can't demonstrate that enforcement. That step relies on well-established browser default behavior rather than something I executed here. If you want, I can drive it with the headless Chromium that's installed to close that last gap.

Validated by Grok:

**Confirmed in Chrome 151.** A logged-in admin session deleted a product when an attacker page on a different site performed a top-level GET. The same browser refused to send that session cookie for a cross-site image request, so the other product stayed.

The app was still on `http://127.0.0.1:8082`. The attacker page was `http://127.0.0.2:8099`, which Chrome treats as a different site. The browser logged in as the seeded `Admin` account and stored `JSESSIONID` for `127.0.0.1` with no `SameSite`, `Secure`, or `HttpOnly` attribute.

| Request from the attacker site | Result |

|---|---|

| `<img src="http://127.0.0.1:8082/products/delete/26">` | Product 26 still present. Catalog stayed at 15. |

| `<script>location.href = "http://127.0.0.1:8082/products/delete/25"</script>` | Product 25 removed. Catalog went from 15 to 14. The browser landed on `http://127.0.0.1:8082/`. |

That split is the SameSite=Lax rule. Lax does not attach the cookie to a cross-site subresource, and it does attach it to a cross-site top-level GET. If the cookie had been `SameSite=None`, the image would have deleted product 26 as well. If it had been `Strict`, the navigation would not have deleted product 25. The app never set the attribute, and Chrome’s default is Lax, which is enough for these GET deletes.

The server side is unchanged: CSRF is disabled, and `GET /products/delete/{id}` removes the row and redirects to `/`.

---

### #3 · coffeeshop · xss · scored class

**Proposed:** real · new: no · confidence: medium · reported by 6 configs (CxSec-Luna, CxSec-Terra, DeepSec-Claude, Opus5-med+MCP, Opus5-xhigh, Sonnet5-xhigh)

> Product description is stored unsanitised and rendered with th:utext on the public home page (stored XSS); it is the same flow as reference coffeeshop-template-injection-1, just typed correctly as XSS.

- **Attacker source:** src/main/java/nl/scottjohnson/coffeeshop/controller/ProductController.java:34-35 — POST /products/add or /products/edit/{id} binds Product.description (no constraints, Product.java:17). The route requires ROLE_ADMIN (SecurityConfig.java:31), but CSRF is disabled (SecurityConfig.java:44) and any self-registered customer can promote themselves to admin through the /profile mass assignment (cluster 7).
- **Sink:** src/main/resources/templates/fragments/productsTable.html:45 —  (unescaped output; every other cell uses th:text)
- **Evidence:** th:utext turns off Thymeleaf's HTML escaping, and neither Product nor ProductService sanitises the description, so a stored `<img src=x onerror=...>` runs for every visitor to the public home page. With server.servlet.session.cookie.http-only=false, the payload can also read JSESSIONID. Only admins can write the field directly. An outside attacker can still reach it three ways: (a) CSRF is globally disabled, so a forged POST to /products/add from an admin's browser plants the payload; (b) a low-privilege customer can become admin by mass-assigning roles on POST /profile; (c) the unauthenticated SQLi on POST / (SearchRepository.java:24, reference coffeeshop-sql-injection-1) can UNION attacker strings into this same unescaped cell, which gives a reflected variant. The flow is a genuine vulnerability, but the direct write is admin-gated and reachability depends on chaining, hence medium confidence.
- **Novelty:** This is the same flow as reference coffeeshop-template-injection-1: identical source (ProductController.java:35/42) and identical sink (productsTable.html:45 th:utext). The reference labels it template-injection, but th:utext only emits the value unescaped; it does not re-evaluate Thymeleaf expressions in it. The real impact is therefore stored XSS, so this cluster is a correctly typed duplicate that went unmatched because of the type label.
- **Second reviewer:** Same source and sink as the template-injection reference; the type label is the only reason it did not match.
- **Strongest counter-argument:** The direct write is admin-only, so on its own this is an admin-to-visitor stored XSS. It counts as 'real' only through chaining: the /profile mass assignment (cluster 7, verified) lets any customer become admin; CSRF is disabled (SecurityConfig.java:44); and the unauthenticated SQLi on POST / (HomeController.java:28-30) can UNION a payload into the same cell. Because novelty is 'no', the verdict does not change the novel count either way.
- **Your call:** ☐ agree · ☐ disagree → ______

Validated by Grok:

**Exploitable.** A product description stored through `/products/add` is written unescaped into the public home page, and Chrome runs it for a visitor who never logs in. It is the same source and sink as `coffeeshop-template-injection-1`.

**Agree.** Real, new: no. Confidence is high after the live chain; the earlier medium rating was the admin-gate uncertainty.

Runtime: the existing Spring Boot 2.6 jar is the project’s own H2 database `jdbc:h2:mem:testdb` in `application.properties`), already listening on `127.0.0.1:8082` under OpenJDK 21.0.11. `GET /` and `GET /login` both returned 200. There is no CSP. The session cookie is `JSESSIONID` with only `Path=/`, so it is readable from script. No MongoDB, Redis, mail, or queue is on this path. A new customer was registered through `POST /register`; the password is only in `/tmp/coffeeshop-xss-secret`.

**Source.** `ProductController.java:34-35` binds `Product.description` on `POST /products/add` and `/products/edit/{id}`. `Product.java:17` has no constraint on that field. `/products/`** requires `ROLE_ADMIN` `SecurityConfig.java:31`). An anonymous `POST /products/add` returned 302 to `/login`. The new customer got 403 on `GET /products/add`. `POST /profile` with `roles=ROLE_ADMIN` returned 302, and the next login could open the product form.

**Sink.** `productsTable.html:45`, `th:utext="${product.description}"`, included by the public `index.html`. The other cells use `th:text`.

**Control.** Description `Plain espresso control` was stored and rendered as text. Description `SSTI-MARKER-${7*7}-[[${7*7}]]` came back unchanged. The page did not contain `SSTI-MARKER-49`, so `th:utext` did not evaluate a Thymeleaf expression.

**Exploit.** Description `<img src=x onerror="document.title='XSS:'+…">` was stored as product 79. The anonymous home response contained the raw `<img>` tag. Chromium 151.0.7922.34 opened `http://127.0.0.1:8082/` with no session and set the title to `XSS:no-cookie`, with one `product-desc` image whose handler is `onerror`. The same page with the customer’s session cookie set the title to `XSS:cookie`, and `document.cookie` contained `JSESSIONID`. The cookie value was not recorded.

The reference entry uses this source `ProductController.java:35` and `:42`) and this sink `productsTable.html:45`). Its type is `template-injection`, and its aliases are template injection, server-side template injection, and local file inclusion. An XSS-typed report cannot match it. Add `xss` as an alias on `coffeeshop-template-injection-1` rather than a second finding.