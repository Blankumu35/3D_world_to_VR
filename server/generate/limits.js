// Spending caps. Every generation costs money (Tripo credits) or GPU
// quota (Hugging Face), so the server refuses new jobs past:
//   - GENERATION_LIMIT_PER_SESSION per browser session (default 10)
//   - GENERATION_DAILY_LIMIT across everyone, per calendar day (default 100)
// Failed jobs are given back, so a provider outage doesn't use up a
// child's turns. Counts live in memory and reset when the server restarts,
// which is fine for a supervised study on one laptop.

const perSessionLimit = () => Number(process.env.GENERATION_LIMIT_PER_SESSION) || 10;
const dailyLimit = () => Number(process.env.GENERATION_DAILY_LIMIT) || 100;

const sessionCounts = new Map(); // sessionId -> number of jobs counted
let day = today();
let dayCount = 0;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function rollDay() {
  const now = today();
  if (now !== day) {
    day = now;
    dayCount = 0;
  }
}

/** A session id from the browser: random, short, no personal data. */
export function cleanSessionId(raw) {
  const id = String(raw || '').slice(0, 64);
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : 'anonymous';
}

export function remainingFor(sessionId) {
  rollDay();
  const used = sessionCounts.get(sessionId) || 0;
  return Math.max(0, Math.min(perSessionLimit() - used, dailyLimit() - dayCount));
}

/** @returns {string|null} a child-readable reason if the job is refused. */
export function takeTurn(sessionId) {
  rollDay();
  if (dayCount >= dailyLimit()) {
    return "The magic machine is resting for today. Ask a grown-up to try again tomorrow.";
  }
  const used = sessionCounts.get(sessionId) || 0;
  if (used >= perSessionLimit()) {
    return `You've made ${used} things already, that's the limit! Try using the ones you made.`;
  }
  sessionCounts.set(sessionId, used + 1);
  dayCount += 1;
  return null;
}

/** Gives a turn back (called when a job fails). */
export function returnTurn(sessionId) {
  const used = sessionCounts.get(sessionId) || 0;
  if (used > 0) sessionCounts.set(sessionId, used - 1);
  if (dayCount > 0) dayCount -= 1;
}

export function limitsSummary(sessionId) {
  return { perSession: perSessionLimit(), daily: dailyLimit(), remaining: remainingFor(sessionId) };
}