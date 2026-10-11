import React, { useRef } from 'react';

/**
 * ScenePanel
 * Name the world, start a new one, save it to a file, or open a saved file.
 * Saving and opening are done in App.jsx (via AppManager.serializeScene /
 * loadScene); this component only collects the input. `lastAutosave` is the
 * time of the last automatic save to this browser, shown so it's clear work
 * is being kept.
 */
export function ScenePanel({ title, onTitleChange, onNew, onSave, onOpen, lastAutosave, isBusy }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so opening the same file twice still fires
    if (file) onOpen(file);
  };

  return (
    <div style={panelStyle}>
      <input
        type="text"
        value={title}
        maxLength={60}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Name your world"
        aria-label="World name"
        style={inputStyle}
      />
      <button style={buttonStyle} onClick={onNew} disabled={isBusy}>
        New world
      </button>
      <button style={buttonStyle} onClick={onSave} disabled={isBusy}>
        Save world
      </button>
      <button style={buttonStyle} onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
        Open world
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {lastAutosave && (
        <span style={statusStyle} aria-live="polite">
          Autosaved {lastAutosave.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}

const panelStyle = {
  position: 'absolute',
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  padding: 8,
  borderRadius: 8,
  background: 'rgba(20, 20, 26, 0.82)',
  color: '#eee',
  font: '12px system-ui, sans-serif',
  zIndex: 10
};

const inputStyle = {
  width: 160,
  padding: '5px 8px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.08)',
  color: '#eee',
  fontSize: 12
};

const buttonStyle = {
  padding: '5px 10px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.08)',
  color: '#eee',
  cursor: 'pointer',
  fontSize: 12
};

const statusStyle = { marginLeft: 4, color: '#9aa4c2', whiteSpace: 'nowrap' };