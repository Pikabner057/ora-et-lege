// Small FSRS-5 scheduler (the algorithm Anki uses), default weights, no dependencies.
// Formulas: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
// Grades: 1 Again, 2 Hard, 3 Good, 4 Easy. Times are ms since epoch.

const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5, FACTOR = 19 / 81, RETENTION = 0.9;
const DAY = 86400000, RELEARN_MS = 10 * 60000;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const initD = g => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);

export function retrievability(elapsedDays, s) {
  return Math.pow(1 + FACTOR * elapsedDays / s, DECAY);
}

export function intervalDays(s) {
  const i = (s / FACTOR) * (Math.pow(RETENTION, 1 / DECAY) - 1);
  return clamp(Math.round(i), 1, 36500);
}

function nextD(d, g) {
  const delta = -W[6] * (g - 3);
  const dp = d + delta * (10 - d) / 9;            // linear damping
  return clamp(W[7] * initD(4) + (1 - W[7]) * dp, 1, 10); // mean reversion
}

function recallS(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1, easy = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy);
}

function forgetS(d, s, r) {
  return Math.min(W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)), s);
}

export function newCard(now = Date.now()) {
  return { due: now, s: 0, d: 0, reps: 0, lapses: 0, last: 0 };
}

// Returns a new card state; never mutates the input.
export function review(card, g, now = Date.now()) {
  const c = { ...card };
  if (!c.reps) {
    c.s = W[g - 1];
    c.d = initD(g);
  } else {
    const elapsed = (now - c.last) / DAY;
    if (elapsed < 1) {
      c.s = c.s * Math.exp(W[17] * (g - 3 + W[18])); // same-day review
    } else {
      const r = retrievability(elapsed, c.s);
      c.s = g === 1 ? forgetS(c.d, c.s, r) : recallS(c.d, c.s, r, g);
    }
    c.d = nextD(c.d, g);
  }
  c.s = Math.max(c.s, 0.01);
  if (g === 1 && c.reps) c.lapses++;
  c.reps++;
  c.last = now;
  c.due = g === 1 ? now + RELEARN_MS : now + intervalDays(c.s) * DAY;
  return c;
}

// What each button would give, for showing "1d / 3d / 8d" under the grade buttons.
export function preview(card, now = Date.now()) {
  return [1, 2, 3, 4].map(g => {
    const n = review(card, g, now);
    return g === 1 ? "10m" : fmtDays(Math.round((n.due - now) / DAY));
  });
}

export function fmtDays(d) {
  if (d < 31) return d + "d";
  if (d < 365) return Math.round(d / 30) + "mo";
  return (d / 365).toFixed(1) + "y";
}
