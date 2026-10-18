import React, { useState } from 'react';
import { publishScene, writePreview } from '../../services/publish';

/**
 * ViewInVRDialog
 * Opened from ScenePanel's "View in VR" button. Two choices:
 * - "Try it here": opens the viewer in a new tab on this computer.
 * - "Send to headset": publishes the world to the server and shows a short
 *   room code to type into the viewer on the headset.
 *
 * `getScene()` returns { scene, warnings } from AppManager.serializeScene,
 * called at click time so the newest version of the world is sent.
 */
export function ViewInVRDialog({ getScene, onClose }) {
  const [status, setStatus] = useState('choose'); // 'choose' | 'sending' | 'sent' | 'error'
  const [code, setCode] = useState(null);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);

  const snapshot = () => {
    try {
      const result = getScene();
      setWarnings(result.warnings);
      return result.scene;
    } catch (err) {
      setError(err.message);
      setStatus('error');
      return null;
    }
  };

  const handlePreview = () => {
    const scene = snapshot();
    if (!scene) return;
    if (!writePreview(scene)) {
      setError('This browser would not let the world be passed to the viewer. Try "Send to headset" instead.');
      setStatus('error');
      return;
    }
    window.open('/view?preview', '_blank', 'noopener');
    onClose();
  };

  const handleSend = async () => {
    const scene = snapshot();
    if (!scene) return;
    setStatus('sending');
    try {
      const result = await publishScene(scene);
      setCode(result.code);
      setStatus('sent');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vr-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="vr-dialog-title" style={titleStyle}>🥽 Step inside your world</p>

        {status === 'choose' && (
          <>
            <p style={bodyStyle}>Where do you want to look at it?</p>
            <div style={columnStyle}>
              <button style={primaryButtonStyle} onClick={handleSend} autoFocus>
                Send to headset
              </button>
              <button style={secondaryButtonStyle} onClick={handlePreview}>
                Try it on this computer
              </button>
            </div>
          </>
        )}

        {status === 'sending' && <p style={bodyStyle}>Sending your world…</p>}

        {status === 'sent' && (
          <>
            <p style={bodyStyle}>On the headset, open the viewer and type this code:</p>
            <p style={codeStyle} aria-label={`Room code ${code.split('').join(' ')}`}>
              {code}
            </p>
            <p style={smallStyle}>
              Viewer address: <strong>{window.location.host}/view</strong>
              <br />
              Changed something? Press "View in VR" again to get a new code.
            </p>
            <button style={primaryButtonStyle} onClick={onClose}>
              Done
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <p style={{ ...bodyStyle, color: '#B91C1C' }}>{error}</p>
            <div style={rowStyle}>
              <button style={secondaryButtonStyle} onClick={() => setStatus('choose')}>
                Back
              </button>
              <button style={secondaryButtonStyle} onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}

        {warnings.length > 0 && status !== 'error' && (
          <p style={warningStyle}>Left out: {warnings.join(' ')}</p>
        )}
      </div>
    </div>
  );
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
  width: 380,
  maxWidth: 'calc(100vw - 32px)',
  padding: 24,
  borderRadius: 16,
  background: '#fff',
  boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
  fontFamily: 'system-ui, sans-serif',
  color: '#1E293B'
};

const titleStyle = { fontSize: 20, fontWeight: 800, margin: '0 0 8px' };
const bodyStyle = { fontSize: 15, color: '#444', margin: '0 0 16px', lineHeight: 1.5 };
const smallStyle = { fontSize: 13, color: '#64748B', margin: '0 0 16px', lineHeight: 1.6 };
const warningStyle = { fontSize: 12, color: '#92400E', margin: '14px 0 0', lineHeight: 1.5 };
const rowStyle = { display: 'flex', gap: 10 };
const columnStyle = { display: 'flex', flexDirection: 'column', gap: 10 };

const codeStyle = {
  fontSize: 44,
  fontWeight: 800,
  letterSpacing: '0.18em',
  textAlign: 'center',
  fontFamily: 'ui-monospace, Menlo, monospace',
  background: '#F1F5F9',
  borderRadius: 12,
  padding: '12px 0',
  margin: '0 0 16px'
};

const buttonBase = {
  width: '100%',
  minHeight: 48,
  fontSize: 16,
  fontWeight: 700,
  borderRadius: 10,
  cursor: 'pointer'
};
const primaryButtonStyle = { ...buttonBase, border: 'none', background: '#2563EB', color: '#fff' };
const secondaryButtonStyle = { ...buttonBase, border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#334155' };

export default ViewInVRDialog;