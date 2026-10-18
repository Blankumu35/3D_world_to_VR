// "Practice" maker: pretends to generate by returning one of the built-in
// models after a short wait. Costs nothing and needs no internet, so the
// prompt panel can be developed, demonstrated and rehearsed (e.g. in a
// pilot session) without spending Tripo credits or Hugging Face quota.
//
// Only offered when GENERATION_PRACTICE=1 is set in .env.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OBJECTS_DIR = path.resolve(__dirname, '..', '..', '..', 'apps', 'web', 'public', 'assets', 'objects');

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason || new Error('aborted'));
    }, { once: true });
  });

export function createPracticeProvider(env = process.env) {
  const stepMs = Number(env.GENERATION_PRACTICE_STEP_MS) || 700;
  return {
    id: 'practice',
    label: 'Practice',
    description: 'No AI: gives back a model from the library. For testing.',
    supports: { text: true, image: true },
    concurrency: 3,

    status() {
      return env.GENERATION_PRACTICE === '1'
        ? { available: true }
        : { available: false, reason: 'Set GENERATION_PRACTICE=1 in .env to turn on practice mode.' };
    },

    async run({ mode, prompt, image }, report, signal) {
      const stages = mode === 'text'
        ? ['Drawing a picture', 'Building in 3D', 'Building in 3D', 'Making the model file']
        : ['Sending your picture', 'Building in 3D', 'Building in 3D', 'Making the model file'];
      for (let i = 0; i < stages.length; i++) {
        await report({ stage: stages[i], progress: 10 + i * 22 });
        await sleep(stepMs, signal);
      }
      const files = (await fs.readdir(OBJECTS_DIR)).filter((f) => f.endsWith('.glb'));
      if (!files.length) throw new Error('No built-in .glb models to practise with');
      // Same prompt -> same model, so repeated tests are predictable.
      const pick = [...(prompt || 'x')].reduce((n, c) => n + c.charCodeAt(0), 0) % files.length;
      const glb = await fs.readFile(path.join(OBJECTS_DIR, files[pick]));
      return { glb, preview: mode === 'image' ? image : null, taskId: `practice:${files[pick]}` };
    }
  };
}