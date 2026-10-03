import React from 'react';
import { GRID_SIZE } from '../../playcanvas/AppManager';

/**
 * TransformPanel
 * Controlled UI for the selected object's position, rotation and scale.
 * Junior mode only: sized for large touch targets and legible-at-a-glance
 * numbers, everything the child needs and nothing more — no advanced/
 * variable controls, no colour picker, no way to loosen the grid. Values
 * flow down from App state; every change calls back up so the engine
 * remains the single source of truth.
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
      <div style={panelStyle}>
        <p style={titleStyle}>🎯 Selected Object</p>
        <p style={emptyStyle}>
          Tap an object to move, turn or resize it.
          <br />
          <br />
          <strong>Drag</strong> empty space to look around
          <br />
          <strong>Scroll</strong> to zoom (hold Shift to zoom faster)
          <br />
          <strong>Right-drag</strong> an object to turn it
        </p>
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
    <div style={panelStyle}>
      <style>{`
        .jr-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 14px;
          border-radius: 999px;
          background: #E2E8F0;
          outline: none;
        }
        .jr-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #2563EB;
          border: 3px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.35);
          cursor: pointer;
        }
        .jr-slider::-moz-range-thumb {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #2563EB;
          border: 3px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.35);
          cursor: pointer;
        }
      `}</style>

      <p style={titleStyle}>🎯 Selected Object</p>

      {/* ---- Size ---- */}
      <label style={labelStyle}>Size</label>
      <div style={rowStyle}>
        <button
          style={stepButtonStyle}
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
          style={{ flex: 1 }}
        />
        <button
          style={stepButtonStyle}
          onClick={() => onScaleLevelChange(selection.scaleLevel + 5)}
        >
          +
        </button>
      </div>
      <div style={scaleReadoutStyle}>
        <span>{formatFactor(selection.scaleFactor)}</span>
        <button style={linkButtonStyle} onClick={() => onScaleLevelChange(0)}>
          reset
        </button>
      </div>

      {/* ---- Rotation ---- */}
      <label style={labelStyle}>Turn</label>
      <AxisSlider
        axis="X"
        color="#EF4444"
        value={rx}
        min={0}
        max={360}
        step={1}
        suffix="°"
        onChange={(v) => handleRotAxis(0, v)}
      />
      <AxisSlider
        axis="Y"
        color="#22C55E"
        value={ry}
        min={0}
        max={360}
        step={1}
        suffix="°"
        onChange={(v) => handleRotAxis(1, v)}
      />
      <AxisSlider
        axis="Z"
        color="#3B82F6"
        value={rz}
        min={0}
        max={360}
        step={1}
        suffix="°"
        onChange={(v) => handleRotAxis(2, v)}
      />
      <div style={quickRowStyle}>
        <button style={chipStyle} onClick={() => handleRotAxis(1, (ry + 90) % 360)}>
          ↻ 90°
        </button>
        <button style={chipStyle} onClick={() => onRotationChange([0, 0, 0])}>
          ↺ straighten
        </button>
      </div>

      {/* ---- Position ---- */}
      {/* X/Z step in whole grid cells (see GRID_SIZE in AppManager.js) —
          the engine snaps to the grid regardless, so showing finer
          precision here would just be misleading. Y stays free/continuous:
          height isn't part of the grid. */}
      <label style={labelStyle}>Position</label>
      <AxisSlider
        axis="X"
        color="#EF4444"
        value={x}
        min={-25}
        max={25}
        step={GRID_SIZE}
        onChange={(v) => handleAxis(0, v)}
      />
      <AxisSlider
        axis="Y"
        color="#22C55E"
        value={y}
        min={0}
        max={20}
        step={0.1}
        onChange={(v) => handleAxis(1, v)}
      />
      <AxisSlider
        axis="Z"
        color="#3B82F6"
        value={z}
        min={-25}
        max={25}
        step={GRID_SIZE}
        onChange={(v) => handleAxis(2, v)}
      />
      <div style={quickRowStyle}>
        <button style={chipStyle} onClick={() => onPositionChange([0, y, 0])}>
          ⌖ centre
        </button>
        <button style={chipStyle} onClick={onDropToGround}>
          ⬇ on ground
        </button>
        <button style={chipStyle} onClick={onFocus}>
          🔍 focus
        </button>
      </div>

      <button style={deleteButtonStyle} onClick={onDelete}>
        🗑️ Remove object
      </button>
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
    <div style={rowStyle}>
      <span style={{ ...axisBadgeStyle, background: color }}>{axis}</span>
      <input
        className="jr-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1 }}
      />
      <input
        type="number"
        value={Number(value).toFixed(wholeStep ? 0 : 1)}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        style={numberInputStyle}
      />
      {suffix && <span style={suffixStyle}>{suffix}</span>}
    </div>
  );
}

const panelStyle = {
  position: 'absolute',
  top: '20px',
  right: '20px',
  width: '320px',
  maxHeight: 'calc(100vh - 40px)',
  overflowY: 'auto',
  background: 'rgba(255, 255, 255, 0.97)',
  padding: '18px',
  borderRadius: '16px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
  zIndex: 10,
  fontFamily: 'system-ui, sans-serif'
};

const titleStyle = { fontWeight: 800, margin: '0 0 14px 0', fontSize: '18px' };
const emptyStyle = { fontSize: '15px', color: '#666', lineHeight: 1.7, margin: 0 };
const labelStyle = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 700,
  color: '#444',
  margin: '16px 0 8px'
};
const rowStyle = { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' };
const scaleReadoutStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '14px',
  color: '#333'
};
const axisBadgeStyle = {
  width: '30px',
  height: '30px',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 'bold',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0
};
const numberInputStyle = {
  width: '64px',
  padding: '8px 6px',
  fontSize: '15px',
  borderRadius: '8px',
  border: '1px solid #CCC',
  textAlign: 'center'
};
const suffixStyle = { fontSize: '13px', color: '#888', width: '12px' };
const stepButtonStyle = {
  width: '40px',
  height: '40px',
  fontSize: '22px',
  fontWeight: 'bold',
  lineHeight: 1,
  borderRadius: '10px',
  border: '1px solid #CBD5E1',
  background: '#F8FAFC',
  cursor: 'pointer',
  flexShrink: 0
};
const quickRowStyle = { display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' };
const chipStyle = {
  flex: 1,
  padding: '10px 6px',
  fontSize: '14px',
  fontWeight: 700,
  borderRadius: '10px',
  border: '1px solid #CBD5E1',
  background: '#F8FAFC',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  minHeight: '44px'
};
const linkButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#2563EB',
  fontSize: '14px',
  cursor: 'pointer',
  padding: 0
};
const deleteButtonStyle = {
  width: '100%',
  marginTop: '16px',
  padding: '12px',
  fontSize: '15px',
  fontWeight: 700,
  borderRadius: '10px',
  border: 'none',
  background: '#EF4444',
  color: '#fff',
  cursor: 'pointer',
  minHeight: '48px'
};