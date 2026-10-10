// Validates a scene document: first its shape (JSON Schema), then rules a
// schema cannot express. Works in the browser and in Node.
//
//   const result = validateScene(doc);
//   if (!result.ok) console.log(result.errors); // array of readable strings

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from './scene.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ allErrors: true, strict: true, discriminator: true });
addFormats(ajv);
const checkShape = ajv.compile(schema);

function formatAjvError(err) {
  const where = err.instancePath || '(scene)';
  return `${where} ${err.message}`;
}

export function validateScene(scene) {
  if (!checkShape(scene)) {
    return { ok: false, errors: checkShape.errors.map(formatAjvError) };
  }

  const errors = [];
  const byId = new Map();

  scene.entities.forEach((entity, i) => {
    if (byId.has(entity.id)) errors.push(`/entities/${i}/id "${entity.id}" is used more than once`);
    byId.set(entity.id, entity);
    if (entity.type === 'environment' && entity.interaction) {
      errors.push(`/entities/${i}/interaction environments cannot have interactions`);
    }
  });

  if (scene.player) {
    const target = byId.get(scene.player.entityId);
    if (!target) errors.push(`/player/entityId "${scene.player.entityId}" is not in entities`);
    else if (target.type === 'environment') errors.push('/player/entityId cannot be an environment');
  }

  if (Date.parse(scene.meta.updatedAt) < Date.parse(scene.meta.createdAt)) {
    errors.push('/meta/updatedAt is earlier than createdAt');
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}
