#!/usr/bin/env python3
"""Register a project manager and a member, store an HTML project name, log time.

Prereq: Iguana's dev server on $BASE (default http://127.0.0.1:8000), using the
SQLite database from local_conf. Signup mail is the file backend; set EMAIL_DIR
to that directory (default /tmp/vb2-apps/iguana/files/emails).
"""
import json
import os
import random
import re
import sqlite3
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from pathlib import Path

BASE = os.environ.get("BASE", "http://127.0.0.1:8000")
EMAIL_DIR = Path(os.environ.get("EMAIL_DIR", "/tmp/vb2-apps/iguana/files/emails"))
HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / "evidence"
EVIDENCE.mkdir(exist_ok=True)
PASSWORD = "Repro-pass-19!"
PAYLOAD = "<img src=x onerror=alert(1)>"
SHORT = os.environ.get("PROJECT_SHORT") or ("X" + f"{random.randint(0, 999):03d}")
SQLITE = os.environ.get("SQLITE", "/tmp/vb2-apps/iguana/files/db.sqlite3")


class RecordingRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self):
        self.hops = []

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.hops.append({"status": code, "location": newurl})
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def opener():
    redirect = RecordingRedirect()
    jar = CookieJar()
    return urllib.request.build_opener(redirect, urllib.request.HTTPCookieProcessor(jar)), redirect, jar


def call(op, method, path, form=None):
    data = None
    headers = {}
    if form is not None:
        data = urllib.parse.urlencode(form, doseq=True).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        resp = op.open(req, timeout=30)
        body = resp.read().decode("utf-8", "replace")
        return resp.status, body, resp.geturl()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        return exc.code, body, BASE + path


def token_from(html):
    match = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html)
    if not match:
        raise RuntimeError("csrf token missing")
    return match.group(1)


def errors(html):
    return re.findall(r'class="errorlist"[\s\S]*?</ul>', html)[:6]


def signup(username, email):
    op, _, _ = opener()
    _, page, _ = call(op, "GET", "/sign_up/")
    status, body, url = call(
        op,
        "POST",
        "/sign_up/",
        {
            "csrfmiddlewaretoken": token_from(page),
            "username": username,
            "email": email,
            "password1": PASSWORD,
            "password2": PASSWORD,
            "captcha_0": "PASSED",
            "captcha_1": "PASSED",
        },
    )
    if "email_confirmation" not in body and "activate" not in body and status >= 400:
        raise RuntimeError(f"signup {username} {status} {errors(body)} {body[:400]}")
    link = None
    for mail in sorted(EMAIL_DIR.glob("*"), key=lambda path: path.stat().st_mtime, reverse=True):
        text = mail.read_text(errors="replace")
        if username not in text and email not in text:
            continue
        found = re.search(r"https?://[^/\s]+(/activate/[^\s]+)", text)
        if found:
            link = found.group(1).strip()
            break
    if not link:
        raise RuntimeError(f"activation link for {username} not in {EMAIL_DIR}")
    act_op, _, _ = opener()
    act_status, act_body, act_url = call(act_op, "GET", link)
    if "invalid" in act_body.lower() and "activation" in act_body.lower():
        raise RuntimeError(f"activation failed for {username}: {act_body[:300]}")
    return {"status": status, "activation": link, "activation_status": act_status, "activation_url": act_url}


def user_pk(username):
    conn = sqlite3.connect(SQLITE)
    row = conn.execute(
        "SELECT id FROM user_management_customuser WHERE username = ?",
        (username,),
    ).fetchone()
    conn.close()
    if not row:
        raise RuntimeError(f"no auth_user row for {username} in {SQLITE}")
    return str(row[0])


def selected_options(html):
    chosen = {}
    for attrs, inner in re.findall(r"<select([^>]*)>(.*?)</select>", html, re.S):
        name = re.search(r'name="([^"]+)"', attrs)
        if not name:
            continue
        selected = re.search(r'<option[^>]*value="([^"]*)"[^>]*selected', inner)
        if not selected:
            selected = re.search(r'<option[^>]*selected[^>]*value="([^"]*)"', inner)
        if not selected:
            selected = re.search(r'<option[^>]*value="([^"]+)"', inner)
        if selected:
            chosen[name.group(1)] = selected.group(1)
    return chosen


