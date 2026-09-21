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

    this.orbit = { yaw: 25, pitch: -20, dist: 8 };
    this.orbitTarget = new pc.Vec3(0, 1, 0);

    // When set, the camera "stands" at this fixed point (e.g. the centre of
    // a just-added environment) instead of orbiting around orbitTarget from
    // a distance — see updateCamera(). Mouse-drag still steers yaw/pitch as
    // normal, so it behaves like looking around from where you're standing.
    this.insideTarget = null;

    this.pointer = {
      down: false,
      mode: null, // 'orbit' | 'drag' | 'rotate'
      lastX: 0,
      lastY: 0,
      moved: false
    };

    this.init();
  }

  // ------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------

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

    this.updateHandler = () => this.drawSelectionOutline();
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
    // used two different ways below depending on mode.
    const dir = new pc.Vec3(
      Math.cos(pitch) * Math.sin(yaw),
      -Math.sin(pitch),
      Math.cos(pitch) * Math.cos(yaw)
    );

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

        if (this.pointer.mode === 'drag') {
          const record = this.entities.get(hitId);
          const pos = record.entity.getPosition();
          const ground = this.screenToPlane(x, y, pos.y);
          this.dragOffset = ground
            ? new pc.Vec3(pos.x - ground.x, 0, pos.z - ground.z)
            : new pc.Vec3();
        }
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
        record.entity.setPosition(
          ground.x + this.dragOffset.x,
          currentY,
          ground.z + this.dragOffset.z
        );
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
      worldScale: record.baseScale * levelToFactor(record.scaleLevel)
    };
  }

  emitTransform(assetId) {
    if (!this.onTransformChange) return;
    const t = this.getTransform(assetId);
    if (t) this.onTransformChange(t);
  }

  setEntityPosition(assetId, position) {
    const record = this.entities.get(assetId);
    if (!record) return false;
    const [x, y, z] = position;
    record.entity.setPosition(x, y, z);
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
   */
  loadGlbAsset(assetId, source, position = [0, 0, 0], options = {}) {
    const { targetSize = 1.5, autoSelect = true } = options;
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
        entity.setPosition(x, y, z);
        this.app.root.addChild(entity);

        this.entities.set(assetId, {
          entity,
          baseScale: 1,
          scaleLevel: 0,
          rotation: [0, 0, 0]
        });

        if (targetSize > 0) {
          this.normaliseAndGround(assetId, targetSize);
        } else {
          this.dropToGround(assetId);
        }
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
    if (this.canvas) {
      this.canvas.removeEventListener('pointerdown', this.onPointerDown);
      this.canvas.removeEventListener('pointermove', this.onPointerMove);
      this.canvas.removeEventListener('pointerup', this.onPointerUp);
      this.canvas.removeEventListener('pointercancel', this.onPointerUp);
      this.canvas.removeEventListener('wheel', this.onWheel);
      this.canvas.removeEventListener('contextmenu', this.onContextMenu);
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