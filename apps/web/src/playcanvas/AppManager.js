import * as pc from 'playcanvas';

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

/**
 * AppManager
 * Owns the PlayCanvas application and exposes an imperative API the React
 * layer drives. Selection, dragging, rotating and orbiting live here (they
 * need per-frame engine access); React owns UI state and reads/writes
 * transforms through the setters below.
 */
export class AppManager {
  constructor(canvasElement, callbacks = {}) {
    this.canvas = canvasElement;
    this.app = null;
    this.camera = null;

    /**
     * @type {Map<string, {
     *   entity: pc.Entity,
     *   baseScale: number,   // scale chosen at import time (normalised)
     *   scaleLevel: number,  // -100..100, user-facing
     *   rotation: number[]   // euler degrees [x, y, z]
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

    // Skybox entity (see the Skybox section) — null until setSkyboxImage/
    // setSkyboxGradient is called for the first time.
    this.skybox = null;

    // Interaction: entities can be marked with setInteractable(); the
    // nearest one within interactRadius of the character is tracked here
    // and reported through onInteractionPromptChange so the UI can show a
    // "Press E to ..." hint. See the Interaction section.
    this.interactRadius = 2;
    this.activeInteractableId = null;
    this.onInteractionPromptChange = callbacks.onInteractionPromptChange || null;

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

    const light = new pc.Entity('SunLight', this.app);
    light.addComponent('light', {
      type: 'directional',
      color: new pc.Color(1, 1, 1),
      intensity: 1
    });
    this.app.root.addChild(light);
    light.setEulerAngles(45, 30, 0);

    this.ground = new pc.Entity('Ground', this.app);
    this.ground.addComponent('render', { type: 'plane' });
    const groundMat = new pc.StandardMaterial();
    groundMat.diffuse = new pc.Color(0.28, 0.32, 0.38);
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

    this.updateHandler = (dt) => {
      this.stepCharacterMovement(dt);
      this.drawSelectionOutline();
      this.updateInteractionPrompt();
      // Keeps the skybox "infinitely far away" by re-centring it on the
      // camera every frame instead of letting the camera move away from it.
      if (this.skybox) this.skybox.setPosition(this.camera.getPosition());
    };
    this.app.on('update', this.updateHandler);

    this.app.start();
  }

  // ------------------------------------------------------------------
  // Camera
  // ------------------------------------------------------------------

  updateCamera() {
    if (!this.camera) return;
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
    sky.addComponent('render', { type: 'sphere' });
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
   */
  setSkyboxImage(source, { flipV = false } = {}) {
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
        resolve(sky);
      });
    });
  }

  /**
   * Two-colour vertical gradient, generated on a small offscreen canvas —
   * a quick "set the mood" option (dusk, night, clear day) with no photo
   * needed. `topColor`/`bottomColor` are any CSS colour string.
   */
  setSkyboxGradient(topColor = '#4a6fa5', bottomColor = '#dfe9f3') {
    if (!this.app) return null;

    const height = 128;
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 2, height);

    const texture = new pc.Texture(this.app.graphicsDevice, {
      width: 2,
      height,
      format: pc.PIXELFORMAT_R8_G8_B8_A8
    });
    texture.setSource(canvas);

    const sky = this.createSkyboxEntity();
    const mat = sky.render.meshInstances[0].material;
    mat.emissiveMap = texture;
    mat.emissive = new pc.Color(1, 1, 1);
    mat.emissiveMapTiling = new pc.Vec2(1, 1);
    mat.update();
    return sky;
  }

  /** Back to the plain clear-color background (see the camera's clearColor). */
  clearSkybox() {
    if (!this.skybox) return;
    this.skybox.destroy();
    this.skybox = null;
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
   */
  setTerrainTexture(source, tiling = [10, 10]) {
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
        resolve(texture);
      });
    });
  }

  /** Back to a flat colour, no image — undoes setTerrainTexture. */
  setTerrainColor(color = [0.28, 0.32, 0.38]) {
    if (!this.ground) return;
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
  // Any entity can be marked with setInteractable({ label, onInteract }).
  // Every frame, updateInteractionPrompt() finds the nearest interactable
  // within interactRadius of wherever the character currently is (reusing
  // getCharacterPosition, the same position stepCharacterMovement drives)
  // and reports it via onInteractionPromptChange so the UI can show a
  // "Press E to <label>" hint. Pressing E calls triggerInteraction(), which
  // fires that entity's own onInteract(assetId) callback — what actually
  // happens (open a door, pick something up, play a sound) is entirely up
  // to whoever called setInteractable; the engine only handles "is the
  // character close enough, and did they press the button".
  // ------------------------------------------------------------------

  /** Mark `assetId` as something the character can interact with up close. */
  setInteractable(assetId, { label = 'Interact', onInteract } = {}) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    record.interactable = { label, onInteract: onInteract || null };
    return true;
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
    record.interactable.onInteract?.(this.activeInteractableId);
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

      const hitId = this.pickEntityAt(x, y);

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
      if (this.pointer.mode === 'orbit' && !this.pointer.moved) {
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
    if (!box || !this.app.drawWireAlignedBox) return;

    const min = new pc.Vec3().copy(box.center).sub(box.halfExtents);
    const max = new pc.Vec3().copy(box.center).add(box.halfExtents);
    this.app.drawWireAlignedBox(min, max, new pc.Color(1, 0.78, 0.2));
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
      // Label only — the onInteract callback itself isn't UI-serialisable
      // and shouldn't need to be; the UI just needs to know whether this
      // selection currently has one and what it's called.
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
    record.entity.setEulerAngles(
      record.rotation[0],
      record.rotation[1],
      record.rotation[2]
    );
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
    const { targetSize = 1.5, autoSelect = true, name = assetId, type = 'object' } = options;
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
        const snapped = this.snapToGrid(x, z);
        entity.setPosition(snapped.x, y, snapped.z);
        this.app.root.addChild(entity);

        this.entities.set(assetId, {
          entity,
          baseScale: 1,
          scaleLevel: 0,
          rotation: [0, 0, 0],
          name,
          type,
          interactable: null
        });

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
      record.baseScale = targetSize / largest;
      record.scaleLevel = 0;
      const s = record.baseScale;
      record.entity.setLocalScale(s, s, s);
    }

    this.dropToGround(assetId);
  }

  // ------------------------------------------------------------------
  // XR
  // ------------------------------------------------------------------

  enterVR() {
    const cameraComponent = this.camera?.camera;
    if (!this.app || !cameraComponent) return false;
    if (!this.app.xr || !this.app.xr.isAvailable(pc.XRTYPE_VR)) return false;

    // LOCALFLOOR puts the origin at floor level, so objects placed at y = 0
    // appear on the ground rather than at head height.
    this.app.xr.start(cameraComponent, pc.XRTYPE_VR, pc.XRSPACE_LOCALFLOOR, {
      callback: (err) => {
        if (err) console.error('Failed to start XR session:', err);
      }
    });
    return true;
  }

  isVRAvailable() {
    return !!(this.app && this.app.xr && this.app.xr.isAvailable(pc.XRTYPE_VR));
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
    if (this.app) {
      if (this.updateHandler) this.app.off('update', this.updateHandler);
      this.app.destroy();
      this.app = null;
    }
    this.entities.clear();
    this.selectedId = null;
  }
}