'use strict';

const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');

const express = require('express');
const session = require('express-session');
const exphbs = require('express-handlebars');

const execAsync = util.promisify(exec);

const PORT = process.env.PORT || 3055;
const startedAt = Date.now();

const app = express();

app.engine(
  'hbs',
  exphbs.engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views', 'layouts'),
  }),
);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: 'viuvsubvsdaf2392379y8239h2r3ifubviufbv',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      maxAge: 99999999999,
    },
  }),
);

function bumpSession(req) {
  if (!req.session) return;
  req.session.visits = (req.session.visits || 0) + 1;
}

function firstQueryString(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

/** Same-origin relative path only — used for ?referer= and /visitPage redirects. */
function safeRedirectPath(referer) {
  const raw = firstQueryString(referer).trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (raw.includes('..')) return null;
  if (/[\0\r\n]/.test(raw)) return null;
  return raw;
}

function refererLabelForCurrentPage(req) {
  const p = req.path || '/';
  if (p === '/check') return '/';
  if (p === '/visitPage') return '/';
  return p;
}

function isSafePingHost(host) {
  if (!host || typeof host !== 'string') return false;
  const h = host.trim();
  if (!h || h.length > 253) return false;
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}/;
  if (ipv4.test(h)) return true;
  const ipv6 = /^[0-9a-fA-F:]+/;
  if (ipv6.test(h) && h.length <= 128) return true;
  const hostname =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*/;
  return hostname.test(h);
}

function parseTarget(raw) {
  const input = (raw || '').trim();
  if (!input) return { error: 'Target is required.' };

  if (input.startsWith('https://')) {
    let url;
    try {
      url = new URL(input);
    } catch {
      return { error: 'Invalid https:// URL.' };
    }
    if (url.protocol !== 'https:') {
      return { error: 'Only https:// URLs are supported for web checks.' };
    }
    const host = url.hostname;
    if (!isSafePingHost(host)) {
      return { error: 'Hostname in URL is not allowed.' };
    }
    return {
      pingHost: host,
      httpsOrigin: url.origin,
      securityTxtUrl: new URL('/.well-known/security.txt', url.origin).href,
      displayTarget: input,
      isHttps: true,
    };
  }

  if (!isSafePingHost(input)) {
    return { error: 'Invalid host or IP for ping.' };
  }
  return {
    pingHost: input,
    displayTarget: input,
    isHttps: false,
  };
}

async function runPing(host) {
  const cmd = `ping -c 4 -W 5 ${host}`;
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 25000,
      maxBuffer: 512 * 1024,
    });
    return { ok: true, output: (stdout || '').trim() + (stderr ? `\n${stderr}` : '') };
  } catch (err) {
    const out = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
    return {
      ok: false,
      output: out || err.message || String(err),
    };
  }
}

async function fetchSecurityTxtMeta(securityTxtUrl) {
  const res = await fetch(securityTxtUrl, {
    redirect: 'follow',
    headers: { Accept: 'text/plain,*/*' },
  });
  const headers = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const text = await res.text();
  const maxBody = 64 * 1024;
  const bodyPreview =
    text.length > maxBody ? `${text.slice(0, maxBody)}\n... (truncated)` : text;
  return {
    url: securityTxtUrl,
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers,
    bodyPreview,
  };
}

app.use((req, res, next) => {
  bumpSession(req);
  next();
});

app.use((req, res, next) => {
  const ref = refererLabelForCurrentPage(req);
  if (req.path === '/account') {
    res.locals.navAccountHref = req.originalUrl;
  } else {
    res.locals.navAccountHref = `/account?referer=${encodeURIComponent(ref)}`;
  }
  next();
});

app.get('/', (req, res) => {
  res.render('index', {
    title: 'Health check',
    serverUptimeSec: Math.floor(process.uptime()),
    serverHostname: os.hostname(),
    startedAtIso: new Date(startedAt).toISOString(),
    visits: req.session.visits || 0,
  });
});

app.get('/account', (req, res) => {
  let lastPingLabel = 'n/a';
  if (req.session.lastPingOk === true) lastPingLabel = 'yes';
  else if (req.session.lastPingOk === false) lastPingLabel = 'no';

  const refererTarget = req.query.referer;
  const visitPageHref = refererTarget
    ? `/visitPage?referer=${encodeURIComponent(refererTarget)}`
    : null;

  const profile = {
    title: 'Session',
    visits: req.session.visits || 0,
    lastTarget: req.session.lastTarget || null,
    lastPingLabel,
    sessionID: req.sessionID,
    serverHostname: os.hostname(),
    refererTarget,
    visitPageHref,
  };
  return res.render('account.hbs', profile);
});

app.get('/visitPage', (req, res) => {
  const target = req.query.referer || '/';
  if (
    !target ||
    target === '/visitPage' ||
    target.startsWith('/visitPage?')
  ) {
    res.redirect(302, '/');
  }
    res.redirect(target);
});

app.post('/check', async (req, res, next) => {
  try {
    const parsed = parseTarget(req.body.target);
    if (parsed.error) {
      return res.status(400).render('results', {
        title: 'Check failed',
        error: parsed.error,
        displayTarget: req.body.target,
      });
    }

    const pingResult = await runPing(parsed.pingHost);
    req.session.lastTarget = parsed.displayTarget;
    req.session.lastPingOk = pingResult.ok;

    let securityTxt = null;
    if (parsed.isHttps && parsed.securityTxtUrl) {
      try {
        securityTxt = await fetchSecurityTxtMeta(parsed.securityTxtUrl);
      } catch (e) {
        securityTxt = {
          url: parsed.securityTxtUrl,
          ok: false,
          fetchError: e.message || String(e),
        };
      }
    }

    return res.render('results', {
      title: 'Results',
      displayTarget: parsed.displayTarget,
      pingHost: parsed.pingHost,
      pingResult,
      securityTxt,
      isHttps: parsed.isHttps,
    });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('results', {
    title: 'Error',
    error: err.message || 'Unexpected error.',
    displayTarget: req.body && req.body.target,
  });
});

app.listen(PORT, () => {
  console.log(`js-project-purplehaze listening on http://127.0.0.1:${PORT}`);
});
