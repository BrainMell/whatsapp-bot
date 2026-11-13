'use strict';
// 🖼️ Conquest renderers. _in-process fns draw with node-canvas; the public render*() go through a small child pool
// (renderWorker.js type 'conquest') so drawing never blocks the bot's event loop. Failure => null => text fallback.
const path = require('path'); const art = require('./art'); const envCards = require('./envCards'); const map = require('./mapgen');
const OWN = ['#3a7bd5', '#d5483a', '#4bb26a', '#e0b030', '#9a5cd0', '#e07a30', '#5c6a78', '#8a5a3a'];
const ownerColor = (names, n) => OWN[Math.max(0, names.indexOf(n)) % OWN.length];
const ctxOf = (W, H) => { const { createCanvas } = require('canvas'); const c = createCanvas(W, H); return { c, ctx: c.getContext('2d') }; };
function title(ctx, W, text, sub) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, 44); ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 22px serif'; ctx.textAlign = 'left'; ctx.fillText(text, 14, 29); if (sub) { ctx.font = '15px serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#d9c9a0'; ctx.fillText(sub, W - 14, 28); } ctx.textAlign = 'left'; }
function wrap(ctx, text, x, y, w, lh) { const words = String(text).split(' '); let line = ''; for (const wd of words) { const t = line + wd + ' '; if (ctx.measureText(t).width > w && line) { ctx.fillText(line, x, y); line = wd + ' '; y += lh; } else line = t; } ctx.fillText(line, x, y); return y; }

