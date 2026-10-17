import { scoreStats, activeScoring } from "./scoring.js";

// ---------- helpers ----------

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/, "")
    .trim();

function describe(id, players) {
  const p = players?.[id];
  if (!p) return { id, name: id };
  const out = { id, name: p.n, pos: p.p, team: p.t || "FA" };
  if (p.i) out.injury = p.i;
  return out;
}

function teamDirectory(users, rosters) {
  const byUser = Object.fromEntries((users || []).map((u) => [u.user_id, u]));
  const dir = {};
  for (const r of rosters || []) {
    const u = byUser[r.owner_id] || {};
    dir[r.roster_id] = {
      roster_id: r.roster_id,
      owner: u.display_name || "(no owner)",
      team: u.metadata?.team_name || u.display_name || `Team ${r.roster_id}`,
      owner_id: r.owner_id,
    };
  }
  return dir;
}

function findRoster(rosters, dir, which) {
  if (which === undefined || which === null || which === "") return null;
  const asNum = Number(which);
  if (Number.isInteger(asNum) && dir[asNum]) return rosters.find((r) => r.roster_id === asNum);
  const q = norm(which);
  const hit = Object.values(dir).find((d) => norm(d.owner) === q || norm(d.team) === q || d.owner_id === which);
  if (hit) return rosters.find((r) => r.roster_id === hit.roster_id);
  throw new ToolError(`No team matching "${which}". Teams: ${Object.values(dir).map((d) => `${d.roster_id}=${d.team} (${d.owner})`).join(", ")}`);
}

function resolvePlayer(query, players) {
  const q = String(query).trim();
  if (players[q]) return q;
  const nq = norm(q);
  const matches = Object.entries(players).filter(([, p]) => norm(p.n) === nq);
  const pool = matches.length ? matches : Object.entries(players).filter(([, p]) => norm(p.n).includes(nq));
  if (!pool.length) throw new ToolError(`No player matching "${query}".`);
  pool.sort(([, a], [, b]) => (a.r ?? 1e9) - (b.r ?? 1e9));
  return pool[0][0];
}

export class ToolError extends Error {}

const fpts = (s, key) => Number(s?.[key] ?? 0) + Number(s?.[`${key}_decimal`] ?? 0) / 100;

async function weekOrCurrent(api, week) {
  if (week) return { week: Number(week) };
  const st = await api.state();
  return { week: Number(st.display_week || st.week), state: st };
}

// ---------- tools ----------

const leagueId = { type: "string", description: "Sleeper league ID (use find_leagues to look it up from a username)." };
const teamArg = {
  type: ["string", "integer"],
  description: "A team: roster_id, owner username/display name, or team name.",
};

