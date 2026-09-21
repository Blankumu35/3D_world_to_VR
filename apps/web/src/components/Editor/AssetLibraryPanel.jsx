import React, { useState, useRef } from 'react';
import { getLibraryFor } from '../../assets/AssetLibrary';

// The MIME type used on the drag event's DataTransfer so Canvas3D can tell
// a library-card drag apart from, say, a browser file drag.
export const ASSET_DRAG_MIME = 'application/x-vr-world-builder-asset';

/**
 * AssetLibraryPanel
 * Two tabs — Objects and Environments — each showing a grid of cards the
 * user can drag onto the canvas (Canvas3D reads ASSET_DRAG_MIME on drop) or
 * click to add at a default spot. Every tab also has an "upload your own"
 * section (local .glb/.gltf file or a URL) so custom environments and
 * objects both go through the same flow.
 */
export function AssetLibraryPanel({ onAddAsset, isImporting }) {
  const [activeTab, setActiveTab] = useState('objects'); // 'objects' | 'environments'
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef(null);

  const items = getLibraryFor(activeTab);
  const currentType = activeTab === 'environments' ? 'environment' : 'object';

  const handleDragStart = (e, item) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(
      ASSET_DRAG_MIME,
      JSON.stringify({ source: item.url, name: item.name, type: item.type })
    );
    // Fallback plain-text payload so a drop handler that only reads text
    // still gets something useful.
    e.dataTransfer.setData('text/plain', item.url);
  };

  const handleCardClick = (item) => {
    if (isImporting) return;
    onAddAsset({ source: item.url, name: item.name, type: item.type });
  };

  // ---- Upload-your-own (local file or URL), tagged with the active tab's type ----

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.glb') && !file.name.endsWith('.gltf')) {
      alert('Please select a valid .glb or .gltf 3D model file.');
      return;
    }

    onAddAsset({ source: file, name: file.name, type: currentType });
    e.target.value = ''; // Reset input selection
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (!urlInput.trim() || isImporting) return;

    onAddAsset({ source: urlInput.trim(), name: `model_${Date.now()}`, type: currentType });
    setUrlInput('');
  };

  return (
    <div style={panelStyle}>
      {/* ---- Tabs ---- */}
      <div style={tabRowStyle}>
        <button
          style={activeTab === 'objects' ? tabButtonActiveStyle : tabButtonStyle}
          onClick={() => setActiveTab('objects')}
        >
          📦 Objects
        </button>
        <button
          style={activeTab === 'environments' ? tabButtonActiveStyle : tabButtonStyle}
          onClick={() => setActiveTab('environments')}
        >
          🌍 Environments
        </button>
      </div>

      <p style={hintStyle}>Drag a card onto the scene, or click to add it.</p>

      {/* ---- Draggable grid ---- */}
      <div style={gridStyle}>
        {items.map((item) => (
          <div
            key={item.id}
            draggable={!isImporting}
            onDragStart={(e) => handleDragStart(e, item)}
            onClick={() => handleCardClick(item)}
            style={cardStyle}
            title={`Drag onto the scene, or click to add "${item.name}"`}
          >
            <span style={cardIconStyle}>{item.icon}</span>
            <span style={cardLabelStyle}>{item.name}</span>
          </div>
        ))}
      </div>

      {/* ---- Upload your own ---- */}
      <div style={uploadSectionStyle}>
        <p style={uploadLabelStyle}>
          Upload your own {currentType === 'environment' ? 'environment' : 'object'}
        </p>

        <input
          type="file"
          ref={fileInputRef}
          accept=".glb,.gltf"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          style={uploadButtonStyle}
        >
          📁 Upload Local .GLB File
        </button>

        <div style={orDividerStyle}>— OR —</div>

        <form onSubmit={handleUrlSubmit} style={{ display: 'flex', gap: '6px' }}>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste model URL (.glb)"
            disabled={isImporting}
            style={urlInputStyle}
          />
          <button type="submit" disabled={isImporting} style={submitButtonStyle}>
            Load
          </button>
        </form>
      </div>
    </div>
  );
}

const panelStyle = {
  position: 'absolute',
  top: '20px',
  left: '20px',
  width: '260px',
  maxHeight: 'calc(100vh - 40px)',
  overflowY: 'auto',
  background: 'rgba(255, 255, 255, 0.96)',
  padding: '16px',
  borderRadius: '12px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
  zIndex: 10,
  fontFamily: 'system-ui, sans-serif',
};

const tabRowStyle = { display: 'flex', gap: '6px', marginBottom: '10px' };

const tabButtonBase = {
  flex: 1,
  padding: '8px 6px',
  fontSize: '13px',
  fontWeight: 600,
  borderRadius: '8px',
  border: '1px solid #CBD5E1',
  cursor: 'pointer',
};

const tabButtonStyle = { ...tabButtonBase, background: '#F8FAFC', color: '#334155' };
const tabButtonActiveStyle = { ...tabButtonBase, background: '#2563EB', color: '#FFF', border: '1px solid #2563EB' };

const hintStyle = { fontSize: '11px', color: '#888', margin: '0 0 10px' };

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '8px',
  marginBottom: '14px',
};

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  padding: '10px 4px',
  borderRadius: '8px',
  border: '1px solid #E2E8F0',
  background: '#F8FAFC',
  cursor: 'grab',
  userSelect: 'none',
};

const cardIconStyle = { fontSize: '22px' };
const cardLabelStyle = { fontSize: '10px', fontWeight: 600, color: '#334155', textAlign: 'center' };

const uploadSectionStyle = {
  borderTop: '1px solid #E2E8F0',
  paddingTop: '12px',
};

const uploadLabelStyle = { fontSize: '11px', fontWeight: 600, color: '#666', margin: '0 0 8px' };

const uploadButtonStyle = {
  width: '100%',
  padding: '9px 12px',
  fontSize: '13px',
  fontWeight: '600',
  borderRadius: '8px',
  backgroundColor: '#2563EB',
  color: '#FFF',
  border: 'none',
  cursor: 'pointer',
};

const orDividerStyle = { margin: '8px 0', fontSize: '11px', color: '#666', textAlign: 'center' };

const urlInputStyle = {
  flex: 1,
  padding: '8px 10px',
  fontSize: '13px',
  borderRadius: '6px',
  border: '1px solid #CCC',
};

const submitButtonStyle = {
  padding: '8px 12px',
  fontSize: '13px',
  fontWeight: 'bold',
  borderRadius: '6px',
  backgroundColor: '#10B981',
  color: '#FFF',
  border: 'none',
  cursor: 'pointer',
};