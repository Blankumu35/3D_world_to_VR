import React, { useState } from 'react';

/**
 * MovementControls
 * On-screen D-pad + Run toggle for walking around the scene — the pointer
 * equivalent of WASD + Shift (see AppManager.attachKeyboardHandlers). Both
 * input paths funnel through engine.setMoveKey / engine.setRunning, so
 * keyboard and on-screen input share one source of truth and can't
 * contradict each other.
 *
 * Takes `engineRef` (not the engine instance) because the engine is created
 * after first render — reading engineRef.current inside the handlers, at
 * interaction time, avoids needing extra state just to re-render once it's
 * ready.
 */
export function MovementControls({ engineRef }) {
  const [running, setRunningState] = useState(false);

  const press = (direction) => (e) => {
    e.preventDefault();
    engineRef.current?.setMoveKey(direction, true);
  };
  const release = (direction) => (e) => {
    e.preventDefault();
    engineRef.current?.setMoveKey(direction, false);
  };

  const toggleRun = () => {
    const next = !running;
    setRunningState(next);
    engineRef.current?.setRunning(next);
  };

  return (
    <div style={containerStyle}>
      <button style={runButtonStyle(running)} onClick={toggleRun} title="Toggle run">
        {running ? '🏃 Run' : '🚶 Walk'}
      </button>

      <div style={padStyle}>
        <span />
        <DPadButton label="▲" title="Forward" onPress={press('forward')} onRelease={release('forward')} />
        <span />

        <DPadButton label="◀" title="Left" onPress={press('left')} onRelease={release('left')} />
        <span style={centerDotStyle} />
        <DPadButton label="▶" title="Right" onPress={press('right')} onRelease={release('right')} />

        <span />
        <DPadButton label="▼" title="Back" onPress={press('back')} onRelease={release('back')} />
        <span />
      </div>
    </div>
  );
}

function DPadButton({ label, title, onPress, onRelease }) {
  return (
    <button
      style={dpadButtonStyle}
      title={title}
      onPointerDown={onPress}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

const containerStyle = {
  position: 'absolute',
  bottom: '24px',
  left: '24px',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '10px',
  userSelect: 'none',
  touchAction: 'none',
};

const padStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 44px)',
  gridTemplateRows: 'repeat(3, 44px)',
  gap: '4px',
};

const dpadButtonStyle = {
  width: '44px',
  height: '44px',
  fontSize: '16px',
  borderRadius: '10px',
  border: '1px solid rgba(255,255,255,0.5)',
  background: 'rgba(255, 255, 255, 0.92)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  cursor: 'pointer',
  touchAction: 'none',
};

const centerDotStyle = {
  width: '44px',
  height: '44px',
};

const runButtonStyle = (active) => ({
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 700,
  borderRadius: '999px',
  border: 'none',
  color: active ? '#FFF' : '#334155',
  background: active ? '#F59E0B' : 'rgba(255,255,255,0.92)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  cursor: 'pointer',
});