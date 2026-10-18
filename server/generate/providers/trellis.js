// TRELLIS (Microsoft, MIT licence), run on Hugging Face. Free within
// your Hugging Face GPU quota; the open-source comparison in the report.
//
// Two Hugging Face services are used, both with your HF_TOKEN:
//
//   1. Text prompts only: a text-to-image model through Hugging Face
//      Inference Providers (default FLUX.1-schnell, Apache 2.0) draws a
//      picture of the object on a plain background. TRELLIS's best model
//      takes pictures, not text, and the text-only TRELLIS Spaces are
//      third-party copies (at least one uploads results to an unrelated
//      server), so text goes through a picture first. Tripo does the
//      same thing internally.
//
//   2. The official TRELLIS Space (default JeffreyXiang/TRELLIS, model
//      microsoft/TRELLIS-image-large) through the Gradio client:
//        /start_session     makes the Space's per-user folder
//        /preprocess_image  removes the background
//        /image_to_3d       builds the 3D model (kept in the session)
//        /extract_glb       simplifies it and exports a .glb
//      ZeroGPU time is charged to the HF_TOKEN account (a few models a day
//      on a free account, many more on PRO).
//
// Spaces change without notice, so before each job this reads the
// Space's own API description (view_api) and fills in parameters by name.
// If an endpoint has gone, the error says which one.
//
// Settings (.env):
//   HF_TOKEN                    required (fine-grained, with "Make calls to
//                               Inference Providers" and access to public Spaces)
//   TRELLIS_SPACE               default JeffreyXiang/TRELLIS
//   HF_TEXT_TO_IMAGE_MODEL      default black-forest-labs/FLUX.1-schnell
//   HF_TEXT_TO_IMAGE_PROVIDER   default auto
//   TRELLIS_TEXTURE_SIZE        default 1024
//   TRELLIS_MESH_SIMPLIFY       default 0.95 (higher = fewer triangles)

import { Client, handle_file } from '@gradio/client';
import { InferenceClient } from '@huggingface/inference';
import { download, assertGlb } from '../storage.js';
import { GenerationError, MESSAGES } from '../errors.js';

/** Wraps a child's prompt so the picture is easy to turn into 3D. */
export function picturePrompt(prompt) {
  return (
    `${prompt}. A single object on its own, a cute 3D toy model, whole object in view, ` +
    'centred, plain white background, soft even lighting, no text, no shadows on the background'
  );
}

/** Default text-to-image: Hugging Face Inference Providers. */
async function hfTextToImage({ prompt, token, model, provider, signal }) {
  const client = new InferenceClient(token);
  const blob = await client.textToImage(
    { model, provider, inputs: picturePrompt(prompt) },
    { outputType: 'blob', signal }
  );
  return { buffer: Buffer.from(await blob.arrayBuffer()), mimeType: blob.type || 'image/png' };
}

/** Turns a Gradio file result ({ url, path, ... } or a string) into a URL. */
function fileUrl(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.url || value.path || null;
}

/**
 * Builds a call's payload from the Space's own parameter list: values we
 * know by name, the Space's defaults for the rest. Throws if the Space
 * needs something we don't know how to fill.
 */
export function buildPayload(apiInfo, endpoint, values) {
  const info = apiInfo?.named_endpoints?.[endpoint];
  if (!info) {
    throw new GenerationError(
      `The TRELLIS Space has no ${endpoint} endpoint any more (it may have been updated).`,
      MESSAGES.failed
    );
  }
  const payload = {};
  for (const p of info.parameters || []) {
    const name = p.parameter_name;
    if (name in values) payload[name] = values[name];
    else if (p.parameter_has_default) payload[name] = p.parameter_default;
    else {
      throw new GenerationError(
        `The TRELLIS Space's ${endpoint} needs "${name}", which this app doesn't know how to fill.`,
        MESSAGES.failed
      );
    }
  }
  return payload;
}

/** Turns Gradio / ZeroGPU error text into something useful. */
function explain(err) {
  if (err instanceof GenerationError) return err;
  const text = String(err?.message || err || '');
  if (/quota|exceeded your gpu|zerogpu/i.test(text)) {
    return new GenerationError(`TRELLIS GPU quota: ${text}`, MESSAGES.quota);
  }
  if (/queue is full|too many requests|429/i.test(text)) {
    return new GenerationError(`TRELLIS busy: ${text}`, MESSAGES.busy);
  }
  if (/401|403|unauthori[sz]ed|invalid.*token/i.test(text)) {
    return new GenerationError(`Hugging Face rejected the token: ${text}`, MESSAGES.notConfigured);
  }
  if (/nsfw|safety|inappropriate|content.?polic/i.test(text)) {
    return new GenerationError(`Blocked by the picture model: ${text}`, MESSAGES.blocked);
  }
  return new GenerationError(`TRELLIS failed: ${text}`, MESSAGES.failed);
}

/**
 * @param {object} deps - replaceable for tests:
 *   connect(space, options) -> Gradio client; textToImage(args) -> { buffer, mimeType }
 */
