import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas3D } from './components/Editor/Canvas3D';
import { AssetLibraryPanel } from './components/Editor/AssetLibraryPanel';
import { TransformPanel } from './components/Editor/TransformPanel';
import { EnvironmentPanel } from './components/Editor/EnvironmentPanel';
import { ScenePanel } from './components/Editor/ScenePanel';
import { RestorePrompt } from './components/Editor/RestorePrompt';
import { SidePanel } from './components/Editor/SidePanel';
import { getAssetById } from './assets/AssetLibrary';
import {
  writeAutosave,
  readAutosave,
  clearAutosave,
  isEmptyScene,
  sceneFingerprint
} from './services/autosave';
//import { InteractableControls } from './components/Editor/InteractableControls';
import { CharacterControls } from './components/Controls/CharacterControls';
import { PlayerModePanel } from './components/Controls/PlayerModePanel';
//import { InteractionHint } from './components/Controls/InteractionHint';

// How often to check whether the world changed and needs autosaving. The
// check is cheap (serialize + string compare), and nothing is written when
// nothing changed.
const AUTOSAVE_INTERVAL_MS = 3000;

const DEFAULT_TITLE = 'My world';
const DEFAULT_LIGHTING = { timeOfDay: 12, shadows: true };

export function App() {
  const engineRef = useRef(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selection, setSelection] = useState(null);

  // Objects (not environments) that exist right now, for the "choose your
  // player" dropdown — kept in React state rather than re-querying the
  // engine each render, since AppManager doesn't emit a general "entities
  // changed" event.
  const [placedObjects, setPlacedObjects] = useState([]); // [{ id, name }]
  const [playerEntityId, setPlayerEntityId] = useState(null);
  const [playerView, setPlayerView] = useState('third-person');
  const [worldTitle, setWorldTitle] = useState(DEFAULT_TITLE);
  // Mirrors AppManager.environmentState.lighting for the Sun & moon controls.
  const [lighting, setLighting] = useState(DEFAULT_LIGHTING);
  // 'dynamic' | 'gradient' | 'image' | 'none' — mirrors the engine's sky.
  const [skyType, setSkyType] = useState('dynamic');
  // Which tab of the right-hand SidePanel is open: 'world' | 'object' | 'player'.
  const [sideTab, setSideTab] = useState('world');

  // ---- Autosave state ----
  // restoreOffer: the autosaved { savedAt, scene } waiting for the user to
  // choose "Carry on" or "Start new" (null when there's nothing to offer).
  // autosaveReadyRef stays false until that choice is made, so the empty
  // starting scene can't overwrite the autosave before the user decides.
  // busyRef pauses autosave while a world is being loaded, so a half-loaded
  // world is never saved over a complete one.
  const [restoreOffer, setRestoreOffer] = useState(null);
  const [lastAutosave, setLastAutosave] = useState(null);
  const autosaveReadyRef = useRef(false);
  const busyRef = useRef(false);
  const lastFingerprintRef = useRef(null);
  const worldTitleRef = useRef(worldTitle);
  useEffect(() => {
    worldTitleRef.current = worldTitle;
  }, [worldTitle]);

  // Interaction HUD: `interactionPrompt` mirrors AppManager's nearest
  // in-range interactable ({ id, label } | null); `interactionMessage` is a
  // brief "you did the thing" toast shown after E is actually pressed (see
  // the interaction handler wired up in handleEngineReady below).
  const [interactionPrompt, setInteractionPrompt] = useState(null);
  const [interactionMessage, setInteractionMessage] = useState(null);
  const interactionMessageTimeoutRef = useRef(null);

  const handleEngineReady = useCallback((engineInstance) => {
    engineRef.current = engineInstance;
    // setInteractionPromptHandler is a plain setter on AppManager rather
    // than one of Canvas3D's constructor-time callbacks (onSelectionChange
    // etc.) — wiring it here, right where engineRef itself is captured,
    // means Canvas3D never needs to know this feature exists.
    engineInstance.setInteractionPromptHandler(setInteractionPrompt);
    // Interactions are saved as data ({ type, ... }); this decides what each
    // type does when the player presses E.
    engineInstance.setInteractionHandler((id, action) => {
      if (action?.type === 'message') showInteractionMessage(action.text);
    });

    // Offer to restore the last autosaved world, if there's one worth
    // offering. Otherwise autosave can start straight away.
    const saved = readAutosave();
    if (saved && !isEmptyScene(saved.scene)) {
      setRestoreOffer(saved);
    } else {
      clearAutosave();
      autosaveReadyRef.current = true;
    }
  }, []);

  // ---- Autosave loop ----
  // Polls rather than hooking every engine change (drag, rotate, sky, ...):
  // one place to maintain, and it can't miss a change some future feature
  // forgets to report. Also saves immediately when the tab is hidden or the
  // page is closing, so a refresh straight after a change isn't lost.
  useEffect(() => {
    const autosaveNow = () => {
      const engine = engineRef.current;
      if (!engine || !autosaveReadyRef.current || busyRef.current) return;
      let scene;
      try {
        ({ scene } = engine.serializeScene({ title: worldTitleRef.current }));
      } catch (err) {
        console.warn('Autosave skipped:', err);
        return;
      }
      const fingerprint = sceneFingerprint(scene);
      if (fingerprint === lastFingerprintRef.current) return;
      if (writeAutosave(scene)) {
        lastFingerprintRef.current = fingerprint;
        setLastAutosave(new Date());
      }
    };

    const intervalId = window.setInterval(autosaveNow, AUTOSAVE_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') autosaveNow();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', autosaveNow);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', autosaveNow);
    };
  }, []);

  // Fired when the user clicks an object (or empty space) in the scene
  const handleSelectionChange = useCallback((sel) => {
    setSelection(sel);
  }, []);

  // Clicking an object (or adding one) opens the Object tab so its controls
  // are right there. Keyed on the id, so dragging the same object (which
  // updates `selection` constantly) doesn't keep yanking the tab back.
  const selectedId = selection?.id ?? null;
  useEffect(() => {
    if (selectedId) setSideTab('object');
  }, [selectedId]);

  // Fired while dragging or rotating, so the panel stays in sync
  const handleTransformChange = useCallback((transform) => {
    setSelection((prev) => (prev && prev.id === transform.id ? transform : prev));
  }, []);

  // Fired by AppManager whenever the active player changes — including from
  // under us, e.g. focusOn() or removeEntity() stepping out of player mode
  // on their own. This is the single source of truth for playerEntityId;
  // the panel's own actions (below) don't set it directly.
  const handlePlayerChange = useCallback((id) => {
    setPlayerEntityId(id);
  }, []);

  // Turns a canvas-relative screen point into a world-space drop position by
  // raycasting from the camera through that point onto the y=0 ground plane
  // (AppManager.screenToPlane). Environments always go at the origin — they
  // aren't meant to be dropped at an arbitrary spot the way a small object is.
  const resolveDropPosition = (engine, screenPos, isEnvironment) => {
    if (isEnvironment) return [0, 0, 0];

    if (screenPos) {
      const ground = engine.screenToPlane(screenPos.x, screenPos.y, 0);
      if (ground) return [ground.x, ground.y, ground.z];
    }

    // Click-to-add (no screen point) or a ray that missed the ground plane:
    // small random spread so repeated clicks don't stack objects exactly on
    // top of each other.
    const spread = 4;
    return [(Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread];
  };

  // Shared by: library-card click, library-card drag-drop onto the canvas,
  // and the "upload your own" file/URL form — all three go through the same
  // engine call so objects and environments behave consistently everywhere.
  const handleAddAsset = async ({ id, source, name, type }, screenPos) => {
    if (!engineRef.current) return;

    setIsImporting(true);
    try {
      const isEnvironment = type === 'environment';
      const assetId = `${isEnvironment ? 'env' : 'obj'}_${Date.now()}`;
      const position = resolveDropPosition(engineRef.current, screenPos, isEnvironment);

      // Environments skip the "shrink to ~1.5 units" normalisation a small
      // placed object gets (targetSize: 0 keeps the model's authored scale)
      // and don't grab the selection/transform panel on load. `name`/`type`
      // are stored on the entity so the player picker can list it.
      // Library items carry an `id`, which is what a saved scene stores.
      // Uploads have none yet, so they can be placed but not saved.
      const assetRef = id ? { source: 'builtin', id } : null;
      const loadOptions = isEnvironment
        ? { targetSize: 0, autoSelect: false, name, type: 'environment', assetRef }
        : { name, type: 'object', assetRef };

      await engineRef.current.loadGlbAsset(assetId, source, position, loadOptions);

      if (isEnvironment) {
        // Move the viewpoint to stand at the centre of a newly-added
        // environment, looking around from inside it rather than at it
        // from outside. Placed objects don't move the camera.
        engineRef.current.viewFromCenter(assetId);
      } else {
        setPlacedObjects((prev) => [...prev, { id: assetId, name }]);
      }

      console.log(`Successfully added ${type}: ${name}`);
    } catch (err) {
      console.error(`Failed to add ${type}:`, err);
      alert('Could not load the 3D model. Make sure it is a valid .glb or .gltf file.');
    } finally {
      setIsImporting(false);
    }
  };

  // Dropped from the AssetLibraryPanel onto the canvas
  const handleDropAsset = (asset, screenPos) => {
    handleAddAsset(asset, screenPos);
  };

  // Character movement isn't tied to the current selection — it reads/writes
  // the camera's own "standing" position — so it doesn't go through
  // withSelection below. useCallback with an empty dependency array keeps
  // this stable across renders, which matters here: useKeyboardMovement only
  // attaches its window key listeners once, on mount, and closes over
  // whatever onMoveInputChange was passed in at that time. A function that
  // changed identity every render would still *work* (engineRef.current is
  // read at call time, not closed over early) but would be a needless prop
  // change on every App render, so it's kept stable regardless.
  const handleMoveInputChange = useCallback((input) => {
    engineRef.current?.setMoveInput(input);
  }, []);

  const withSelection = (fn) => (...args) => {
    if (!engineRef.current || !selection) return;
    fn(engineRef.current, selection.id, ...args);
  };

  const handlePositionChange = withSelection((engine, id, position) =>
    engine.setEntityPosition(id, position)
  );

  const handleRotationChange = withSelection((engine, id, rotation) =>
    engine.setEntityRotation(id, rotation)
  );

  const handleScaleLevelChange = withSelection((engine, id, level) =>
    engine.setEntityScaleLevel(id, level)
  );

  const handleDropToGround = withSelection((engine, id) => engine.dropToGround(id));

  const handleFocus = withSelection((engine, id) => engine.focusOn(id));

  const handleDelete = withSelection((engine, id) => {
    engine.removeEntity(id); // also exits player mode if `id` was the player
    setSelection(null);
    setPlacedObjects((prev) => prev.filter((o) => o.id !== id));
  });

  // ---- Environment: skybox + terrain (see components/Editor/EnvironmentPanel) ----

  const handleSetSkyboxImage = async (file, options) => {
    if (!engineRef.current) return;
    setIsImporting(true);
    try {
      await engineRef.current.setSkyboxImage(file, options);
      setSkyType('image');
    } catch (err) {
      console.error('Failed to set skybox image:', err);
      alert('Could not load that image as a skybox. Try a .jpg or .png photo.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSetDynamicSky = () => {
    engineRef.current?.setDynamicSky();
    setSkyType('dynamic');
  };

  const handleClearSkybox = () => {
    engineRef.current?.clearSkybox();
    setSkyType('none');
  };

  const handleSetTerrainTexture = async (file, tiling) => {
    if (!engineRef.current) return;
    setIsImporting(true);
    try {
      await engineRef.current.setTerrainTexture(file, tiling);
    } catch (err) {
      console.error('Failed to set terrain texture:', err);
      alert('Could not load that image as a ground texture. Try a .jpg or .png.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClearTerrainTexture = () => {
    engineRef.current?.setTerrainColor();
  };

  const handleSetTimeOfDay = (hours) => {
    engineRef.current?.setTimeOfDay(hours);
    setLighting((prev) => ({ ...prev, timeOfDay: hours }));
  };

  const handleSetShadows = (enabled) => {
    engineRef.current?.setShadows(enabled);
    setLighting((prev) => ({ ...prev, shadows: enabled }));
  };

  // ---- Interactable objects (see components/Editor/InteractableControls) ----
  // The engine only knows "close enough + E was pressed" (see
  // AppManager's Interaction section); what happens is decided by the
  // interaction handler set in handleEngineReady. The default is just a
  // brief on-screen toast.

  const showInteractionMessage = (text) => {
    setInteractionMessage(text);
    window.clearTimeout(interactionMessageTimeoutRef.current);
    interactionMessageTimeoutRef.current = window.setTimeout(
      () => setInteractionMessage(null),
      2500
    );
  };

  const handleSetInteractable = withSelection((engine, id, label) => {
    engine.setInteractable(id, {
      label,
      action: { type: 'message', text: label }
    });
    setSelection((prev) => (prev && prev.id === id ? engine.getTransform(id) : prev));
  });

  const handleClearInteractable = withSelection((engine, id) => {
    engine.clearInteractable(id);
    setSelection((prev) => (prev && prev.id === id ? engine.getTransform(id) : prev));
  });

  // ---- Save / open / new (see components/Editor/ScenePanel) ----

  // Turns a saved { source, id } ref back into a URL the engine can load.
  // Only built-in library items for now; uploads and generated models will
  // resolve through the server once it stores them.
  const resolveAssetUrl = (ref) => {
    if (ref.source === 'builtin') return getAssetById(ref.id)?.url ?? null;
    return null;
  };

  // Shared by "Open world" and "Carry on": replaces the current world with
  // a saved one and brings the React state back in line with the engine.
  // Returns the engine's warnings (things that couldn't be loaded).
  const loadWorld = async (doc) => {
    const engine = engineRef.current;
    busyRef.current = true;
    setIsImporting(true);
    try {
      const { warnings } = await engine.loadScene(doc, resolveAssetUrl);
      setSelection(null);
      setPlacedObjects(engine.listPlayableEntities());
      setPlayerView(engine.playerView);
      setWorldTitle(engine.sceneMeta.title);
      setLighting({ ...engine.environmentState.lighting });
      setSkyType(engine.environmentState.sky.type);
      return warnings;
    } finally {
      busyRef.current = false;
      setIsImporting(false);
    }
  };

  const handleSaveScene = () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const { scene, warnings } = engine.serializeScene({ title: worldTitle });
      const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fileName = (scene.meta.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'world') + '.world.json';
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      if (warnings.length) alert('Saved, but some things were left out:\n\n' + warnings.join('\n'));
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const handleOpenScene = async (file) => {
    if (!engineRef.current) return;
    try {
      const doc = JSON.parse(await file.text());
      const warnings = await loadWorld(doc);
      if (warnings.length) alert('Opened, but some things are missing:\n\n' + warnings.join('\n'));
    } catch (err) {
      console.error(err);
      alert(err instanceof SyntaxError ? 'That file is not a saved world.' : err.message);
    }
  };

  // Clears the world and the autosave. Use between study participants on a
  // shared machine, so the next child starts fresh.
  const handleNewScene = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const ok = window.confirm(
      'Start a new world? This clears everything on screen. Use "Save world" first if you want to keep it.'
    );
    if (!ok) return;
    engine.clearScene();
    engine.sceneMeta = { title: DEFAULT_TITLE, createdAt: new Date().toISOString() };
    setSelection(null);
    setPlacedObjects([]);
    setWorldTitle(DEFAULT_TITLE);
    setLighting({ ...engine.environmentState.lighting });
    setSkyType(engine.environmentState.sky.type);
    clearAutosave();
    lastFingerprintRef.current = null;
    setLastAutosave(null);
  };

  // ---- Restore prompt (see components/Editor/RestorePrompt) ----

  const handleRestore = async () => {
    if (!restoreOffer || !engineRef.current) return;
    try {
      const warnings = await loadWorld(restoreOffer.scene);
      if (warnings.length) alert('Opened, but some things are missing:\n\n' + warnings.join('\n'));
    } catch (err) {
      // An autosave that can't be loaded (e.g. from an older, incompatible
      // version) is thrown away rather than offered again on every load.
      console.error('Could not restore autosave:', err);
      alert('Your last world could not be opened, so a new one has been started.');
      clearAutosave();
    }
    setRestoreOffer(null);
    autosaveReadyRef.current = true;
  };

  const handleStartNew = () => {
    clearAutosave();
    setRestoreOffer(null);
    autosaveReadyRef.current = true;
  };

  // ---- Active player controls (see components/Controls/PlayerModePanel) ----

  const handleSelectPlayer = (id) => {
    engineRef.current?.setActivePlayer(id);
  };

  const handleExitPlayerMode = () => {
    engineRef.current?.clearActivePlayer();
  };

  const handleChangeViewMode = (mode) => {
    engineRef.current?.setPlayerView(mode);
    setPlayerView(mode);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Canvas3D
        onEngineReady={handleEngineReady}
        onSelectionChange={handleSelectionChange}
        onTransformChange={handleTransformChange}
        onDropAsset={handleDropAsset}
        onPlayerChange={handlePlayerChange}
      />
      <AssetLibraryPanel onAddAsset={handleAddAsset} isImporting={isImporting} />
      <ScenePanel
        title={worldTitle}
        onTitleChange={setWorldTitle}
        onNew={handleNewScene}
        onSave={handleSaveScene}
        onOpen={handleOpenScene}
        lastAutosave={lastAutosave}
        isBusy={isImporting || !!restoreOffer}
      />
      <CharacterControls onMoveInputChange={handleMoveInputChange} />
      {/* Right-hand panel: World / Object / Player as tabs, so only one set
          of controls shows at a time and nothing overlaps. */}
      <SidePanel
        activeTab={sideTab}
        onTabChange={setSideTab}
        tabs={[
          {
            id: 'world',
            label: '🌍 World',
            content: (
              <EnvironmentPanel
                skyType={skyType}
                onSetSkyboxImage={handleSetSkyboxImage}
                onSetDynamicSky={handleSetDynamicSky}
                onClearSkybox={handleClearSkybox}
                onSetTerrainTexture={handleSetTerrainTexture}
                onClearTerrainTexture={handleClearTerrainTexture}
                timeOfDay={lighting.timeOfDay}
                shadows={lighting.shadows}
                onSetTimeOfDay={handleSetTimeOfDay}
                onSetShadows={handleSetShadows}
                isBusy={isImporting}
              />
            )
          },
          {
            id: 'object',
            label: '🎯 Object',
            dot: !!selection,
            content: (
              <TransformPanel
                selection={selection}
                onPositionChange={handlePositionChange}
                onRotationChange={handleRotationChange}
                onScaleLevelChange={handleScaleLevelChange}
                onDropToGround={handleDropToGround}
                onFocus={handleFocus}
                onDelete={handleDelete}
              />
            )
          },
          {
            id: 'player',
            label: '🎮 Player',
            dot: !!playerEntityId,
            content: (
              <PlayerModePanel
                objects={placedObjects}
                playerEntityId={playerEntityId}
                viewMode={playerView}
                onSelectPlayer={handleSelectPlayer}
                onExitPlayerMode={handleExitPlayerMode}
                onChangeViewMode={handleChangeViewMode}
              />
            )
          }
        ]}
      />
      {restoreOffer && (
        <RestorePrompt
          title={restoreOffer.scene?.meta?.title || DEFAULT_TITLE}
          savedAt={restoreOffer.savedAt}
          onRestore={handleRestore}
          onStartNew={handleStartNew}
          isBusy={isImporting}
        />
      )}
    </div>
  );
}

export default App;