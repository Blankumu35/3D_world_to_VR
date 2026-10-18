// Minimal backend for the VR World Builder.
//
// Responsibilities (kept deliberately small):
//   /api/health    – liveness check
//   /api/scenes    – publish a scene and fetch it by short code (route/publish.js)
//   /api/generate  – text/picture-to-3D jobs (route/generate.js)
//   /api/generated – the finished models (server/data/generated)
//   everything else, in production – the built front end from /dist
//
// In development, Vite serves the front end and proxies /api here
// (see vite.config.js), so the browser only ever talks to one origin.

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// API keys (TRIPO_API_KEY, HF_TOKEN, ...) live in a .env file in the repo
// root, which is never committed; see .env.example. (Imports are hoisted,
// so this runs after them; the providers read process.env when a request
// arrives, not at import time.) Needs Node 20.12 or newer.
try {
  process.loadEnvFile();
} catch {
  // no .env file: generation providers report themselves as not set up
}

import publishRouter from './route/publish.js';
import generateRouter from './route/generate.js';
import { GENERATED_DIR } from './generate/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.disable('x-powered-by');

// Generation requests may carry a picture (as a data: URL, up to 8 MB
// decoded), so that route gets a bigger body limit than everything else.
// It must come first: once a body is parsed, later parsers skip it.
app.use('/api/generate', express.json({ limit: '12mb' }));

// Scene documents are small JSON.
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/scenes', publishRouter);
app.use('/api/generate', generateRouter);

// Generated models and their preview pictures. File names are random ids,
// so the files never change and can be cached for good.
app.use(
  '/api/generated',
  express.static(GENERATED_DIR, { immutable: true, maxAge: '365d', index: false, dotfiles: 'deny' })
);

// Unknown API paths get a JSON 404 rather than falling through to index.html.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` });
});

// Production: serve the Vite build and let the client-side app handle routes
// such as /view/ABC123. Skipped in dev, where there is no /dist.
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

// Last-resort error handler: log the detail, return a generic message.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That is too big to send.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});