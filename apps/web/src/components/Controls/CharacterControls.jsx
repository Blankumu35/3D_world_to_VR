import { useState } from 'react';
import { useKeyboardMovement } from './usekeyboardMovement';

/**
 * Turns WASD/arrow-key input into calls on the engine's move-input state.
 * All the actual walking — turning that input into a moving position that
 * respects the current look direction — happens in
 * AppManager.stepCharacterMovement, which needs per-frame engine access this
 * component doesn't have. This stays a thin input adapter, kept in its own
 * folder rather than Editor/ so input handling doesn't get tangled up with
 * the scene-editing UI (library, transform panel).
 *
 * Mount this once, unconditionally, alongside the other editor UI — it has
 * no dependency on what's currently selected and works whether the camera
 * is orbiting or already standing inside an environment.
 */
export function CharacterControls({ onMoveInputChange }) {
  const [isMoving, setIsMoving] = useState(false);

  useKeyboardMovement((input) => {
    onMoveInputChange?.(input);
    setIsMoving(input.forward || input.backward || input.left || input.right);
  });

  return (
    <div style={{ ...hintStyle, opacity: isMoving ? 0.35 : 0.9 }}>
      <kbd style={kbdStyle}>W</kbd>
      <kbd style={kbdStyle}>A</kbd>
      <kbd style={kbdStyle}>S</kbd>
      <kbd style={kbdStyle}>D</kbd> to walk &nbsp;·&nbsp;
      <kbd style={kbdStyle}>Shift</kbd> to run
    </div>
  );
}

const hintStyle = {
  position: 'absolute',
  bottom: '16px',
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  fontSize: '12px',
  padding: '6px 14px',
  borderRadius: '999px',
  pointerEvents: 'none',
  transition: 'opacity 0.2s ease',
  zIndex: 10,
  fontFamily: 'system-ui, sans-serif',
  display: 'flex',
  alignItems: 'center',
  gap: '3px'
};

const kbdStyle = {
  background: 'rgba(255,255,255,0.15)',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '4px',
  padding: '1px 5px',
  fontSize: '11px',
  fontFamily: 'inherit'
};