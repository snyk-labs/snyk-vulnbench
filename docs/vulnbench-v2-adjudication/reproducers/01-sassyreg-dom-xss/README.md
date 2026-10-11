# 01 · sassyreg · DOM XSS

Unauthenticated visitor opens `/package-profile`. The page loads `authorName` from `https://pkgregistryapp.com/package` (`PackageProfile.js`). React first renders that string as text in `h1#authorName`. Clicking the props/heart button 10 times reads `textContent` and writes it into `#errorMessage` with `innerHTML` (`PropsPoints.js`). The browser decodes the text back into markup, and the handler runs.

The registry host is fictional. The reproducer does not change the fixture. Playwright fulfills `https://pkgregistryapp.com/package` locally with an `authorName` that contains an `<img onerror>` marker.

## Start the app

From a copy of `fixtures/app-project-sassyreg/project` (do not edit the fixture). `node-sass@7` has no Node 24 binary, so the copy's `devDependencies` swap it for `sass` before `npm install`. Application source is unchanged.

```bash
npm install
BROWSER=none CI=true HOST=127.0.0.1 PORT=3010 npm start
```

## Run

```bash
node run.mjs
```

`evidence/result.json` records whether `document.documentElement.dataset.pwned` became `sassyreg` after the tenth click. `evidence/error-message.html` is the `innerHTML` the sink wrote.
