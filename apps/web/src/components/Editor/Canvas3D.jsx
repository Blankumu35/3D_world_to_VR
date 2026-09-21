import { useEffect, useRef } from 'react';
import { AppManager } from '../../playcanvas/AppManager';
import { ASSET_DRAG_MIME } from './AssetLibraryPanel';

export function Canvas3D({ onEngineReady, onSelectionChange, onTransformChange, onDropAsset }) {
  const canvasRef = useRef(null);
  const managerRef = useRef(null);

  // Callbacks are held in refs so the engine always calls the latest version
  // without needing to tear down and rebuild the PlayCanvas app.
  const selectionCb = useRef(onSelectionChange);
  const transformCb = useRef(onTransformChange);
  const dropCb = useRef(onDropAsset);
  selectionCb.current = onSelectionChange;
  transformCb.current = onTransformChange;
  dropCb.current = onDropAsset;

  useEffect(() => {
    if (!canvasRef.current) return;

    const manager = new AppManager(canvasRef.current, {
      onSelectionChange: (sel) => selectionCb.current?.(sel),
      onTransformChange: (t) => transformCb.current?.(t)
    });
    managerRef.current = manager;

    onEngineReady?.(manager);

    return () => {
      managerRef.current?.destroy();
      managerRef.current = null;
    };
    // Intentionally run once: the PlayCanvas app owns a WebGL context and
    // must not be rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A card dragged from the AssetLibraryPanel is dropped here. We hand the
  // asset payload plus the drop's screen coordinates (relative to the
  // canvas) up to App.jsx, which owns the engine ref and knows how to turn
  // a screen point into a world position.
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(ASSET_DRAG_MIME);
    if (!raw || !dropCb.current) return;

    let asset;
    try {
      asset = JSON.parse(raw);
    } catch {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    dropCb.current(asset, { x: screenX, y: screenY });
  };

  return (
    <canvas
      ref={canvasRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        width: '100%',
        height: '100vh',
        display: 'block',
        touchAction: 'none'
      }}
    />
  );
}