export function createTrellisProvider(env = process.env, deps = {}) {
  const connect = deps.connect || ((space, options) => Client.connect(space, options));
  const textToImage = deps.textToImage || hfTextToImage;
  const token = () => env.HF_TOKEN;
  const space = () => env.TRELLIS_SPACE || 'JeffreyXiang/TRELLIS';

  // Runs one Space endpoint. Uses submit() so queue position can be shown.
  async function runEndpoint(client, apiInfo, endpoint, values, onQueue, signal) {
    const payload = buildPayload(apiInfo, endpoint, values);
    if (typeof client.submit !== 'function') {
      return client.predict(endpoint, payload);
    }
    const job = client.submit(endpoint, payload);
    const stop = () => job.cancel?.();
    signal?.addEventListener('abort', stop, { once: true });
    try {
      for await (const msg of job) {
        if (signal?.aborted) throw signal.reason || new Error('aborted');
        if (msg.type === 'status') {
          if (msg.stage === 'error') throw new Error(msg.message || `${endpoint} failed`);
          if (msg.stage === 'pending' && Number.isFinite(msg.position) && msg.position > 0) {
            await onQueue?.(msg.position);
          }
        } else if (msg.type === 'data') {
          return msg;
        }
      }
      throw new Error(`${endpoint} finished without a result`);
    } finally {
      signal?.removeEventListener('abort', stop);
    }
  }

  return {
    id: 'trellis',
    label: 'TRELLIS',
    description: 'Free, open-source (MIT). Slower; uses your Hugging Face GPU time.',
    supports: { text: true, image: true },
    concurrency: 1, // one ZeroGPU job per token at a time

    status() {
      return token()
        ? { available: true }
        : { available: false, reason: 'Add HF_TOKEN to .env to use TRELLIS.' };
    },

    async run({ mode, prompt, image }, report, signal) {
      if (!token()) throw new GenerationError('HF_TOKEN missing', MESSAGES.notConfigured);
      let client;
      try {
        // 1. Text -> picture
        let picture = image;
        if (mode === 'text') {
          await report({ stage: 'Drawing a picture', progress: 5 });
          picture = await textToImage({
            prompt,
            token: token(),
            model: env.HF_TEXT_TO_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell',
            provider: env.HF_TEXT_TO_IMAGE_PROVIDER || 'auto',
            signal
          });
          // Show the child the picture while the 3D part runs.
          await report({ stage: 'Picture ready', progress: 20, preview: picture });
        }

        // 2. Picture -> 3D on the TRELLIS Space
        await report({ stage: 'Connecting to TRELLIS', progress: 22 });
        client = await connect(space(), {
          hf_token: token(),
          events: ['data', 'status']
        });
        const apiInfo = await client.view_api();
        const has = (name) => !!apiInfo?.named_endpoints?.[name];
        const onQueue = (position) => report({ stage: `Waiting in line (number ${position})` });

        // demo.load(start_session) doesn't fire for API clients, but the
        // Space writes its files into the folder it creates.
        if (has('/start_session')) {
          await runEndpoint(client, apiInfo, '/start_session', {}, onQueue, signal);
        }

        let imageInput = handle_file(new Blob([picture.buffer], { type: picture.mimeType || 'image/png' }));
        if (has('/preprocess_image')) {
          await report({ stage: 'Cutting out the background', progress: 28 });
          const pre = await runEndpoint(client, apiInfo, '/preprocess_image', { image: imageInput }, onQueue, signal);
          // Pass the Space's own file reference back when we have one, so
          // the cleaned image isn't downloaded and uploaded again.
          const cleaned = pre?.data?.[0];
          if (cleaned?.meta?._type === 'gradio.FileData') imageInput = cleaned;
          else if (fileUrl(cleaned)) imageInput = handle_file(fileUrl(cleaned));
        }

        await report({ stage: 'Building in 3D', progress: 35 });
        await runEndpoint(
          client,
          apiInfo,
          '/image_to_3d',
          {
            image: imageInput,
            multiimages: [],
            is_multiimage: false,
            seed: Math.floor(Math.random() * 2_147_483_647),
            randomize_seed: false,
            ss_guidance_strength: 7.5,
            ss_sampling_steps: 12,
            slat_guidance_strength: 3,
            slat_sampling_steps: 12,
            multiimage_algo: 'stochastic'
          },
          onQueue,
          signal
        );

        await report({ stage: 'Making the model file', progress: 75 });
        const extracted = await runEndpoint(
          client,
          apiInfo,
          '/extract_glb',
          {
            mesh_simplify: Number(env.TRELLIS_MESH_SIMPLIFY) || 0.95,
            texture_size: Number(env.TRELLIS_TEXTURE_SIZE) || 1024
          },
          onQueue,
          signal
        );
        const urls = (extracted?.data || []).map(fileUrl).filter(Boolean);
        const glbUrl = urls.find((u) => /\.glb(\?|$)/i.test(u)) || urls[0];
        if (!glbUrl) throw new GenerationError('TRELLIS returned no model file', MESSAGES.failed);

        await report({ stage: 'Downloading', progress: 92 });
        const { buffer: glb } = await download(glbUrl, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        assertGlb(glb);
        return { glb, preview: mode === 'image' ? picture : null };
      } catch (err) {
        if (signal?.aborted) throw err;
        throw explain(err);
      } finally {
        try {
          client?.close?.();
        } catch {
          // already closed
        }
      }
    }
  };
}