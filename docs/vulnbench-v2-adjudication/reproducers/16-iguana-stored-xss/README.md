# 16 · iguana · stored XSS

Open signup creates a user. The activation link is written by the file email backend (`EMAIL_FILE_PATH` in the development settings). After activation, that user can create a project and becomes its manager. `Project.name` allows 30 characters and only checks a minimum length of 4.

The manager sets the name to `<img src=x onerror=alert(1)>` (28 characters) and adds another signed-up user as a developer. Manager and developer are autocomplete fields; the reproducer posts their primary keys. Creating an issue redirects to the backlog, which links `/project/<short>/issue/1/`. That member logs one hour on the issue, then opens the activity heatmap. The browser clicks the calendar cell whose cal-heatmap datum is that day. The click loads `/timelog/api/YYYYMMDD`, and jQuery `.append` inserts `issue_project_name` (`draw_activity_heatmap.js`). `alert(1)` runs. The last-7-days chart (`draw_last_seven.js`) throws before painting when a day bucket is missing, so this run does not use that tooltip.

The JSON endpoints return only the viewer's own timelogs, so the script runs for the member who logged the time.

## Start

Copy the project. Development settings are SQLite (`local_conf.py`). The checked-in tree has no `common/settings/__init__.py`; the copy needs one that imports `local_conf` and sets `SECRET_KEY`. Drop `test_without_migrations`, `django_extensions`, and `functional_tests` from `INSTALLED_APPS` if those packages are not installed. Create `files/emails` before migrate. Run with Python 3.8 (Django 2.2.28):

```bash
cd src
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

`CAPTCHA_TEST_MODE` is on, so signup accepts captcha value `PASSED`.

If a `sitecustomize.py` in the virtualenv replaces `common.settings` with a Postgres DSN, start Python with `-S` and put the virtualenv `site-packages` plus `src` on `PYTHONPATH` so the copy's SQLite settings load.

## Run

```bash
EMAIL_DIR=/path/to/files/emails python3 run.py
```

`run.py` performs the HTTP steps and then `browser.mjs`. `evidence/state.json` is the accounts and project. `evidence/browser.json` records the alerts.
