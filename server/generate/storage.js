// Where generated models live, and the checks a downloaded file must pass
// before it is kept.
//
// Each model is stored as server/data/generated/<assetId>.glb with a
// <assetId>.json metadata file next to it (prompt, provider, date) and,
// when there is one, a <assetId>.png preview picture. Scenes refer to a
// model as { source: 'generated', id: assetId } and the browser loads it
// from /api/generated/<assetId>.glb (see server/index.js).

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED_DIR = path.resolve(__dirname, '..', 'data', 'generated');

// Quest-friendly models are a few MB; anything this big is a mistake.
export const MAX_MODEL_BYTES = 60 * 1024 * 1024;

// Must match the asset id pattern in shared/scene/scene.schema.json.
const ASSET_ID_PATTERN = /^gen_[A-Za-z0-9]{16}$/;

export function newAssetId() {
  // 16 base62-ish characters: not guessable, short enough for the schema.
  return 'gen_' + crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, 'x').slice(0, 16);
}

export function isAssetId(id) {
  return ASSET_ID_PATTERN.test(id);
}

/**
 * A binary glTF file starts with the ASCII magic "glTF" and version 2.
 * Checking this stops an HTML error page or a JSON error being saved as a
 * "model" when a provider misbehaves.
 */
export function assertGlb(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) {
    throw new Error('The model file was empty.');
  }
  if (buffer.length > MAX_MODEL_BYTES) {
    throw new Error('The model file is too big to use.');
  }
  const magic = buffer.toString('ascii', 0, 4);
  const version = buffer.readUInt32LE(4);
  if (magic !== 'glTF' || version !== 2) {
    throw new Error('The provider did not send back a .glb model.');
  }
}

/** Saves a checked .glb (and optional preview) and returns its metadata. */
export async function saveModel(assetId, glb, meta, preview = null) {
  if (!isAssetId(assetId)) throw new Error('Bad asset id');
  assertGlb(glb);
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.writeFile(path.join(GENERATED_DIR, `${assetId}.glb`), glb);
  let previewFile = null;
  if (preview?.buffer?.length) {
    const ext = preview.mimeType === 'image/jpeg' ? 'jpg' : preview.mimeType === 'image/webp' ? 'webp' : 'png';
    previewFile = `${assetId}.${ext}`;
    await fs.writeFile(path.join(GENERATED_DIR, previewFile), preview.buffer);
  }
  const record = {
    id: assetId,
    ...meta,
    bytes: glb.length,
    preview: previewFile,
    createdAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(GENERATED_DIR, `${assetId}.json`), JSON.stringify(record, null, 2));
  return record;
}

/** Saves just a preview picture (used while a job is still running). */
export async function savePreview(assetId, preview) {
  if (!isAssetId(assetId) || !preview?.buffer?.length) return null;
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  const ext = preview.mimeType === 'image/jpeg' ? 'jpg' : preview.mimeType === 'image/webp' ? 'webp' : 'png';
  const file = `${assetId}.${ext}`;
  await fs.writeFile(path.join(GENERATED_DIR, file), preview.buffer);
  return file;
}

/** Every stored model's metadata, newest first. */
export async function listModels() {
  let names;
  try {
    names = await fs.readdir(GENERATED_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const records = await Promise.all(
    names
      .filter((n) => n.endsWith('.json'))
      .map(async (n) => {
        try {
          return JSON.parse(await fs.readFile(path.join(GENERATED_DIR, n), 'utf8'));
        } catch {
          return null;
        }
      })
  );
  return records.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * Downloads a URL into memory with a size cap and a timeout. Used for the
 * finished model and preview images from both providers.
 */
export async function download(url, { headers = {}, maxBytes = MAX_MODEL_BYTES, timeoutMs = 120_000 } = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
  const declared = Number(res.headers.get('content-length'));
  if (declared && declared > maxBytes) throw new Error('The model file is too big to use.');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error('The model file is too big to use.');
  return { buffer, mimeType: (res.headers.get('content-type') || '').split(';')[0] };
}