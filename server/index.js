// Minimal backend for the VR World Builder.
//
// Responsibilities (kept deliberately small):
//   /api/health    – liveness check
//   /api/scenes    – publish a scene and fetch it by short code (route/publish.js)
//   /api/generate  – text-to-3D jobs (route/generate.js, stubbed for now)
//   everything else, in production – the built front end from /dist
//
// In development, Vite serves the front end and proxies /api here
// (see vite.config.js), so the browser only ever talks to one origin.

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import publishRouter from './route/publish.js';
import generateRouter from './route/generate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.disable('x-powered-by');

// Scene documents are small JSON; models and images will get their own
// upload route later rather than being stuffed into this body.
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/scenes', publishRouter);
app.use('/api/generate', generateRouter);

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
    return res.status(413).json({ error: 'Scene is too large to publish.' });
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