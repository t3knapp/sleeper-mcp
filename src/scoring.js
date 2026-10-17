// Score a Sleeper stat line with a league's scoring_settings.
//
// Sleeper's stat keys and scoring keys share names (rec, rec_fd, pass_yd, fgm_40_49, ...),
// so most of scoring is a dot product. Team defenses are the exception: points-allowed and
// yards-allowed are scored by bucket, and a stat line may carry the raw total instead of the
// bucket flag, so the bucket is derived when it's missing.

const PTS_ALLOW_BUCKETS = [
  ["pts_allow_0", 0, 0],
  ["pts_allow_1_6", 1, 6],
  ["pts_allow_7_13", 7, 13],
  ["pts_allow_14_20", 14, 20],
  ["pts_allow_21_27", 21, 27],
  ["pts_allow_28_34", 28, 34],
  ["pts_allow_35p", 35, Infinity],
];

const YDS_ALLOW_BUCKETS = [
  ["yds_allow_0_100", 0, 99],
  ["yds_allow_100_199", 100, 199],
  ["yds_allow_200_299", 200, 299],
  ["yds_allow_300_349", 300, 349],
  ["yds_allow_350_399", 350, 399],
  ["yds_allow_400_449", 400, 449],
  ["yds_allow_450_499", 450, 499],
  ["yds_allow_500_549", 500, 549],
  ["yds_allow_550p", 550, Infinity],
];

// Keys whose scoring value applies per unit but which Sleeper's stat lines don't use as counts.
const SKIP = new Set(["pts_allow", "yds_allow"]);

const FIRST_DOWN_KEYS = ["pass_fd", "rush_fd", "rec_fd"];

function withDerivedBuckets(stats) {
  const s = { ...stats };
  const hasPtsBucket = PTS_ALLOW_BUCKETS.some(([k]) => k in s);
  if (!hasPtsBucket && typeof s.pts_allow === "number") {
    for (const [k, lo, hi] of PTS_ALLOW_BUCKETS) if (s.pts_allow >= lo && s.pts_allow <= hi) s[k] = 1;
  }
  const hasYdsBucket = YDS_ALLOW_BUCKETS.some(([k]) => k in s);
  if (!hasYdsBucket && typeof s.yds_allow === "number") {
    for (const [k, lo, hi] of YDS_ALLOW_BUCKETS) if (s.yds_allow >= lo && s.yds_allow <= hi) s[k] = 1;
  }
  return s;
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * @param {Record<string, number>} stats  a Sleeper stat line (one player, one week)
 * @param {Record<string, number>} scoring  league.scoring_settings
 * @returns {{points: number, first_down_points: number, breakdown: Record<string, number>}}
 */
export function scoreStats(stats, scoring) {
  const s = withDerivedBuckets(stats || {});
  let points = 0;
  let fd = 0;
  const breakdown = {};
  for (const [key, weight] of Object.entries(scoring || {})) {
    if (!weight || SKIP.has(key)) continue;
    const v = s[key];
    if (typeof v !== "number" || !v) continue;
    const p = v * weight;
    points += p;
    breakdown[key] = round2(p);
    if (FIRST_DOWN_KEYS.includes(key)) fd += p;
  }
  return { points: round2(points), first_down_points: round2(fd), breakdown };
}

/** Only the scoring rules that are non-zero, for a readable summary. */
export function activeScoring(scoring) {
  return Object.fromEntries(
    Object.entries(scoring || {})
      .filter(([, v]) => v)
      .map(([k, v]) => [k, round2(v * 1000) / 1000])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
