import React from 'react';
import {
  firstSectionStyle,
  sectionStyle,
  sectionLabelStyle,
  hintStyle,
  BLUE,
  BORDER,
  SURFACE,
  TEXT,
  MUTED
} from './panelStyles';

/**
 * SceneListPanel ("Things" tab of SidePanel, when nothing is selected)
 * Everything in the current world: places (environments) first, then
 * objects. Clicking a row selects it, which opens its edit controls
 * (TransformPanel) in the same tab. 🔍 moves the camera to look at it, for
 * things that are off-screen or hidden behind something bigger.
 *
 * items: AppManager.listSceneItems() — [{ id, name, type, source, isPlayer, interactable }]
 */
export function SceneListPanel({ items, onSelect, onFocus }) {
  const places = items.filter((i) => i.type === 'environment');
  const objects = items.filter((i) => i.type !== 'environment');

  if (items.length === 0) {
    return (
      <div style={firstSectionStyle}>
        <span style={sectionLabelStyle}>Nothing here yet</span>
        <p style={{ ...hintStyle, marginTop: 0 }}>
          Add things from the library on the left, or make something new. They'll be listed here.
        </p>
        <Tips />
      </div>
    );
  }

  return (
    <div>
      <div style={firstSectionStyle}>
        <p style={{ ...hintStyle, marginTop: 0 }}>Click something to change it.</p>
      </div>
      {places.length > 0 && (
        <Group label={`Places (${places.length})`} items={places} onSelect={onSelect} onFocus={onFocus} first />
      )}
      {objects.length > 0 && (
        <Group label={`Objects (${objects.length})`} items={objects} onSelect={onSelect} onFocus={onFocus} first={!places.length} />
      )}
      <div style={{ ...sectionStyle, paddingBottom: 0 }}>
        <Tips />
      </div>
    </div>
  );
}

function Group({ label, items, onSelect, onFocus, first }) {
  return (
    <div style={first ? { paddingBottom: 12 } : { ...sectionStyle }}>
      <span style={sectionLabelStyle}>{label}</span>
      <ul style={listStyle}>
        {items.map((item) => (
          <li key={item.id} style={rowStyle}>
            <button style={rowButtonStyle} onClick={() => onSelect(item.id)} title={`Change ${item.name}`}>
              <span style={iconStyle} aria-hidden="true">
                {item.type === 'environment' ? '🏙️' : item.source === 'generated' ? '✨' : '🧸'}
              </span>
              <span style={nameStyle}>{item.name}</span>
              {item.isPlayer && <span style={{ ...badgeStyle, background: '#DBEAFE', color: BLUE }}>🎮 You</span>}
              {item.interactable && <span style={badgeStyle} title="Does something when you press E">E</span>}
              {item.source === 'upload' && (
                <span style={{ ...badgeStyle, background: '#FEF3C7', color: '#92400E' }} title="Added from this computer, so it won't be saved yet">
                  not saved
                </span>
              )}
            </button>
            <button style={focusButtonStyle} onClick={() => onFocus(item.id)} aria-label={`Look at ${item.name}`} title="Look at it">
              🔍
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tips() {
  return (
    <ul style={tipListStyle}>
      <li><strong>Click</strong> an object in the world to pick it</li>
      <li><strong>Drag</strong> an object to move it</li>
      <li><strong>Right-drag</strong> an object to turn it</li>
      <li><strong>Drag</strong> empty space to look around</li>
      <li><strong>Scroll</strong> to zoom (Shift for faster)</li>
    </ul>
  );
}

const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 };

const rowStyle = { display: 'flex', gap: 4 };

const rowButtonStyle = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 38,
  padding: '6px 10px',
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT,
  fontSize: 14,
  textAlign: 'left',
  cursor: 'pointer'
};

const iconStyle = { width: 20, textAlign: 'center', flexShrink: 0 };

const nameStyle = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 };

const badgeStyle = {
  flexShrink: 0,
  padding: '1px 6px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  background: '#E2E8F0',
  color: MUTED
};

const focusButtonStyle = {
  width: 38,
  flexShrink: 0,
  borderRadius: 8,
  border: `1px solid ${BORDER}`,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 14
};

const tipListStyle = { margin: '4px 0 0', paddingLeft: '18px', fontSize: '12px', color: MUTED, lineHeight: 1.8 };

export default SceneListPanel;