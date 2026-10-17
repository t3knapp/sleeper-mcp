import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreStats, activeScoring } from "../src/scoring.js";
import { SCORING, QB_WEEK1 } from "./fixtures.mjs";

test("league score = Sleeper half-PPR + first-down points for a real stat line", () => {
  const r = scoreStats(QB_WEEK1, SCORING);
  // 5 passing + 1 rushing first downs at 0.5 each = 3.0 on top of Sleeper's 22.66
  assert.equal(r.first_down_points, 3);
  assert.equal(r.points, 25.66);
  assert.equal(r.points, QB_WEEK1.pts_half_ppr + r.first_down_points);
});

test("receiver: half PPR plus receiving first downs", () => {
  const r = scoreStats({ rec: 8, rec_yd: 124, rec_td: 2, rec_fd: 6 }, SCORING);
  assert.equal(r.points, 8 * 0.5 + 12.4 + 12 + 3);
  assert.equal(r.breakdown.rec_fd, 3);
});

test("defense points-allowed bucket is derived from the raw total when missing", () => {
  assert.equal(scoreStats({ pts_allow: 17, sack: 3, int: 1 }, SCORING).points, 1 + 3 + 2);
  assert.equal(scoreStats({ pts_allow: 0 }, SCORING).points, 10);
  assert.equal(scoreStats({ pts_allow: 41 }, SCORING).points, -4);
});

test("an explicit bucket flag wins over the raw total", () => {
  assert.equal(scoreStats({ pts_allow: 17, pts_allow_7_13: 1 }, SCORING).points, 4);
});

test("zero-weight rules and unknown stats are ignored", () => {
  assert.equal(scoreStats({ qb_hit: 9, rush_att: 20, tkl: 5 }, SCORING).points, 0);
});

test("empty inputs score zero", () => {
  assert.equal(scoreStats(null, SCORING).points, 0);
  assert.equal(scoreStats({ rec: 3 }, null).points, 0);
});

test("activeScoring keeps only non-zero rules and rounds float noise", () => {
  const s = activeScoring({ pass_yd: 0.03999999910593033, qb_hit: 0, rush_fd: 0.5 });
  assert.deepEqual(s, { pass_yd: 0.04, rush_fd: 0.5 });
});
