require('dotenv').config();
const express = require('express');
const path = require('path');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Origins allowed to call the API cross-origin (e.g. the specialist PWA pointed
// at a remote server). Comma-separated, e.g. ALLOWED_ORIGINS=https://app.curbside.au
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// ── Startup security checks ──
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set — using an insecure development fallback. ' +
               'Set JWT_SECRET in your environment before deploying.');
}
if (IS_PROD && ALLOWED_ORIGINS.length === 0) {
  console.warn('⚠️  ALLOWED_ORIGINS is not set in production — cross-origin API ' +
               'requests will be blocked. Set it to your front-end origin(s).');
}

// ── Middleware ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS — same-origin requests need no headers; cross-origin requests are
// allowed only from configured origins. In dev (no allowlist) we reflect the
// caller's origin to keep local tooling and the PWA working.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    if (ALLOWED_ORIGINS.length === 0) {
      if (!IS_PROD) res.header('Access-Control-Allow-Origin', origin); // dev convenience
    } else if (ALLOWED_ORIGINS.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Route loader (skips missing files gracefully) ──
function mount(routePath, filePath) {
  try {
    app.use(routePath, require(filePath));
    console.log(`  ✓ ${routePath}`);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.log(`  ○ ${routePath} (pending — file not yet created)`);
    } else {
      console.error(`  ✗ ${routePath} — ${err.message}`);
    }
  }
}

console.log('Mounting routes:');
mount('/api/auth',        './routes/auth');
mount('/api/consults',    './routes/consults');
mount('/api/specialists', './routes/specialists');
mount('/api/documents',   './routes/documents');
mount('/api/billing',     './routes/billing');
mount('/api/admin',       './routes/admin');
mount('/api/notes',       './routes/notes');

// ── Health check ──
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'Curbside MVP',
    time: new Date().toISOString(),
    routes_loaded: true
  });
});

// ── Page routes ──
// The console (the former single-page app) now lives at /app; the marketing
// site is served at / from public/index.html by the static middleware above.
app.get(['/app', '/app/*'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});
app.get('/privacy', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});
app.get('/terms', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// ── Fallback (serves the marketing landing page for any other non-API route) ──
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global error handler ──
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// ── Start (wait for DB) ──
db.ready.then(() => {
  app.listen(PORT, () => {
    console.log(`\n🏥 Curbside MVP running → http://localhost:${PORT}\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

module.exports = app;
