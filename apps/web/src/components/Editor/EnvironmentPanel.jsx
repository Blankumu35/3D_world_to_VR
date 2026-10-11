import React, { useRef, useState } from 'react';
import {
  sectionStyle,
  firstSectionStyle,
  sectionLabelStyle,
  hintStyle,
  rowStyle,
  chipStyle,
  checkboxLabelStyle,
  numberInputStyle,
  MUTED
} from './panelStyles';

// Shortcuts for the time-of-day slider. Each switches to the automatic sky
// (which follows the time) and jumps to a good-looking moment.
const SKY_PRESETS = [
  { name: '☀️ Day', time: 12 },
  { name: '🌇 Sunset', time: 17.75 },
  { name: '🌙 Night', time: 23 }
];

/** 13.5 -> "13:30" */
function formatTime(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.round((hours - Math.floor(hours)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const isDaytime = (hours) => hours >= 6 && hours <= 18;

/**
 * EnvironmentPanel ("World" tab of SidePanel)
 * Sky, sun & moon, and ground controls. Talks to AppManager only through
 * the callback props below — nothing here reaches into engineRef directly,
 * same pattern as AssetLibraryPanel's onAddAsset.
 */
export function EnvironmentPanel({
  skyType,
  onSetSkyboxImage,
  onSetDynamicSky,
  onClearSkybox,
  onSetTerrainTexture,
  onClearTerrainTexture,
  timeOfDay,
  shadows,
  onSetTimeOfDay,
  onSetShadows,
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
    <div>
      {/* ---- Time of day: drives the sun/moon and the automatic sky ---- */}
      <div style={firstSectionStyle}>
        <span style={sectionLabelStyle}>Time of day</span>
        <div style={rowStyle}>
          {SKY_PRESETS.map((p) => (
            <button
              key={p.name}
              style={chipStyle}
              disabled={isBusy}
              onClick={() => {
                onSetDynamicSky();
                onSetTimeOfDay(p.time);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        <label style={{ ...rowStyle, gap: '10px', marginTop: '10px' }}>
          <span aria-hidden="true" style={{ width: '18px', textAlign: 'center' }}>
            {isDaytime(timeOfDay) ? '☀️' : '🌙'}
          </span>
          <input
            type="range"
            min={0}
            max={24}
            step={0.25}
            value={timeOfDay}
            onChange={(e) => onSetTimeOfDay(Number(e.target.value))}
            aria-label="Time of day"
            style={{ flex: 1 }}
          />
          <span style={{ width: '40px', textAlign: 'right', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(timeOfDay)}
          </span>
        </label>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={shadows} onChange={(e) => onSetShadows(e.target.checked)} />
          Shadows
        </label>
      </div>

      {/* ---- Sky ---- */}
      <div style={sectionStyle}>
        <span style={sectionLabelStyle}>Sky</span>
        <div style={rowStyle}>
          <button
            style={chipStyle}
            disabled={isBusy}
            onClick={() => skyFileInputRef.current?.click()}
          >
            Upload photo…
          </button>
          <button style={chipStyle} disabled={isBusy} onClick={onClearSkybox}>
            Plain
          </button>
        </div>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={flipSky}
            onChange={(e) => setFlipSky(e.target.checked)}
          />
          Photo looks upside down
        </label>
        {skyType === 'image' && (
          <p style={hintStyle}>Your sky photo stays the same at every time of day.</p>
        )}
        {skyType !== 'dynamic' && (
          <button
            style={{ ...chipStyle, width: '100%', marginTop: '8px' }}
            disabled={isBusy}
            onClick={onSetDynamicSky}
          >
            Make the sky follow the time
          </button>
        )}
        <input
          ref={skyFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleSkyFile}
        />
      </div>

      {/* ---- Ground ---- */}
      <div style={{ ...sectionStyle, paddingBottom: 0 }}>
        <span style={sectionLabelStyle}>Ground</span>
        <div style={rowStyle}>
          <button
            style={chipStyle}
            disabled={isBusy}
            onClick={() => terrainFileInputRef.current?.click()}
          >
            Upload texture…
          </button>
          <button style={chipStyle} disabled={isBusy} onClick={onClearTerrainTexture}>
            Plain colour
          </button>
        </div>
        <label style={{ ...rowStyle, gap: '8px', marginTop: '8px', fontSize: '13px' }}>
          Repeat texture
          <input
            type="number"
            min={1}
            max={100}
            value={tiling}
            onChange={(e) => setTiling(Number(e.target.value) || 1)}
            style={numberInputStyle}
          />
          <span style={{ fontSize: '12px', color: MUTED }}>times</span>
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