export const TOOLS = [
  {
    name: "nfl_state",
    description: "Current NFL season, week and season type according to Sleeper.",
    inputSchema: { type: "object", properties: {} },
    async run(api) {
      const s = await api.state();
      return { season: s.season, season_type: s.season_type, week: s.week, display_week: s.display_week };
    },
  },
  {
    name: "find_leagues",
    description: "Look up a Sleeper user by username and list their NFL leagues for a season.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string" },
        season: { type: "string", description: "Defaults to the current season." },
      },
      required: ["username"],
    },
    async run(api, { username, season }) {
      const user = await api.user(username);
      if (!user) throw new ToolError(`No Sleeper user "${username}".`);
      const yr = season || (await api.state()).season;
      const leagues = (await api.userLeagues(user.user_id, yr)) || [];
      return {
        user: { user_id: user.user_id, username: user.username, display_name: user.display_name },
        season: yr,
        leagues: leagues.map((l) => ({
          league_id: l.league_id,
          name: l.name,
          teams: l.total_rosters,
          status: l.status,
          type: ["redraft", "keeper", "dynasty"][l.settings?.type ?? 0],
        })),
      };
    },
  },
  {
    name: "league_overview",
    description:
      "League settings: name, status, roster slots, playoff and waiver settings, and every non-zero scoring rule (including bonuses like points per first down).",
    inputSchema: { type: "object", properties: { league_id: leagueId }, required: ["league_id"] },
    async run(api, { league_id }) {
      const l = await api.league(league_id);
      if (!l) throw new ToolError(`No league ${league_id}.`);
      const s = l.settings || {};
      return {
        league_id: l.league_id,
        name: l.name,
        season: l.season,
        status: l.status,
        teams: l.total_rosters,
        type: ["redraft", "keeper", "dynasty"][s.type ?? 0],
        roster_positions: l.roster_positions,
        playoffs: { start_week: s.playoff_week_start, teams: s.playoff_teams },
        trade_deadline_week: s.trade_deadline,
        waivers: { type: ["rolling", "reverse standings", "FAAB"][s.waiver_type ?? 0], faab_budget: s.waiver_budget },
        previous_league_id: l.previous_league_id || null,
        scoring: activeScoring(l.scoring_settings),
      };
    },
  },
  {
    name: "standings",
    description: "Standings: record, points for and against, sorted by wins then points for.",
    inputSchema: { type: "object", properties: { league_id: leagueId }, required: ["league_id"] },
    async run(api, { league_id }) {
      const [users, rosters] = await Promise.all([api.users(league_id), api.rosters(league_id)]);
      const dir = teamDirectory(users, rosters);
      const rows = rosters.map((r) => ({
        ...dir[r.roster_id],
        wins: r.settings?.wins ?? 0,
        losses: r.settings?.losses ?? 0,
        ties: r.settings?.ties ?? 0,
        points_for: Math.round(fpts(r.settings, "fpts") * 100) / 100,
        points_against: Math.round(fpts(r.settings, "fpts_against") * 100) / 100,
      }));
      rows.sort((a, b) => b.wins - a.wins || b.points_for - a.points_for);
      return rows.map((r, i) => ({ rank: i + 1, ...r, owner_id: undefined }));
    },
  },
  {
    name: "rosters",
    description: "Rosters with player names, positions, NFL teams and injury status, split into starters, bench, IR and taxi. Pass `team` for one roster.",
    inputSchema: { type: "object", properties: { league_id: leagueId, team: teamArg }, required: ["league_id"] },
    async run(api, { league_id, team }) {
      const [users, rosters, players] = await Promise.all([api.users(league_id), api.rosters(league_id), api.players()]);
      const dir = teamDirectory(users, rosters);
      const one = findRoster(rosters, dir, team);
      const list = one ? [one] : rosters;
      return list.map((r) => {
        const starters = (r.starters || []).filter((id) => id && id !== "0");
        const reserve = new Set(r.reserve || []);
        const taxi = new Set(r.taxi || []);
        const bench = (r.players || []).filter((id) => !starters.includes(id) && !reserve.has(id) && !taxi.has(id));
        const d = { ...dir[r.roster_id] };
        delete d.owner_id;
        return {
          ...d,
          starters: starters.map((id) => describe(id, players)),
          bench: bench.map((id) => describe(id, players)),
          ...(reserve.size ? { ir: [...reserve].map((id) => describe(id, players)) } : {}),
          ...(taxi.size ? { taxi: [...taxi].map((id) => describe(id, players)) } : {}),
        };
      });
    },
  },
  {
    name: "matchups",
    description: "Head-to-head matchups for a week with each team's points and starters' points. Defaults to the current week.",
    inputSchema: {
      type: "object",
      properties: { league_id: leagueId, week: { type: "integer", minimum: 1, maximum: 18 }, team: teamArg },
      required: ["league_id"],
    },
    async run(api, { league_id, week, team }) {
      const w = await weekOrCurrent(api, week);
      const [users, rosters, rows, players] = await Promise.all([
        api.users(league_id),
        api.rosters(league_id),
        api.matchups(league_id, w.week),
        api.players(),
      ]);
      const dir = teamDirectory(users, rosters);
      const focus = findRoster(rosters, dir, team);
      const groups = {};
      for (const m of rows || []) (groups[m.matchup_id ?? `bye-${m.roster_id}`] ||= []).push(m);
      const out = Object.values(groups)
        .filter((g) => !focus || g.some((m) => m.roster_id === focus.roster_id))
        .map((g) =>
          g.map((m) => ({
            team: dir[m.roster_id]?.team,
            owner: dir[m.roster_id]?.owner,
            roster_id: m.roster_id,
            points: m.points ?? 0,
            starters: (m.starters || [])
              .filter((id) => id && id !== "0")
              .map((id) => ({ ...describe(id, players), points: m.players_points?.[id] ?? 0 })),
          })),
        );
      return { week: w.week, matchups: out };
    },
  },
  {
    name: "transactions",
    description: "Waiver claims, free-agent moves and trades for a week, with player names and FAAB bids. Defaults to the current week.",
    inputSchema: {
      type: "object",
      properties: { league_id: leagueId, week: { type: "integer", minimum: 1, maximum: 18 } },
      required: ["league_id"],
    },
    async run(api, { league_id, week }) {
      const w = await weekOrCurrent(api, week);
      const [users, rosters, txs, players] = await Promise.all([
        api.users(league_id),
        api.rosters(league_id),
        api.transactions(league_id, w.week),
        api.players(),
      ]);
      const dir = teamDirectory(users, rosters);
      const name = (rid) => dir[rid]?.team || `roster ${rid}`;
      return {
        week: w.week,
        transactions: (txs || [])
          .sort((a, b) => (b.status_updated || 0) - (a.status_updated || 0))
          .map((t) => ({
            type: t.type,
            status: t.status,
            when: t.status_updated ? new Date(t.status_updated).toISOString() : null,
            teams: (t.roster_ids || []).map(name),
            adds: Object.entries(t.adds || {}).map(([id, rid]) => ({ ...describe(id, players), to: name(rid) })),
            drops: Object.entries(t.drops || {}).map(([id, rid]) => ({ ...describe(id, players), from: name(rid) })),
            ...(t.settings?.waiver_bid != null ? { faab_bid: t.settings.waiver_bid } : {}),
            ...(t.draft_picks?.length
              ? { draft_picks: t.draft_picks.map((p) => ({ season: p.season, round: p.round, to: name(p.owner_id), from: name(p.previous_owner_id) })) }
              : {}),
          })),
      };
    },
  },
  {
    name: "trending",
    description:
      "Most added or dropped players across all of Sleeper over a recent window. With league_id, marks who is rostered in that league and who is available.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["add", "drop"], default: "add" },
        lookback_hours: { type: "integer", minimum: 1, maximum: 168, default: 24 },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 25 },
        league_id: { ...leagueId, description: "Optional: mark availability in this league." },
      },
    },
    async run(api, { type = "add", lookback_hours = 24, limit = 25, league_id }) {
      const [rows, players, rosters, users] = await Promise.all([
        api.trending(type, lookback_hours, limit),
        api.players(),
        league_id ? api.rosters(league_id) : null,
        league_id ? api.users(league_id) : null,
      ]);
      const owner = {};
      if (rosters) {
        const dir = teamDirectory(users, rosters);
        for (const r of rosters) for (const id of r.players || []) owner[id] = dir[r.roster_id].team;
      }
      return (rows || []).map((t) => ({
        ...describe(t.player_id, players),
        count: t.count,
        ...(league_id ? { rostered_by: owner[t.player_id] || null } : {}),
      }));
    },
  },
  {
    name: "free_agents",
    description:
      "Players not on any roster in a league, ranked by Sleeper's popularity rank. Filter by position. Pair with score_players to rank them under the league's scoring.",
    inputSchema: {
      type: "object",
      properties: {
        league_id: leagueId,
        position: { type: "string", enum: ["QB", "RB", "WR", "TE", "K", "DEF"] },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
      required: ["league_id"],
    },
    async run(api, { league_id, position, limit = 25 }) {
      const [rosters, players] = await Promise.all([api.rosters(league_id), api.players()]);
      const taken = new Set(rosters.flatMap((r) => r.players || []));
      return Object.entries(players)
        .filter(([id, p]) => !taken.has(id) && p.t && (!position || p.p === position))
        .sort(([, a], [, b]) => (a.r ?? 1e9) - (b.r ?? 1e9))
        .slice(0, limit)
        .map(([id]) => describe(id, players));
    },
  },
  {
    name: "player_lookup",
    description: "Find players by name (partial names work). Returns Sleeper player IDs, position, team and injury status.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 25, default: 10 } },
      required: ["query"],
    },
    async run(api, { query, limit = 10 }) {
      const players = await api.players();
      const q = norm(query);
      return Object.entries(players)
        .filter(([id, p]) => norm(p.n).includes(q) || id === query)
        .sort(([, a], [, b]) => (a.r ?? 1e9) - (b.r ?? 1e9))
        .slice(0, limit)
        .map(([id]) => describe(id, players));
    },
  },
  {
    name: "score_players",
    description:
      "Score players for a week under THIS league's scoring rules (including first-down points), from actual stats for past weeks or projections for upcoming ones. Shows Sleeper's standard half-PPR points beside each for comparison. Pass player names/IDs, or `team` to score a whole roster.",
    inputSchema: {
      type: "object",
      properties: {
        league_id: leagueId,
        players: { type: "array", items: { type: "string" }, maxItems: 20, description: "Player names or Sleeper IDs." },
        team: teamArg,
        week: { type: "integer", minimum: 1, maximum: 18, description: "Defaults to the current week." },
        source: { type: "string", enum: ["stats", "projections"], description: "Defaults to stats for past weeks, projections otherwise." },
      },
      required: ["league_id"],
    },
    async run(api, { league_id, players: names = [], team, week, source }) {
      const [league, st, players] = await Promise.all([api.league(league_id), api.state(), api.players()]);
      if (!league) throw new ToolError(`No league ${league_id}.`);
      const w = Number(week || st.display_week || st.week);
      const src = source || (w < Number(st.week) ? "stats" : "projections");
      let ids = names.map((n) => resolvePlayer(n, players));
      if (team !== undefined && team !== null && team !== "") {
        const [users, rosters] = await Promise.all([api.users(league_id), api.rosters(league_id)]);
        const r = findRoster(rosters, teamDirectory(users, rosters), team);
        ids = [...ids, ...(r.players || [])];
      }
      ids = [...new Set(ids)].slice(0, 20);
      if (!ids.length) throw new ToolError("Pass `players` or `team`.");
      const season = league.season || st.season;
      const rows = await Promise.all(
        ids.map(async (id) => {
          const base = describe(id, players);
          try {
            const weeks = await api.playerWeeks(src, id, season);
            const entry = weeks?.[String(w)];
            if (!entry?.stats) return { ...base, points: null, note: `no ${src} for week ${w}` };
            const sc = scoreStats(entry.stats, league.scoring_settings);
            return {
              ...base,
              opponent: entry.opponent || null,
              points: sc.points,
              first_down_points: sc.first_down_points,
              sleeper_half_ppr: entry.stats.pts_half_ppr ?? null,
              breakdown: sc.breakdown,
            };
          } catch (e) {
            return { ...base, points: null, note: `${src} unavailable (${e.message})` };
          }
        }),
      );
      rows.sort((a, b) => (b.points ?? -1e9) - (a.points ?? -1e9));
      return { league: league.name, week: w, source: src, players: rows };
    },
  },
  {
    name: "draft_history",
    description:
      "Draft picks for this league and, optionally, past seasons (follows the league's history). Each pick has round, pick number, player and the team that drafted.",
    inputSchema: {
      type: "object",
      properties: {
        league_id: leagueId,
        seasons_back: { type: "integer", minimum: 0, maximum: 4, default: 0, description: "How many previous seasons to include." },
        team: { ...teamArg, description: "Optional: only picks by this owner (matched by owner username/display name)." },
      },
      required: ["league_id"],
    },
    async run(api, { league_id, seasons_back = 0, team }) {
      const out = [];
      let id = league_id;
      for (let i = 0; i <= seasons_back && id && id !== "0"; i++) {
        const [league, drafts, users] = await Promise.all([api.league(id), api.drafts(id), api.users(id)]);
        if (!league) break;
        const byUser = Object.fromEntries((users || []).map((u) => [u.user_id, u.display_name]));
        for (const d of drafts || []) {
          const picks = (await api.draftPicks(d.draft_id)) || [];
          const rows = picks
            .map((p) => ({
              round: p.round,
              pick: p.pick_no,
              player: [p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(" ") || p.player_id,
              pos: p.metadata?.position,
              nfl_team: p.metadata?.team,
              owner: byUser[p.picked_by] || p.picked_by,
              ...(p.is_keeper ? { keeper: true } : {}),
            }))
            .filter((p) => !team || norm(p.owner) === norm(team));
          out.push({ season: league.season, league: league.name, draft_type: d.type, picks: rows });
        }
        id = league.previous_league_id;
      }
      return out;
    },
  },
];

export const TOOL_INDEX = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
