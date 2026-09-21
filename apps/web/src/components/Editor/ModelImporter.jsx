import React, { useState, useRef } from 'react';

export function ModelImporter({ onImportModel, isImporting }) {
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef(null);

  // Handle local file selection (.glb / .gltf)
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.glb') && !file.name.endsWith('.gltf')) {
      alert('Please select a valid .glb or .gltf 3D model file.');
      return;
    }

    onImportModel(file, file.name);
    e.target.value = ''; // Reset input selection
  };

  // Handle URL form submit
  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (!urlInput.trim() || isImporting) return;

    onImportModel(urlInput.trim(), `model_${Date.now()}`);
    setUrlInput('');
  };

  return (
    <div style={importerContainerStyle}>
      <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>📦 Import 3D Object</p>

      {/* Local File Selector */}
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

      <div style={{ margin: '8px 0', fontSize: '12px', color: '#666' }}>— OR —</div>

      {/* URL Import Form */}
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
  );
}

const importerContainerStyle = {
  position: 'absolute',
  top: '20px',
  left: '20px',
  background: 'rgba(255, 255, 255, 0.95)',
  padding: '16px',
  borderRadius: '12px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: '240px',
};

const uploadButtonStyle = {
  width: '100%',
  padding: '10px 14px',
  fontSize: '14px',
  fontWeight: '600',
  borderRadius: '8px',
  backgroundColor: '#2563EB',
  color: '#FFF',
  border: 'none',
  cursor: 'pointer',
};

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