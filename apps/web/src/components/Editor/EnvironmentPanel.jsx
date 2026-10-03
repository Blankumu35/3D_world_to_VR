import React, { useRef, useState } from 'react';

// A handful of ready-made gradients so "make it immersive" doesn't require
// hunting down a 360 photo first — pick one, or drop in your own image.
const SKY_PRESETS = [
  { name: 'Clear Day', top: '#4a90d9', bottom: '#dfe9f3' },
  { name: 'Sunset', top: '#2b3a67', bottom: '#f0956a' },
  { name: 'Night', top: '#02040a', bottom: '#1b2540' }
];

const panelStyle = {
  position: 'absolute',
  top: 16,
  right: 16,
  width: 220,
  padding: 12,
  borderRadius: 8,
  background: 'rgba(20, 20, 26, 0.82)',
  color: '#eee',
  font: '12px system-ui, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  gap: 10
};

const sectionTitleStyle = { fontWeight: 600, marginBottom: 4 };
const rowStyle = { display: 'flex', gap: 6, flexWrap: 'wrap' };
const buttonStyle = {
  flex: '1 1 auto',
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.08)',
  color: '#eee',
  cursor: 'pointer',
  fontSize: 11
};

/**
 * Skybox photo/gradient + terrain texture controls. Talks to AppManager
 * only through the callback props below — nothing here reaches into
 * engineRef directly, same pattern as AssetLibraryPanel's onAddAsset.
 */
export function EnvironmentPanel({
  onSetSkyboxImage,
  onSetSkyboxGradient,
  onClearSkybox,
  onSetTerrainTexture,
  onClearTerrainTexture,
  isBusy
}) {
  const skyFileInputRef = useRef(null);
  const terrainFileInputRef = useRef(null);
  const [flipSky, setFlipSky] = useState(false);
  const [tiling, setTiling] = useState(10);

  const handleSkyFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (file) onSetSkyboxImage(file, { flipV: flipSky });
  };

  const handleTerrainFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onSetTerrainTexture(file, [tiling, tiling]);
  };

  return (
    <div style={panelStyle}>
      <div>
        <div style={sectionTitleStyle}>Skybox</div>
        <div style={rowStyle}>
          {SKY_PRESETS.map((p) => (
            <button
              key={p.name}
              style={buttonStyle}
              disabled={isBusy}
              onClick={() => onSetSkyboxGradient(p.top, p.bottom)}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div style={{ ...rowStyle, marginTop: 6, alignItems: 'center' }}>
          <button
            style={buttonStyle}
            disabled={isBusy}
            onClick={() => skyFileInputRef.current?.click()}
          >
            Upload photo…
          </button>
          <button style={buttonStyle} disabled={isBusy} onClick={onClearSkybox}>
            Clear
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <input
            type="checkbox"
            checked={flipSky}
            onChange={(e) => setFlipSky(e.target.checked)}
          />
          Photo looks upside down
        </label>
        <input
          ref={skyFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleSkyFile}
        />
      </div>

      <div>
        <div style={sectionTitleStyle}>Ground texture</div>
        <div style={rowStyle}>
          <button
            style={buttonStyle}
            disabled={isBusy}
            onClick={() => terrainFileInputRef.current?.click()}
          >
            Upload texture…
          </button>
          <button style={buttonStyle} disabled={isBusy} onClick={onClearTerrainTexture}>
            Plain colour
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          Tiling
          <input
            type="number"
            min={1}
            max={100}
            value={tiling}
            onChange={(e) => setTiling(Number(e.target.value) || 1)}
            style={{ width: 48 }}
          />
        </label>
        <input
          ref={terrainFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleTerrainFile}
        />
      </div>
    </div>
  );
}

export default EnvironmentPanel;