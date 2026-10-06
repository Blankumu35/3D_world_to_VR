// Publish a scene document and fetch it back by a short room code.
// Storage is plain JSON files under server/data/scenes for now.

import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENES_DIR = path.resolve(__dirname, '..', 'data', 'scenes');

// No 0/O, 1/I/L: children will read these off a screen and type them in.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

function makeCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

// Shape check only. Tighten this once the scene schema is written down.
function validateScene(scene) {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return 'Scene must be an object.';
  if (!Number.isInteger(scene.version)) return 'Scene needs an integer "version".';
  if (!Array.isArray(scene.entities)) return 'Scene needs an "entities" array.';
  return null;
}

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const problem = validateScene(req.body);
    if (problem) return res.status(400).json({ error: problem });

    await fs.mkdir(SCENES_DIR, { recursive: true });

    // Retry on the rare collision; 'wx' refuses to overwrite an existing code.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      const record = { code, publishedAt: new Date().toISOString(), scene: req.body };
      try {
        await fs.writeFile(path.join(SCENES_DIR, `${code}.json`), JSON.stringify(record), { flag: 'wx' });
        return res.status(201).json({ code, viewPath: `/view/${code}` });
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }
    res.status(503).json({ error: 'Could not allocate a room code. Try again.' });
  } catch (err) {
    next(err);
  }
});

router.get('/:code', async (req, res, next) => {
  const code = req.params.code.toUpperCase();
  // Validating against the alphabet also blocks path traversal (../ etc.).
  if (!CODE_PATTERN.test(code)) return res.status(400).json({ error: 'That is not a valid room code.' });
  try {
    const raw = await fs.readFile(path.join(SCENES_DIR, `${code}.json`), 'utf8');
    res.type('application/json').send(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: `No scene with code ${code}.` });
    next(err);
  }
});

export default router;