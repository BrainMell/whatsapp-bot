'use strict';
// 🖼️ Conquest renderers. _in-process fns draw with node-canvas; the public render*() go through a small child pool
// (renderWorker.js type 'conquest') so drawing never blocks the bot's event loop. Failure => null => text fallback.
const path = require('path'); const art = require('./art'); const envCards = require('./envCards'); const map = require('./mapgen');
const OWN = ['#3a7bd5', '#d5483a', '#4bb26a', '#e0b030', '#9a5cd0', '#e07a30', '#5c6a78', '#8a5a3a'];
const ownerColor = (names, n) => OWN[Math.max(0, names.indexOf(n)) % OWN.length];
const ctxOf = (W, H) => { const { createCanvas } = require('canvas'); const c = createCanvas(W, H); return { c, ctx: c.getContext('2d') }; };
function title(ctx, W, text, sub) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, 44); ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 22px serif'; ctx.textAlign = 'left'; ctx.fillText(text, 14, 29); if (sub) { ctx.font = '15px serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#d9c9a0'; ctx.fillText(sub, W - 14, 28); } ctx.textAlign = 'left'; }
function wrap(ctx, text, x, y, w, lh) { const words = String(text).split(' '); let line = ''; for (const wd of words) { const t = line + wd + ' '; if (ctx.measureText(t).width > w && line) { ctx.fillText(line, x, y); line = wd + ' '; y += lh; } else line = t; } ctx.fillText(line, x, y); return y; }

// ── siege scene (3D hex diorama, scene3d.js) ───────────────────────────────────────────────
async function siegeInProcess(b) {
    const S3 = require('./scene3d'); const { c, ctx, W, H, card } = await S3.siegeScene(b);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 44, W, 36); ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 16px serif'; ctx.textAlign = 'center'; ctx.fillText(`${card.icon || ''} ${card.name.toUpperCase()} — ${card.text || ''}`.slice(0, 112), W / 2, 68); ctx.textAlign = 'left';
    title(ctx, W, `${b.tileName} — ${b.attacker} assault${b.defender ? ' vs ' + b.defender : ''}`, `Round ${b.round}/12 · ${b.phase === 'wall' ? 'BREAK THE WALL' : b.phase === 'golems' ? 'FACE THE GOLEMS' : b.phase.toUpperCase()}`);
    if (b.outcome) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 250, W, 110); ctx.fillStyle = b.outcome === 'won' ? '#ffe28a' : '#e86a5a'; ctx.font = 'bold 56px serif'; ctx.textAlign = 'center'; ctx.fillText(b.outcome === 'won' ? 'STRONGHOLD TAKEN' : 'ASSAULT REPELLED', W / 2, 325); ctx.textAlign = 'left'; }
    return c.toBuffer('image/png');
}

