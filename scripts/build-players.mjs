// Build the slim player index stored in KV under "players".
// Sleeper's full player dump is ~5 MB and meant to be fetched at most once a day; the Worker
// can't parse it within the free plan's CPU budget, so this runs in GitHub Actions instead.
//
// Usage: node scripts/build-players.mjs [out=players.json]

import { writeFile } from "node:fs/promises";

const FANTASY = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);

export function slim(all) {
  const players = {};
  for (const [id, p] of Object.entries(all)) {
    const pos = FANTASY.has(p.position) ? p.position : (p.fantasy_positions || []).find((x) => FANTASY.has(x));
    if (!pos) continue;
    if (!p.active && !p.team) continue;
    const name =
      p.full_name ||
      (pos === "DEF" ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : null) ||
      `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
      id;
    const row = { n: name, p: pos };
    if (p.team) row.t = p.team;
    if (p.injury_status) row.i = p.injury_status;
    if (p.search_rank != null && p.search_rank < 9999999) row.r = p.search_rank;
    players[id] = row;
  }
  return players;
}

async function main() {
  const out = process.argv[2] || "players.json";
  const res = await fetch("https://api.sleeper.app/v1/players/nfl", {
    headers: { "user-agent": "sleeper-mcp (+https://github.com/t3knapp/sleeper-mcp)" },
  });
  if (!res.ok) throw new Error(`Sleeper returned ${res.status}`);
  const players = slim(await res.json());
  const count = Object.keys(players).length;
  if (count < 1000) throw new Error(`Only ${count} players after filtering; refusing to overwrite the index.`);
  const body = JSON.stringify({ built_at: new Date().toISOString(), count, players });
  await writeFile(out, body);
  console.log(`Wrote ${count} players (${(body.length / 1024).toFixed(0)} KB) to ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
