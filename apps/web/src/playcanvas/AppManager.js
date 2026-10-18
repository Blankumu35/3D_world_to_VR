import * as pc from 'playcanvas';
import { validateScene } from '../../../../shared/scene/validateScene.js';
import { migrateScene, CURRENT_SCENE_VERSION } from '../../../../shared/scene/migrate.js';

/**
 * Converts a -100..100 slider level into a scale multiplier.
 * Multiplicative rather than linear, so a given slider movement always
 * changes the object by the same *percentage* regardless of its current
 * size — a large object and a tiny one both respond usefully.
 *   level    0 -> 1x (imported size)
 *   level  100 -> 16x
 *   level -100 -> 1/16x
 */
export const SCALE_LEVEL_BASE = 2;
export const SCALE_LEVEL_DIVISOR = 25;

export function levelToFactor(level) {
  return Math.pow(SCALE_LEVEL_BASE, level / SCALE_LEVEL_DIVISOR);
}

export function factorToLevel(factor) {
  return (Math.log(factor) / Math.log(SCALE_LEVEL_BASE)) * SCALE_LEVEL_DIVISOR;
}

const DEFAULT_GROUND_COLOR = [0.28, 0.32, 0.38];

// Scene files store colours as "#rrggbb"; the engine uses [r, g, b] in 0..1.
function rgbToHex(rgb) {
  return '#' + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}
function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
const round4 = (n) => Math.round(n * 10000) / 10000;

// Lighting a new world starts with: midday sun, shadows on.
const DEFAULT_LIGHTING = { timeOfDay: 12, shadows: true };

