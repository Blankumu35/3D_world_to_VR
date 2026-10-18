import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppManager } from '../web/src/playcanvas/AppManager';
import { CharacterControls } from '../web/src/components/Controls/CharacterControls';
import {
  fetchPublishedScene,
  normaliseRoomCode,
  readPreview,
  resolveAssetUrl,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH
} from '../web/src/services/publish';

/**
 * ViewerApp — the page at /view and /view/CODE.
 *
 * Shows one published world with none of the editor's panels, so a headset
 * only downloads and runs what it needs. Three ways in:
 * - /view/CODE      loads that published world from the server
 * - /view           shows a big keypad to type a room code (easiest on a
 *                   headset, where typing a long address is painful)
 * - /view?preview   loads the world the editor just handed over through
 *                   localStorage ("Try it on this computer")
 *
 * On a headset an "Enter VR" button appears; on a laptop you can look
 * around with the mouse and walk with W A S D.
 */
export function ViewerApp() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  const initial = parseLocation();
  const [code, setCode] = useState(initial.code);
  const [isPreview] = useState(initial.preview);
  const [status, setStatus] = useState(initial.code || initial.preview ? 'loading' : 'enter-code');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [vr, setVr] = useState({ available: false, inVR: false });

  // ---- Engine: created once, read-only (no selecting or moving things) ----
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new AppManager(
      canvasRef.current,
      { onXRChange: (state) => setVr((prev) => ({ ...prev, ...state })) },
      { readOnly: true }
    );
    engineRef.current = engine;
    setVr({ available: engine.isVRAvailable(), inVR: false });
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // ---- Load the world whenever the code changes ----
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || (!code && !isPreview)) return;
    let cancelled = false;

    (async () => {
      setStatus('loading');
      setError('');
      try {
        const doc = code ? await fetchPublishedScene(code) : readPreview();
        if (!doc) throw new Error('There is no world to preview. Go back to the editor and press "View in VR".');
        const result = await engine.loadScene(doc, resolveAssetUrl);
        if (cancelled) return;
        setTitle(engine.sceneMeta.title);
        setWarnings(result.warnings);
        setStatus('ready');
        document.title = `${engine.sceneMeta.title} · VR viewer`;
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError(err.message);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, isPreview]);

  const openCode = useCallback((next) => {
    window.history.pushState(null, '', `/view/${next}`);
    setCode(next);
  }, []);

  const backToKeypad = () => {
    window.history.pushState(null, '', '/view');
    setCode(null);
    setStatus('enter-code');
  };

  // Back/forward buttons between /view and /view/CODE.
  useEffect(() => {
    const onPop = () => {
      const loc = parseLocation();
      setCode(loc.code);
      if (!loc.code && !loc.preview) setStatus('enter-code');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleEnterVR = () => {
    // Must run inside the click: browsers only allow VR from a user action.
    engineRef.current?.enterVR();
  };

  const handleMoveInputChange = useCallback((input) => {
    engineRef.current?.setMoveInput(input);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#111' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {status === 'ready' && !vr.inVR && (
        <>
          <div style={topBarStyle}>
            <span style={{ fontWeight: 700 }}>{title}</span>
            {code && <span style={codeChipStyle}>{code}</span>}
            {!isPreview && (
              <button style={smallButtonStyle} onClick={backToKeypad}>
                Another world
              </button>
            )}
          </div>

          <div style={bottomStyle}>
            {vr.available ? (
              <button style={enterVrButtonStyle} onClick={handleEnterVR}>
                🥽 Enter VR
              </button>
            ) : (
              <p style={noVrStyle}>
                No headset found. Drag to look around and walk with W A S D.
                <br />
                To step inside, open this page on a headset.
              </p>
            )}
            {vr.error && <p style={{ ...noVrStyle, color: '#FCA5A5' }}>VR could not start: {vr.error}</p>}
            {warnings.length > 0 && <p style={warningStyle}>Missing: {warnings.join(' ')}</p>}
          </div>
          <CharacterControls onMoveInputChange={handleMoveInputChange} />
        </>
      )}

      {status === 'enter-code' && <CodeKeypad onSubmit={openCode} />}

      {status === 'loading' && (
        <div style={overlayStyle}>
          <p style={bigTextStyle}>Opening world{code ? ` ${code}` : ''}…</p>
        </div>
      )}

      {status === 'error' && (
        <div style={overlayStyle}>
          <div style={cardStyle}>
            <p style={{ ...bigTextStyle, fontSize: 22 }}>Hmm, that didn't work</p>
            <p style={bodyStyle}>{error}</p>
            {!isPreview && (
              <button style={primaryButtonStyle} onClick={backToKeypad}>
                Type a different code
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** /view/ABC123 -> { code: 'ABC123' }, /view?preview -> { preview: true } */
function parseLocation() {
  const match = window.location.pathname.match(/^\/view\/([^/]+)\/?$/);
  const code = match ? normaliseRoomCode(decodeURIComponent(match[1])) : '';
  const preview = new URLSearchParams(window.location.search).has('preview');
  return { code: code.length === ROOM_CODE_LENGTH ? code : null, preview: !code && preview };
}

/**
 * Room-code entry with large keys: pointing a controller at a 6-letter
 * code is much easier than using the headset's keyboard. The text box
 * still works for a real keyboard.
 */
function CodeKeypad({ onSubmit }) {
  const [value, setValue] = useState('');
  const complete = value.length === ROOM_CODE_LENGTH;

  const press = (c) => setValue((v) => normaliseRoomCode(v + c));
  const submit = () => {
    if (complete) onSubmit(value);
  };

  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, width: 560 }}>
        <p style={{ ...bigTextStyle, fontSize: 24, margin: '0 0 6px' }}>🥽 Visit a world</p>
        <p style={bodyStyle}>Type the code from the laptop.</p>
        <input
          value={value}
          onChange={(e) => setValue(normaliseRoomCode(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          aria-label="Room code"
          placeholder="ABC234"
          autoFocus
          style={codeInputStyle}
        />
        <div style={keypadStyle}>
          {ROOM_CODE_ALPHABET.split('').map((c) => (
            <button key={c} style={keyStyle} onClick={() => press(c)} disabled={complete}>
              {c}
            </button>
          ))}
          <button
            style={{ ...keyStyle, gridColumn: 'span 2', background: '#F1F5F9' }}
            onClick={() => setValue((v) => v.slice(0, -1))}
            aria-label="Delete last letter"
          >
            ⌫
          </button>
        </div>
        <button style={{ ...primaryButtonStyle, opacity: complete ? 1 : 0.5 }} onClick={submit} disabled={!complete}>
          Go
        </button>
      </div>
    </div>
  );
}

// ---- Styles ----

const overlayStyle = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(180deg, #1E3A8A 0%, #0F172A 100%)',
  fontFamily: 'system-ui, sans-serif',
  zIndex: 20
};

const cardStyle = {
  width: 420,
  maxWidth: 'calc(100vw - 32px)',
  padding: 28,
  borderRadius: 20,
  background: '#fff',
  boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
  color: '#1E293B'
};

const bigTextStyle = { fontSize: 28, fontWeight: 800, color: 'inherit', margin: '0 0 12px' };
const bodyStyle = { fontSize: 16, color: '#475569', margin: '0 0 18px', lineHeight: 1.5 };

const codeInputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: 40,
  fontWeight: 800,
  letterSpacing: '0.25em',
  textAlign: 'center',
  fontFamily: 'ui-monospace, Menlo, monospace',
  padding: '10px 0',
  borderRadius: 12,
  border: '2px solid #CBD5E1',
  marginBottom: 16,
  color: '#0F172A'
};

const keypadStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(8, 1fr)',
  gap: 8,
  marginBottom: 16
};

const keyStyle = {
  minHeight: 52,
  fontSize: 22,
  fontWeight: 700,
  borderRadius: 10,
  border: '1px solid #CBD5E1',
  background: '#fff',
  color: '#0F172A',
  cursor: 'pointer'
};

const primaryButtonStyle = {
  width: '100%',
  minHeight: 56,
  fontSize: 20,
  fontWeight: 800,
  borderRadius: 12,
  border: 'none',
  background: '#2563EB',
  color: '#fff',
  cursor: 'pointer'
};

const topBarStyle = {
  position: 'absolute',
  top: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  padding: '8px 12px',
  borderRadius: 10,
  background: 'rgba(20, 20, 26, 0.82)',
  color: '#eee',
  font: '14px system-ui, sans-serif',
  zIndex: 10
};

const codeChipStyle = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  letterSpacing: '0.12em',
  padding: '2px 8px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.12)'
};

const smallButtonStyle = {
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.25)',
  background: 'rgba(255,255,255,0.08)',
  color: '#eee',
  cursor: 'pointer',
  fontSize: 13
};

const bottomStyle = {
  position: 'absolute',
  bottom: 64,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  fontFamily: 'system-ui, sans-serif',
  zIndex: 10,
  width: 'max-content',
  maxWidth: 'calc(100vw - 32px)'
};

const enterVrButtonStyle = {
  padding: '18px 40px',
  fontSize: 26,
  fontWeight: 800,
  borderRadius: 16,
  border: 'none',
  background: '#2563EB',
  color: '#fff',
  boxShadow: '0 8px 24px rgba(37, 99, 235, 0.45)',
  cursor: 'pointer'
};

const noVrStyle = {
  margin: 0,
  padding: '10px 14px',
  borderRadius: 10,
  background: 'rgba(20, 20, 26, 0.82)',
  color: '#E2E8F0',
  fontSize: 14,
  lineHeight: 1.5,
  textAlign: 'center'
};

const warningStyle = { ...noVrStyle, color: '#FCD34D', fontSize: 12 };

export default ViewerApp;