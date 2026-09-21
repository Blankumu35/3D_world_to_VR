import React, { useState, useRef, useCallback } from 'react';
import { Canvas3D } from './components/Editor/Canvas3D';
import { AssetLibraryPanel } from './components/Editor/AssetLibraryPanel';
import { TransformPanel } from './components/Editor/TransformPanel';
import { CharacterControls } from './components/Controls/CharacterControls';
import { PlayerModePanel } from './components/Controls/PlayerModePanel';

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

  const handleEngineReady = useCallback((engineInstance) => {
    engineRef.current = engineInstance;
  }, []);

  // Fired when the user clicks an object (or empty space) in the scene
  const handleSelectionChange = useCallback((sel) => {
    setSelection(sel);
  }, []);

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
  const handleAddAsset = async ({ source, name, type }, screenPos) => {
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
      const loadOptions = isEnvironment
        ? { targetSize: 0, autoSelect: false, name, type: 'environment' }
        : { name, type: 'object' };

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
      <CharacterControls onMoveInputChange={handleMoveInputChange} />
      <PlayerModePanel
        objects={placedObjects}
        playerEntityId={playerEntityId}
        viewMode={playerView}
        onSelectPlayer={handleSelectPlayer}
        onExitPlayerMode={handleExitPlayerMode}
        onChangeViewMode={handleChangeViewMode}
      />
      <TransformPanel
        selection={selection}
        onPositionChange={handlePositionChange}
        onRotationChange={handleRotationChange}
        onScaleLevelChange={handleScaleLevelChange}
        onDropToGround={handleDropToGround}
        onFocus={handleFocus}
        onDelete={handleDelete}
      />
    </div>
  );
}

export default App;