def login(username):
    op, redirect, jar = opener()
    _, page, _ = call(op, "GET", "/login/")
    status, body, url = call(
        op,
        "POST",
        "/login/",
        {
            "csrfmiddlewaretoken": token_from(page),
            "username": username,
            "password": PASSWORD,
        },
    )
    if "/login/" in url:
        raise RuntimeError(f"login failed for {username}: {errors(body) or body[:300]}")
    return op


def main():
    manager = f"mgr{SHORT.lower()}"
    member = f"mem{SHORT.lower()}"
    # usernames must be unique; SHORT may already exist on a re-run
    signup(manager, f"{manager}@example.test")
    signup(member, f"{member}@example.test")
    mgr = login(manager)

    _, create_page, _ = call(mgr, "GET", "/project/create/")
    status, body, url = call(
        mgr,
        "POST",
        "/project/create/",
        {
            "csrfmiddlewaretoken": token_from(create_page),
            "name": PAYLOAD,
            "name_short": SHORT,
            "description": "local repro",
        },
    )
    if status >= 400 or errors(body):
        (EVIDENCE / "project-create.html").write_text(body)
        raise RuntimeError(f"project create {status} {errors(body)}")

    mem = login(member)
    # Manager and developer are autocomplete widgets, not a full <select> of users.
    manager_id = user_pk(manager)
    member_id = user_pk(member)
    _, edit_page, _ = call(mgr, "GET", f"/project/{SHORT}/edit/")
    status, body, url = call(
        mgr,
        "POST",
        f"/project/{SHORT}/edit/",
        {
            "csrfmiddlewaretoken": token_from(edit_page),
            "name": PAYLOAD,
            "description": "local repro",
            "manager": manager_id,
            "developer": member_id,
        },
    )
    if errors(body):
        (EVIDENCE / "project-edit-post.html").write_text(body)
        raise RuntimeError(f"project edit {status} {errors(body)}")

    _, issue_page, _ = call(mgr, "GET", f"/project/{SHORT}/issue/create/")
    issue_fields = selected_options(issue_page)
    if "kanbancol" not in issue_fields:
        (EVIDENCE / "issue-create.html").write_text(issue_page)
        raise RuntimeError(f"no kanban column on issue form; selects={issue_fields}")
    status, body, url = call(
        mgr,
        "POST",
        f"/project/{SHORT}/issue/create/",
        {
            "csrfmiddlewaretoken": token_from(issue_page),
            "title": "Log this",
            "kanbancol": issue_fields["kanbancol"],
            "type": issue_fields.get("type", "Task"),
            "priority": issue_fields.get("priority", "2"),
            "storypoints": "1",
        },
    )
    number = None
    # Success lands on the backlog, which links /project/<short>/issue/<n>/.
    match = re.search(rf"/{re.escape(SHORT)}/issue/(\d+)/", url + "\n" + body)
    if match:
        number = match.group(1)
    if not number:
        (EVIDENCE / "issue-create-post.html").write_text(body)
        raise RuntimeError(f"issue create did not redirect to an issue: {status} {url} {errors(body)}")

    log_path = f"/project/{SHORT}/issue/{number}/log/"
    _, log_page, _ = call(mem, "GET", log_path)
    created = re.search(r'name="created_at"[^>]*value="([^"]*)"', log_page)
    form = {
        "csrfmiddlewaretoken": token_from(log_page),
        "time": "1h",
        "created_at": created.group(1)
        if created and created.group(1)
        else datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
    }
    status, body, url = call(mem, "POST", log_path, form)
    if errors(body) or "/log/" in url:
        (EVIDENCE / "timelog.html").write_text(body)
        raise RuntimeError(f"timelog {status} {url} {errors(body)}")

    state = {
        "base": BASE,
        "manager": manager,
        "member": member,
        "password": PASSWORD,
        "project": SHORT,
        "issue": number,
        "payload": PAYLOAD,
        "member_id": member_id,
        "manager_id": manager_id,
    }
    (EVIDENCE / "state.json").write_text(json.dumps(state, indent=2))
    browser = subprocess.run(
        ["node", str(HERE / "browser.mjs")],
        cwd=HERE,
        check=False,
    )
    if browser.returncode != 0:
        raise SystemExit(browser.returncode)


if __name__ == "__main__":
    main()