function defaultEnvironmentState() {
  return {
    sky: { type: 'dynamic' },
    ground: { type: 'color', color: rgbToHex(DEFAULT_GROUND_COLOR) },
    lighting: { ...DEFAULT_LIGHTING }
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Works out where the sun or moon is and what light it gives, for a time of
 * day in hours (0–24). Kept as a plain function, separate from the engine,
 * so it's easy to reason about and test.
 *
 *   06:00–18:00  the sun rises in the east, peaks at noon, sets in the west
 *   18:00–06:00  the moon follows the same path, lower and dimmer
 *
 * Returns { body: 'sun' | 'moon', elevation (deg), azimuth (deg),
 *           color [r,g,b], intensity, ambient [r,g,b] }.
 */
export function computeSkyLight(timeOfDay) {
  const t = ((timeOfDay % 24) + 24) % 24;
  const isDay = t >= 6 && t <= 18;
  // 0 at rise, 1 at set
  const progress = isDay ? (t - 6) / 12 : (((t - 18) + 24) % 24) / 12;
  const arc = Math.sin(progress * Math.PI); // 0 at the horizon, 1 overhead
  const maxElevation = isDay ? 70 : 50;
  // Never quite on the horizon: a light skimming the ground gives a dark
  // scene and stretched, flickering shadows.
  const elevation = Math.max(15, arc * maxElevation);
  const azimuth = 90 + progress * 180; // east -> south -> west

  if (isDay) {
    const day = smoothstep(10, 35, arc * maxElevation); // 0 = low sun, 1 = high
    return {
      body: 'sun',
      elevation,
      azimuth,
      color: lerp3([1.0, 0.55, 0.3], [1.0, 0.97, 0.9], day),
      intensity: lerp(0.9, 1.15, day),
      ambient: lerp3([0.42, 0.33, 0.33], [0.4, 0.42, 0.46], day)
    };
  }
  return {
    body: 'moon',
    elevation,
    azimuth,
    color: [0.62, 0.72, 1.0],
    intensity: 0.5,
    // Kept fairly bright on purpose: a night scene children can't see
    // anything in isn't much fun to build.
    ambient: [0.2, 0.22, 0.34]
  };
}

/**
 * Sky colours through the day, as [hour, topColour, horizonColour]. The
 * automatic ("dynamic") sky blends between the two nearest entries, so
 * moving the time-of-day slider fades the sky smoothly. 24:00 repeats
 * 00:00 so the night wraps round.
 */
const SKY_KEYFRAMES = [
  [0, '#02040a', '#141a30'],
  [4.5, '#060a1a', '#1b2240'],
  [5.5, '#1a2350', '#5a4a72'],
  [6.25, '#2b3a67', '#f2a07b'], // sunrise
  [7.5, '#4a7fc1', '#f5d6b8'],
  [9, '#3f7fd1', '#cfe3f5'],
  [12, '#3b82d6', '#dbeaf7'], // noon
  [16, '#4a86cf', '#e2e8f0'],
  [17.25, '#3d4f86', '#f6b26b'], // golden hour
  [18, '#2b3a67', '#f0956a'], // sunset
  [19, '#1b2147', '#6b4a6e'], // dusk
  [20.5, '#070b1c', '#1b2540'],
  [24, '#02040a', '#141a30']
];

const hexToRgb255 = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgb255ToHex = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

/** Sky gradient for a time of day: { top, bottom } as "#rrggbb". */
export function computeSkyColors(timeOfDay) {
  const t = Math.min(Math.max(timeOfDay, 0), 24);
  let i = 0;
  while (i < SKY_KEYFRAMES.length - 2 && SKY_KEYFRAMES[i + 1][0] <= t) i++;
  const [h0, top0, bottom0] = SKY_KEYFRAMES[i];
  const [h1, top1, bottom1] = SKY_KEYFRAMES[i + 1];
  const k = h1 === h0 ? 0 : (t - h0) / (h1 - h0);
  return {
    top: rgb255ToHex(lerp3(hexToRgb255(top0), hexToRgb255(top1), k)),
    bottom: rgb255ToHex(lerp3(hexToRgb255(bottom0), hexToRgb255(bottom1), k))
  };
}

/**
 * Junior mode places everything on a fixed lattice: world units per grid
 * cell, applied to x/z only (never y — height comes from dropToGround /
 * normaliseAndGround, not the grid). This is not a toggle; every placement
 * path snaps unconditionally. Exported so TransformPanel's position sliders
 * can step in whole cells instead of drifting out of sync with this value.
 */
export const GRID_SIZE = 1;

/**
 * Horizontal radius (world units) used to test the walking character
 * against placed-object AABBs — see the Collision section below.
 */
export const CHARACTER_RADIUS = 0.4;

const SELECTION_COLOR = new pc.Color(1, 0.78, 0.2);
const RAY_COLOR_OK = new pc.Color(0.35, 0.8, 1);
const RAY_COLOR_BAD = new pc.Color(1, 0.35, 0.35);
const RAY_COLOR_IDLE = new pc.Color(1, 1, 1);

/**
 * AppManager
 * Owns the PlayCanvas application and exposes an imperative API the React
 * layer drives. Selection, dragging, rotating and orbiting live here (they
 * need per-frame engine access); React owns UI state and reads/writes
 * transforms through the setters below.
 */
export class AppManager {
  /**
   * @param {HTMLCanvasElement} canvasElement
   * @param {object} callbacks - onSelectionChange, onTransformChange, ...
   * @param {{ readOnly?: boolean }} options - readOnly: the VR viewer. You
   *   can look around and walk, but clicking never selects or moves objects.
   */
  constructor(canvasElement, callbacks = {}, options = {}) {
    this.canvas = canvasElement;
    this.app = null;
    this.camera = null;
    this.readOnly = !!options.readOnly;

    /**
     * @type {Map<string, {
     *   entity: pc.Entity,
     *   baseRotation: pc.Quat, // the model's own root rotation (kept)
     *   baseScale: number,     // scale chosen at import time (normalised)
     *   scaleLevel: number,    // -100..100, user-facing
     *   rotation: number[],    // user euler degrees [x, y, z], on top of baseRotation
     *   name: string,
     *   type: 'object' | 'environment',
     *   assetRef: { source: string, id: string } | null, // null = can't be saved
     *   interactable: { label: string, action: object } | null
     * }>}
     */
    this.entities = new Map();
    this.selectedId = null;

    this.onSelectionChange = callbacks.onSelectionChange || null;
    this.onTransformChange = callbacks.onTransformChange || null;
    this.onPlayerChange = callbacks.onPlayerChange || null;

    // "Active player": character movement (below) drives this entity
    // instead of the free-look camera. playerView controls how the camera
    // relates to it — see setPlayerView / updateCamera.
    this.activePlayerId = null;
    this.playerView = 'third-person'; // 'normal' | 'third-person' | 'first-person'

    this.orbit = { yaw: 25, pitch: -20, dist: 8 };
    this.orbitTarget = new pc.Vec3(0, 1, 0);

    // When set, the camera "stands" at this fixed point (e.g. the centre of
    // a just-added environment) instead of orbiting around orbitTarget from
    // a distance — see updateCamera(). Mouse-drag still steers yaw/pitch as
    // normal, so it behaves like looking around from where you're standing.
    // Character movement (below) walks this same point around, so standing
    // still and walking use one shared position rather than two.
    this.insideTarget = null;

    // Character movement: WASD/arrow-key state is written by the Controls
    // component via setMoveInput(); stepCharacterMovement() reads it once
    // per frame. Speeds are in world units/second.
    this.walkSpeed = 3;
    this.runSpeed = 7;
    this.characterRadius = CHARACTER_RADIUS;
    this.moveInput = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      running: false
    };

    this.pointer = {
      down: false,
      mode: null, // 'orbit' | 'drag' | 'rotate'
      lastX: 0,
      lastY: 0,
      moved: false
    };

    // Skybox entity (see the Skybox section) — null until a sky is shown.
    // The gradient canvas/texture are made once and redrawn in place, so
    // dragging the time slider doesn't create a new GPU texture per frame.
    this.skybox = null;
    this.gradientCanvas = null;
    this.gradientTexture = null;

    // What the sky and ground are currently set to, in scene-file form, so
    // serializeScene() can save it. Kept up to date by the setters below.
    this.environmentState = defaultEnvironmentState();

    // Directional light and the visible sun/moon disc (see the Sun & moon
    // section). Created in init().
    this.sun = null;
    this.celestial = null;
    this.celestialDir = new pc.Vec3(0, 1, 0);

    // Title and creation time of the world being edited (see loadScene).
    this.sceneMeta = { title: 'My world', createdAt: new Date().toISOString() };

    // Called with (entityId, action) when the player presses E near an
    // interactable. The app decides what each action type does.
    this.interactionHandler = null;

    // Interaction: entities can be marked with setInteractable(); the
    // nearest one within interactRadius of the character is tracked here
    // and reported through onInteractionPromptChange so the UI can show a
    // "Press E to ..." hint. See the Interaction section.
    this.interactRadius = 2;
    this.activeInteractableId = null;
    this.onInteractionPromptChange = callbacks.onInteractionPromptChange || null;

    // VR (see the XR section). The camera is moved under xrRig while a
    // headset session runs: the headset moves the camera *inside* the rig,
    // and teleporting / snap turning move the rig itself.
    this.xrRig = null;
    this.teleportMarker = null;
    this.xrHiddenId = null;
    this.inVR = false;
    this.onXRChange = callbacks.onXRChange || null;
    this.xrState = {
      aiming: null,        // the XrInputSource currently aiming, or null
      aimingBy: null,      // 'trigger' | 'stick'
      target: null,        // pc.Vec3 where the ray ends
      targetValid: false,
      turnArmed: new Map() // inputSource -> false until the stick re-centres
    };
    this.teleportRange = 15;
    this.snapTurnDegrees = 30;

    this.init();
  }

  // ------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------

  /**
   * Lets the UI learn when the nearest interactable object changes, called
   * with `{ id, label }` or `null`. A setter rather than a constructor-only
   * callback because this feature was added after Canvas3D's callback
   * plumbing was written — call it once, right after the engine instance
   * is available (same moment App.jsx captures engineRef).
   */
  setInteractionPromptHandler(fn) {
    this.onInteractionPromptChange = fn || null;
  }

  init() {
    if (!this.canvas) return;

    this.app = new pc.Application(this.canvas, {
      mouse: new pc.Mouse(this.canvas),
      // `pc.Touch` is an event wrapper, not an input device — the device
      // class is `pc.TouchDevice`. Only attach it on touch-capable devices.
      touch: pc.platform.touch ? new pc.TouchDevice(this.canvas) : undefined
    });

    // Fill/resolution must be set before start(), or the first frame renders
    // at the default canvas size.
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);

    this.camera = new pc.Entity('MainCamera', this.app);
    this.camera.addComponent('camera', {
      clearColor: new pc.Color(0.15, 0.15, 0.2),
      farClip: 500,
      nearClip: 0.05
    });
    this.app.root.addChild(this.camera);
    this.updateCamera();

    // The sun (or moon): one directional light, moved and recoloured by
    // applyLighting(). Shadow settings are a compromise for Quest headsets:
    // a 2048 map covering 60 units around the camera.
    this.sun = new pc.Entity('SunLight', this.app);
    this.sun.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 1, 1),
      intensity: 1,
      castShadows: true,
      shadowResolution: 2048,
      shadowDistance: 60,
      shadowBias: 0.2,
      normalOffsetBias: 0.05
    });
    this.app.root.addChild(this.sun);
    this.createCelestialEntity();

    this.ground = new pc.Entity('Ground', this.app);
    this.ground.addComponent('render', { type: 'plane' });
    const groundMat = new pc.StandardMaterial();
    groundMat.diffuse = new pc.Color(...DEFAULT_GROUND_COLOR);
    groundMat.update();
    this.ground.render.meshInstances[0].material = groundMat;
    this.app.root.addChild(this.ground);
    this.ground.setLocalScale(60, 1, 60);

    this.resizeHandler = () => {
      if (this.app) this.app.resizeCanvas();
    };
    window.addEventListener('resize', this.resizeHandler);

    this.attachPointerHandlers();
    this.attachInteractionKey();

    this.setupXR();

    this.updateHandler = (dt) => {
      this.updateXR();
      this.stepCharacterMovement(dt);
      this.drawSelectionOutline();
      this.updateInteractionPrompt();
      // Keeps the skybox "infinitely far away" by re-centring it on the
      // camera every frame instead of letting the camera move away from it.
      if (this.skybox) this.skybox.setPosition(this.camera.getPosition());
      this.updateCelestialPosition();
    };
    this.app.on('update', this.updateHandler);

    this.applyLighting();
    this.app.start();
  }

  // ------------------------------------------------------------------
  // Camera
  // ------------------------------------------------------------------

  updateCamera() {
    if (!this.camera) return;
    // In VR the headset drives the camera; see the XR section.
    if (this.isInVR()) return;
    const pitch = this.orbit.pitch * pc.math.DEG_TO_RAD;
    const yaw = this.orbit.yaw * pc.math.DEG_TO_RAD;

    // Offset from a look-at target to the camera, for the given yaw/pitch —
    // used a few different ways below depending on mode.
    const dir = new pc.Vec3(
      Math.cos(pitch) * Math.sin(yaw),
      -Math.sin(pitch),
      Math.cos(pitch) * Math.cos(yaw)
    );

    const playerRecord = this.activePlayerId && this.entities.get(this.activePlayerId);

    if (playerRecord && this.playerView !== 'normal') {
      // Following the active player: first/third person both track its
      // world position every frame, not just when it moves, since the
      // object itself might get dragged/rotated/rescaled via TransformPanel
      // while it's the active player too.
      const box = this.getWorldAabb(playerRecord.entity);
      const pos = playerRecord.entity.getPosition();
      const cx = box ? box.center.x : pos.x;
      const cz = box ? box.center.z : pos.z;
      const base = box ? box.center.y - box.halfExtents.y : pos.y;
      const height = box ? box.halfExtents.y * 2 : 1.6;

      if (this.playerView === 'first-person') {
        // Eye near the top of the object, looking out through it.
        const eyeY = base + height * 0.9;
        this.camera.setPosition(cx, eyeY, cz);
        this.camera.lookAt(cx - dir.x, eyeY - dir.y, cz - dir.z);
        return;
      }

      // 'third-person': a chase camera at the usual orbit distance/angle,
      // just centred on the player instead of a fixed orbitTarget. Reuses
      // orbit.dist, so the scroll-wheel zoom still works as "follow
      // distance".
      const targetY = base + height * 0.5;
      const d = this.orbit.dist;
      this.camera.setPosition(cx + d * dir.x, targetY + d * dir.y, cz + d * dir.z);
      this.camera.lookAt(cx, targetY, cz);
      return;
    }

    if (this.insideTarget) {
      // "Standing inside" mode: the eye sits AT insideTarget and yaw/pitch
      // steer which way it's looking, rather than orbiting around a distant
      // point. lookPoint is just insideTarget minus the same direction
      // vector the orbit case uses, so a mouse-drag feels identical either
      // way.
      const p = this.insideTarget;
      this.camera.setPosition(p.x, p.y, p.z);
      this.camera.lookAt(p.x - dir.x, p.y - dir.y, p.z - dir.z);
      return;
    }

    const d = this.orbit.dist;
    const x = this.orbitTarget.x + d * dir.x;
    const y = this.orbitTarget.y + d * dir.y;
    const z = this.orbitTarget.z + d * dir.z;

    this.camera.setPosition(x, y, z);
    this.camera.lookAt(this.orbitTarget);
  }

  /**
   * Multiplicative zoom. A fixed linear step feels sluggish when far out and
   * jumpy when close in; scaling the distance by a constant factor per wheel
   * tick keeps the perceived speed constant at any distance.
   */
  zoomBy(deltaY, speed = 0.0035) {
    this.orbit.dist = pc.math.clamp(
      this.orbit.dist * Math.exp(deltaY * speed),
      0.4,
      200
    );
    this.updateCamera();
  }

  /** Frame the camera on an object so it fills a sensible part of the view. */
  focusOn(assetId) {
    const record = this.entities.get(assetId);
    if (!record) return;
    const box = this.getWorldAabb(record.entity);
    if (!box) return;

    this.insideTarget = null; // framing an object is an "outside" view
    if (this.activePlayerId) {
      // Framing something from outside doesn't make sense while embodying
      // it as the active player — step out of player mode first.
      this.activePlayerId = null;
      this.onPlayerChange?.(null);
    }
    this.orbitTarget.copy(box.center);
    const radius = box.halfExtents.length();
    this.orbit.dist = pc.math.clamp(radius * 3.2, 0.5, 200);
    this.updateCamera();
  }

  /**
   * Moves the viewpoint to the centre of a just-added environment, so you're
   * standing inside it rather than looking at it from outside. Mouse-drag
   * still looks around freely from that point (see updateCamera).
   */
  viewFromCenter(assetId, eyeHeight = 1.6) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    const box = this.getWorldAabb(record.entity);
    if (!box) return false;

    this.insideTarget = new pc.Vec3(box.center.x, box.center.y + eyeHeight, box.center.z);
    this.updateCamera();
    return true;
  }

  /** Leave "standing inside" mode and go back to the normal orbit camera. */
  exitInsideView() {
    if (!this.insideTarget) return;
    this.insideTarget = null;
    this.updateCamera();
  }

  // ------------------------------------------------------------------
  // Skybox
  //
  // PlayCanvas's real skybox system wants a prefiltered cubemap, which
  // needs its own asset-build step — overkill for "drop in a photo or pick
  // a colour". Instead this is the classic cheap trick: a huge inverted
  // sphere that follows the camera's position (never its rotation) every
  // frame, rendered with backface culling reversed (cull = CULLFACE_FRONT)
  // so you see its *inside* surface instead of its outside. A single
  // equirectangular "360 photo" maps onto a sphere's UVs directly, no
  // reprojection needed.
  // ------------------------------------------------------------------

  /** Creates the skybox sphere the first time it's needed; reuses it after. */
  createSkyboxEntity() {
    if (this.skybox) return this.skybox;
    const sky = new pc.Entity('Skybox', this.app);
    // The sky must never block the sun or be shaded by it.
    sky.addComponent('render', { type: 'sphere', castShadows: false, receiveShadows: false });
    const mat = new pc.StandardMaterial();
    mat.cull = pc.CULLFACE_FRONT; // see the inside of the sphere
    mat.diffuse = new pc.Color(0, 0, 0); // scene lights shouldn't tint it
    mat.update();
    sky.render.meshInstances[0].material = mat;
    // Bigger than anything reasonably placed in the scene, smaller than
    // the camera's farClip (500 — see init()) so it doesn't get clipped.
    sky.setLocalScale(300, 300, 300);
    this.app.root.addChild(sky);
    this.skybox = sky;
    return sky;
  }

  /**
   * Loads an image (File/Blob from a file input, or a URL) as the skybox.
   * @param {boolean} flipV - some equirectangular photos come out upside
   *   down through this mapping; flip if so.
   * @param {object|null} assetRef - scene-file asset ref ({ source, id })
   *   for this image, or null for a local file that can't be saved yet.
   */
  setSkyboxImage(source, { flipV = false, assetRef = null } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.app) return reject(new Error('PlayCanvas application not ready'));

      let fileUrl = source;
      let isObjectUrl = false;
      if (source instanceof Blob || source instanceof File) {
        fileUrl = URL.createObjectURL(source);
        isObjectUrl = true;
      }

      this.app.assets.loadFromUrl(fileUrl, 'texture', (err, asset) => {
        if (isObjectUrl) URL.revokeObjectURL(fileUrl);
        if (err || !asset || !asset.resource) {
          console.error('Failed to load skybox image:', err);
          return reject(err instanceof Error ? err : new Error(err || 'Invalid image'));
        }

        const sky = this.createSkyboxEntity();
        const mat = sky.render.meshInstances[0].material;
        // Emissive rather than diffuse: emissive output isn't affected by
        // scene lighting/shadow at all, so the sky reads as a fixed, evenly
        // lit backdrop no matter where the sun is pointed.
        mat.emissiveMap = asset.resource;
        mat.emissive = new pc.Color(1, 1, 1);
        mat.emissiveMapTiling = new pc.Vec2(1, flipV ? -1 : 1);
        mat.update();
        this.environmentState.sky = { type: 'image', asset: assetRef, flipV };
        resolve(sky);
      });
    });
  }

  /**
   * Two-colour vertical gradient, drawn on a small offscreen canvas. Used
   * both for a fixed gradient sky (from an older saved world) and for the
   * automatic sky, which redraws it whenever the time of day changes.
   * `topColor`/`bottomColor` are any CSS colour string.
   */
  drawSkyGradient(topColor, bottomColor) {
    if (!this.app) return null;

    const height = 128;
    if (!this.gradientCanvas) {
      this.gradientCanvas = document.createElement('canvas');
      this.gradientCanvas.width = 2;
      this.gradientCanvas.height = height;
    }
    const ctx = this.gradientCanvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, height);

    if (!this.gradientTexture) {
      this.gradientTexture = new pc.Texture(this.app.graphicsDevice, {
        width: 2,
        height,
        format: pc.PIXELFORMAT_R8_G8_B8_A8
      });
      this.gradientTexture.setSource(this.gradientCanvas);
    } else {
      this.gradientTexture.upload(); // re-send the redrawn canvas to the GPU
    }

    const sky = this.createSkyboxEntity();
    const mat = sky.render.meshInstances[0].material;
    if (mat.emissiveMap !== this.gradientTexture) {
      mat.emissiveMap = this.gradientTexture;
      mat.emissive = new pc.Color(1, 1, 1);
      mat.emissiveMapTiling = new pc.Vec2(1, 1);
      mat.update();
    }
    return sky;
  }

  /** A fixed two-colour sky that doesn't change with the time of day. */
  setSkyboxGradient(topColor = '#4a6fa5', bottomColor = '#dfe9f3') {
    const sky = this.drawSkyGradient(topColor, bottomColor);
    this.environmentState.sky = { type: 'gradient', top: topColor, bottom: bottomColor };
    return sky;
  }

  /**
   * The automatic sky: its colours follow the time of day (see
   * computeSkyColors), redrawn by applyLighting whenever the time changes.
   */
  setDynamicSky() {
    this.environmentState.sky = { type: 'dynamic' };
    this.applyLighting();
  }

  /** Back to the plain clear-color background (see the camera's clearColor). */
  clearSkybox() {
    this.environmentState.sky = { type: 'none' };
    if (!this.skybox) return;
    this.skybox.destroy();
    this.skybox = null;
  }

  // ------------------------------------------------------------------
  // Sun & moon
  //
  // One directional light stands in for whichever of the sun or moon is
  // up (see computeSkyLight for the maths). A small glowing disc is drawn
  // in the sky in the same direction, so children can see where the light
  // and shadows are coming from. Like the skybox, the disc follows the
  // camera's position so it always looks infinitely far away.
  // ------------------------------------------------------------------

  createCelestialEntity() {
    const disc = new pc.Entity('SunMoonDisc', this.app);
    disc.addComponent('render', {
      type: 'sphere',
      castShadows: false,
      receiveShadows: false
    });
    const mat = new pc.StandardMaterial();
    mat.useLighting = false; // a light source shouldn't be shaded itself
    mat.diffuse = new pc.Color(0, 0, 0);
    mat.update();
    disc.render.meshInstances[0].material = mat;
    this.app.root.addChild(disc);
    this.celestial = disc;
  }

  /** @param {number} hours 0–24, e.g. 6.5 for half past six in the morning */
  setTimeOfDay(hours) {
    const t = Number(hours);
    if (!Number.isFinite(t)) return;
    this.environmentState.lighting.timeOfDay = Math.min(Math.max(t, 0), 24);
    this.applyLighting();
  }

  /** Shadows look good but cost frame rate, which matters most on a headset. */
  setShadows(enabled) {
    this.environmentState.lighting.shadows = !!enabled;
    this.applyLighting();
  }

  /** Pushes environmentState.lighting onto the light, ambient, disc and sky. */
  applyLighting() {
    if (!this.app || !this.sun) return;
    const { timeOfDay, shadows } = this.environmentState.lighting;
    const sky = computeSkyLight(timeOfDay);

    // Direction from the scene towards the sun/moon.
    const e = sky.elevation * pc.math.DEG_TO_RAD;
    const a = sky.azimuth * pc.math.DEG_TO_RAD;
    this.celestialDir.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)).normalize();

    // A directional light shines along its entity's -Y axis, so point +Y
    // at the sun: the light then travels from the sun towards the scene.
    const up = pc.Vec3.UP;
    const axis = new pc.Vec3().cross(up, this.celestialDir);
    const angle = Math.acos(pc.math.clamp(up.dot(this.celestialDir), -1, 1)) * pc.math.RAD_TO_DEG;
    const q = axis.lengthSq() < 1e-8 ? new pc.Quat() : new pc.Quat().setFromAxisAngle(axis.normalize(), angle);
    this.sun.setRotation(q);

    this.sun.light.color = new pc.Color(...sky.color);
    this.sun.light.intensity = sky.intensity;
    this.sun.light.castShadows = shadows;
    this.app.scene.ambientLight = new pc.Color(...sky.ambient);

    if (this.environmentState.sky.type === 'dynamic') {
      const { top, bottom } = computeSkyColors(timeOfDay);
      this.drawSkyGradient(top, bottom);
    }

    if (this.celestial) {
      const mat = this.celestial.render.meshInstances[0].material;
      const glow = sky.body === 'sun' ? lerp3([1.0, 0.6, 0.3], [1.0, 0.95, 0.75], smoothstep(15, 35, sky.elevation)) : [0.85, 0.88, 0.95];
      mat.emissive = new pc.Color(...glow);
      mat.update();
      const size = sky.body === 'sun' ? 9 : 6;
      this.celestial.setLocalScale(size, size, size);
      this.updateCelestialPosition();
    }
  }

  /** Keeps the disc a fixed distance from the camera, inside the skybox. */
  updateCelestialPosition() {
    if (!this.celestial || !this.camera) return;
    const p = this.camera.getPosition();
    const d = 120; // skybox radius is 150 (see createSkyboxEntity)
    this.celestial.setPosition(p.x + this.celestialDir.x * d, p.y + this.celestialDir.y * d, p.z + this.celestialDir.z * d);
  }

  // ------------------------------------------------------------------
  // Terrain texturing
  //
  // The ground plane starts as a flat colour (see init()); these swap in a
  // tileable image instead, repeated across the plane rather than
  // stretched once across the whole 60x60 area.
  // ------------------------------------------------------------------

  /**
   * @param {number[]} tiling - [u, v] repeat counts across the ground
   *   plane. Higher = smaller, more repeated tiles.
   * @param {object|null} assetRef - scene-file asset ref, as in setSkyboxImage.
   */
  setTerrainTexture(source, tiling = [10, 10], { assetRef = null } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.app || !this.ground) return reject(new Error('Ground not ready'));

      let fileUrl = source;
      let isObjectUrl = false;
      if (source instanceof Blob || source instanceof File) {
        fileUrl = URL.createObjectURL(source);
        isObjectUrl = true;
      }

      this.app.assets.loadFromUrl(fileUrl, 'texture', (err, asset) => {
        if (isObjectUrl) URL.revokeObjectURL(fileUrl);
        if (err || !asset || !asset.resource) {
          console.error('Failed to load terrain texture:', err);
          return reject(err instanceof Error ? err : new Error(err || 'Invalid image'));
        }

        const texture = asset.resource;
        texture.addressU = pc.ADDRESS_REPEAT;
        texture.addressV = pc.ADDRESS_REPEAT;

        const mat = this.ground.render.meshInstances[0].material;
        mat.diffuseMap = texture;
        mat.diffuse = new pc.Color(1, 1, 1); // let the texture carry the colour
        mat.diffuseMapTiling = new pc.Vec2(tiling[0], tiling[1]);
        mat.update();
        this.environmentState.ground = { type: 'texture', asset: assetRef, tiling: [tiling[0], tiling[1]] };
        resolve(texture);
      });
    });
  }

  /** Back to a flat colour, no image — undoes setTerrainTexture. */
  setTerrainColor(color = DEFAULT_GROUND_COLOR) {
    if (!this.ground) return;
    this.environmentState.ground = { type: 'color', color: rgbToHex(color) };
    const mat = this.ground.render.meshInstances[0].material;
    mat.diffuseMap = null;
    mat.diffuse = new pc.Color(color[0], color[1], color[2]);
    mat.update();
  }

  // ------------------------------------------------------------------
  // Active player (embody a placed object)
  //
  // this.activePlayerId names the entity character movement drives (see
  // stepCharacterMovement); this.playerView says how the camera relates to
  // it — 'normal' leaves the camera alone (independent free-look/orbit,
  // same as when there's no player), 'third-person' chases it,
  // 'first-person' stands inside it. Both are read by updateCamera().
  // ------------------------------------------------------------------

  /** Objects (not environments) that can be picked as the active player. */
  listPlayableEntities() {
    return Array.from(this.entities.entries())
      .filter(([, r]) => r.type !== 'environment')
      .map(([id, r]) => ({ id, name: r.name || id }));
  }

  /**
   * Makes `assetId` the active player: character movement now moves this
   * object instead of the free-look camera. Camera behaviour depends on
   * the current playerView (see setPlayerView).
   */
  setActivePlayer(assetId) {
    if (!this.entities.has(assetId)) return false;
    this.activePlayerId = assetId;
    this.onPlayerChange?.(this.activePlayerId);
    this.updateCamera();
    return true;
  }

  /** Stop controlling any object; movement goes back to the free-look camera. */
  clearActivePlayer() {
    if (!this.activePlayerId) return;
    // Keep the camera exactly where it ended up (e.g. mid-chase-cam)
    // instead of snapping back to wherever the free-look camera was left
    // before player mode started.
    this.insideTarget = this.camera.getPosition().clone();
    this.activePlayerId = null;
    this.onPlayerChange?.(null);
    this.updateCamera();
  }

  /** @param {'normal'|'first-person'|'third-person'} mode */
  setPlayerView(mode) {
    if (!['normal', 'first-person', 'third-person'].includes(mode)) return;
    this.playerView = mode;
    this.updateCamera();
  }

  // ------------------------------------------------------------------
  // Character movement (walk / run)
  // ------------------------------------------------------------------

  /**
   * Merges partial movement input, e.g. { forward: true }. Called by the
   * Controls components on every keydown/keyup rather than once per frame —
   * cheap object writes, no per-frame cost until stepCharacterMovement runs.
   */
  setMoveInput(partial) {
    Object.assign(this.moveInput, partial);
  }

  /**
   * Advances the "standing" position (or, with an active player set, that
   * entity's position — see setActivePlayer) by one frame's worth of
   * WASD/arrow-key input, called every engine tick. Movement is
   * first-person: forward/back/strafe relative to the direction the camera
   * is currently looking, on the horizontal plane only — pitch (looking up/
   * down) is deliberately ignored for the movement direction so tilting the
   * view doesn't make you fly.
   *
   * Pressing a movement key while still orbiting, with no active player and
   * no insideTarget set yet, converts the current orbit view into a
   * standing position at the camera's present location, so "walk" works
   * immediately rather than requiring viewFromCenter() first.
   */
  stepCharacterMovement(dt) {
    if (this.isInVR()) return; // VR moves by teleport instead
    const input = this.moveInput;
    const isMoving = input.forward || input.backward || input.left || input.right;
    if (!isMoving) return;

    const yaw = this.orbit.yaw * pc.math.DEG_TO_RAD;
    // Same yaw convention as updateCamera()'s `dir`, but with pitch fixed at
    // 0 (horizontal-only). `dir` there points from the look-at point back to
    // the camera, so the direction you're actually facing is its negation.
    const facing = new pc.Vec3(-Math.sin(yaw), 0, -Math.cos(yaw));
    // Right-hand "right" vector for a Y-up world: cross(facing, up).
    const right = new pc.Vec3(-facing.z, 0, facing.x);

    const move = new pc.Vec3();
    if (input.forward) move.add(facing);
    if (input.backward) move.sub(facing);
    if (input.right) move.add(right);
    if (input.left) move.sub(right);

    if (move.lengthSq() === 0) return;

    const speed = input.running ? this.runSpeed : this.walkSpeed;
    move.normalize().mulScalar(speed * dt);

    const playerRecord = this.activePlayerId && this.entities.get(this.activePlayerId);
    if (playerRecord) {
      // An active player is driven directly, keeping its current height
      // (no flying/sinking) — camera-relative movement either way, same
      // feel as free-look walking. resolveMove stops it short of (or slides
      // it along) any other placed object instead of passing through —
      // excludeId is itself, so it never collides with its own box.
      const p = playerRecord.entity.getPosition();
      const next = this.resolveMove(p.x, p.z, move, this.activePlayerId);
      playerRecord.entity.setPosition(next.x, p.y, next.z);
      this.emitTransform(this.activePlayerId);
      this.updateCamera(); // re-centre the chase/first-person camera
      return;
    }

    if (!this.insideTarget) {
      const p = this.camera.getPosition();
      this.insideTarget = new pc.Vec3(p.x, p.y, p.z);
    }
    // No entity to exclude here — the free-look "standing" viewpoint isn't
    // one of the placed objects, so it's tested against all of them.
    const next = this.resolveMove(this.insideTarget.x, this.insideTarget.z, move, null);
    this.insideTarget.x = next.x;
    this.insideTarget.z = next.z;
    this.updateCamera();
  }

  // ------------------------------------------------------------------
  // Collision (lightweight, horizontal-only — no physics engine)
  //
  // The character is treated as a vertical cylinder of radius
  // characterRadius and tested against every other placed object's world
  // AABB on the x/z plane only; height is ignored. That's a deliberate
  // simplification (a real body could duck under a low shelf, or walk
  // under something floating overhead) but it's enough to stop the
  // reported "you can currently walk through a placed object" bug without
  // a physics body. Environments are never obstacles — they're the
  // walkable world itself, not something placed *in* it.
  // ------------------------------------------------------------------

  /** World AABBs of every placed object other than `excludeId`. */
  getObstacleBoxes(excludeId) {
    const boxes = [];
    this.entities.forEach((record, id) => {
      if (id === excludeId || record.type === 'environment') return;
      const box = this.getWorldAabb(record.entity);
      if (box) boxes.push(box);
    });
    return boxes;
  }

  /** True if a circle at (cx, cz) with the given radius overlaps `box` on x/z. */
  circleHitsBox(cx, cz, radius, box) {
    const minX = box.center.x - box.halfExtents.x;
    const maxX = box.center.x + box.halfExtents.x;
    const minZ = box.center.z - box.halfExtents.z;
    const maxZ = box.center.z + box.halfExtents.z;
    const nearestX = pc.math.clamp(cx, minX, maxX);
    const nearestZ = pc.math.clamp(cz, minZ, maxZ);
    const dx = cx - nearestX;
    const dz = cz - nearestZ;
    return dx * dx + dz * dz < radius * radius;
  }

  /** True if a character circle at (x, z) would overlap any obstacle. */
  isPositionBlocked(x, z, excludeId, radius = this.characterRadius) {
    return this.getObstacleBoxes(excludeId).some((box) =>
      this.circleHitsBox(x, z, radius, box)
    );
  }

  /**
   * Applies a horizontal `move` from (fromX, fromZ), stopping short of
   * obstacles instead of passing through them. Tries the full move first,
   * then each axis alone — walking into a wall at an angle slides you
   * along it instead of just stopping dead — and falls back to staying put
   * if even that's blocked (e.g. wedged in a corner).
   */
  resolveMove(fromX, fromZ, move, excludeId) {
    const tryPos = (x, z) =>
      this.isPositionBlocked(x, z, excludeId) ? null : { x, z };
    return (
      tryPos(fromX + move.x, fromZ + move.z) ||
      tryPos(fromX + move.x, fromZ) ||
      tryPos(fromX, fromZ + move.z) || { x: fromX, z: fromZ }
    );
  }

  /**
   * If `assetId` overlaps another placed object, nudges it directly away
   * from the nearest offending object's centre (x/z only) in grid-sized
   * steps until clear, up to `maxTries`. Called after a non-environment
   * asset is loaded/placed, so click-to-add and drag-drop can't stack two
   * objects on top of each other. Best-effort: in a crowded corner it may
   * exhaust its tries and leave a small overlap rather than shove the
   * object arbitrarily far from where the user dropped it.
   */
  resolveObjectOverlap(assetId, maxTries = 12) {
    const record = this.entities.get(assetId);
    if (!record || record.type === 'environment') return;

    for (let i = 0; i < maxTries; i++) {
      const box = this.getWorldAabb(record.entity);
      if (!box) return;
      const hit = this.getObstacleBoxes(assetId).find((o) =>
        this.boxesOverlap2D(box, o)
      );
      if (!hit) return;

      const p = record.entity.getPosition();
      let dx = box.center.x - hit.center.x;
      let dz = box.center.z - hit.center.z;
      if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) dx = 1; // exactly stacked
      const len = Math.hypot(dx, dz);
      // Step outward by roughly one grid cell or the object's own footprint,
      // whichever is bigger, rather than computing the exact penetration
      // depth — cheaper, and a couple of extra tries costs nothing here.
      const step = Math.max(GRID_SIZE, box.halfExtents.x, box.halfExtents.z);
      const snapped = this.snapToGrid(p.x + (dx / len) * step, p.z + (dz / len) * step);
      record.entity.setPosition(snapped.x, p.y, snapped.z);
    }
  }

  /** AABB overlap test on x/z only (ignores height, like the rest of this section). */
  boxesOverlap2D(a, b) {
    return (
      Math.abs(a.center.x - b.center.x) < a.halfExtents.x + b.halfExtents.x &&
      Math.abs(a.center.z - b.center.z) < a.halfExtents.z + b.halfExtents.z
    );
  }

  // ------------------------------------------------------------------
  // Interaction (proximity + "E" key)
  //
  // Any entity can be marked with setInteractable({ label, action }).
  // Every frame, updateInteractionPrompt() finds the nearest interactable
  // within interactRadius of wherever the character currently is (reusing
  // getCharacterPosition, the same position stepCharacterMovement drives)
  // and reports it via onInteractionPromptChange so the UI can show a
  // "Press E to <label>" hint. Pressing E calls triggerInteraction(), which
  // passes that entity's action (plain data, so it can be saved) to the
  // handler set with setInteractionHandler — what actually happens is up to
  // the app; the engine only handles "is the character close enough, and
  // did they press the button".
  // ------------------------------------------------------------------

  /**
   * Mark `assetId` as something the character can interact with up close.
   * `action` is plain data (e.g. { type: 'message', text: 'Hi!' }) so it can
   * be saved; what each action type does is up to setInteractionHandler.
   */
  setInteractable(assetId, { label = 'Interact', action = null } = {}) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    record.interactable = { label, action };
    return true;
  }

  /** fn(entityId, action) runs when the player presses E near an interactable. */
  setInteractionHandler(fn) {
    this.interactionHandler = fn;
  }

  /** Remove the interactable marking (e.g. a "used up" object). */
  clearInteractable(assetId) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    record.interactable = null;
    return true;
  }

  /**
   * Where "the character" is, for both collision and interaction: the
   * active player entity if there is one, otherwise the free-look
   * "standing" point — same source stepCharacterMovement reads/writes.
   */
  getCharacterPosition() {
    const playerRecord = this.activePlayerId && this.entities.get(this.activePlayerId);
    if (playerRecord) return playerRecord.entity.getPosition();
    return this.insideTarget || this.camera.getPosition();
  }

  /** Called once per frame from the update loop. */
  updateInteractionPrompt() {
    const pos = this.getCharacterPosition();
    let nearestId = null;
    let nearestDist = this.interactRadius;

    this.entities.forEach((record, id) => {
      // Can't interact with whatever you're currently embodying.
      if (!record.interactable || id === this.activePlayerId) return;
      const box = this.getWorldAabb(record.entity);
      const center = box ? box.center : record.entity.getPosition();
      const dist = Math.hypot(pos.x - center.x, pos.z - center.z);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestId = id;
      }
    });

    if (nearestId === this.activeInteractableId) return;
    this.activeInteractableId = nearestId;
    if (!this.onInteractionPromptChange) return;
    const record = nearestId && this.entities.get(nearestId);
    this.onInteractionPromptChange(
      record ? { id: nearestId, label: record.interactable.label } : null
    );
  }

  /** Fires the nearest in-range interactable's callback, if any. */
  triggerInteraction() {
    if (!this.activeInteractableId) return false;
    const record = this.entities.get(this.activeInteractableId);
    if (!record?.interactable) return false;
    this.interactionHandler?.(this.activeInteractableId, record.interactable.action);
    return true;
  }

  /**
   * "E" is the interact key. Guarded against firing while the user is
   * typing in some unrelated text input elsewhere on the page (name
   * fields, URL box, etc. in AssetLibraryPanel), same idea as any keyboard
   * shortcut living alongside real form fields.
   */
  attachInteractionKey() {
    this.onInteractKeyDown = (e) => {
      if (e.code !== 'KeyE') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      this.triggerInteraction();
    };
    window.addEventListener('keydown', this.onInteractKeyDown);
  }

  // ------------------------------------------------------------------
  // Pointer: pick / drag / rotate / orbit
  // ------------------------------------------------------------------

  attachPointerHandlers() {
    this.onContextMenu = (e) => e.preventDefault();

    this.onPointerDown = (e) => {
      const { x, y } = this.canvasCoords(e);
      this.pointer.down = true;
      this.pointer.moved = false;
      this.pointer.lastX = e.clientX;
      this.pointer.lastY = e.clientY;

      // The viewer never selects: every drag just looks around.
      const hitId = this.readOnly ? null : this.pickEntityAt(x, y);

      if (hitId) {
        this.selectEntity(hitId);
        // Right-click or Shift+drag on an object rotates it; plain drag moves it.
        const wantsRotate = e.button === 2 || e.shiftKey;
        this.pointer.mode = wantsRotate ? 'rotate' : 'drag';
        // No drag-offset tracking here: grid snapping means the object's
        // centre jumps to whichever cell is under the cursor, rather than
        // preserving the exact pixel you grabbed — same feel as placing a
        // block, and one less thing to explain to a young user.
      } else {
        this.pointer.mode = 'orbit';
      }
      this.canvas.setPointerCapture?.(e.pointerId);
    };

    this.onPointerMove = (e) => {
      if (!this.pointer.down) return;
      const dx = e.clientX - this.pointer.lastX;
      const dy = e.clientY - this.pointer.lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.pointer.moved = true;
      this.pointer.lastX = e.clientX;
      this.pointer.lastY = e.clientY;

      if (this.pointer.mode === 'orbit') {
        this.orbit.yaw -= dx * 0.4;
        this.orbit.pitch = pc.math.clamp(this.orbit.pitch - dy * 0.3, -85, 20);
        this.updateCamera();
      } else if (this.pointer.mode === 'rotate' && this.selectedId) {
        // Horizontal drag spins around Y (the usual "turn it round"),
        // vertical drag tips it around X.
        const record = this.entities.get(this.selectedId);
        if (!record) return;
        const rot = record.rotation;
        this.setEntityRotation(this.selectedId, [
          rot[0] + dy * 0.6,
          rot[1] + dx * 0.6,
          rot[2]
        ]);
      } else if (this.pointer.mode === 'drag' && this.selectedId) {
        const record = this.entities.get(this.selectedId);
        if (!record) return;
        const { x, y } = this.canvasCoords(e);
        const currentY = record.entity.getPosition().y;
        const ground = this.screenToPlane(x, y, currentY);
        if (!ground) return;
        const snapped = this.snapToGrid(ground.x, ground.z);
        record.entity.setPosition(snapped.x, currentY, snapped.z);
        this.emitTransform(this.selectedId);
      }
    };

    this.onPointerUp = (e) => {
      if (this.pointer.mode === 'orbit' && !this.pointer.moved && !this.readOnly) {
        this.selectEntity(null);
      }
      this.pointer.down = false;
      this.pointer.mode = null;
      this.canvas.releasePointerCapture?.(e.pointerId);
    };

    this.onWheel = (e) => {
      e.preventDefault();
      // Shift accelerates further. Trackpads send many small deltas and mice
      // send few large ones; the multiplicative curve handles both.
      this.zoomBy(e.deltaY, e.shiftKey ? 0.009 : 0.0035);
    };

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  canvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  buildRay(x, y) {
    const cam = this.camera.camera;
    const near = cam.screenToWorld(x, y, cam.nearClip);
    const far = cam.screenToWorld(x, y, cam.farClip);
    const dir = far.clone().sub(near).normalize();
    return new pc.Ray(near, dir);
  }

  screenToPlane(x, y, planeY = 0) {
    const cam = this.camera.camera;
    const near = cam.screenToWorld(x, y, cam.nearClip);
    const far = cam.screenToWorld(x, y, cam.farClip);
    const dir = far.clone().sub(near);
    if (Math.abs(dir.y) < 1e-6) return null;
    const t = (planeY - near.y) / dir.y;
    if (t < 0) return null;
    return new pc.Vec3(near.x + dir.x * t, planeY, near.z + dir.z * t);
  }

  /**
   * Snaps x/z to the nearest grid cell. Used for placement and dragging —
   * never for character/player movement, which stays smooth (see
   * stepCharacterMovement).
   */
  snapToGrid(x, z) {
    return {
      x: Math.round(x / GRID_SIZE) * GRID_SIZE,
      z: Math.round(z / GRID_SIZE) * GRID_SIZE
    };
  }

  getWorldAabb(entity) {
    const renders = entity.findComponents('render');
    let box = null;
    renders.forEach((render) => {
      render.meshInstances.forEach((mi) => {
        if (!box) box = mi.aabb.clone();
        else box.add(mi.aabb);
      });
    });
    return box;
  }

  /**
   * Ray/AABB picking — fast, dependency-free, accurate enough for placement.
   * The box is axis-aligned, so a heavily rotated object has a looser
   * clickable area than its visible shape. Swap for pc.Picker if that turns
   * out to bother users in testing.
   */
  pickEntityAt(x, y) {
    const ray = this.buildRay(x, y);
    let bestId = null;
    let bestDist = Infinity;

    this.entities.forEach((record, id) => {
      const box = this.getWorldAabb(record.entity);
      if (!box) return;
      const hitPoint = new pc.Vec3();
      if (box.intersectsRay(ray, hitPoint)) {
        const dist = hitPoint.distance(ray.origin);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = id;
        }
      }
    });

    return bestId;
  }

  drawSelectionOutline() {
    if (!this.selectedId || !this.app) return;
    const record = this.entities.get(this.selectedId);
    if (!record) return;
    const box = this.getWorldAabb(record.entity);
    if (!box) return;

    // app.drawWireAlignedBox was removed in PlayCanvas 2.x; the scene's
    // immediate renderer still has it.
    const scene = this.app.scene;
    const min = new pc.Vec3().copy(box.center).sub(box.halfExtents);
    const max = new pc.Vec3().copy(box.center).add(box.halfExtents);
    scene.immediate.drawWireAlignedBox(min, max, SELECTION_COLOR, true, scene.defaultDrawLayer, null);
  }

  // ------------------------------------------------------------------
  // Selection + transform API
  // ------------------------------------------------------------------

  selectEntity(assetId) {
    if (this.selectedId === assetId) return;
    this.selectedId = assetId;
    this.onSelectionChange?.(assetId ? this.getTransform(assetId) : null);
  }

  getTransform(assetId) {
    const record = this.entities.get(assetId);
    if (!record) return null;
    const p = record.entity.getPosition();
    return {
      id: assetId,
      position: [p.x, p.y, p.z],
      rotation: [...record.rotation],
      scaleLevel: record.scaleLevel,
      // Multiplier relative to imported size — what the UI displays
      scaleFactor: levelToFactor(record.scaleLevel),
      // Absolute world scale, mostly useful for debugging
      worldScale: record.baseScale * levelToFactor(record.scaleLevel),
      // Label only; the UI just needs to know whether this selection
      // currently has an interaction and what it's called.
      interactable: record.interactable ? { label: record.interactable.label } : null
    };
  }

  emitTransform(assetId) {
    if (!this.onTransformChange) return;
    const t = this.getTransform(assetId);
    if (t) this.onTransformChange(t);
  }

  /**
   * Sets a placed object's position, snapping x/z to the grid. This is the
   * TransformPanel-driven path (slider/number input), so it needs the same
   * snap the canvas drag gets — otherwise a slider could place an object
   * off-grid in a way dragging it in the viewport never could.
   */
  setEntityPosition(assetId, position) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    const [x, y, z] = position;
    const snapped = this.snapToGrid(x, z);
    record.entity.setPosition(snapped.x, y, snapped.z);
    this.emitTransform(assetId);
    return true;
  }

  /** @param {number[]} rotation euler degrees [x, y, z] */
  setEntityRotation(assetId, rotation) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    const norm = (deg) => ((deg % 360) + 360) % 360;
    record.rotation = [norm(rotation[0]), norm(rotation[1]), norm(rotation[2])];
    const q = new pc.Quat().setFromEulerAngles(
      record.rotation[0],
      record.rotation[1],
      record.rotation[2]
    );
    // User rotation on top of the model's own (see loadGlbAsset).
    record.entity.setLocalRotation(q.mul(record.baseRotation));
    this.emitTransform(assetId);
    return true;
  }

  /** Spin around a single axis without disturbing the other two. */
  rotateAxis(assetId, axis, degrees) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    const idx = { x: 0, y: 1, z: 2 }[axis];
    if (idx === undefined) return false;
    const next = [...record.rotation];
    next[idx] += degrees;
    return this.setEntityRotation(assetId, next);
  }

  /** Set scale via the -100..100 proportional level. */
  setEntityScaleLevel(assetId, level) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    record.scaleLevel = pc.math.clamp(level, -100, 100);
    const s = record.baseScale * levelToFactor(record.scaleLevel);
    record.entity.setLocalScale(s, s, s);
    this.emitTransform(assetId);
    return true;
  }

  /** Nudge the scale by a number of levels — for +/- buttons. */
  nudgeScale(assetId, deltaLevels) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    return this.setEntityScaleLevel(assetId, record.scaleLevel + deltaLevels);
  }

  /** Rest the object's base on the ground plane at its current size. */
  dropToGround(assetId) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    const box = this.getWorldAabb(record.entity);
    if (!box) return false;
    const bottom = box.center.y - box.halfExtents.y;
    const p = record.entity.getPosition();
    record.entity.setPosition(p.x, p.y - bottom, p.z);
    this.emitTransform(assetId);
    return true;
  }

  getEntity(assetId) {
    return this.entities.get(assetId)?.entity;
  }

  removeEntity(assetId) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    record.entity.destroy();
    this.entities.delete(assetId);
    if (this.selectedId === assetId) this.selectEntity(null);
    if (this.activePlayerId === assetId) this.clearActivePlayer();
    return true;
  }

  listEntities() {
    return Array.from(this.entities.keys());
  }

  // ------------------------------------------------------------------
  // Asset loading
  // ------------------------------------------------------------------

  /**
   * @param {object} options
   * @param {number} options.targetSize - largest-dimension target in world
   *   units after normalisation (see normaliseAndGround). Small placed
   *   objects want ~1.5; a scene-filling environment wants something much
   *   larger (or pass 0 to skip normalisation entirely and use the model's
   *   authored scale as-is).
   * @param {boolean} options.autoSelect - whether the new entity becomes the
   *   active selection (and so appears in TransformPanel) immediately after
   *   loading. Usually wanted for a placed object, usually not for a
   *   just-dropped environment.
   * @param {string} options.name - display name, used by the active-player
   *   picker (listPlayableEntities). Defaults to assetId if not given.
   * @param {string} options.type - 'object' | 'environment'. Environments
   *   are excluded from the active-player picker.
   */
  loadGlbAsset(assetId, source, position = [0, 0, 0], options = {}) {
    const {
      targetSize = 1.5,
      autoSelect = true,
      name = assetId,
      type = 'object',
      // Scene-file asset ref ({ source, id }), or null for a model that
      // came from the user's computer and can't be saved yet.
      assetRef = null,
      // true when restoring a saved scene: use the saved position as-is,
      // with no grid snapping, re-scaling, dropping or overlap nudging.
      exact = false
    } = options;
    return new Promise((resolve, reject) => {
      if (!this.app) return reject(new Error('PlayCanvas application not ready'));

      let fileUrl = source;
      let isObjectUrl = false;

      if (source instanceof Blob || source instanceof File) {
        fileUrl = URL.createObjectURL(source);
        isObjectUrl = true;
      }

      this.app.assets.loadFromUrl(fileUrl, 'container', (err, asset) => {
        if (isObjectUrl) URL.revokeObjectURL(fileUrl);

        if (err || !asset || !asset.resource) {
          console.error('Failed to load 3D model container:', err);
          return reject(
            err instanceof Error ? err : new Error(err || 'Invalid container resource')
          );
        }

        const entity = asset.resource.instantiateRenderEntity();
        if (!entity) {
          return reject(new Error('Failed to instantiate entity from 3D model'));
        }

        const [x, y, z] = position;
        if (exact) {
          entity.setPosition(x, y, z);
        } else {
          const snapped = this.snapToGrid(x, z);
          entity.setPosition(snapped.x, y, snapped.z);
        }
        this.app.root.addChild(entity);

        // Many models (Sketchfab exports especially) have a rotation and
        // scale on their root node that makes them stand upright at the
        // right size. User rotation/scale are applied on top of these,
        // never instead of them.
        const baseRotation = entity.getLocalRotation().clone();
        const intrinsicScale = entity.getLocalScale().x || 1;

        this.entities.set(assetId, {
          entity,
          baseRotation,
          baseScale: intrinsicScale,
          scaleLevel: 0,
          rotation: [0, 0, 0],
          name,
          type,
          assetRef,
          interactable: null
        });

        if (exact) {
          if (autoSelect) this.selectEntity(assetId);
          return resolve(entity);
        }

        if (targetSize > 0) {
          this.normaliseAndGround(assetId, targetSize);
        } else {
          this.dropToGround(assetId);
        }
        // Only for placed objects — an environment is meant to surround
        // everything else, so "overlapping" is the normal case for it.
        if (type !== 'environment') this.resolveObjectOverlap(assetId);
        if (autoSelect) this.selectEntity(assetId);
        resolve(entity);
      });
    });
  }

  /**
   * Scales the model so its largest dimension is ~1.5 units and sits on the
   * ground. Text-to-3D output has no consistent unit convention, so raw
   * imports arrive as either a speck or a skyscraper. The result becomes the
   * object's `baseScale`, i.e. scale level 0.
   */
  normaliseAndGround(assetId, targetSize = 1.5) {
    const record = this.entities.get(assetId);
    if (!record) return;

    const box = this.getWorldAabb(record.entity);
    if (!box) return;

    const largest = Math.max(
      box.halfExtents.x * 2,
      box.halfExtents.y * 2,
      box.halfExtents.z * 2
    );
    if (largest > 0) {
      // `largest` was measured at the current scale, so scale relative to it.
      record.baseScale = record.baseScale * (targetSize / largest);
      record.scaleLevel = 0;
      const s = record.baseScale;
      record.entity.setLocalScale(s, s, s);
    }

    this.dropToGround(assetId);
  }

  // ------------------------------------------------------------------
  // XR
  // ------------------------------------------------------------------

  /**
   * Creates the VR camera rig and teleport marker, and listens for the
   * headset session starting and ending. Called once from init().
   *
   * How VR movement works:
   * - The headset sets the camera's *local* position/rotation every frame.
   *   PlayCanvas treats the camera's parent as the play space, so we park
   *   the camera under xrRig and move the rig to move the player.
   * - Teleport: point a controller at the floor and hold the trigger (or
   *   push the thumbstick forward), release to jump there.
   * - Snap turn: push the thumbstick left/right to turn 30°.
   */
  setupXR() {
    const xr = this.app.xr;
    if (!xr) return;

    this.xrRig = new pc.Entity('XRRig', this.app);
    this.app.root.addChild(this.xrRig);

    // Flat glowing disc that shows where you'll land. Unlit so it's easy
    // to see at night, and it never casts a shadow.
    this.teleportMarker = new pc.Entity('TeleportMarker', this.app);
    this.teleportMarker.addComponent('render', {
      type: 'cylinder',
      castShadows: false,
      receiveShadows: false
    });
    this.teleportMarkerMat = new pc.StandardMaterial();
    this.teleportMarkerMat.useLighting = false;
    this.teleportMarkerMat.emissive = new pc.Color(0.35, 0.8, 1);
    this.teleportMarkerMat.diffuse = new pc.Color(0, 0, 0);
    this.teleportMarkerMat.opacity = 0.75;
    this.teleportMarkerMat.blendType = pc.BLEND_NORMAL;
    this.teleportMarkerMat.update();
    this.teleportMarker.render.meshInstances[0].material = this.teleportMarkerMat;
    this.teleportMarker.setLocalScale(0.7, 0.02, 0.7);
    this.teleportMarker.enabled = false;
    this.app.root.addChild(this.teleportMarker);

    this.onXRStart = () => this.handleXRStart();
    this.onXREnd = () => this.handleXREnd();
    this.onXRAvailable = () => this.onXRChange?.({ inVR: this.isInVR(), available: this.isVRAvailable() });
    xr.on('start', this.onXRStart);
    xr.on('end', this.onXREnd);
    xr.on('available', this.onXRAvailable);

    // Trigger held = aiming, trigger released = jump.
    this.onXRSelectStart = (inputSource) => {
      if (inputSource.targetRayMode !== pc.XRTARGETRAY_POINTER) return;
      this.xrState.aiming = inputSource;
      this.xrState.aimingBy = 'trigger';
    };
    this.onXRSelectEnd = (inputSource) => {
      if (this.xrState.aiming !== inputSource || this.xrState.aimingBy !== 'trigger') return;
      this.finishTeleport();
    };
    xr.input.on('selectstart', this.onXRSelectStart);
    xr.input.on('selectend', this.onXRSelectEnd);
  }

  /**
   * True while a headset session is running. Tracked with our own flag
   * rather than app.xr.active, which is still true while the 'end' event
   * runs — handleXREnd needs updateCamera() to work again by then.
   */
  isInVR() {
    return this.inVR;
  }

  isVRAvailable() {
    return !!(this.app && this.app.xr && this.app.xr.isAvailable(pc.XRTYPE_VR));
  }

  /**
   * Starts a headset session. Must be called from a click/tap handler —
   * browsers refuse to start VR otherwise.
   * @returns {boolean} false if VR isn't available here.
   */
  enterVR() {
    const cameraComponent = this.camera?.camera;
    if (!this.app || !cameraComponent) return false;
    if (!this.isVRAvailable()) return false;

    // LOCALFLOOR puts the origin at floor level, so objects placed at y = 0
    // appear on the ground rather than at head height.
    this.app.xr.start(cameraComponent, pc.XRTYPE_VR, pc.XRSPACE_LOCALFLOOR, {
      callback: (err) => {
        if (err) {
          console.error('Failed to start XR session:', err);
          this.onXRChange?.({ inVR: false, available: this.isVRAvailable(), error: err.message || String(err) });
        }
      }
    });
    return true;
  }

  exitVR() {
    if (this.isInVR()) this.app.xr.end();
  }

  /**
   * Where you stand when the headset goes on: on the world's player object
   * if it has one (the object is hidden so you're not standing inside it),
   * otherwise under the desktop camera. Either way you face the same way
   * the desktop camera was facing.
   */
  getVRStartPose() {
    const yaw = this.orbit.yaw;
    const record = this.activePlayerId && this.entities.get(this.activePlayerId);
    if (record) {
      const box = this.getWorldAabb(record.entity);
      const p = box ? box.center : record.entity.getPosition();
      return { x: p.x, z: p.z, yaw, hideId: this.activePlayerId };
    }
    const p = this.camera.getPosition();
    return { x: p.x, z: p.z, yaw, hideId: null };
  }

  handleXRStart() {
    const pose = this.getVRStartPose();
    this.inVR = true;

    this.xrRig.setPosition(pose.x, 0, pose.z);
    this.xrRig.setEulerAngles(0, pose.yaw, 0);
    this.camera.reparent(this.xrRig);
    this.camera.setLocalPosition(0, 0, 0);
    this.camera.setLocalRotation(pc.Quat.IDENTITY);

    this.xrHiddenId = pose.hideId;
    this.xrStartPoint = { x: pose.x, z: pose.z };
    if (pose.hideId) this.entities.get(pose.hideId).entity.enabled = false;

    // The selection box would follow you around the world otherwise.
    this.selectEntity(null);
    this.resetTeleportAim();
    this.onXRChange?.({ inVR: true, available: true });
  }

  handleXREnd() {
    // Back to the desktop camera, standing where the headset last was.
    const head = this.camera.getPosition().clone();
    const forward = this.camera.forward.clone();
    this.inVR = false;
    this.camera.reparent(this.app.root);

    if (this.xrHiddenId && this.entities.has(this.xrHiddenId)) {
      // You were the character in VR, so it ends up where you ended up.
      const entity = this.entities.get(this.xrHiddenId).entity;
      const p = entity.getPosition();
      entity.setPosition(
        p.x + (head.x - this.xrStartPoint.x),
        p.y,
        p.z + (head.z - this.xrStartPoint.z)
      );
      entity.enabled = true;
    }
    this.xrHiddenId = null;
    this.resetTeleportAim();

    if (!this.activePlayerId) {
      this.insideTarget = new pc.Vec3(head.x, Math.max(head.y, 1.6), head.z);
      // yaw convention: facing = (-sin yaw, 0, -cos yaw)
      this.orbit.yaw = Math.atan2(-forward.x, -forward.z) * pc.math.RAD_TO_DEG;
      this.orbit.pitch = 0;
    }
    this.updateCamera();
    this.onXRChange?.({ inVR: false, available: this.isVRAvailable() });
  }

  resetTeleportAim() {
    this.xrState.aiming = null;
    this.xrState.aimingBy = null;
    this.xrState.target = null;
    this.xrState.targetValid = false;
    if (this.teleportMarker) this.teleportMarker.enabled = false;
  }

  /**
   * Follows a controller's pointing ray to the floor (y = 0). Returns where
   * it lands and whether you're allowed to stand there: not too far away,
   * not inside a placed object, and not through one.
   */
  castTeleportRay(inputSource) {
    const origin = inputSource.getOrigin();
    const dir = inputSource.getDirection();
    const head = this.camera.getPosition();

    let hitT = Infinity;
    let valid = false;
    if (dir.y < -0.02) {
      hitT = -origin.y / dir.y;
      const x = origin.x + dir.x * hitT;
      const z = origin.z + dir.z * hitT;
      const dx = x - head.x;
      const dz = z - head.z;
      valid = dx * dx + dz * dz <= this.teleportRange * this.teleportRange;
    }

    // Stop the ray at the first object in the way.
    const ray = new pc.Ray(origin, dir);
    const hitPoint = new pc.Vec3();
    this.getObstacleBoxes(this.xrHiddenId).forEach((box) => {
      if (box.intersectsRay(ray, hitPoint)) {
        const t = hitPoint.distance(origin);
        if (t < hitT) {
          hitT = t;
          valid = false;
        }
      }
    });

    const length = Number.isFinite(hitT) ? hitT : 4;
    const end = new pc.Vec3().copy(dir).mulScalar(length).add(origin);
    if (valid && this.isPositionBlocked(end.x, end.z, this.xrHiddenId)) valid = false;
    return { end, onFloor: Number.isFinite(hitT) && end.y < 0.01, valid };
  }

  /** Per-frame VR work: pointer rays, teleport aiming and snap turning. */
  updateXR() {
    if (!this.isInVR()) return;
    const state = this.xrState;

    this.app.xr.input.inputSources.forEach((src) => {
      if (src.targetRayMode !== pc.XRTARGETRAY_POINTER) return;
      const axes = src.gamepad?.axes || [];
      const stickX = axes[pc.XRPAD_STICK_X] || 0;
      const stickY = axes[pc.XRPAD_STICK_Y] || 0;

      // Snap turn: fire once when pushed past 0.7, then wait for the stick
      // to come back to the middle before turning again.
      const armed = state.turnArmed.get(src) !== false;
      if (armed && Math.abs(stickX) > 0.7 && Math.abs(stickX) > Math.abs(stickY)) {
        this.snapTurn(stickX > 0 ? -this.snapTurnDegrees : this.snapTurnDegrees);
        state.turnArmed.set(src, false);
      } else if (!armed && Math.abs(stickX) < 0.3) {
        state.turnArmed.set(src, true);
      }

      // Stick forward = aim, let go = jump (the trigger works too).
      if (!state.aiming && stickY < -0.7) {
        state.aiming = src;
        state.aimingBy = 'stick';
      } else if (state.aiming === src && state.aimingBy === 'stick' && stickY > -0.3) {
        this.finishTeleport();
      }

      // Every controller shows a short white ray; the aiming one shows the
      // full ray, blue where you can land and red where you can't.
      if (state.aiming === src) {
        const hit = this.castTeleportRay(src);
        state.target = hit.end;
        state.targetValid = hit.valid;
        this.app.drawLine(src.getOrigin(), hit.end, hit.valid ? RAY_COLOR_OK : RAY_COLOR_BAD, false);
        if (hit.onFloor) {
          this.teleportMarker.enabled = true;
          this.teleportMarker.setPosition(hit.end.x, 0.01, hit.end.z);
          this.teleportMarkerMat.emissive = hit.valid ? RAY_COLOR_OK : RAY_COLOR_BAD;
          this.teleportMarkerMat.update();
        } else {
          this.teleportMarker.enabled = false;
        }
      } else {
        const end = new pc.Vec3().copy(src.getDirection()).mulScalar(0.5).add(src.getOrigin());
        this.app.drawLine(src.getOrigin(), end, RAY_COLOR_IDLE, false);
      }
    });

    // Controller unplugged / switched to hands mid-aim.
    if (state.aiming && !this.app.xr.input.inputSources.includes(state.aiming)) {
      this.resetTeleportAim();
    }
  }

  finishTeleport() {
    const { target, targetValid } = this.xrState;
    if (target && targetValid) this.teleportTo(target.x, target.z);
    this.resetTeleportAim();
  }

  /**
   * Moves the play space so your head ends up above (x, z). The rig moves
   * by the head's offset, not to (x, z) itself, because you may have
   * walked around inside your real room.
   */
  teleportTo(x, z) {
    if (!this.isInVR()) return;
    const head = this.camera.getPosition();
    const rig = this.xrRig.getPosition();
    this.xrRig.setPosition(rig.x + (x - head.x), 0, rig.z + (z - head.z));
  }

  /** Turns the play space around your head (positive = left). */
  snapTurn(degrees) {
    if (!this.isInVR()) return;
    const head = this.camera.getPosition().clone();
    const rig = this.xrRig.getPosition().clone();
    const turn = new pc.Quat().setFromEulerAngles(0, degrees, 0);

    // Rotate the rig's offset from the head, so the head stays put.
    const offset = new pc.Vec3().sub2(rig, head);
    turn.transformVector(offset, offset);
    this.xrRig.setPosition(head.x + offset.x, 0, head.z + offset.z);
    this.xrRig.setRotation(new pc.Quat().mul2(turn, this.xrRig.getRotation()));
  }

  // ------------------------------------------------------------------
  // Scene save / load
  //
  // The scene file format lives in shared/scene/scene.schema.json. Assets
  // are saved as { source, id } refs, never URLs; the caller supplies a
  // resolveAssetUrl(ref) function to turn a ref back into a loadable URL.
  // ------------------------------------------------------------------

  /**
   * Builds a scene document from what's currently in the world.
   * @returns {{ scene: object, warnings: string[] }} warnings list anything
   *   that was left out (e.g. models uploaded from this computer).
   */
  serializeScene({ title } = {}) {
    const warnings = [];
    const entities = [];

    this.entities.forEach((record, id) => {
      const name = (record.name || id).slice(0, 60);
      if (!record.assetRef) {
        warnings.push(`"${name}" was added from this computer, so it can't be saved yet.`);
        return;
      }
      const p = record.entity.getPosition();
      const interactable = record.interactable;
      entities.push({
        id,
        name,
        type: record.type === 'environment' ? 'environment' : 'object',
        asset: { ...record.assetRef },
        position: [round4(p.x), round4(p.y), round4(p.z)],
        rotation: record.rotation.map(round4),
        baseScale: record.baseScale,
        scaleLevel: round4(record.scaleLevel),
        interaction:
          interactable && interactable.action && record.type !== 'environment'
            ? { label: interactable.label, action: { ...interactable.action } }
            : null
      });
    });

    const { sky, ground } = this.environmentState;
    let savedSky = sky;
    if (sky.type === 'image' && !sky.asset) {
      warnings.push('The sky picture came from this computer, so it was not saved.');
      savedSky = { type: 'none' };
    }
    let savedGround = ground;
    if (ground.type === 'texture' && !ground.asset) {
      warnings.push('The ground picture came from this computer, so it was not saved.');
      savedGround = { type: 'color', color: rgbToHex(DEFAULT_GROUND_COLOR) };
    }

    const savedIds = new Set(entities.map((e) => e.id));
    const player =
      this.activePlayerId && savedIds.has(this.activePlayerId)
        ? { entityId: this.activePlayerId, view: this.playerView }
        : null;

    const scene = {
      version: CURRENT_SCENE_VERSION,
      meta: {
        title: (title || this.sceneMeta.title || 'My world').slice(0, 60),
        createdAt: this.sceneMeta.createdAt,
        updatedAt: new Date().toISOString()
      },
      environment: {
        sky: { ...savedSky },
        ground: { ...savedGround },
        lighting: { ...this.environmentState.lighting }
      },
      entities,
      player
    };

    // If this fails it's a bug in the editor, not something the user did.
    const check = validateScene(scene);
    if (!check.ok) {
      throw new Error('Could not save this world:\n' + check.errors.join('\n'));
    }
    return { scene, warnings };
  }

  /** Removes everything the user added and resets the sky, ground and light. */
  clearScene() {
    this.clearActivePlayer();
    this.selectEntity(null);
    Array.from(this.entities.keys()).forEach((id) => this.removeEntity(id));
    this.setTerrainColor(DEFAULT_GROUND_COLOR);
    this.environmentState.lighting = { ...DEFAULT_LIGHTING };
    this.setDynamicSky(); // also applies the lighting
    this.activeInteractableId = null;
    this.onInteractionPromptChange?.(null);
  }

  /**
   * Replaces the current world with a saved one.
   * @param {object} doc - parsed scene file
   * @param {(ref: {source: string, id: string}) => string|null} resolveAssetUrl
   * @returns {Promise<{ warnings: string[] }>}
   */
  async loadScene(doc, resolveAssetUrl) {
    const scene = migrateScene(doc);
    const check = validateScene(scene);
    if (!check.ok) {
      throw new Error('This file is not a valid world:\n' + check.errors.join('\n'));
    }

    const warnings = [];
    this.clearScene();

    // Sky
    const { sky, ground } = scene.environment;
    if (sky.type === 'none') {
      this.clearSkybox();
    } else if (sky.type === 'dynamic') {
      this.environmentState.sky = { type: 'dynamic' }; // drawn by applyLighting below
    } else if (sky.type === 'gradient') {
      this.setSkyboxGradient(sky.top, sky.bottom);
    } else if (sky.type === 'image') {
      const url = resolveAssetUrl(sky.asset);
      if (url) {
        await this.setSkyboxImage(url, { flipV: !!sky.flipV, assetRef: sky.asset }).catch(() =>
          warnings.push('The sky picture could not be loaded.')
        );
      } else {
        warnings.push('The sky picture is missing.');
      }
    }

    // Ground
    if (ground.type === 'color') {
      this.setTerrainColor(hexToRgb(ground.color));
    } else {
      const url = resolveAssetUrl(ground.asset);
      if (url) {
        await this.setTerrainTexture(url, ground.tiling, { assetRef: ground.asset }).catch(() =>
          warnings.push('The ground picture could not be loaded.')
        );
      } else {
        warnings.push('The ground picture is missing.');
      }
    }

    // Sun & moon
    this.environmentState.lighting = { ...scene.environment.lighting };
    this.applyLighting();

    // Entities, loaded in parallel; one bad model doesn't stop the rest.
    const results = await Promise.allSettled(
      scene.entities.map(async (e) => {
        const url = resolveAssetUrl(e.asset);
        if (!url) throw new Error(`"${e.name}" is missing from the library.`);
        await this.loadGlbAsset(e.id, url, e.position, {
          name: e.name,
          type: e.type,
          assetRef: e.asset,
          autoSelect: false,
          exact: true
        });
        const record = this.entities.get(e.id);
        record.baseScale = e.baseScale;
        this.setEntityRotation(e.id, e.rotation);
        this.setEntityScaleLevel(e.id, e.scaleLevel);
        if (e.interaction) {
          this.setInteractable(e.id, { label: e.interaction.label, action: e.interaction.action });
        }
      })
    );
    // Models finish loading in any order; put them back in saved order so
    // saving the same world twice gives the same file.
    const loaded = new Map();
    scene.entities.forEach((e) => {
      if (this.entities.has(e.id)) loaded.set(e.id, this.entities.get(e.id));
    });
    this.entities = loaded;

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        warnings.push(r.reason?.message || `"${scene.entities[i].name}" could not be loaded.`);
      }
    });

    // Player
    if (scene.player) {
      this.setPlayerView(scene.player.view);
      if (!this.setActivePlayer(scene.player.entityId)) {
        warnings.push('The player object could not be loaded.');
      }
    }

    this.sceneMeta = { title: scene.meta.title, createdAt: scene.meta.createdAt };
    return { warnings };
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  destroy() {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    if (this.onInteractKeyDown) {
      window.removeEventListener('keydown', this.onInteractKeyDown);
    }
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.onPointerDown);
      this.canvas.removeEventListener('pointermove', this.onPointerMove);
      this.canvas.removeEventListener('pointerup', this.onPointerUp);
      this.canvas.removeEventListener('pointercancel', this.onPointerUp);
      this.canvas.removeEventListener('wheel', this.onWheel);
      this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    }
    if (this.skybox) {
      this.skybox.destroy();
      this.skybox = null;
    }
    if (this.celestial) {
      this.celestial.destroy();
      this.celestial = null;
    }
    if (this.gradientTexture) {
      this.gradientTexture.destroy();
      this.gradientTexture = null;
    }
    if (this.app?.xr && this.onXRStart) {
      if (this.app.xr.active) this.app.xr.end();
      this.app.xr.off('start', this.onXRStart);
      this.app.xr.off('end', this.onXREnd);
      this.app.xr.off('available', this.onXRAvailable);
      this.app.xr.input.off('selectstart', this.onXRSelectStart);
      this.app.xr.input.off('selectend', this.onXRSelectEnd);
    }
    if (this.app) {
      if (this.updateHandler) this.app.off('update', this.updateHandler);
      this.app.destroy();
      this.app = null;
    }
    this.entities.clear();
    this.selectedId = null;
  }
}