// Thin client for Sleeper's public, read-only API (https://docs.sleeper.com).
// The per-player stats/projections endpoints are undocumented but widely used; callers
// should treat their failure as "data unavailable", not as a server error.

const BASE = "https://api.sleeper.app";

export class SleeperError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {object} opts
 * @param {typeof fetch} [opts.fetch]
 * @param {{get: (k: string, t?: string) => Promise<any>}} [opts.kv]  Workers KV namespace holding the player index
 */
export function createClient({ fetch: f = globalThis.fetch, kv } = {}) {
  let players = null; // module-lifetime cache of the slim player index
  let playersLoadedAt = 0;

  async function get(path, ttl = 60) {
    const res = await f(BASE + path, {
      headers: { "user-agent": "sleeper-mcp (+https://github.com/t3knapp/sleeper-mcp)" },
      // Honored on Cloudflare (edge cache); ignored elsewhere.
      cf: { cacheTtl: ttl, cacheEverything: true },
    });
    if (res.status === 404) throw new SleeperError(`Not found: ${path}`, 404);
    if (!res.ok) throw new SleeperError(`Sleeper returned ${res.status} for ${path}`, res.status);
    const text = await res.text();
    if (!text || text === "null") return null;
    return JSON.parse(text);
  }

  return {
    state: () => get("/v1/state/nfl", 300),
    user: (nameOrId) => get(`/v1/user/${encodeURIComponent(nameOrId)}`, 3600),
    userLeagues: (userId, season) => get(`/v1/user/${userId}/leagues/nfl/${season}`, 600),
    league: (id) => get(`/v1/league/${id}`, 600),
    users: (id) => get(`/v1/league/${id}/users`, 600),
    rosters: (id) => get(`/v1/league/${id}/rosters`, 60),
    matchups: (id, week) => get(`/v1/league/${id}/matchups/${week}`, 60),
    transactions: (id, week) => get(`/v1/league/${id}/transactions/${week}`, 120),
    drafts: (id) => get(`/v1/league/${id}/drafts`, 3600),
    draftPicks: (draftId) => get(`/v1/draft/${draftId}/picks`, 3600),
    trending: (type, hours, limit) =>
      get(`/v1/players/nfl/trending/${type}?lookback_hours=${hours}&limit=${limit}`, 600),
    playerWeeks: (kind, playerId, season) =>
      get(`/${kind}/nfl/player/${playerId}?season_type=regular&season=${season}&grouping=week`, kind === "stats" ? 600 : 1800),

    /** Slim player index {id: {n, p, t, i, s, r}} built daily by the refresh workflow. */
    async players() {
      if (players && Date.now() - playersLoadedAt < 6 * 3600 * 1000) return players;
      const data = kv ? await kv.get("players", "json") : null;
      if (!data) throw new SleeperError("Player index isn't built yet. Run the 'Refresh player index' workflow.", 503);
      players = data.players || data;
      playersLoadedAt = Date.now();
      return players;
    },
  };
}
