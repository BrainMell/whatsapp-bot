'use strict';
// 🐟→🏛️ CROWD LAYOUT (owner 2026-11-11: "enemy arrangement ... looks like sardines stacked together at 6").
// The Go renderer lines every enemy up on ONE row. With 3+ enemies they overlap into a pile. Go also returns each combatant as an
// isolated cut (PNG + crop rect) and an anchor, so Node re-stages the enemy side itself: staggered ROWS (back row smaller + higher,
// front row full size), spread across the enemy half of the arena, bosses pulled to the front. Anchors/cuts/sprites/focus are all
// rewritten together, so every downstream painter (bars, hit FX, shadows, ults, death stills, card scenes) stays aligned without
// knowing the layout changed. Runs once per Go response (inside the layers cache). CROWD_LAYOUT=0 disables; <3 enemies = untouched.
const { createCanvas, loadImage } = require('canvas');

function plan(enemyAnchors, isBoss, W, H) {
  // Interleaved rows on one shared x grid: neighbours alternate rows, so same-row spacing is rows*step (room to breathe) while the
  // staggered back row (smaller + higher) peeks through the gaps. Single row whenever everything already fits.
  const n = enemyAnchors.length, items = enemyAnchors.slice().sort((p, q) => p.index - q.index);
  const fb = enemyAnchors.map((a) => a.feetY).sort((p, q) => p - q)[Math.floor(n / 2)];     // baseline = median feet line Go used
  const xLo = 0.46 * W, xHi = 0.96 * W, span = xHi - xLo, step = span / n;
  const maxW = Math.max(...items.map((a) => a.w || 120));
  const rows = step >= maxW * 0.92 ? 1 : (2 * step >= maxW * 0.9 ? 2 : 3);
  const out = new Map();
  items.forEach((a, i) => {
    const depth = isBoss(a.index) ? 0 : (rows === 1 ? 0 : (rows - 1 - (i % rows)));     // 0 = front; bosses always front
    const w = a.w || 120, rowGap = step * rows;
    const f = Math.max(0.55, Math.min(1, (rowGap * 0.98) / maxW, 1 - 0.13 * depth));
    const nx = Math.max(xLo + w * f * 0.5, Math.min(xHi - w * f * 0.5, xLo + step * (i + 0.5)));
    out.set(a.index, { x: nx, feetY: fb - depth * 0.07 * H, f: rows === 1 ? Math.min(1, (step * 0.95) / maxW) : f });
  });
  return out;
}

/** Returns the same `layers` (mutated) or untouched when not applicable / anything is missing. payload = the Go request. */
async function relayout(layers, payload) {
  try {
    if (!layers || process.env.CROWD_LAYOUT === '0' || !Array.isArray(layers.anchors) || !Array.isArray(layers.cuts)) return layers;
    const W = layers.w || 1024, H = layers.h || 687;
    const enemies = layers.anchors.filter((a) => a && a.side === 'enemy');
    if (enemies.length < 3) return layers;
    const cutOf = new Map(layers.cuts.filter((c) => c && c.png).map((c) => [c.side + ':' + c.index, c]));
    for (const a of layers.anchors) if (a && (a.side === 'player' || a.side === 'enemy' || a.side === 'summon') && !cutOf.has(a.side + ':' + a.index)) return layers;   // need every cut or we cannot restage safely
    const boss = (i) => (payload && payload.enemies && payload.enemies[i] && payload.enemies[i].isBoss ? 1 : 0);
    const pos = plan(enemies, boss, W, H);
    const imgs = new Map(); for (const [k, c] of cutOf) imgs.set(k, await loadImage(Buffer.from(c.png, 'base64')));
    const units = [];
    const newAnchors = [], newCuts = [];
    for (const a of layers.anchors) {
      const c = cutOf.get(a.side + ':' + a.index); let na = { ...a }, nc = c ? { ...c } : null;
      const p = a.side === 'enemy' ? pos.get(a.index) : null;
      if (p && c) {
        const f = p.f, offX = (c.x + c.w / 2) - a.x, offY = (c.y + c.h) - a.feetY;
        na = { ...a, x: p.x, feetY: p.feetY, w: (a.w || c.w) * f, h: (a.h || c.h) * f };
        nc = { ...c, w: c.w * f, h: c.h * f }; nc.x = p.x + offX * f - nc.w / 2; nc.y = p.feetY + offY * f - nc.h;
      }
      newAnchors.push(na); if (nc) { newCuts.push(nc); units.push({ key: a.side + ':' + a.index, cut: nc, feet: na.feetY, side: a.side, index: a.index }); }
    }
    for (const c of layers.cuts) if (c && !c.png) newCuts.push(c);
    units.sort((p, q) => p.feet - q.feet);                                   // back to front
    const cv = createCanvas(W, H), cx = cv.getContext('2d');
    for (const u of units) cx.drawImage(imgs.get(u.key), u.cut.x, u.cut.y, u.cut.w, u.cut.h);
    const sprites = cv.toBuffer('image/png');
    let focus = layers.focus;
    if (payload && payload.focusSide) {
      const fu = units.find((u) => u.side === String(payload.focusSide) && u.index === Math.floor(Number(payload.focusIndex) || 0));
      if (fu) { const fv = createCanvas(W, H), fc = fv.getContext('2d'); fc.drawImage(imgs.get(fu.key), fu.cut.x, fu.cut.y, fu.cut.w, fu.cut.h); focus = fv.toBuffer('image/png'); }
    }
    return { ...layers, sprites, focus, anchors: newAnchors, cuts: newCuts, crowd: true };
  } catch (e) { console.warn('[CrowdLayout] skipped:', e && e.message); return layers; }
}
module.exports = { relayout, plan };
