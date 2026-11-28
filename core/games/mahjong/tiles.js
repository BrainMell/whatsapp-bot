'use strict';
// Mahjong solitaire ("turtle") - tiles, layout, free-tile rules and a deal that is ALWAYS solvable.

// ---- tile set: 34 kinds x4 = 136, + 4 flowers + 4 seasons = 144 --------------------------------
const KINDS = [];
for (const s of ['D', 'B', 'C']) for (let n = 1; n <= 9; n++) KINDS.push(s + n); // dots, bamboo, characters
KINDS.push('WE', 'WS', 'WW', 'WN', 'DR', 'DG', 'DW');                              // winds, dragons (red/green/white)
const FLOWERS = ['F1', 'F2', 'F3', 'F4'];
const SEASONS = ['S1', 'S2', 'S3', 'S4'];
/** two tiles match when their groups are equal (any flower matches any flower, same for seasons) */
const group = (k) => (k[0] === 'F' ? 'FL' : k[0] === 'S' ? 'SE' : k);

// ---- classic turtle layout, half-tile units (a tile covers 2x2) ----------------------------------
function layout() {
  const P = [];
  const row = (z, y, x0, x1) => { for (let x = x0; x <= x1; x += 2) P.push({ x, y, z }); };
  row(0, 0, 2, 24); row(0, 2, 6, 20); row(0, 4, 4, 22); row(0, 6, 2, 24);
  row(0, 8, 2, 24); row(0, 10, 4, 22); row(0, 12, 6, 20); row(0, 14, 2, 24);
  P.push({ x: 0, y: 7, z: 0 }, { x: 26, y: 7, z: 0 }, { x: 28, y: 7, z: 0 });
  for (let y = 2; y <= 12; y += 2) row(1, y, 8, 18);
  for (let y = 4; y <= 10; y += 2) row(2, y, 10, 16);
  for (let y = 6; y <= 8; y += 2) row(3, y, 12, 14);
  P.push({ x: 13, y: 7, z: 4 });
  P.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  return P.map((p, i) => ({ id: i + 1, ...p }));
}

const overlap = (a, b) => Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
function isFree(t, alive) {
  let left = false, right = false;
  for (const o of alive) {
    if (o === t) continue;
    if (o.z === t.z + 1 && overlap(o, t)) return false;          // something on top
    if (o.z === t.z && Math.abs(o.y - t.y) < 2) {
      if (o.x === t.x - 2) left = true;
      if (o.x === t.x + 2) right = true;
    }
  }
  return !(left && right);
}
const freeTiles = (alive) => alive.filter((t) => isFree(t, alive));

/** every legal pair among the free tiles */
function movesOf(alive) {
  const f = freeTiles(alive); const out = [];
  for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) if (group(f[i].kind) === group(f[j].kind)) out.push([f[i], f[j]]);
  return out;
}

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** the full 144-tile multiset */
function fullSet() {
  const s = [];
  for (const k of KINDS) for (let i = 0; i < 4; i++) s.push(k);
  return s.concat(FLOWERS, SEASONS);
}

/**
 * Assign `kinds` (multiset, even count per group) onto `slots` so the result is solvable:
 * play the game BACKWARDS - repeatedly take two currently-free slots and give them a matching pair.
 * Returns the tile list or null (caller retries).
 */
function dealOnto(slots, kinds) {
  const byGroup = new Map();
  for (const k of kinds) { const g = group(k); if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(k); }
  const pairs = [];
  for (const arr of byGroup.values()) { shuffle(arr); while (arr.length >= 2) pairs.push([arr.pop(), arr.pop()]); }
  shuffle(pairs);
  const alive = slots.map((s) => ({ ...s, kind: null }));
  const done = [];
  let pool = alive.slice();
  while (pool.length) {
    const f = freeTiles(pool);
    if (f.length < 2) return null;
    // prefer two slots that are not stacked right on each other, for a more interesting board
    shuffle(f);
    const a = f[0]; let b = f[1];
    for (let i = 1; i < f.length; i++) { if (Math.abs(f[i].x - a.x) + Math.abs(f[i].y - a.y) > 4) { b = f[i]; break; } }
    const pr = pairs.pop(); if (!pr) return null;
    a.kind = pr[0]; b.kind = pr[1];
    done.push(a, b);
    pool = pool.filter((t) => t !== a && t !== b);
  }
  return done.length === slots.length ? alive : null;
}

function newDeal() {
  const base = layout();
  for (let i = 0; i < 200; i++) { const d = dealOnto(base, fullSet()); if (d) return d.map((t) => ({ ...t, alive: true })); }
  throw new Error('mahjong: could not deal');
}

/** reshuffle what is left on the board (still solvable) */
function reshuffleAlive(tiles) {
  const alive = tiles.filter((t) => t.alive);
  const kinds = alive.map((t) => t.kind);
  for (let i = 0; i < 200; i++) {
    const d = dealOnto(alive.map(({ id, x, y, z }) => ({ id, x, y, z })), kinds);
    if (d) { const m = new Map(d.map((t) => [t.id, t.kind])); for (const t of alive) t.kind = m.get(t.id); return true; }
  }
  return false;
}

module.exports = { KINDS, group, layout, isFree, freeTiles, movesOf, newDeal, reshuffleAlive };
