import React from 'react';

/**
 * RestorePrompt
 * Shown on page load when an autosaved world exists. Asking first, rather
 * than reopening it silently, matters on shared machines: the next child
 * shouldn't find the previous child's world already on screen.
 */
export function RestorePrompt({ title, savedAt, onRestore, onStartNew, isBusy }) {
  const when = formatWhen(savedAt);

  return (
    <div style={backdropStyle}>
      <div style={cardStyle} role="dialog" aria-modal="true" aria-labelledby="restore-title">
        <p id="restore-title" style={titleStyle}>Carry on with your last world?</p>
        <p style={bodyStyle}>
          <strong>{title}</strong>
          {when && <> was saved {when}.</>}
        </p>
        <div style={rowStyle}>
          <button style={primaryButtonStyle} onClick={onRestore} disabled={isBusy} autoFocus>
            {isBusy ? 'Opening…' : 'Carry on'}
          </button>
          <button style={secondaryButtonStyle} onClick={onStartNew} disabled={isBusy}>
            Start new
          </button>
        </div>
      </div>
    </div>
  );
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const today = new Date().toDateString() === date.toDateString();
  return today ? `today at ${time}` : `on ${date.toLocaleDateString()} at ${time}`;
}

const backdropStyle = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(10, 12, 20, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50
};

const cardStyle = {
  width: 360,
  maxWidth: 'calc(100vw - 32px)',
  padding: 24,
  borderRadius: 16,
  background: '#fff',
  boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
  fontFamily: 'system-ui, sans-serif'
};

const titleStyle = { fontSize: 20, fontWeight: 800, margin: '0 0 8px' };
const bodyStyle = { fontSize: 15, color: '#444', margin: '0 0 20px', lineHeight: 1.5 };
const rowStyle = { display: 'flex', gap: 10 };

const buttonBase = {
  flex: 1,
  minHeight: 48,
  fontSize: 16,
  fontWeight: 700,
  borderRadius: 10,
  cursor: 'pointer'
};
const primaryButtonStyle = { ...buttonBase, border: 'none', background: '#2563EB', color: '#fff' };
const secondaryButtonStyle = { ...buttonBase, border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#334155' };