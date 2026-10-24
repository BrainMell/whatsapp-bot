'use strict';
const DEFAULT_LADDER = Object.freeze(['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS']);

/**
 * Mixed-tier parties are limited to one rank above their lowest normal rank.
 * Uniform parties retain the existing one-rank-above progression rule.
 * Special ranks outside the supplied ladder do not promote the group.
 */
function resolvePartyDungeonRank(ranks, options = {}) {
  const ladder = Array.isArray(options.ladder) && options.ladder.length
    ? options.ladder.map((r) => String(r).toUpperCase())
    : [...DEFAULT_LADDER];
  const index = new Map(ladder.map((rank, i) => [rank, i]));
  const counts = new Map();

  for (const raw of Array.isArray(ranks) ? ranks : []) {
    const rank = String(raw || 'F').trim().toUpperCase();
    if (!index.has(rank)) continue;
    counts.set(rank, (counts.get(rank) || 0) + 1);
  }
  if (!counts.size) return null;

  const present = [...counts.keys()].sort((a, b) => index.get(a) - index.get(b));
  const lowestRank = present[0];
  const highestRank = present[present.length - 1];
  let commonRank = lowestRank;
  let commonCount = -1;
  // Low-to-high strict comparison means a count tie favors the lower rank.
  for (const rank of ladder) {
    const n = counts.get(rank) || 0;
    if (n > commonCount) { commonRank = rank; commonCount = n; }
  }

  const mixed = lowestRank !== highestRank;
  const basisRank = mixed ? lowestRank : commonRank;
  const newRank = ladder[Math.min(ladder.length - 1, index.get(basisRank) + 1)];

  return {
    newRank, commonRank, commonCount,
    rankedCount: [...counts.values()].reduce((sum, n) => sum + n, 0),
    total: Number.isInteger(options.total) ? options.total : (Array.isArray(ranks) ? ranks.length : 0),
    lowestRank, highestRank, mixed, basisRank,
  };
}
module.exports = { resolvePartyDungeonRank, DEFAULT_LADDER };
