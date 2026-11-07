'use strict';
// ⚔️ Node-composed PvE battle card (HUD v6.1). Go supplies the HUD-less + nameplate-less layered
// scene (bg + sprites + cuts + anchors, hud:"none-clean"). Node paints: the slim OVERHEAD HP BARS
// (v6.1 RESTORED — owner: "keep the one where the players is green and the enemies is red"; Go's
// legacy red bars + name pills stay stripped), turn marker, hit flash, unit status visuals (shield
// bubbles + badges), rank chip, compact player plate and (when the active player owns summon
// cards) the floating deck hand. Returns null on ANY problem so the caller falls back to the Go card.
const { createCanvas, loadImage } = require('canvas');
const hud = require('./combatHud');
const auras = require('./statusAuras');
const unitFx = (side, idx, players, enemies) => { const u = side === 'enemy' ? enemies[idx] : players[idx]; if (!u || u.isDead || u.justDied) return null; return Array.isArray(u.statusEffects) ? u.statusEffects : null; };

async function renderNodeCard(players, enemies, options, api) {
  const t0 = Date.now();
  const payload = api.buildPayload(players, enemies, options);
  await hud.preload();
  const layers = await api.generateCombatLayers(players, enemies, { ...options, hud: 'none-clean' });
  if (!layers || !layers.bg || !layers.sprites) return null;
  const W = layers.w || 1024, H = layers.h || 687, s = W / hud.DW;
  const cv = createCanvas(W, H), c = cv.getContext('2d');
  c.drawImage(await loadImage(layers.bg), 0, 0, W, H);
  const anchors = Array.isArray(layers.anchors) ? layers.anchors : [];
  const act = options.action || null;
  // turn marker (golden ellipse under the acting unit, under the sprites)
  if (act) {
    const a = anchors.find((x) => x.side === (act.attackerSide || 'player') && x.index === (Number(act.attackerIndex) || 0));
    if (a) { c.save(); c.translate(a.x * s, a.feetY * s); c.scale(1, 0.28); const g = c.createRadialGradient(0, 0, 4, 0, 0, 62 * s); g.addColorStop(0, 'rgba(255,214,102,0.85)'); g.addColorStop(1, 'rgba(255,214,102,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 62 * s, 0, Math.PI * 2); c.fill(); c.restore(); }
  }
  for (const a of anchors) { const fx = unitFx(a.side, a.index, players, enemies); if (fx) auras.drawAuras(c, a, fx, s, 'ground'); }
  c.drawImage(await loadImage(layers.sprites), 0, 0, W, H);
  // JRPG-style hit reaction on the target: knock-back red double image + slash + impact star + damage number
  try { await require('./hitFx').drawHitReaction(c, layers, anchors, act, s); } catch (e) { /* cosmetic */ }
  // overhead unit bars — v6.1 RESTORED (owner 2026-11-07: "both are gone now instead of the one,
  // keep the one where the players is green and the enemies is red"). These slim Node bars ARE
  // that display: green fill on the player roster, red on enemies / crimson on bosses. Go's
  // legacy nameplate pills stay stripped server-side via hud:"none-clean". A unit with status
  // badges lifts its bar above the badge row so the two never collide. Raw rosters feed the bars
  // (payload strips statusEffects, and HP lives on the same live objects).
  for (const a of anchors) {
    if (a.side !== 'player' && a.side !== 'enemy') continue;
    const u = a.side === 'enemy' ? enemies[a.index] : players[a.index];
    if (!u || u.isDead || u.justDied) continue;
    const hp = Number(u.currentHP ?? (u.stats && u.stats.hp) ?? 0); if (hp <= 0) continue;
    const maxHp = Number(u.maxHp ?? (u.stats && u.stats.maxHp) ?? 0);
    const fxCount = Array.isArray(u.statusEffects) ? u.statusEffects.filter((e) => e && e.icon).length : 0;
    hud.drawUnitBar(c, a, { name: u.name, hp, maxHp, isBoss: u.isBoss, friendly: a.side === 'player', yOff: fxCount ? 26 : 0 }, s);
  }
  // unit status visuals over the sprites: shield bubble (absorb) + floating status badges.
  // Data comes from the RAW rosters (payload strips statusEffects); anchors map side+index →
  // the exact sprite position (owner 2026-11-06: "some summon skills add a shield — make a
  // shield bubble for it; read the skill trees for abilities like that").
  for (const a of anchors) {
    if (a.side !== 'player' && a.side !== 'enemy') continue;
    const u = a.side === 'enemy' ? enemies[a.index] : players[a.index];
    if (!u || u.isDead || u.justDied) continue;
    const hp = Number(u.currentHP ?? (u.stats && u.stats.hp) ?? 0); if (hp <= 0) continue;
    const fx = Array.isArray(u.statusEffects) ? u.statusEffects.filter((e) => e && e.icon) : [];
    if (!fx.length) continue;
    auras.drawAuras(c, a, u.statusEffects, s, 'front');
    hud.drawStatusBadges(c, a, fx, s);
  }
  // rank chip
  const pl = payload.players || [];
  const rank = String(options.rank || (pl[0] && pl[0].adventurerRank) || 'F').toUpperCase();
  hud.drawRankBanner(c, options.floor > 0 ? 'FLOOR ' + options.floor : rank + ' RANK', s);
  // compact player plate (the unit whose turn it is, else the first player)
  const hi = act && act.attackerSide === 'player' ? Math.max(0, Number(act.attackerIndex) || 0) : 0;
  const p = pl[hi] || pl[0];
  if (p) {
    const cut = (layers.cuts || []).find((x) => x.side === 'player' && x.index === hi);
    hud.drawPlayerHud(c, {
      name: p.name, hp: p.currentHP ?? p.hp, maxHp: p.maxHp, energy: p.energy, maxEnergy: p.maxEnergy, level: p.level,
      portrait: await hud.portraitFromCut(cut),
    }, s);
  }
  if (options._sceneOut) { Object.assign(options._sceneOut, { canvas: cv, anchors, s, hi, layers, players, enemies }); }
  // summon deck tray - ONLY for players who own cards
  if (options._skipTray) { const buf0 = cv.toBuffer('image/jpeg', { quality: 0.8 }); return { success: true, buffer: buf0, mimeType: 'image/jpeg' }; }
  try {
    const src = players[hi] || players[0];
    if (src && src.jid) {
      const sc = require('../summonCards');
      const entries = sc.handEntries(src.jid, options.combatState || {}, src);
      if (entries.length) await hud.drawDeckTray(c, entries, s);
    }
  } catch (e) { /* tray is optional */ }
  const buffer = cv.toBuffer('image/jpeg', { quality: 0.88 });
  console.log(`[CombatHud] node card ${buffer.length}B in ${Date.now() - t0}ms`);
  return { success: true, buffer, mimeType: 'image/jpeg' };
}
/** ⚔️ PvP duel card (owner 2026-11-07): no rank banner; P1's hub bottom-left, P2's hub TOP-RIGHT, mirrored (portrait on the right,
 * bars grow right-to-left). players = [p1, p2] in fixed slot order. Same fallback contract as renderNodeCard. */
async function renderNodePvpCard(players, enemies, options, api) {
  const t0 = Date.now();
  if (!Array.isArray(players) || players.length < 2) return null;
  const payload = api.buildPayload(players, [], options);
  await hud.preload();
  const layers = await api.generateCombatLayers(players, [], { ...options, hud: 'none-clean' });
  if (!layers || !layers.bg || !layers.sprites) return null;
  const W = layers.w || 1024, H = layers.h || 687, s = W / hud.DW;
  const cv = createCanvas(W, H), c = cv.getContext('2d');
  c.drawImage(await loadImage(layers.bg), 0, 0, W, H);
  const anchors = Array.isArray(layers.anchors) ? layers.anchors : [];
  const act = options.action || null, turn = act ? Math.max(0, Number(act.attackerIndex) || 0) : -1;
  const aOf = (i) => anchors.find((x) => x.side === 'player' && x.index === i);
  if (turn >= 0 && aOf(turn)) { const a = aOf(turn); c.save(); c.translate(a.x * s, a.feetY * s); c.scale(1, 0.28); const g = c.createRadialGradient(0, 0, 4, 0, 0, 62 * s); g.addColorStop(0, 'rgba(255,214,102,0.85)'); g.addColorStop(1, 'rgba(255,214,102,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 62 * s, 0, Math.PI * 2); c.fill(); c.restore(); }
  for (const a of anchors) { const fx = unitFx(a.side, a.index, players, []); if (fx) auras.drawAuras(c, a, fx, s, 'ground'); }
  c.drawImage(await loadImage(layers.sprites), 0, 0, W, H);
  try { await require('./hitFx').drawHitReaction(c, layers, anchors, act && act.targetSide ? { ...act, targetSide: 'player' } : null, s); } catch (e) { /* cosmetic */ }
  for (const a of anchors) {
    if (a.side !== 'player') continue;
    const u = players[a.index]; if (!u || u.isDead) continue;
    const fx = Array.isArray(u.statusEffects) ? u.statusEffects.filter((e) => e && e.icon) : [];
    if (!fx.length) continue;
    auras.drawAuras(c, a, u.statusEffects, s, 'front');
    hud.drawStatusBadges(c, a, fx, s);
  }
  const pl = payload.players || [];
  for (let i = 0; i < 2; i++) {
    const p = pl[i]; if (!p) continue;
    const cut = (layers.cuts || []).find((x) => x.side === 'player' && x.index === i), flip = i === 1, col = i === 0 ? '#d8b04a' : '#8f5bd6';
    if (i === turn) { // active duelist: warm glow behind their hub
      const gx = flip ? W - 18 * s - 165 * s : 18 * s + 165 * s, gy = (flip ? 12 : hud.DH - 104) * s + 49 * s;
      const g = c.createRadialGradient(gx, gy, 10 * s, gx, gy, 230 * s); g.addColorStop(0, 'rgba(255,214,102,0.30)'); g.addColorStop(1, 'rgba(255,214,102,0)'); c.fillStyle = g; c.fillRect(gx - 240 * s, gy - 120 * s, 480 * s, 240 * s);
    }
    hud.drawPlayerHud(c, { name: p.name, hp: p.currentHP ?? p.hp, maxHp: p.maxHp, energy: p.energy, maxEnergy: p.maxEnergy, level: p.level, portrait: await hud.portraitFromCut(cut), color: col },
      s, 18, flip ? 12 : hud.DH - 104, { flip, seed: 11 + i * 5 });
  }
  // 🃏 summon deck trays: every duelist who owns cards gets one (P1 bottom strip beside the hub, P2 top strip left of the mirrored hub)
  try {
    const sc = require('../summonCards');
    for (let i = 0; i < 2; i++) {
      const src = players[i]; if (!src || !src.jid) continue;
      const entries = sc.handEntries(src.jid, options.combatState || {}, src);
      if (!entries.length) continue;
      if (i === 0) await hud.drawDeckTray(c, entries, s, 330, hud.DH - 96, hud.DW - 18);
      else await hud.drawDeckTray(c, entries, s, 18, 8, hud.DW - 340);
    }
  } catch (e) { /* tray is optional */ }
  const buffer = cv.toBuffer('image/jpeg', { quality: 0.88 });
  console.log(`[CombatHud] node PvP card ${buffer.length}B in ${Date.now() - t0}ms`);
  return { success: true, buffer, mimeType: 'image/jpeg' };
}
module.exports = { renderNodeCard, renderNodePvpCard };

