// Tripo (https://developers.tripo3d.ai) — paid, fast, reliable. The
// provider used in the study.
//
// API v3, as documented in October 2026:
//   POST /v3/files                        multipart "file" -> data.file_token
//   POST /v3/generation/text-to-model     { prompt, model, ... } -> data.task_id
//   POST /v3/generation/image-to-model    { input: file_token, model, ... } -> data.task_id
//   GET  /v3/tasks/{task_id}              -> data.status, data.progress, data.output.model_url
// Responses are { code: 0, data } on success. model_url expires after
// about 5 minutes, so the model is downloaded as soon as the task succeeds.
//
// Settings (.env):
//   TRIPO_API_KEY      required
//   TRIPO_MODEL        default P1-20260311 (Tripo's low-poly model)
//   TRIPO_FACE_LIMIT   default 5000 triangles (Quest-friendly)
//   TRIPO_API_BASE     default https://openapi.tripo3d.ai/v3

import { download, assertGlb } from '../storage.js';
import { GenerationError, MESSAGES } from '../errors.js';

const POLL_MS = 2000; // Tripo asks for at most 1 request/second
const FAILED = new Set(['failed', 'cancelled', 'canceled', 'banned', 'expired', 'unknown']);

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason || new Error('aborted'));
    }, { once: true });
  });

export function createTripoProvider(env = process.env) {
  const base = () => (env.TRIPO_API_BASE || 'https://openapi.tripo3d.ai/v3').replace(/\/$/, '');
  const key = () => env.TRIPO_API_KEY;
  const model = () => env.TRIPO_MODEL || 'P1-20260311';
  const faceLimit = () => Number(env.TRIPO_FACE_LIMIT) || 5000;

  async function call(path, { method = 'GET', json, form, signal } = {}) {
    const headers = { Authorization: `Bearer ${key()}` };
    let body;
    if (json) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      body = form; // fetch sets the multipart boundary itself
    }

    let res;
    try {
      res = await fetch(base() + path, { method, headers, body, signal });
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new GenerationError(`Tripo unreachable: ${err.message}`, MESSAGES.failed);
    }

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      // non-JSON error page
    }

    if (!res.ok || !payload || payload.code !== 0) {
      const code = payload?.code;
      const detail = payload?.message || payload?.msg || payload?.error || `HTTP ${res.status}`;
      // 1007 = rate limited, 2000 = too many tasks at once (both HTTP 429)
      if (res.status === 429 || code === 1007 || code === 2000) {
        throw new GenerationError(`Tripo busy (${code}): ${detail}`, MESSAGES.busy);
      }
      if (res.status === 401 || res.status === 403) {
        throw new GenerationError(`Tripo rejected the API key: ${detail}`, MESSAGES.notConfigured);
      }
      throw new GenerationError(`Tripo error ${code ?? res.status} on ${path}: ${detail}`, MESSAGES.failed);
    }
    return payload.data;
  }

  async function uploadImage(image, signal) {
    const ext = image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType === 'image/webp' ? 'webp' : 'png';
    const form = new FormData();
    form.append('file', new Blob([image.buffer], { type: image.mimeType }), `picture.${ext}`);
    const data = await call('/files', { method: 'POST', form, signal });
    if (!data?.file_token) throw new GenerationError('Tripo upload returned no file_token', MESSAGES.badImage);
    return data.file_token;
  }

  return {
    id: 'tripo',
    label: 'Tripo',
    description: 'Fast and reliable. Uses paid credits.',
    supports: { text: true, image: true },
    concurrency: 5, // Tripo's default for P-series generation

    status() {
      return key()
        ? { available: true }
        : { available: false, reason: 'Add TRIPO_API_KEY to .env to use Tripo.' };
    },

    async run({ mode, prompt, image }, report, signal) {
      if (!key()) throw new GenerationError('TRIPO_API_KEY missing', MESSAGES.notConfigured);

      // Settings shared by both modes. pbr:false keeps one colour texture
      // instead of four maps, which is lighter on a headset.
      const common = {
        model: model(),
        face_limit: faceLimit(),
        texture: true,
        pbr: false
      };

      let created;
      if (mode === 'image') {
        await report({ stage: 'Sending your picture', progress: 5 });
        const token = await uploadImage(image, signal);
        created = await call('/generation/image-to-model', {
          method: 'POST',
          json: { input: token, ...common },
          signal
        });
      } else {
        created = await call('/generation/text-to-model', {
          method: 'POST',
          json: { prompt, ...common },
          signal
        });
      }
      const taskId = created?.task_id;
      if (!taskId) throw new GenerationError('Tripo returned no task_id', MESSAGES.failed);

      await report({ stage: 'Building in 3D', progress: 10 });

      // Poll until the task finishes. The job runner's timeout aborts `signal`.
      let task;
      for (;;) {
        await sleep(POLL_MS, signal);
        task = await call(`/tasks/${encodeURIComponent(taskId)}`, { signal });
        const status = String(task?.status || '').toLowerCase();
        if (status === 'success') break;
        if (FAILED.has(status)) {
          throw new GenerationError(
            `Tripo task ${taskId} ended with status "${status}"`,
            status === 'banned' ? MESSAGES.blocked : MESSAGES.failed
          );
        }
        const p = Number(task?.progress);
        await report({
          stage: status === 'queued' ? 'Waiting in line' : 'Building in 3D',
          progress: Number.isFinite(p) ? 10 + p * 0.8 : undefined
        });
      }

      const output = task.output || {};
      const modelUrl = output.model_url || output.pbr_model_url || output.model;
      if (!modelUrl) throw new GenerationError(`Tripo task ${taskId} has no model_url`, MESSAGES.failed);

      await report({ stage: 'Downloading', progress: 92 });
      const { buffer: glb } = await download(modelUrl);
      try {
        assertGlb(glb);
      } catch (err) {
        throw new GenerationError(`Tripo task ${taskId}: ${err.message}`, MESSAGES.failed);
      }

      // The rendered preview is nice to have; never fail the job over it.
      let preview = null;
      if (output.rendered_image_url) {
        preview = await download(output.rendered_image_url, { maxBytes: 5 * 1024 * 1024, timeoutMs: 20_000 }).catch(() => null);
      }
      return { glb, preview, taskId };
    }
  };
}