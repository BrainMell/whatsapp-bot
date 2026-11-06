'use strict';
// ⚔️ Node-composed PvE battle card (HUD v6). Go supplies the HUD-less + BAR-less layered scene
// (bg + sprites + cuts + anchors, hud:"none-clean" — owner 2026-11-07: the legacy overhead HP
// bars/nameplates showed alongside the new plate; they are gone from the card entirely, the
// compact plate is the single HP/MP display). Node paints the turn marker, hit flash, rank chip,
// compact player plate and (only when the active player owns summon cards) the long deck tray.
// Returns null on ANY problem so the caller falls back to the Go card.
const { createCanvas, loadImage } = require('canvas');
const hud = require('./combatHud');

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
  c.drawImage(await loadImage(layers.sprites), 0, 0, W, H);
  // red hit flash on the target (from its cut)
  if (act && act.targetSide && Array.isArray(layers.cuts)) {
    const cut = layers.cuts.find((x) => x.side === act.targetSide && x.index === (Number(act.targetIndex) || 0));
    if (cut && cut.png && !act.heal) {
      try {
        const im = await loadImage(Buffer.from(cut.png, 'base64')), t = createCanvas(cut.w, cut.h), tc = t.getContext('2d');
        tc.drawImage(im, 0, 0, cut.w, cut.h); tc.globalCompositeOperation = 'source-atop'; tc.fillStyle = 'rgba(255,40,30,0.5)'; tc.fillRect(0, 0, cut.w, cut.h);
        c.drawImage(t, cut.x * s, cut.y * s, cut.w * s, cut.h * s);
      } catch (e) { /* cosmetic */ }
    }
  }
  // (v6: NO overhead unit bars — the plate is the single HP/MP display on the card; Go's legacy
  // nameplates/bars are stripped server-side via hud:"none-clean")
  const pl = payload.players || [];
  // rank chip
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
  // summon deck tray - ONLY for players who own cards
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
module.exports = { renderNodeCard };
