// Progress lives on the device (localStorage). The review log is append-only so two devices'
// exports can be merged later without conflicts.
const KEY = "church-latin-v1";

const blank = () => ({
  version: 1,
  cards: {},          // id -> FSRS state
  log: [],            // [cardId, time, grade]
  learned: {},        // "prayerId:lineIndex" -> time first learned
  days: {},           // "YYYY-MM-DD" -> {reviews, newWords, done}
  settings: { newPerDay: 6, rate: 0.85, ui: "en" },
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch (e) { /* corrupted or blocked storage: start fresh */ }
  return blank();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

export const get = () => state;

export function today(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function day(key = today()) {
  return (state.days[key] ||= { reviews: 0, newWords: 0, done: false });
}

// Lenient streak: one missed day in a row is forgiven, two are not.
export function streak() {
  let n = 0, misses = 0;
  const d = new Date();
  if (!state.days[today(d)]?.reviews) d.setDate(d.getDate() - 1); // today not started yet
  for (let i = 0; i < 3650; i++) {
    const rec = state.days[today(d)];
    if (rec && rec.reviews > 0) { n++; misses = 0; }
    else if (++misses > 1) break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function exportJSON() {
  return JSON.stringify(state);
}

export function importJSON(text) {
  const incoming = JSON.parse(text);
  if (!incoming || incoming.version !== 1 || !incoming.cards) throw new Error("Not a Church Latin backup file.");
  // merge: keep every log entry once; for cards keep the most recently reviewed state
  const seen = new Set(state.log.map(e => e.join("|")));
  for (const e of incoming.log || []) if (!seen.has(e.join("|"))) state.log.push(e);
  state.log.sort((a, b) => a[1] - b[1]);
  for (const [id, c] of Object.entries(incoming.cards)) {
    if (!state.cards[id] || (c.last || 0) > (state.cards[id].last || 0)) state.cards[id] = c;
  }
  for (const [k, v] of Object.entries(incoming.learned || {})) state.learned[k] ??= v;
  for (const [k, v] of Object.entries(incoming.days || {})) {
    const cur = state.days[k];
    state.days[k] = cur ? { reviews: Math.max(cur.reviews, v.reviews), newWords: Math.max(cur.newWords, v.newWords), done: cur.done || v.done } : v;
  }
  save();
}

export function reset() {
  state = blank();
  save();
}
