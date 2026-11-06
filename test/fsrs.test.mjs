import test from "node:test";
import assert from "node:assert/strict";
import { newCard, review, intervalDays, retrievability } from "../app/js/fsrs.js";

const DAY = 86400000, t0 = Date.UTC(2026, 10, 6, 12);

test("retention 0.9 means interval equals stability", () => {
  assert.equal(intervalDays(10), 10);
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
});

test("first answers: Again < Hard < Good < Easy", () => {
  const due = [1, 2, 3, 4].map(g => review(newCard(t0), g, t0).due - t0);
  assert.equal(due[0], 10 * 60000); // Again: see it again in 10 minutes
  for (let i = 1; i < 4; i++) assert.ok(due[i] >= due[i - 1], `grade ${i + 1}`);
  assert.equal(Math.round(due[3] / DAY), 16); // Easy first interval = w3 ≈ 15.7 days
});

test("Good answers on time keep growing the interval", () => {
  let c = review(newCard(t0), 3, t0), now = t0, prev = 0;
  for (let i = 0; i < 6; i++) {
    now = c.due;
    c = review(c, 3, now);
    const ivl = Math.round((c.due - now) / DAY);
    assert.ok(ivl > prev, `step ${i}: ${ivl} > ${prev}`);
    prev = ivl;
  }
  assert.ok(prev > 60, "after 7 Goods the gap is months, got " + prev);
});

test("a lapse shrinks stability and raises difficulty", () => {
  let c = review(newCard(t0), 3, t0);
  c = review(c, 3, c.due);
  const before = c;
  const after = review(c, 1, c.due);
  assert.ok(after.s < before.s);
  assert.ok(after.d > before.d);
  assert.equal(after.lapses, 1);
});

test("input card is not mutated", () => {
  const c = newCard(t0), copy = { ...c };
  review(c, 3, t0);
  assert.deepEqual(c, copy);
});
