// Generation jobs: created by POST /api/generate, run in the background,
// polled by the browser with GET /api/generate/jobs/:id.
//
// A job moves queued -> running -> done | failed. While running, the
// provider reports a short `stage` ("Drawing a picture", "Building in 3D")
// and a 0-100 `progress` for the progress bar. When done, the model is
// saved by storage.js and the job carries its `assetId`.
//
// Jobs are kept in memory for an hour; the saved models are permanent.

import crypto from 'node:crypto';
import { newAssetId, saveModel, savePreview } from './storage.js';
import { returnTurn } from './limits.js';

const JOB_TTL_MS = 60 * 60 * 1000;
// Read when each job starts, so .env changes apply after a restart.
const jobTimeoutMs = () => Number(process.env.GENERATION_TIMEOUT_MS) || 8 * 60 * 1000;

const jobs = new Map();

// Per-provider queues so we never exceed a provider's concurrency limit
// (Tripo P series: 5; a ZeroGPU Space: effectively 1 per token).
const running = new Map(); // providerId -> count
const waiting = new Map(); // providerId -> [start functions]

function acquire(provider) {
  const limit = provider.concurrency || 1;
  const count = running.get(provider.id) || 0;
  if (count < limit) {
    running.set(provider.id, count + 1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const list = waiting.get(provider.id) || [];
    list.push(resolve);
    waiting.set(provider.id, list);
  });
}

function release(provider) {
  const list = waiting.get(provider.id) || [];
  const next = list.shift();
  if (next) next(); // hand the slot straight to the next job
  else running.set(provider.id, Math.max(0, (running.get(provider.id) || 1) - 1));
}

/** What the browser is allowed to see about a job. */
export function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    provider: job.provider,
    mode: job.mode,
    name: job.name,
    assetId: job.status === 'done' ? job.assetId : null,
    previewUrl: job.preview ? `/api/generated/${job.preview}` : null,
    error: job.error,
    createdAt: job.createdAt
  };
}

export function getJob(id) {
  return jobs.get(id) || null;
}

/** Display name for the new object, from the prompt. */
function nameFrom(prompt, mode) {
  if (!prompt) return mode === 'image' ? 'My picture' : 'New object';
  const words = prompt.replace(/^(a|an|the)\s+/i, '');
  const name = words.charAt(0).toUpperCase() + words.slice(1);
  return name.length > 40 ? name.slice(0, 39) + '…' : name;
}

/**
 * Starts a job and returns it immediately.
 * @param {object} provider - see providers/*.js
 * @param {{ mode: 'text'|'image', prompt: string, image?: {buffer, mimeType}, sessionId: string }} input
 */
export function startJob(provider, input) {
  const job = {
    id: 'job_' + crypto.randomBytes(9).toString('base64url'),
    assetId: newAssetId(),
    status: 'queued',
    stage: 'Waiting for a turn',
    progress: 0,
    provider: provider.id,
    mode: input.mode,
    name: nameFrom(input.prompt, input.mode),
    prompt: input.prompt,
    preview: null,
    error: null,
    sessionId: input.sessionId,
    createdAt: new Date().toISOString()
  };
  jobs.set(job.id, job);
  setTimeout(() => jobs.delete(job.id), JOB_TTL_MS).unref();

  run(provider, job, input).catch((err) => console.error('Job runner crashed:', err));
  return job;
}

async function run(provider, job, input) {
  await acquire(provider);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), jobTimeoutMs());
  timer.unref();

  try {
    job.status = 'running';
    job.stage = 'Starting';
    job.progress = 2;

    const report = async ({ stage, progress, preview } = {}) => {
      if (stage) job.stage = stage;
      if (Number.isFinite(progress)) job.progress = Math.max(job.progress, Math.min(99, Math.round(progress)));
      if (preview && !job.preview) {
        job.preview = await savePreview(job.assetId, preview).catch(() => null);
      }
    };

    const result = await provider.run(
      { mode: input.mode, prompt: input.prompt, image: input.image },
      report,
      controller.signal
    );

    job.stage = 'Saving';
    const record = await saveModel(
      job.assetId,
      result.glb,
      {
        name: job.name,
        prompt: input.prompt || null,
        mode: input.mode,
        provider: provider.id,
        providerTaskId: result.taskId || null
      },
      // A preview reported earlier is already on disk; keep the first one.
      job.preview ? null : result.preview
    );
    if (record.preview) job.preview = record.preview;
    job.status = 'done';
    job.stage = 'Ready';
    job.progress = 100;
  } catch (err) {
    job.status = 'failed';
    job.stage = 'Something went wrong';
    job.error = controller.signal.aborted
      ? 'That took too long. Please try again.'
      : err.childMessage || 'Something went wrong while making it. Please try again.';
    console.error(`[generate] ${provider.id} job ${job.id} failed:`, err.message);
    returnTurn(job.sessionId);
  } finally {
    clearTimeout(timer);
    release(provider);
  }
}