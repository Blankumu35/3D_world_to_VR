// Getting a world from the editor to the VR viewer.
//
// Two routes:
// - publishScene(): sends the world to the server (POST /api/scenes) and
//   gets back a 6-letter room code. Any device that can reach the server —
//   a headset included — can then open /view/CODE.
// - writePreview(): hands the world to /view?preview in another tab on the
//   same computer through localStorage. No server needed.

import { getAssetById } from '../assets/AssetLibrary';

const PREVIEW_KEY = 'vr-world-builder.preview';

// Same alphabet as server/route/publish.js (no 0/O, 1/I/L).
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function normaliseRoomCode(text) {
  return String(text || '')
    .toUpperCase()
    .split('')
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

/**
 * Turns a saved { source, id } asset ref back into a URL the engine can
 * load. Only built-in library items for now; uploads and generated models
 * will resolve through the server once it stores them.
 */
export function resolveAssetUrl(ref) {
  if (ref?.source === 'builtin') return getAssetById(ref.id)?.url ?? null;
  return null;
}

/** Reads the JSON error message the server sends, or makes a friendly one. */
async function readError(res) {
  try {
    const body = await res.json();
    if (body?.error) return body.error;
  } catch {
    // not JSON (e.g. the Vite proxy's own error page)
  }
  if (res.status === 502 || res.status === 504 || res.status === 500) {
    return 'The world server is not running. Start it with "npm run server".';
  }
  return `Something went wrong (error ${res.status}).`;
}

/** @returns {Promise<{ code: string, viewPath: string }>} */
export async function publishScene(scene) {
  let res;
  try {
    res = await fetch('/api/scenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scene)
    });
  } catch {
    throw new Error('The world server is not running. Start it with "npm run server".');
  }
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** @returns {Promise<object>} the scene document */
export async function fetchPublishedScene(code) {
  let res;
  try {
    res = await fetch(`/api/scenes/${encodeURIComponent(code)}`);
  } catch {
    throw new Error('Could not reach the world server. Is the laptop on and running it?');
  }
  if (res.status === 404) throw new Error(`There is no world with the code ${code}. Check the letters and try again.`);
  if (!res.ok) throw new Error(await readError(res));
  const record = await res.json();
  return record.scene;
}

export function writePreview(scene) {
  try {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(scene));
    return true;
  } catch {
    return false; // storage full or blocked
  }
}

export function readPreview() {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}