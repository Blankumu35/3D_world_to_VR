// Upgrades an older scene document to the current format version.
//
// When the format changes:
//   1. bump CURRENT_SCENE_VERSION and the "version" const in scene.schema.json
//   2. add MIGRATIONS[oldVersion] that returns a scene at oldVersion + 1
// Old saved and published scenes then keep loading without being rewritten.

export const CURRENT_SCENE_VERSION = 1;

const MIGRATIONS = {
  // Example for the future:
  // 1: (scene) => ({ ...scene, version: 2, entities: scene.entities.map(...) }),
};

export function migrateScene(scene) {
  if (!scene || typeof scene !== 'object' || !Number.isInteger(scene.version)) {
    throw new Error('Not a scene: missing an integer "version".');
  }
  if (scene.version > CURRENT_SCENE_VERSION) {
    throw new Error(
      `This world was made with a newer version (${scene.version}) of the builder. Update the app to open it.`
    );
  }

  let current = scene;
  while (current.version < CURRENT_SCENE_VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) throw new Error(`No migration from scene version ${current.version}.`);
    current = step(current);
  }
  return current;
}
