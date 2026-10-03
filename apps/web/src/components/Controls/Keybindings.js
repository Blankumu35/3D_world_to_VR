/**
 * Maps browser KeyboardEvent.code values to the movement actions they
 * trigger. Centralised here so remapping keys later (or adding jump/crouch)
 * is a one-line change rather than a hunt through event handlers.
 */
export const KEY_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  running: ['ShiftLeft', 'ShiftRight']
};

/** Returns the movement action a key code maps to, or null if it's unbound. */
export function actionForKey(code) {
  for (const [action, codes] of Object.entries(KEY_BINDINGS)) {
    if (codes.includes(code)) return action;
  }
  return null;
}