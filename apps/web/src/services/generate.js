// Talking to the server's generation API (server/route/generate.js).
// The browser never holds an API key: it only starts jobs and polls them.

const SESSION_KEY = 'vr-world-builder.generation-session';
const CREATIONS_KEY = 'vr-world-builder.creations';

/**
 * A random id for this browser tab's session, so the server can apply the
 * per-session limit. Not linked to the child in any way. sessionStorage
 * means a new tab (or the next participant) starts fresh.
 */
export function generationSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '');
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

const headers = (json = false) => ({
  'X-Generation-Session': generationSessionId(),
  ...(json ? { 'Content-Type': 'application/json' } : {})
});

const NO_SERVER = 'The world server is not running. Start it with "npm run server".';

async function request(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error(NO_SERVER);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    // e.g. the Vite proxy's error page when the server is down
  }
  if (!res.ok) {
    if (!body && [500, 502, 503, 504].includes(res.status)) throw new Error(NO_SERVER);
    throw new Error(body?.error || `Something went wrong (error ${res.status}).`);
  }
  return body;
}

/** @returns {Promise<{ providers: object[], limits: { remaining: number } }>} */
export function fetchProviders() {
  return request('/api/generate/providers', { headers: headers() });
}

/**
 * @param {{ provider: string, mode: 'text'|'image', prompt?: string, image?: string }} input
 *   image is a data: URL (see imageFileToDataUrl)
 */
export function startGeneration(input) {
  return request('/api/generate', {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(input)
  });
}

export function fetchJob(id) {
  return request(`/api/generate/jobs/${encodeURIComponent(id)}`, { headers: headers() });
}

/**
 * Polls a job until it is done or failed, calling onUpdate with each new
 * state. Resolves with the final job. A failed poll (e.g. a Wi-Fi blip) is
 * retried a few times before giving up.
 */
export async function waitForJob(id, onUpdate, { intervalMs = 2000, signal } = {}) {
  let misses = 0;
  for (;;) {
    if (signal?.aborted) throw new Error('Stopped');
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const { job } = await fetchJob(id);
      misses = 0;
      onUpdate?.(job);
      if (job.status === 'done' || job.status === 'failed') return job;
    } catch (err) {
      misses += 1;
      if (misses >= 5) throw err;
    }
  }
}

export function generatedModelUrl(assetId) {
  return `/api/generated/${encodeURIComponent(assetId)}.glb`;
}

/**
 * Shrinks a chosen picture to at most `maxSize` pixels on its long side
 * and returns it as a data: URL. Redrawing it on a canvas also drops the
 * photo's hidden metadata (camera, GPS location) before it leaves the
 * laptop. PNGs stay PNG (they may have a transparent background, which
 * the 3D makers like); everything else becomes JPEG.
 */
export function imageFileToDataUrl(file, maxSize = 1024) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
      reject(new Error('Choose a PNG, JPEG or WebP picture.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That picture couldn't be opened."));
    };
    img.src = url;
  });
}

/** Things made in this tab, so they can be added again (newest first). */
export function readCreations() {
  try {
    return JSON.parse(sessionStorage.getItem(CREATIONS_KEY)) || [];
  } catch {
    return [];
  }
}

export function rememberCreation(creation) {
  const list = [creation, ...readCreations().filter((c) => c.assetId !== creation.assetId)].slice(0, 12);
  try {
    sessionStorage.setItem(CREATIONS_KEY, JSON.stringify(list));
  } catch {
    // storage full or blocked: the list just won't survive a refresh
  }
  return list;
}