// ── environment card (portrait collectible-style) ─────────────────────────────────────────────
async function envCardInProcess(cardId, biome) {
    const card = envCards.BY_ID[cardId] || envCards.BY_ID.clear; const W = 520, H = 760; const { c, ctx } = ctxOf(W, H); const bm = biome || (card.biomes.includes('*') ? 'isle' : card.biomes[0]);
    ctx.fillStyle = '#17120c'; ctx.fillRect(0, 0, W, H); const aw = W - 40, ah = 360; ctx.save(); ctx.translate(20, 70); ctx.beginPath(); ctx.rect(0, 0, aw, ah); ctx.clip();
    { const B = require('./breach'); const S3 = require('./scene3d'); const fb = B.create({ id: 'card-' + card.id, tileId: 'card:0,0', biome: bm, tileName: card.name, attacker: 'A', defender: 'B', party: [{ jid: 'x', name: 'Hero', power: 700, sprite: 'Paladin (1).png' }, { jid: 'y', name: 'Mage', power: 700, sprite: 'archmage (1).png' }], defence: { wall: { type: 'stone', hp: 600, max: 600 }, golems: [{ kind: 'stone' }], turrets: [{ kind: 'ballista' }, { kind: 'flame' }] } });
        fb.env = card.id; fb.kind = 'fortress'; fb.defIdx = 1; fb.attIdx = 0; fb.surround = { forest: 1 }; fb.round = 1; const sc = await S3.siegeScene(fb, { noHud: true });
        ctx.drawImage(sc.c, 30, 50, 800, 600, 0, 0, aw, ah); }
    ctx.restore();
    ctx.strokeStyle = card.palette[1]; ctx.lineWidth = 6; ctx.strokeRect(20, 70, aw, ah); ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 30px serif'; ctx.textAlign = 'center'; ctx.fillText(card.name.toUpperCase(), W / 2, 50);
    ctx.font = 'italic 17px serif'; ctx.fillStyle = '#d9c9a0'; ctx.textAlign = 'left'; wrap(ctx, card.text, 30, 468, W - 60, 24);
    const rows = [['Ram', card.mods.ram], ['Ladder', card.mods.ladder], ['Sapper', card.mods.sapper], ['Fire', card.mods.fire], ['Rune', card.mods.rune], ['Shield', card.mods.shield], ['Scout', card.mods.scout], ['Turrets', card.turret == null ? 1 : card.turret], ['Golems', card.golem || 1]];
    rows.forEach(([n, v], i) => { const col = i % 3, row = Math.floor(i / 3); const x = 30 + col * 160, y = 550 + row * 52; ctx.fillStyle = '#241c12'; ctx.fillRect(x, y, 150, 44); ctx.fillStyle = '#bfae86'; ctx.font = '13px sans-serif'; ctx.fillText(n, x + 8, y + 18); ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = v > 1.01 ? '#7be07b' : v < 0.99 ? '#ef7a6a' : '#ddd'; ctx.fillText(`x${(+v).toFixed(2).replace(/0$/, '')}`, x + 8, y + 38); });
    const tags = [card.hazard ? `Hazard ${Math.round(card.hazard * 100)}% HP` : null, card.repair ? `Wall repair ${Math.round(card.repair * 100)}%` : null, ...(card.flags || [])].filter(Boolean); ctx.fillStyle = '#c9a24a'; ctx.font = '13px sans-serif'; ctx.fillText(tags.join('  ·  ').slice(0, 70), 30, 730);
    ctx.textAlign = 'right'; ctx.fillStyle = '#8a7a55'; ctx.fillText(card.biomes.includes('*') ? 'ANY REALM' : card.biomes.join(' / ').toUpperCase(), W - 30, 730);
    return c.toBuffer('image/png');
}


// ── realm war map (3D hex scene) ──────────────────────────────────────────────────────────────
async function mapInProcess(snap) { const c = await require('./scene3d').warMapScene(snap); return c.toBuffer('image/png'); }

// ── child pool (renderWorker.js type 'conquest') ──────────────────────────────────────────────
const { fork } = require('child_process'); let child = null; let seq = 0; const waiting = new Map();
function getChild() { if (child && child.connected) return child; try { const rq = require('../../../../utils/renderQueue'); if (rq.canSpawnChild && !rq.canSpawnChild()) return null; } catch (e) { /* no gate available */ }
    child = fork(path.join(__dirname, '..', 'renderWorker.js'), [], { stdio: 'ignore', serialization: 'advanced' });
    child.on('message', (m) => { if (m && m.kind === 'conquest' && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); clearTimeout(w.t); m.error ? w.rej(new Error(m.error)) : w.res(Buffer.from(m.png, 'base64')); } });
    child.on('exit', () => { child = null; for (const [id, w] of waiting) { waiting.delete(id); clearTimeout(w.t); w.rej(new Error('render child exited')); } }); return child; }
function viaChild(what, data) { return new Promise((res, rej) => { const ch = getChild(); if (!ch) return rej(new Error('no render slot')); const id = ++seq; const t = setTimeout(() => { waiting.delete(id); rej(new Error('render timeout')); }, 12000); waiting.set(id, { res, rej, t }); ch.send({ type: 'conquest', id, what, data }); }); }
const safe = async (what, data, inproc) => { try { return await viaChild(what, data); } catch (e) { if (process.env.CONQUEST_RENDER_INPROC === '1') return inproc(data); console.warn('[conquest] render', what, e.message); return null; } };
module.exports = {
    siegeInProcess, envCardInProcess, mapInProcess,
    renderSiege: (b) => safe('siege', b, siegeInProcess), renderEnvCard: (id) => safe('card', { id }, (d) => envCardInProcess(d.id)), renderMap: (snap) => safe('map', snap, mapInProcess),
};
