import { test } from "node:test";
import assert from "node:assert/strict";
import { handleBody } from "../src/mcp.js";
import worker from "../src/index.js";
import { fakeApi } from "./fixtures.mjs";

const call = async (name, args = {}, api = fakeApi()) => {
  const [status, res] = await handleBody(api, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  assert.equal(status, 200);
  const text = res.result.content[0].text;
  return { isError: res.result.isError, text, data: res.result.isError ? null : JSON.parse(text) };
};

test("initialize echoes the client's protocol version and advertises tools", async () => {
  const [, res] = await handleBody(fakeApi(), { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  assert.equal(res.result.protocolVersion, "2025-03-26");
  assert.ok(res.result.capabilities.tools);
  assert.equal(res.result.serverInfo.name, "sleeper-mcp");
});

test("notifications get 202 with no body; batches return only responses", async () => {
  assert.deepEqual(await handleBody(fakeApi(), { jsonrpc: "2.0", method: "notifications/initialized" }), [202, null]);
  const [status, out] = await handleBody(fakeApi(), [
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 7, method: "ping" },
  ]);
  assert.equal(status, 200);
  assert.deepEqual(out, [{ jsonrpc: "2.0", id: 7, result: {} }]);
});

test("tools/list returns every tool with a schema and read-only hint", async () => {
  const [, res] = await handleBody(fakeApi(), { jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.ok(res.result.tools.length >= 10);
  for (const t of res.result.tools) {
    assert.equal(t.inputSchema.type, "object", t.name);
    assert.equal(t.annotations.readOnlyHint, true);
  }
});

test("unknown method and unknown tool are JSON-RPC errors", async () => {
  const [, a] = await handleBody(fakeApi(), { jsonrpc: "2.0", id: 1, method: "resources/list" });
  assert.equal(a.error.code, -32601);
  const [, b] = await handleBody(fakeApi(), { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "nope" } });
  assert.equal(b.error.code, -32602);
});

test("find_leagues resolves a username to leagues", async () => {
  const { data } = await call("find_leagues", { username: "t3knapp" });
  assert.equal(data.leagues[0].name, "Lets Ride");
  assert.equal(data.leagues[0].type, "redraft");
});

test("unknown user is a tool error, not a crash", async () => {
  const r = await call("find_leagues", { username: "nobody" });
  assert.equal(r.isError, true);
  assert.match(r.text, /No Sleeper user/);
});

test("league_overview surfaces first-down scoring", async () => {
  const { data } = await call("league_overview", { league_id: "L1" });
  assert.equal(data.scoring.rec_fd, 0.5);
  assert.equal(data.scoring.qb_hit, undefined);
  assert.equal(data.waivers.type, "FAAB");
});

test("standings sort by wins then points and use team names", async () => {
  const { data } = await call("standings", { league_id: "L1" });
  assert.equal(data[0].owner, "rival");
  assert.equal(data[1].team, "Knapp Time");
  assert.equal(data[1].points_for, 563.56);
});

test("rosters resolve a team by owner name and include injury status", async () => {
  const { data } = await call("rosters", { league_id: "L1", team: "t3knapp" });
  assert.equal(data.length, 1);
  const adams = data[0].starters.find((p) => p.id === "2133");
  assert.equal(adams.injury, "Questionable");
});

test("bad team name lists the valid teams", async () => {
  const r = await call("rosters", { league_id: "L1", team: "Nobody FC" });
  assert.equal(r.isError, true);
  assert.match(r.text, /Knapp Time/);
});

test("matchups pair teams and attach starter points", async () => {
  const { data } = await call("matchups", { league_id: "L1", team: 1 });
  assert.equal(data.week, 6);
  assert.equal(data.matchups.length, 1);
  assert.equal(data.matchups[0][0].starters[0].points, 25.66);
});

test("transactions name players and FAAB bids", async () => {
  const { data } = await call("transactions", { league_id: "L1", week: 5 });
  const t = data.transactions[0];
  assert.equal(t.adds[0].name, "Free Agent Wr");
  assert.equal(t.drops[0].name, "Davante Adams");
  assert.equal(t.faab_bid, 12);
});

test("trending marks league availability", async () => {
  const { data } = await call("trending", { league_id: "L1" });
  assert.equal(data[0].rostered_by, null);
  assert.equal(data[1].rostered_by, "Knapp Time");
});

test("free_agents excludes rostered and teamless players, ranked", async () => {
  const { data } = await call("free_agents", { league_id: "L1", position: "WR" });
  assert.deepEqual(data.map((p) => p.id), ["8000"]);
});

test("player_lookup ranks the fantasy-relevant namesake first", async () => {
  const { data } = await call("player_lookup", { query: "josh allen" });
  assert.equal(data[0].id, "7000");
});

test("score_players uses league scoring and shows the first-down edge", async () => {
  const { data } = await call("score_players", { league_id: "L1", players: ["Patrick Mahomes", "9487"], week: 1 });
  assert.equal(data.source, "stats");
  const pm = data.players.find((p) => p.id === "4046");
  assert.equal(pm.points, 25.66);
  assert.equal(pm.sleeper_half_ppr, 22.66);
  assert.equal(pm.first_down_points, 3);
  const puka = data.players.find((p) => p.id === "9487");
  assert.equal(puka.points, null);
});

test("score_players defaults to projections for the current week and can score a whole team", async () => {
  const { data } = await call("score_players", { league_id: "L1", team: "Knapp Time" });
  assert.equal(data.source, "projections");
  assert.equal(data.week, 6);
  assert.equal(data.players.length, 5);
});

test("score_players survives a failing stats endpoint", async () => {
  const api = fakeApi({ playerWeeks: async () => { throw new Error("boom"); } });
  const { data } = await call("score_players", { league_id: "L1", players: ["4046"], week: 1 }, api);
  assert.match(data.players[0].note, /unavailable/);
});

test("draft_history follows previous seasons and filters by owner", async () => {
  const { data } = await call("draft_history", { league_id: "L1", seasons_back: 1, team: "t3knapp" });
  assert.deepEqual(data.map((d) => d.season), ["2026", "2025"]);
  assert.equal(data[0].picks.length, 1);
  assert.equal(data[0].picks[0].player, "Puka Nacua");
});

test("missing player index gives a clear message", async () => {
  const { createClient } = await import("../src/sleeper.js");
  const api = { ...fakeApi(), players: createClient({ kv: { get: async () => null } }).players };
  const r = await call("free_agents", { league_id: "L1" }, api);
  assert.equal(r.isError, true);
  assert.match(r.text, /Refresh player index/);
});

test("HTTP layer: info page, 405 on GET /mcp, parse errors, and a full round trip", async () => {
  const env = { CACHE: { get: async () => ({ players: {} }) } };
  const info = await worker.fetch(new Request("https://x.dev/"), env);
  assert.equal((await info.json()).name, "sleeper-mcp");
  assert.equal((await worker.fetch(new Request("https://x.dev/mcp"), env)).status, 405);
  const bad = await worker.fetch(new Request("https://x.dev/mcp", { method: "POST", body: "{" }), env);
  assert.equal(bad.status, 400);
  const init = await worker.fetch(
    new Request("https://x.dev/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }),
    }),
    env,
  );
  assert.equal(init.status, 200);
  assert.equal(init.headers.get("content-type"), "application/json");
  assert.equal((await init.json()).result.serverInfo.name, "sleeper-mcp");
});
