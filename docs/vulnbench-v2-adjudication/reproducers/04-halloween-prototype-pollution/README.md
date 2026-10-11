# 04 · halloween · prototype pollution

No login. `PUT /users/1/settings/notifications` accepts `notificationType` as any string (`userController.ts`). The service writes `userSettings.notifications[notificationType][notificationMode]` (`userService.ts`). `notificationType` of `__proto__` resolves to `Object.prototype`, so the second assignment sets `Object.prototype.isAdmin`.

`GET /admin` checks `req.session.isAdmin`. A new session object has no own `isAdmin`, but it inherits the polluted value, so an unauthenticated request receives `Hello, Admin!`.

## Start the app

From a copy of `fixtures/app-project-halloween/project`, with its `node_modules` available:

```bash
export NODE_ENV=development
export HOST=127.0.0.1 PORT=8094
export CORS_ORIGIN=http://127.0.0.1:8094
export COMMON_RATE_LIMIT_MAX_REQUESTS=1000
export COMMON_RATE_LIMIT_WINDOW_MS=1000
./node_modules/.bin/tsx src/index.ts
```

Restart the process before a second run. The pollution lives for the life of the process, so a later control request would already be an admin.

## Run

```bash
bash run.sh
```

`evidence/transcript.txt` is the HTTP transcript: `401 Unauthorized`, then `201` from the PUT, then `200` with `Hello, Admin!`.
