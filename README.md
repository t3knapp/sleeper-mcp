# sleeper-mcp

A read-only [MCP](https://modelcontextprotocol.io) connector for [Sleeper](https://sleeper.com) fantasy football leagues, running on Cloudflare Workers. Add it to Claude as a custom connector and ask about your league in plain language: standings, matchups, waivers, trades, and player scores under **your league's own scoring rules** (e.g. points per first down), which generic rankings ignore.

## Tools

| Tool | What it returns |
| --- | --- |
| `nfl_state` | Current season and week |
| `find_leagues` | A user's leagues for a season, from their username |
| `league_overview` | Roster slots, playoff/waiver/trade settings, every non-zero scoring rule |
| `standings` | Record, points for/against, team names |
| `rosters` | Starters, bench, IR, taxi with names, positions, NFL teams, injuries |
| `matchups` | Head-to-head pairings with team and starter points for a week |
| `transactions` | Waivers, free-agent moves and trades with names and FAAB bids |
| `trending` | Most added/dropped players across Sleeper, with league availability |
| `free_agents` | Unrostered players in a league, by position |
| `player_lookup` | Name search → Sleeper player IDs |
| `score_players` | League-scored points from stats (past weeks) or projections (upcoming), with Sleeper's standard half-PPR beside each and the first-down share broken out |
| `draft_history` | Draft picks this season and previous seasons, filterable by owner |

## How it works

- `src/index.js` — Worker entry. `POST /mcp` is a stateless MCP endpoint (Streamable HTTP, JSON responses). `GET /` shows server info.
- `src/mcp.js` — JSON-RPC handling: `initialize`, `ping`, `tools/list`, `tools/call`.
- `src/tools.js` — tool definitions.
- `src/scoring.js` — scores a stat line with a league's `scoring_settings`; derives defense points-allowed/yards-allowed buckets when needed.
- `src/sleeper.js` — Sleeper API client with edge caching.
- `scripts/build-players.mjs` — Sleeper's full player list is ~5 MB, too large to parse inside the free plan's 10 ms CPU budget. A daily GitHub Action slims it to fantasy-relevant players and stores it in Workers KV under `players`.

No dependencies at runtime; Wrangler is only used to deploy.

The per-player stats and projections endpoints that `score_players` uses are undocumented. If Sleeper changes them, that tool reports "unavailable" per player instead of failing.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: tests → `wrangler deploy` → rebuild the player index. `refresh-players.yml` rebuilds the index daily. Both need repository secrets `CLOUDFLARE_API_TOKEN` (the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`.

Then add `https://sleeper-mcp.<your-subdomain>.workers.dev/mcp` as a custom connector in Claude.

## Test

```bash
node --test tests/*.test.mjs
```

The endpoint has no authentication: it only proxies Sleeper's public, read-only data.
