// Text/picture-to-3D generation.
//
// Generation takes 10 seconds to several minutes, longer than a request
// should stay open, so it's a job API:
//
//   GET  /api/generate/providers   which makers are set up, and turns left
//   POST /api/generate             { provider, mode: 'text'|'image', prompt?, image? }
//                                  -> 202 { job }   (image is a data: URL)
//   GET  /api/generate/jobs/:id    -> { job }        poll every ~2 s
//   GET  /api/generate/models      every model made so far (newest first)
//
// The finished model is served from /api/generated/<assetId>.glb (see
// server/index.js) and saved in scenes as { source: 'generated', id }.
// API keys stay on this server; the browser never sees them.

import express from 'express';
import { createTripoProvider } from '../generate/providers/tripo.js';
import { createTrellisProvider } from '../generate/providers/trellis.js';
import { createPracticeProvider } from '../generate/providers/practice.js';
import { checkPrompt } from '../generate/promptFilter.js';
import { cleanSessionId, takeTurn, limitsSummary } from '../generate/limits.js';
import { startJob, getJob, publicJob } from '../generate/jobs.js';
import { listModels } from '../generate/storage.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const providers = [createTripoProvider(), createTrellisProvider(), createPracticeProvider()];
const providerById = new Map(providers.map((p) => [p.id, p]));

const router = express.Router();

const sessionOf = (req) => cleanSessionId(req.get('X-Generation-Session'));

/** Decodes a data: URL and checks it really is a PNG, JPEG or WebP. */
function decodeImage(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isWebp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  const mimeType = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : isWebp ? 'image/webp' : null;
  return mimeType ? { buffer, mimeType } : null;
}

router.get('/providers', (req, res) => {
  res.json({
    providers: providers.map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      supports: p.supports,
      ...p.status()
    })),
    limits: limitsSummary(sessionOf(req))
  });
});

router.post('/', (req, res) => {
  const { provider: providerId, mode } = req.body || {};
  const provider = providerById.get(providerId);
  if (!provider) return res.status(400).json({ error: 'Choose a maker.' });

  const status = provider.status();
  if (!status.available) return res.status(503).json({ error: status.reason });

  if (mode !== 'text' && mode !== 'image') return res.status(400).json({ error: 'Choose words or a picture.' });
  if (!provider.supports[mode]) return res.status(400).json({ error: `${provider.label} can't do that.` });

  // Prompt: required for text; optional for pictures (used as the name),
  // but checked either way because it is shown and saved.
  let prompt = '';
  if (mode === 'text' || req.body.prompt) {
    const check = checkPrompt(req.body.prompt);
    if (!check.ok) return res.status(400).json({ error: check.reason });
    prompt = check.prompt;
  }

  let image = null;
  if (mode === 'image') {
    image = decodeImage(req.body.image);
    if (!image) return res.status(400).json({ error: 'Choose a PNG, JPEG or WebP picture under 8 MB.' });
  }

  const sessionId = sessionOf(req);
  const refused = takeTurn(sessionId);
  if (refused) return res.status(429).json({ error: refused });

  const job = startJob(provider, { mode, prompt, image, sessionId });
  res.status(202).json({ job: publicJob(job), limits: limitsSummary(sessionId) });
});

router.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'That job has finished or never existed.' });
  res.json({ job: publicJob(job) });
});

router.get('/models', async (req, res, next) => {
  try {
    const models = await listModels();
    res.json({
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        mode: m.mode,
        url: `/api/generated/${m.id}.glb`,
        previewUrl: m.preview ? `/api/generated/${m.preview}` : null,
        createdAt: m.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
});

export default router;