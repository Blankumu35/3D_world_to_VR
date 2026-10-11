import React from 'react';
import { BLUE, BORDER, SURFACE, TEXT } from './panelStyles';

/**
 * SidePanel
 * The right-hand card holding the World, Object and Player controls as
 * tabs, so only one set shows at a time and nothing can overlap. Styled to
 * match AssetLibraryPanel on the left. The body scrolls inside the card if
 * a tab is taller than the window.
 *
 * tabs: [{ id, label, content, dot? }] — `dot` shows a small marker on the
 * tab (used to hint that an object is selected while another tab is open).
 */
export function SidePanel({ tabs, activeTab, onTabChange }) {
  const current = tabs.find((t) => t.id === activeTab) || tabs[0];

  return (
    <div style={panelStyle}>
      <div style={tabRowStyle} role="tablist">
        {tabs.map((tab) => {
          const active = tab.id === current.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              style={active ? tabButtonActiveStyle : tabButtonStyle}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
              {tab.dot && !active && <span style={dotStyle} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div style={bodyStyle} role="tabpanel">
        {current.content}
      </div>
    </div>
  );
}

const panelStyle = {
  position: 'absolute',
  top: '20px',
  right: '20px',
  width: '300px',
  maxHeight: 'calc(100vh - 40px)',
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(255, 255, 255, 0.96)',
  borderRadius: '12px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
  zIndex: 10,
  fontFamily: 'system-ui, sans-serif',
  color: TEXT
};

const tabRowStyle = { display: 'flex', gap: '6px', padding: '16px 16px 12px' };

const tabButtonBase = {
  position: 'relative',
  flex: 1,
  padding: '8px 6px',
  fontSize: '13px',
  fontWeight: 600,
  borderRadius: '8px',
  cursor: 'pointer'
};
const tabButtonStyle = { ...tabButtonBase, background: SURFACE, color: TEXT, border: `1px solid ${BORDER}` };
const tabButtonActiveStyle = { ...tabButtonBase, background: BLUE, color: '#FFF', border: `1px solid ${BLUE}` };

const dotStyle = {
  position: 'absolute',
  top: '5px',
  right: '6px',
  width: '7px',
  height: '7px',
  borderRadius: '50%',
  background: BLUE
};

const bodyStyle = { padding: '0 16px 16px', overflowY: 'auto' };