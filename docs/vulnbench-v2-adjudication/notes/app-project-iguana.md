#16 · iguana · xss · scored class

Proposed: borderline · new: yes · confidence: medium · reported by 4 configs (CxSec-Luna, CxSec-Sol, CxSec-Terra, DeepSec-Claude)

A project manager (any user can create a project) sets an HTML project name, and the timelog last-7-days tooltip (d3 .html) and activity heatmap day list (jQuery .append) render it unescaped for members who logged time in that project.

Attacker source: src/project/models.py:61-67 ([Project.name](http://Project.name): max_length=30, only MinLengthValidator(4), no character restriction). A project manager sets it via the project create/edit forms (project/forms.py:63,79; ProjectEditView requires write permission via get_w_object_or_404). Any registered user (open signup in user_management) can create a project and become its manager.

Sink: src/common/static/js/graphs/draw_activity_heatmap.js:129-130, where $(sel).append("... in Project <a ...>" + d.fields.issue_project_name + ""). Also src/timelog/static/js/graphs/draw_last_seven.js:190-193, where the d3 tooltip .html("... Project: " + issue_project_name ...).

Evidence: Django template autoescaping does not apply because the name travels as JSON over XHR and is concatenated client-side into jQuery .append() and d3 .html(), both of which parse HTML. issue_short and the URLs derive from the alphanumeric-validated name_short and reverse(), so only issue_project_name is injectable. 30 chars is enough for '![](x)' or a dynamic-import loader. No CSP middleware is configured. The timelog JSON endpoints return only the requesting user's own timelogs. So the victim must have logged time on an issue in a project whose name the attacker (a manager of that project) controls, and must then hover over the last-7-days chart or click that day on the activity heatmap. The project-manager role is self-service for any registered user, not an app-admin role, so this is a low-privilege stored XSS against project members, with victim interaction required.

Novelty: The iguana reference set has no XSS entry (it covers command injection, two ReDoS, SQL injection, code injection and path traversal), and none touches [Project.name](http://Project.name) or the timelog chart JS.

Second reviewer: The code flow is real, but only project members who logged time under a malicious manager can be hit, which matches the rubric's borderline case. (Changed from first pass: real → borderline.)

Strongest counter-argument: The JSON endpoints return only the viewer's own timelogs. The payload therefore reaches only users who have personally logged time on an issue in a project the attacker manages. Self-service project creation gives no reach to arbitrary users: a manager can add developers unilaterally but cannot make them log time. That combines the rubric's 'victim having interacted with attacker data' with a per-project role that gives the attacker power over the victims, so borderline is the correct label. It is real only for an insider who manages a shared project.

Your call: ☐ agree · ☐ disagree → ______

Validated by Grok:

Exploitable. A self-registered project manager can store a 28-character HTML name, and it runs as `alert(1)` in Chrome 151 for a member who has logged time on that project and then opens the chart.

Runtime: Python 3.8.12 (python.org source, linked to a local OpenSSL 1.1.1w) because Django 2.2.28 will not run on the system Python. Postgres 17.11 on `127.0.0.1:5435`, database `iguana`, timezone UTC. Django is the development settings module with `DATABASES` pointed at that cluster. The checked-in development file hardcodes SQLite, and the production settings accept `postgresql` but then only set the engine when the value is `postgres`, so that branch never selects Postgres. psycopg2 is 2.9.9 because 2.8.4 does not build against the Postgres 17 headers. Cache is local, Celery is in-memory, and signup mail is the file backend. `GET /login/` returned 200. No CSP. The session cookie is `HttpOnly` and `SameSite=Lax`.

Source. `src/project/models.py:61-67`. `Project.name` is a 30-character string with only `MinLengthValidator(4)`. Create and edit are `src/project/forms.py:63` and `:79`. `ProjectCreateView` saves the project and adds the signed-up user as manager (`src/project/views.py:223-229`). Signup is open; the activation link was the one the app wrote for that account.

Sink. The timelog JSON sets `issue_project_name` from `Project.name` at `src/timelog/json.py:207` and `:257`, and those endpoints return only the requesting user's rows. Two client sinks parse that string as HTML:

- `src/common/static/js/graphs/draw_activity_heatmap.js:129-130` — jQuery `.append(...)` after a click on a heatmap day.
- `src/timelog/static/js/graphs/draw_last_seven.js:192-193` — d3 `.html(...)` on bar hover. The script is in `<head>` and calls `draw()` immediately, so on this localhost run the first JSON callback threw because `#chart_last_seven` was not parsed yet. The page's own `resize` listener then painted the bar, and hover ran the payload.

Control. Project `BEN1` named `Benign Control`. The victim logged `1h` there too. The heatmap day list read `1h on Issue BEN1-1 in Project Benign Control` and `window.alert` was not called. The last-seven tooltip read `Issue: BEN1-1 Project: Benign Control 60 Minutes` with no `onerror`. The manager, who had not logged time, got `[]` from `/timelog/api/last_7_days/`. The activity page HTML contains the escaped name (`&lt;img`), and the response has no `Content-Security-Policy`.

Exploit. Project `XS1` named `<img src=x onerror=alert(1)>` (28 characters). The victim was added as a developer and logged `1h` on issue `XS1-1`. `/timelog/api/last_7_days/?project=XS1` returned `"issue_project_name": "<img src=x onerror=alert(1)>"`. In Chrome 151.0.7922.34, clicking that heatmap day called `alert(1)` and inserted one `img`. Hovering the last-seven bar did the same: `onerror` was `alert(1)` and the tooltip text was `Issue: XS1-1 Project: 60 Minutes`.

I agree with borderline and with new. The iguana set has no XSS finding and nothing on `Project.name` or these chart scripts. It is real only for someone who has logged time in a project this user manages, and only after they click the day or hover the bar. Suggested ground truth: `xss`, source `src/project/models.py:61`, sinks `src/common/static/js/graphs/draw_activity_heatmap.js:130` and `src/timelog/static/js/graphs/draw_last_seven.js:192`.