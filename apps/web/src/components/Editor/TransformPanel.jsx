import React from 'react';

/**
 * TransformPanel
 * Controlled UI for the selected object's position, rotation and scale.
 * Values flow down from App state; every change calls back up so the engine
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
          Click an object to move, turn or resize it.
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
      <label style={labelStyle}>Position</label>
      <AxisSlider
        axis="X"
        color="#EF4444"
        value={x}
        min={-25}
        max={25}
        step={0.1}
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
        step={0.1}
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
  return (
    <div style={rowStyle}>
      <span style={{ ...axisBadgeStyle, background: color }}>{axis}</span>
      <input
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
        value={Number(value).toFixed(step >= 1 ? 0 : 1)}
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
  width: '280px',
  maxHeight: 'calc(100vh - 40px)',
  overflowY: 'auto',
  background: 'rgba(255, 255, 255, 0.96)',
  padding: '16px',
  borderRadius: '12px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
  zIndex: 10,
  fontFamily: 'system-ui, sans-serif'
};

const titleStyle = { fontWeight: 'bold', margin: '0 0 12px 0', fontSize: '15px' };
const emptyStyle = { fontSize: '13px', color: '#666', lineHeight: 1.6, margin: 0 };
const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#444',
  margin: '14px 0 6px'
};
const rowStyle = { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' };
const scaleReadoutStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '12px',
  color: '#333'
};
const axisBadgeStyle = {
  width: '20px',
  height: '20px',
  borderRadius: '4px',
  color: '#fff',
  fontSize: '11px',
  fontWeight: 'bold',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0
};
const numberInputStyle = {
  width: '50px',
  padding: '4px 6px',
  fontSize: '12px',
  borderRadius: '6px',
  border: '1px solid #CCC'
};
const suffixStyle = { fontSize: '11px', color: '#888', width: '8px' };
const stepButtonStyle = {
  width: '26px',
  height: '26px',
  fontSize: '16px',
  fontWeight: 'bold',
  lineHeight: 1,
  borderRadius: '6px',
  border: '1px solid #CBD5E1',
  background: '#F8FAFC',
  cursor: 'pointer',
  flexShrink: 0
};
const quickRowStyle = { display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' };
const chipStyle = {
  flex: 1,
  padding: '6px 4px',
  fontSize: '11px',
  fontWeight: 600,
  borderRadius: '6px',
  border: '1px solid #CBD5E1',
  background: '#F8FAFC',
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};
const linkButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#2563EB',
  fontSize: '12px',
  cursor: 'pointer',
  padding: 0
};
const deleteButtonStyle = {
  width: '100%',
  marginTop: '14px',
  padding: '8px',
  fontSize: '13px',
  fontWeight: 600,
  borderRadius: '8px',
  border: 'none',
  background: '#EF4444',
  color: '#fff',
  cursor: 'pointer'
};