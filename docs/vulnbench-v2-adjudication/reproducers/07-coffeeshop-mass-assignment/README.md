# 07 · coffeeshop · mass assignment

A visitor registers at `POST /register`, which forces `ROLE_CUSTOMER`. After form login, `POST /profile` binds the request onto a `Person` entity and `PersonService.savePerson` persists it. There is no binder allow-list, so `roles` and `id` are writable.

The script checks three requests from ordinary customer sessions:

1. `id` set to the caller's own id and `roles=ROLE_ADMIN`. After the next login, `GET /persons` (admin-only) returns 200.
2. `id` omitted. The save inserts a new person with `ROLE_ADMIN`. Logging in as that username opens `/persons`.
3. `id` set to another user's id, with a new username and password. The old username disappears from `GET /api/v1/person`, and the new username logs in.

`/api/v1/person` is unauthenticated and is how the caller learns ids.

## Start the app

The project is Spring Boot 2.6 on Java 17. It uses the in-memory H2 database in `application.properties` (port 8082). Build with JDK 17 and Maven, then:

```bash
java -jar target/JavaCoffeeShop.jar
```

## Run

```bash
python3 run.py
```

`evidence/summary.json` is the pass/fail record. `evidence/transcript.json` is every request, status, and a body excerpt.
