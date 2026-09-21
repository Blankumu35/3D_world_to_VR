import { useEffect, useRef } from 'react';
import { actionForKey } from './Keybindings .js';

const IDLE_INPUT = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  running: false
};

/**
 * Tracks WASD/arrow-key + Shift state and reports it via onChange whenever
 * it actually changes (not on every OS key-repeat event). Ignores key events
 * while the user is typing in a text field, so e.g. pasting a model URL into
 * the asset library's upload box doesn't also start the camera walking.
 */
export function useKeyboardMovement(onChange) {
  const stateRef = useRef({ ...IDLE_INPUT });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const isTypingTarget = (target) => {
      const tag = target?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
    };

    const applyKey = (code, isDown) => {
      const action = actionForKey(code);
      if (!action) return false;
      if (stateRef.current[action] === isDown) return false; // no change — e.g. key-repeat
      stateRef.current = { ...stateRef.current, [action]: isDown };
      onChangeRef.current?.({ ...stateRef.current });
      return true;
    };

    const handleKeyDown = (e) => {
      if (isTypingTarget(e.target)) return;
      if (applyKey(e.code, true)) e.preventDefault();
    };

    const handleKeyUp = (e) => {
      if (applyKey(e.code, false)) e.preventDefault();
    };

    // If the window loses focus mid-stride (alt-tab, a native file picker,
    // clicking a browser dialog) keyup never fires and a key can appear
    // stuck "held" forever. Reset on blur to avoid a runaway camera.
    const handleBlur = () => {
      stateRef.current = { ...IDLE_INPUT };
      onChangeRef.current?.({ ...IDLE_INPUT });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      handleBlur(); // also clear input state if this component unmounts mid-key-press
    };
  }, []);
}