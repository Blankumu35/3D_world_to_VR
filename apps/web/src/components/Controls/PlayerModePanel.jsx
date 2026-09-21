import React from 'react';

const VIEW_MODES = [
  { id: 'normal', label: 'Normal' },
  { id: 'third-person', label: '3rd Person' },
  { id: 'first-person', label: '1st Person' }
];

/**
 * PlayerModePanel
 * Lets the user pick a placed object to control (movement then drives that
 * object instead of the free-look camera — see AppManager.setActivePlayer /
 * tickMovement), choose how the camera relates to it, and step back out of
 * player mode at any time.
 */
export function PlayerModePanel({ objects, playerEntityId, viewMode, onSelectPlayer, onExitPlayerMode, onChangeViewMode }) {
  // Nothing placed yet and nobody's the player — nothing useful to show.
  if (objects.length === 0 && !playerEntityId) return null;

  const activeObject = objects.find((o) => o.id === playerEntityId);

  return (
    <div style={panelStyle}>
      <p style={titleStyle}>🎮 Active Player</p>

      {!playerEntityId && (
        <>
          <label style={labelStyle}>Choose an object to control</label>
          <select
            style={selectStyle}
            value=""
            onChange={(e) => {
              if (e.target.value) onSelectPlayer(e.target.value);
            }}
          >
            <option value="" disabled>
              Select an object…
            </option>
            {objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </>
      )}

      {playerEntityId && (
        <>
          <p style={activeLabelStyle}>
            Controlling: <strong>{activeObject?.name || 'object'}</strong>
          </p>

          <label style={labelStyle}>Camera</label>
          <div style={viewModeRowStyle}>
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.id}
                style={mode.id === viewMode ? viewModeButtonActiveStyle : viewModeButtonStyle}
                onClick={() => onChangeViewMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <button style={exitButtonStyle} onClick={onExitPlayerMode}>
            🚪 Exit Player Mode
          </button>
        </>
      )}
    </div>
  );
}

const panelStyle = {
  position: 'absolute',
  bottom: '24px',
  right: '20px',
  width: '220px',
  background: 'rgba(255, 255, 255, 0.96)',
  padding: '14px',
  borderRadius: '12px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
  zIndex: 10,
  fontFamily: 'system-ui, sans-serif'
};

const titleStyle = { fontWeight: 'bold', margin: '0 0 10px 0', fontSize: '14px' };

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: '#666',
  margin: '0 0 6px'
};

const selectStyle = {
  width: '100%',
  padding: '8px 8px',
  fontSize: '13px',
  borderRadius: '6px',
  border: '1px solid #CCC',
  background: '#FFF'
};

const activeLabelStyle = { fontSize: '13px', color: '#334155', margin: '0 0 12px' };

const viewModeRowStyle = { display: 'flex', gap: '4px', marginBottom: '12px' };

const viewModeButtonBase = {
  flex: 1,
  padding: '6px 4px',
  fontSize: '11px',
  fontWeight: 600,
  borderRadius: '6px',
  border: '1px solid #CBD5E1',
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

const viewModeButtonStyle = { ...viewModeButtonBase, background: '#F8FAFC', color: '#334155' };
const viewModeButtonActiveStyle = { ...viewModeButtonBase, background: '#2563EB', color: '#FFF', border: '1px solid #2563EB' };

const exitButtonStyle = {
  width: '100%',
  padding: '8px',
  fontSize: '13px',
  fontWeight: 600,
  borderRadius: '8px',
  border: 'none',
  background: '#EF4444',
  color: '#fff',
  cursor: 'pointer'
};