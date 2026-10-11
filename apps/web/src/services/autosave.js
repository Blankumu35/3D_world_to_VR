// Keeps a copy of the current world in this browser's localStorage, so an
// accidental refresh or closed tab doesn't lose a child's work.
//
// Only works per browser, per device: it does not move a world to another
// machine or the headset (that's what publishing is for). Every access is
// wrapped in try/catch because localStorage can be unavailable (private
// browsing, storage full, blocked by settings) and autosave must never break
// the editor.

const AUTOSAVE_KEY = 'vr-world-builder.autosave';

/** Saves a scene document. Returns true if it was stored. */
export function writeAutosave(scene) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), scene }));
    return true;
  } catch (err) {
    console.warn('Autosave failed:', err);
    return false;
  }
}

/** Returns { savedAt, scene } or null if there is no usable autosave. */
export function readAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.scene) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // nothing to do
  }
}

/** True for a world with nothing in it worth offering to restore. */
export function isEmptyScene(scene) {
  return (
    !scene?.entities?.length &&
    ['none', 'dynamic'].includes(scene?.environment?.sky?.type) &&
    scene?.environment?.ground?.type === 'color'
  );
}

/**
 * The scene as a string with the timestamp blanked out, so two saves of an
 * unchanged world compare equal and don't trigger a pointless rewrite.
 */
export function sceneFingerprint(scene) {
  return JSON.stringify({ ...scene, meta: { ...scene.meta, updatedAt: null } });
}