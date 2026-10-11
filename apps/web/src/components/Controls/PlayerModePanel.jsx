import React from 'react';
import {
  firstSectionStyle,
  sectionStyle,
  sectionLabelStyle,
  hintStyle,
  rowStyle,
  chipStyle,
  chipActiveStyle,
  dangerButtonStyle,
  BORDER,
  TEXT
} from '../Editor/panelStyles';

const VIEW_MODES = [
  { id: 'normal', label: 'Free' },
  { id: 'third-person', label: 'Behind' },
  { id: 'first-person', label: 'Eyes' }
];

/**
 * PlayerModePanel ("Player" tab of SidePanel)
 * Lets the user pick a placed object to control (movement then drives that
 * object instead of the free-look camera — see AppManager.setActivePlayer /
 * stepCharacterMovement), choose how the camera relates to it, and step
 * back out of player mode at any time.
 */
export function PlayerModePanel({ objects, playerEntityId, viewMode, onSelectPlayer, onExitPlayerMode, onChangeViewMode }) {
  const activeObject = objects.find((o) => o.id === playerEntityId);

  if (objects.length === 0 && !playerEntityId) {
    return (
      <div style={firstSectionStyle}>
        <span style={sectionLabelStyle}>Be a character</span>
        <p style={{ ...hintStyle, marginTop: 0 }}>
          Add an object from the library first. Then choose it here to walk around as it with W A S D.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={firstSectionStyle}>
        <span style={sectionLabelStyle}>Be a character</span>
        {!playerEntityId ? (
          <>
            <select
              style={selectStyle}
              value=""
              aria-label="Choose an object to control"
              onChange={(e) => {
                if (e.target.value) onSelectPlayer(e.target.value);
              }}
            >
              <option value="" disabled>
                Choose an object…
              </option>
              {objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <p style={hintStyle}>Then walk around as it with W A S D.</p>
          </>
        ) : (
          <p style={{ fontSize: '14px', color: TEXT, margin: 0 }}>
            You are the <strong>{activeObject?.name || 'object'}</strong>.
          </p>
        )}
      </div>

      {playerEntityId && (
        <>
          <div style={sectionStyle}>
            <span style={sectionLabelStyle}>Camera</span>
            <div style={rowStyle}>
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode.id}
                  style={mode.id === viewMode ? chipActiveStyle : chipStyle}
                  onClick={() => onChangeViewMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ ...sectionStyle, paddingBottom: 0 }}>
            <button style={dangerButtonStyle} onClick={onExitPlayerMode}>
              Stop being the {activeObject?.name || 'object'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const selectStyle = {
  width: '100%',
  padding: '8px',
  fontSize: '13px',
  borderRadius: '8px',
  border: `1px solid ${BORDER}`,
  background: '#FFF',
  color: TEXT
};