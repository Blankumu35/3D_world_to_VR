import React from 'react';
import { GRID_SIZE } from '../../playcanvas/AppManager';
import {
  firstSectionStyle,
  sectionStyle,
  sectionLabelStyle,
  hintStyle,
  rowStyle,
  chipStyle,
  dangerButtonStyle,
  numberInputStyle,
  BLUE,
  BORDER,
  SURFACE,
  TEXT,
  MUTED
} from './panelStyles';

/**
 * TransformPanel ("Object" tab of SidePanel)
 * Controlled UI for the selected object's size, rotation and position.
 * Junior mode: large slider thumbs and plain words, everything the child
 * needs and nothing more. Values flow down from App state; every change
 * calls back up so the engine remains the single source of truth.
 */
export function TransformPanel({
  selection,
  onPositionChange,
  onRotationChange,
  onScaleLevelChange,
  onDropToGround,
  onFocus,
  onDelete
}) {
  if (!selection) {
    return (
      <div style={firstSectionStyle}>
        <span style={sectionLabelStyle}>Nothing selected</span>
        <p style={{ ...hintStyle, marginTop: 0 }}>Click an object to move, turn or resize it.</p>
        <ul style={tipListStyle}>
          <li><strong>Drag</strong> an object to move it</li>
          <li><strong>Right-drag</strong> an object to turn it</li>
          <li><strong>Drag</strong> empty space to look around</li>
          <li><strong>Scroll</strong> to zoom (Shift for faster)</li>
        </ul>
      </div>
    );
  }

  const [x, y, z] = selection.position;
  const [rx, ry, rz] = selection.rotation;

  const handleAxis = (axis, value) => {
    const next = [...selection.position];
    next[axis] = Number(value);
    onPositionChange(next);
  };

  const handleRotAxis = (axis, value) => {
    const next = [...selection.rotation];
    next[axis] = Number(value);
    onRotationChange(next);
  };

  return (
    <div>
      <style>{sliderCss}</style>

      {/* ---- Size ---- */}
      <div style={firstSectionStyle}>
        <div style={{ ...rowStyle, justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ ...sectionLabelStyle, margin: 0 }}>Size</span>
          <span style={{ fontSize: '12px', color: MUTED }}>
            {formatFactor(selection.scaleFactor)} ·{' '}
            <button style={linkButtonStyle} onClick={() => onScaleLevelChange(0)}>
              reset
            </button>
          </span>
        </div>
        <div style={{ ...rowStyle, gap: '8px' }}>
          <button
            style={stepButtonStyle}
            aria-label="Smaller"
            onClick={() => onScaleLevelChange(selection.scaleLevel - 5)}
          >
            −
          </button>
          <input
            className="jr-slider"
            type="range"
            min="-100"
            max="100"
            step="1"
            value={selection.scaleLevel}
            onChange={(e) => onScaleLevelChange(Number(e.target.value))}
            aria-label="Size"
            style={{ flex: 1 }}
          />
          <button
            style={stepButtonStyle}
            aria-label="Bigger"
            onClick={() => onScaleLevelChange(selection.scaleLevel + 5)}
          >
            +
          </button>
        </div>
      </div>

      {/* ---- Rotation ---- */}
      <div style={sectionStyle}>
        <span style={sectionLabelStyle}>Turn</span>
        <AxisSlider axis="X" color="#EF4444" value={rx} min={0} max={360} step={1} suffix="°" onChange={(v) => handleRotAxis(0, v)} />
        <AxisSlider axis="Y" color="#22C55E" value={ry} min={0} max={360} step={1} suffix="°" onChange={(v) => handleRotAxis(1, v)} />
        <AxisSlider axis="Z" color="#3B82F6" value={rz} min={0} max={360} step={1} suffix="°" onChange={(v) => handleRotAxis(2, v)} />
        <div style={{ ...rowStyle, marginTop: '4px' }}>
          <button style={chipStyle} onClick={() => handleRotAxis(1, (ry + 90) % 360)}>
            ↻ Turn 90°
          </button>
          <button style={chipStyle} onClick={() => onRotationChange([0, 0, 0])}>
            ↺ Straighten
          </button>
        </div>
      </div>

      {/* ---- Position ---- */}
      {/* X/Z step in whole grid cells (see GRID_SIZE in AppManager.js) —
          the engine snaps to the grid regardless, so showing finer
          precision here would just be misleading. Y stays free/continuous:
          height isn't part of the grid. */}
      <div style={sectionStyle}>
        <span style={sectionLabelStyle}>Position</span>
        <AxisSlider axis="X" color="#EF4444" value={x} min={-25} max={25} step={GRID_SIZE} onChange={(v) => handleAxis(0, v)} />
        <AxisSlider axis="Y" color="#22C55E" value={y} min={0} max={20} step={0.1} onChange={(v) => handleAxis(1, v)} />
        <AxisSlider axis="Z" color="#3B82F6" value={z} min={-25} max={25} step={GRID_SIZE} onChange={(v) => handleAxis(2, v)} />
        <div style={{ ...rowStyle, marginTop: '4px' }}>
          <button style={chipStyle} onClick={() => onPositionChange([0, y, 0])}>
            Centre
          </button>
          <button style={chipStyle} onClick={onDropToGround}>
            On ground
          </button>
          <button style={chipStyle} onClick={onFocus}>
            Look at it
          </button>
        </div>
      </div>

      <div style={{ ...sectionStyle, paddingBottom: 0 }}>
        <button style={dangerButtonStyle} onClick={onDelete}>
          🗑️ Remove object
        </button>
      </div>
    </div>
  );
}