// ── siege scene ───────────────────────────────────────────────────────────────────────────────
function siegeInProcess(b) {
    const W = 960, H = 620, horizon = 330; const { c, ctx } = ctxOf(W, H); const card = envCards.BY_ID[b.env] || envCards.BY_ID.clear; const fam = art.FAMILY[card.id];
    art.sky(ctx, W, H, card, horizon); art.ground(ctx, W, H, horizon, card, fam); art.weather(ctx, W, H, card, horizon, b.id + ':' + b.round);
    // distant skyline
    ctx.fillStyle = 'rgba(0,0,0,.28)'; const r = art.RNG(b.tileId); ctx.beginPath(); ctx.moveTo(0, horizon); for (let x = 0; x <= W; x += 40) ctx.lineTo(x, horizon - 20 - r() * 40); ctx.lineTo(W, horizon); ctx.fill();
    const S = b.sections; const layout = { towerL: [110, 150, 120, 190], curtainL: [230, 200, 120, 140], gate: [350, 190, 260, 200], curtainR: [610, 200, 120, 140], towerR: [730, 150, 120, 190] };
    const drawSec = (key, rect, sec, type, label, curtainHalf) => { if (!sec) return; const [x, y, w, h] = rect; const frac = sec.hp / sec.max;
        if (sec.hp <= 0) { art.rubble(ctx, x, y, w, h, b.id + key); }
        else { art.brickPattern(ctx, x, y, w, h, type, b.id + key); art.damage(ctx, x, y, w, h, 1 - frac, b.id + key + b.round);
            if (key === 'gate') { ctx.fillStyle = 'rgba(8,6,4,.92)'; ctx.beginPath(); ctx.moveTo(x + 60, y + h); ctx.lineTo(x + 60, y + 70); ctx.arc(x + w / 2, y + 70, w / 2 - 60, Math.PI, 0); ctx.lineTo(x + w - 60, y + h); ctx.fill(); ctx.strokeStyle = '#2a1c10'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 40); ctx.lineTo(x + w / 2, y + h); ctx.stroke(); }
            if (key.startsWith('tower')) { ctx.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 6 + i * 30, y - 10, 18, 12); }
            if (b.burning[key] || (curtainHalf && b.burning.curtain)) art.flames(ctx, x, y + h * 0.4, w, b.id + key + 'f'); }
        if (curtainHalf !== 2) { art.bar(ctx, x + 6, y - 24, w - 12, frac); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${label} ${sec.hp}/${sec.max}`, x + w / 2, y - 30); ctx.textAlign = 'left'; }
        if (b.weak === key) { ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 30, 0, 7); ctx.moveTo(x + w / 2 - 40, y + h / 2); ctx.lineTo(x + w / 2 + 40, y + h / 2); ctx.moveTo(x + w / 2, y + h / 2 - 40); ctx.lineTo(x + w / 2, y + h / 2 + 40); ctx.stroke(); }
        if (b.mines.some((m) => m.s === key)) { ctx.fillStyle = '#e6b93b'; ctx.font = '20px serif'; ctx.fillText('⛏', x + w / 2 - 8, y + h + 22); } };
    if (b.wallType) {
        drawSec('curtain', layout.curtainL, S.curtain, b.wallType, 'Curtain', 1); drawSec('curtain', layout.curtainR, S.curtain, b.wallType, '', 2);
        drawSec('towerL', layout.towerL, S.towerL, b.wallType, 'Left tower'); drawSec('towerR', layout.towerR, S.towerR, b.wallType, 'Right tower'); drawSec('gate', layout.gate, S.gate, b.wallType, 'Gate');
        for (const t of b.turrets) { const m = { towerL: [170, 140], towerR: [790, 140], gate: [480, 180] }[t.mount]; const k = b.turrets.filter((x) => x.mount === t.mount).indexOf(t); art.turret(ctx, m[0] + k * 34 - 12, m[1], t.kind, t.lvl, !!t._silenced || (b.sections[t.mount] && b.sections[t.mount].hp <= 0)); }
    }
    // golems in the courtyard / gate
    const gs = b.golems; const gx0 = W / 2 - (gs.length - 1) * 70;
    gs.forEach((g, i) => { if (g.hp <= 0) return; const x = b.phase === 'wall' ? 400 + i * 80 : gx0 + i * 140, y = b.phase === 'wall' ? 395 : 470; if (b.phase === 'wall') ctx.globalAlpha = 0.45; art.golem(ctx, x, y, g.kind, g.hp / g.max, g.lvl); ctx.globalAlpha = 1; art.bar(ctx, x - 36, y + 14, 72, g.hp / g.max, '#d9473a'); ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`[${i + 1}] ${g.kind} ${g.hp}/${g.max}`, x, y + 36); ctx.textAlign = 'left'; });
    // party strip
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, H - 92, W, 92); const ms = Object.values(b.party); const pw = Math.min(150, (W - 20) / Math.max(1, ms.length));
    ms.forEach((m, i) => { const x = 10 + i * pw; ctx.fillStyle = m.hp > 0 ? '#f2e6c8' : '#777'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(m.name.slice(0, 14), x, H - 70); art.bar(ctx, x, H - 62, pw - 14, m.hp / m.max); ctx.font = '12px sans-serif'; ctx.fillStyle = '#cfc4a4'; ctx.fillText(m.hp > 0 ? `${m.hp}/${m.max}` : 'DOWN', x, H - 40); ctx.fillStyle = m.action ? '#8be78b' : '#888'; ctx.fillText(m.action ? '✔ ' + m.action : '…thinking', x, H - 22); });
    // env card strip
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 44, W, 40); ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 16px serif'; ctx.fillText(card.name.toUpperCase(), 14, 70); ctx.font = '13px serif'; ctx.fillStyle = '#eadfc0'; ctx.fillText(card.text.slice(0, 118), 14 + ctx.measureText(card.name.toUpperCase()).width + 24 > 600 ? 400 : 14 + 170, 70);
    title(ctx, W, `${b.tileName} — ${b.attacker} assault${b.defender ? ' vs ' + b.defender : ''}`, `Round ${b.round}/12 · ${b.phase === 'wall' ? 'BREAK THE WALL' : b.phase === 'golems' ? 'FACE THE GOLEMS' : b.phase.toUpperCase()}`);
    if (b.outcome) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 250, W, 110); ctx.fillStyle = b.outcome === 'won' ? '#ffe28a' : '#e86a5a'; ctx.font = 'bold 56px serif'; ctx.textAlign = 'center'; ctx.fillText(b.outcome === 'won' ? 'VICTORY' : 'REPELLED', W / 2, 330); ctx.textAlign = 'left'; }
    return c.toBuffer('image/png');
}

// ── environment card (portrait collectible-style) ─────────────────────────────────────────────
function envCardInProcess(cardId, biome) {
    const card = envCards.BY_ID[cardId] || envCards.BY_ID.clear; const W = 520, H = 760; const { c, ctx } = ctxOf(W, H);
    ctx.fillStyle = '#17120c'; ctx.fillRect(0, 0, W, H); const aw = W - 40, ah = 360; ctx.save(); ctx.translate(20, 70); ctx.beginPath(); ctx.rect(0, 0, aw, ah); ctx.clip();
    const hz = 210; art.sky(ctx, aw, ah, card, hz); art.ground(ctx, aw, ah, hz, card, art.FAMILY[card.id]); art.weather(ctx, aw, ah, card, hz, 'card'); ctx.fillStyle = 'rgba(0,0,0,.3)'; const r = art.RNG(cardId); ctx.beginPath(); ctx.moveTo(0, hz); for (let x = 0; x <= aw; x += 36) ctx.lineTo(x, hz - 14 - r() * 34); ctx.lineTo(aw, hz); ctx.fill();
    art.brickPattern(ctx, aw / 2 - 80, hz - 70, 160, 110, 'stone', 'cw' + cardId); ctx.restore();
    ctx.strokeStyle = card.palette[1]; ctx.lineWidth = 6; ctx.strokeRect(20, 70, aw, ah); ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 30px serif'; ctx.textAlign = 'center'; ctx.fillText(card.name.toUpperCase(), W / 2, 50);
    ctx.font = 'italic 17px serif'; ctx.fillStyle = '#d9c9a0'; ctx.textAlign = 'left'; wrap(ctx, card.text, 30, 468, W - 60, 24);
    const rows = [['Ram', card.mods.ram], ['Ladder', card.mods.ladder], ['Sapper', card.mods.sapper], ['Fire', card.mods.fire], ['Rune', card.mods.rune], ['Shield', card.mods.shield], ['Scout', card.mods.scout], ['Turrets', card.turret == null ? 1 : card.turret], ['Golems', card.golem || 1]];
    rows.forEach(([n, v], i) => { const col = i % 3, row = Math.floor(i / 3); const x = 30 + col * 160, y = 550 + row * 52; ctx.fillStyle = '#241c12'; ctx.fillRect(x, y, 150, 44); ctx.fillStyle = '#bfae86'; ctx.font = '13px sans-serif'; ctx.fillText(n, x + 8, y + 18); ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = v > 1.01 ? '#7be07b' : v < 0.99 ? '#ef7a6a' : '#ddd'; ctx.fillText(`×${(+v).toFixed(2).replace(/0$/, '')}`, x + 8, y + 38); });
    const tags = [card.hazard ? `Hazard ${Math.round(card.hazard * 100)}% HP` : null, card.repair ? `Wall repair ${Math.round(card.repair * 100)}%` : null, ...(card.flags || [])].filter(Boolean); ctx.fillStyle = '#c9a24a'; ctx.font = '13px sans-serif'; ctx.fillText(tags.join('  ·  ').slice(0, 70), 30, 730);
    ctx.textAlign = 'right'; ctx.fillStyle = '#8a7a55'; ctx.fillText(card.biomes.includes('*') ? 'ANY REALM' : card.biomes.join(' / ').toUpperCase(), W - 30, 730);
    return c.toBuffer('image/png');
}

// ── realm war map ─────────────────────────────────────────────────────────────────────────────
function kindIcon(ctx, kind, x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2; ctx.beginPath();
    switch (kind) {
        case 'keep': ctx.moveTo(-s, s * 0.7); ctx.lineTo(-s, -s * 0.2); ctx.lineTo(-s * 0.5, s * 0.2); ctx.lineTo(0, -s); ctx.lineTo(s * 0.5, s * 0.2); ctx.lineTo(s, -s * 0.2); ctx.lineTo(s, s * 0.7); break;
        case 'fortress': ctx.rect(-s * 0.9, -s * 0.5, s * 1.8, s * 1.3); ctx.moveTo(-s * 0.9, -s * 0.5); ctx.lineTo(-s * 0.9, -s * 0.9); ctx.moveTo(s * 0.9, -s * 0.5); ctx.lineTo(s * 0.9, -s * 0.9); break;
        case 'gem_vein': ctx.fillStyle = '#58e6ff'; ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.8, 0); break;
        case 'titan': ctx.fillStyle = '#ff5a4a'; ctx.arc(0, -s * 0.1, s * 0.85, 0, 7); break;
        case 'ley_gate': ctx.arc(0, 0, s * 0.8, 0, 7); ctx.moveTo(s * 0.4, 0); ctx.arc(0, 0, s * 0.4, 0, 7); break;
        case 'ruins': ctx.moveTo(-s * 0.8, s * 0.8); ctx.lineTo(-s * 0.8, -s * 0.2); ctx.arc(0, -s * 0.2, s * 0.8, Math.PI, 0); ctx.lineTo(s * 0.8, s * 0.8); break;
        case 'shrine': ctx.moveTo(0, -s); ctx.lineTo(s, s * 0.8); ctx.lineTo(-s, s * 0.8); break;
        case 'village': ctx.moveTo(-s * 0.8, s * 0.7); ctx.lineTo(-s * 0.8, 0); ctx.lineTo(0, -s * 0.8); ctx.lineTo(s * 0.8, 0); ctx.lineTo(s * 0.8, s * 0.7); break;
        case 'forest': ctx.fillStyle = '#2f6a34'; ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(-s * 0.7, s * 0.6); break;
        case 'pass': ctx.fillStyle = '#9a8f84'; ctx.moveTo(-s, s * 0.7); ctx.lineTo(-s * 0.3, -s * 0.6); ctx.lineTo(s * 0.1, s * 0.1); ctx.lineTo(s * 0.5, -s * 0.4); ctx.lineTo(s, s * 0.7); break;
        default: ctx.restore(); return;
    } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
const BIOME_GROUND = { isle: '#6f9a8a', desert: '#d2ac6c', tundra: '#d6e2e8', highlands: '#7f9c5a', volcanic: '#6a504a' };
function mapInProcess(snap) { // snap: {seed, realm, W, H, tiles:[{id,x,y,kind,owner,veinLeft,shield}], guilds:[{name,score,tiles}], me:{at}, marches:[{from,to}], title}
    const T = 34, PAD = 20; const g = map.generate(snap.seed); const W = map.W * T + PAD * 2 + 230, H = map.H * T + PAD * 2 + 50; const { c, ctx } = ctxOf(W, H);
    const biome = (g.realms.find((r) => r.key === snap.realm) || {}).biome || 'isle'; ctx.fillStyle = '#14100b'; ctx.fillRect(0, 0, W, H);
    const names = snap.guilds.map((x) => x.name); const by = Object.fromEntries(snap.tiles.map((t) => [t.id, t]));
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) { const id = map.tileId(snap.realm, x, y); const st = g.tiles.get(id); const o = by[id] || {}; const px = PAD + x * T, py = 44 + y * T;
        ctx.fillStyle = BIOME_GROUND[biome]; ctx.fillRect(px, py, T, T); const shade = ((x * 7 + y * 13) % 5) * 0.015; ctx.fillStyle = `rgba(0,0,0,${0.05 + shade})`; ctx.fillRect(px, py, T, T);
        if (o.owner) { ctx.fillStyle = art.hex(ownerColor(names, o.owner), 0.55); ctx.fillRect(px, py, T, T); ctx.strokeStyle = ownerColor(names, o.owner); ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, T - 2, T - 2); }
        ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.strokeRect(px, py, T, T); kindIcon(ctx, st.kind, px + T / 2, py + T / 2, T * 0.3);
        if (o.shield) { ctx.strokeStyle = '#fff'; ctx.setLineDash([3, 3]); ctx.strokeRect(px + 4, py + 4, T - 8, T - 8); ctx.setLineDash([]); } }
    ctx.strokeStyle = 'rgba(20,10,0,.75)'; ctx.lineWidth = 3; for (let i = 0; i <= 4; i++) { const x = PAD + i * 5 * T; ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x, 44 + 15 * T); ctx.stroke(); } for (let j = 0; j <= 3; j++) { const y = 44 + j * 5 * T; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(PAD + 20 * T, y); ctx.stroke(); }
    const realm = g.realms.find((r) => r.key === snap.realm); ctx.font = 'bold 12px serif'; ctx.fillStyle = 'rgba(30,18,6,.8)'; ctx.textAlign = 'center'; realm.provinces.forEach((p) => ctx.fillText(p.name.toUpperCase(), PAD + (p.col * 5 + 2.5) * T, 44 + (p.row * 5) * T + 13)); ctx.textAlign = 'left';
    const center = (id) => { const q = map.parse(id); return q.realm === snap.realm ? [PAD + (q.x + 0.5) * T, 44 + (q.y + 0.5) * T] : null; };
    for (const m of snap.marches || []) { const a = center(m.from), b2 = center(m.to); if (a && b2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b2); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#ffdf6a'; ctx.beginPath(); ctx.arc(b2[0], b2[1], 6, 0, 7); ctx.fill(); } }
    const me = center(snap.me.at); if (me) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(me[0], me[1], 9, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#c00'; ctx.beginPath(); ctx.arc(me[0], me[1], 4, 0, 7); ctx.fill(); }
    title(ctx, W, `${snap.title || realm.name} — ${realm.epithet || ''}`, snap.sub || '');
    const px = PAD * 2 + map.W * T; ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 15px serif'; ctx.fillText('STANDINGS', px, 70);
    snap.guilds.forEach((gd, i) => { const y = 92 + i * 30; ctx.fillStyle = ownerColor(names, gd.name); ctx.fillRect(px, y - 12, 14, 14); ctx.fillStyle = '#eadfc0'; ctx.font = '13px sans-serif'; ctx.fillText(`${gd.name.slice(0, 14)}  ${gd.score}  (${gd.tiles})`, px + 22, y); });
    const ly = 92 + snap.guilds.length * 30 + 20; ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 15px serif'; ctx.fillText('LEGEND', px, ly);
    [['keep', 'Keep'], ['fortress', 'Fortress'], ['ley_gate', 'Ley Gate'], ['gem_vein', 'Aether Vein'], ['titan', 'Titan'], ['ruins', 'Ruins'], ['shrine', 'Shrine'], ['village', 'Village'], ['pass', 'Pass']].forEach(([k, n], i) => { const y = ly + 22 + i * 24; ctx.fillStyle = BIOME_GROUND[biome]; ctx.fillRect(px, y - 14, 22, 22); kindIcon(ctx, k, px + 11, y - 3, 7); ctx.fillStyle = '#eadfc0'; ctx.font = '13px sans-serif'; ctx.fillText(n, px + 32, y + 2); });
    return c.toBuffer('image/png');
}

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
