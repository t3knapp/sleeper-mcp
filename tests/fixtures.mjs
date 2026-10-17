// Small fixtures shaped like real Sleeper responses.

export const SCORING = {
  pass_yd: 0.04, pass_td: 4, pass_int: -1, pass_fd: 0.5, pass_2pt: 2,
  rush_yd: 0.1, rush_td: 6, rush_fd: 0.5, rush_2pt: 2,
  rec: 0.5, rec_yd: 0.1, rec_td: 6, rec_fd: 0.5,
  fum: -1, fum_lost: -2,
  sack: 1, int: 2, fum_rec: 2, def_td: 6, safe: 2, blk_kick: 2,
  pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1,
  pts_allow_21_27: 0, pts_allow_28_34: -1, pts_allow_35p: -4,
  xpm: 1, xpmiss: -1, fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5,
  qb_hit: 0, bonus_rec_te: 0,
};

// A real week-1 line (Sleeper per-player stats endpoint); Sleeper's own half-PPR was 22.66.
export const QB_WEEK1 = {
  pass_yd: 184, pass_td: 2, pass_int: 1, pass_fd: 5, pass_att: 27, pass_cmp: 15,
  rush_yd: 23, rush_td: 1, rush_fd: 1, rush_att: 7,
  pts_half_ppr: 22.66, pts_ppr: 22.66, pts_std: 22.66,
};

export const PLAYERS = {
  "4046": { n: "Patrick Mahomes", p: "QB", t: "KC", r: 30 },
  "9487": { n: "Puka Nacua", p: "WR", t: "LAR", r: 5 },
  "11584": { n: "Bucky Irving", p: "RB", t: "TB", r: 40 },
  "2133": { n: "Davante Adams", p: "WR", t: "LAR", i: "Questionable", r: 60 },
  "7000": { n: "Josh Allen", p: "QB", t: "BUF", r: 2 },
  "7001": { n: "Josh Allen", p: "LB", t: "JAX", r: 500 },
  "8000": { n: "Free Agent Wr", p: "WR", t: "NYJ", r: 150 },
  "8001": { n: "Deep Bench Rb", p: "RB", t: "MIA", r: 300 },
  "8002": { n: "Unsigned Guy", p: "WR", r: 100 },
  KC: { n: "Kansas City Chiefs", p: "DEF", t: "KC", r: 900 },
};

export const LEAGUE = {
  league_id: "L1", name: "Lets Ride", season: "2026", status: "in_season", total_rosters: 2,
  roster_positions: ["QB", "RB", "WR", "FLEX", "DEF", "BN"],
  settings: { type: 0, playoff_week_start: 15, playoff_teams: 6, waiver_type: 2, waiver_budget: 100, trade_deadline: 11 },
  scoring_settings: SCORING,
  previous_league_id: "L0",
};

export const USERS = [
  { user_id: "u1", display_name: "t3knapp", metadata: { team_name: "Knapp Time" } },
  { user_id: "u2", display_name: "rival", metadata: {} },
];

export const ROSTERS = [
  {
    roster_id: 1, owner_id: "u1",
    players: ["4046", "11584", "9487", "2133", "KC"], starters: ["4046", "11584", "9487", "2133", "KC"],
    reserve: [], settings: { wins: 1, losses: 4, fpts: 563, fpts_decimal: 56, fpts_against: 600, fpts_against_decimal: 10 },
  },
  {
    roster_id: 2, owner_id: "u2",
    players: ["7000"], starters: ["7000"],
    settings: { wins: 4, losses: 1, fpts: 650, fpts_decimal: 0, fpts_against: 520, fpts_against_decimal: 0 },
  },
];

export function fakeApi(overrides = {}) {
  return {
    state: async () => ({ season: "2026", season_type: "regular", week: 6, display_week: 6 }),
    user: async (n) => (n === "t3knapp" ? { user_id: "u1", username: "t3knapp", display_name: "t3knapp" } : null),
    userLeagues: async () => [LEAGUE],
    league: async (id) => (id === "L1" ? LEAGUE : id === "L0" ? { ...LEAGUE, league_id: "L0", season: "2025", previous_league_id: null } : null),
    users: async () => USERS,
    rosters: async () => ROSTERS,
    matchups: async () => [
      { roster_id: 1, matchup_id: 1, points: 101.5, starters: ["4046"], players_points: { "4046": 25.66 } },
      { roster_id: 2, matchup_id: 1, points: 120.2, starters: ["7000"], players_points: { "7000": 30.1 } },
    ],
    transactions: async () => [
      { type: "waiver", status: "complete", status_updated: 1, roster_ids: [1], adds: { "8000": 1 }, drops: { "2133": 1 }, settings: { waiver_bid: 12 } },
    ],
    drafts: async (id) => [{ draft_id: `D-${id}`, type: "snake" }],
    draftPicks: async () => [
      { round: 1, pick_no: 1, picked_by: "u1", player_id: "9487", metadata: { first_name: "Puka", last_name: "Nacua", position: "WR", team: "LAR" } },
      { round: 1, pick_no: 2, picked_by: "u2", player_id: "7000", metadata: { first_name: "Josh", last_name: "Allen", position: "QB", team: "BUF" } },
    ],
    trending: async () => [{ player_id: "8000", count: 5000 }, { player_id: "9487", count: 10 }],
    playerWeeks: async (kind, id) =>
      id === "4046" ? { 1: { opponent: "LAC", stats: QB_WEEK1 }, 6: { opponent: "DEN", stats: QB_WEEK1 } } : { 6: null },
    players: async () => PLAYERS,
    ...overrides,
  };
}
