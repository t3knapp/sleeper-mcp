import { test } from "node:test";
import assert from "node:assert/strict";
import { slim } from "../scripts/build-players.mjs";

test("slim keeps fantasy positions on a team or active, and names defenses", () => {
  const out = slim({
    "4046": { full_name: "Patrick Mahomes", position: "QB", team: "KC", active: true, search_rank: 30, injury_status: null },
    "9": { full_name: "Retired Guy", position: "WR", team: null, active: false },
    "10": { full_name: "Some Lineman", position: "OT", team: "KC", active: true },
    "11": { full_name: "Unsigned Rb", position: "RB", team: null, active: true, search_rank: 9999999 },
    KC: { first_name: "Kansas City", last_name: "Chiefs", position: "DEF", team: "KC", active: true },
    "12": { full_name: "Hurt Te", position: "TE", team: "SF", active: true, injury_status: "Out", search_rank: 80 },
  });
  assert.deepEqual(Object.keys(out).sort(), ["11", "12", "4046", "KC"]);
  assert.deepEqual(out["4046"], { n: "Patrick Mahomes", p: "QB", t: "KC", r: 30 });
  assert.equal(out.KC.n, "Kansas City Chiefs");
  assert.equal(out["12"].i, "Out");
  assert.equal(out["11"].r, undefined);
});