function formatFactor(factor) {
  if (factor >= 1) return `${factor.toFixed(2)}× bigger`;
  return `${(1 / factor).toFixed(2)}× smaller`;
}

function AxisSlider({ axis, color, value, min, max, step, suffix = '', onChange }) {
  const wholeStep = step >= 1;
  return (
    <div style={{ ...rowStyle, gap: '8px', marginBottom: '8px' }}>
      <span style={{ ...axisBadgeStyle, background: color }} aria-hidden="true">{axis}</span>
      <input
        className="jr-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${axis} ${suffix ? 'turn' : 'position'}`}
        style={{ flex: 1, minWidth: 0 }}
      />
      <input
        type="number"
        value={Number(value).toFixed(wholeStep ? 0 : 1)}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${axis} value`}
        style={numberInputStyle}
      />
      <span style={{ width: '8px', fontSize: '12px', color: MUTED }}>{suffix}</span>
    </div>
  );
}

// Big round thumbs for small hands; the track itself stays slim.
const sliderCss = `
  .jr-slider { -webkit-appearance: none; appearance: none; height: 8px; border-radius: 999px; background: #E2E8F0; outline: none; }
  .jr-slider:focus-visible { outline: 2px solid ${BLUE}; outline-offset: 4px; }
  .jr-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: ${BLUE}; border: 3px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.35); cursor: pointer; }
  .jr-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: ${BLUE}; border: 3px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.35); cursor: pointer; }
`;

const axisBadgeStyle = {
  width: '24px',
  height: '24px',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '12px',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0
};

const stepButtonStyle = {
  width: '34px',
  height: '34px',
  fontSize: '18px',
  fontWeight: 700,
  lineHeight: 1,
  borderRadius: '8px',
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: TEXT,
  cursor: 'pointer',
  flexShrink: 0
};

const linkButtonStyle = {
  background: 'none',
  border: 'none',
  color: BLUE,
  fontSize: '12px',
  cursor: 'pointer',
  padding: 0
};

const tipListStyle = { margin: '10px 0 0', paddingLeft: '18px', fontSize: '12px', color: MUTED, lineHeight: 1.8 };