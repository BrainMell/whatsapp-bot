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
const SP = require('./sprites');
const WALL_FAM = (b) => (b.wallType === 'wood' ? 'wood' : b.wallType === 'runed' ? 'runed' : (b.biome === 'isle' || b.biome === 'desert' || b.biome === 'tundra' || b.biome === 'highlands' || b.biome === 'volcanic' ? b.biome : 'isle'));
const GOLEM_H = { clay: 175, stone: 195, iron: 215, rune: 235 };
const TURRET_ART = { ballista: 'statue_archer', flame: 'zot_fire_orb_statue', arc: 'zot_entropy_orb_statue', frost: 'zot_winter_orb_statue' };
const ACTION_TAG = { ram: 'RAM', ladder: 'LADDER', sapper: 'SAPPER', fire: 'FIRE', rune: 'RUNE', shield: 'SHIELD', scout: 'SCOUT', strike: 'STRIKE', guard: 'GUARD', shatter: 'SHATTER', lure: 'LURE', rally: 'RALLY' };
async function backdrop(ctx, W, H, biome, card, seed) {
    const bg = await SP.asset(SP.CARD_BG[card.id] || SP.BIOME_BG[biome] || SP.BIOME_BG.isle); SP.cover(ctx, bg, W, H);
    ctx.fillStyle = art.hex(card.palette[0], ['night', 'eclipse', 'whiteout', 'fog'].includes(card.id) ? 0.5 : 0.22); ctx.fillRect(0, 0, W, H);
    art.weather(ctx, W, H, card, 360, seed);
}
async function groundStrip(ctx, W, y0, H, biome, card, seed) {
    const fam = card.id === 'mud' || card.id === 'quicksand' ? 'mud' : (SP.FLOOR_FAM[biome] || 'isle'); const tiles = await SP.variants('floors', fam, 3); const r = art.RNG(seed + 'g');
    ctx.save(); ctx.globalAlpha = 0.85; SP.tileFill(ctx, tiles, 0, y0, W, H - y0, 2, r, true); ctx.restore(); ctx.fillStyle = art.hex(card.palette[1], 0.18); ctx.fillRect(0, y0, W, H - y0);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + 70); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, y0, W, 70);
}
async function siegeInProcess(b) {
    const W = 960, H = 660, groundTop = 372; const { c, ctx } = ctxOf(W, H); const card = envCards.BY_ID[b.env] || envCards.BY_ID.clear; const seed = b.id + ':' + b.round;
    await backdrop(ctx, W, H, b.biome, card, seed); await groundStrip(ctx, W, groundTop, H, b.biome, card, b.id);
    const fam = WALL_FAM(b); const wallTiles = await SP.variants('walls', fam, 6); const S = b.sections; const rr = art.RNG(b.id + 'w');
    const L = { towerL: [110, 142, 120, 230], curtainL: [230, 200, 120, 172], gate: [350, 196, 260, 176], curtainR: [610, 200, 120, 172], towerR: [730, 142, 120, 230] };
    const gateKey = b.wallType === 'runed' ? 'gate_runed' : 'gate_closed';
    const gate = { l: await SP.cq(`gates/${gateKey}_left.png`), m: await SP.cq(`gates/${gateKey}_middle.png`), r: await SP.cq(`gates/${gateKey}_right.png`), bl: await SP.cq('gates/gate_broken_left.png'), bm: await SP.cq('gates/gate_broken_middle.png'), br: await SP.cq('gates/gate_broken_right.png'), ol: await SP.cq('gates/gate_open_left.png'), om: await SP.cq('gates/gate_open_middle.png'), or: await SP.cq('gates/gate_open_right.png') };
    const fireImg = await SP.asset('fx/fire/1/Fire-Wrath__05.png');
    const label = (x, y, w, text, sec, hpFrac) => { art.bar(ctx, x + 6, y - 22, w - 12, hpFrac); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(text, x + w / 2, y - 28); ctx.shadowBlur = 0; ctx.textAlign = 'left'; };
    const drawWall = (key, rect, sec, name, showLabel = true) => { if (!sec) return; const [x, y, w, h] = rect; const frac = sec.hp / sec.max;
        if (sec.hp <= 0) { art.rubble(ctx, x, y + h * 0.55, w, h * 0.45, b.id + key); }
        else { SP.tileFill(ctx, wallTiles, x, y, w, h, 2, art.RNG(b.id + key)); const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
            if (key.startsWith('tower')) { SP.tileFill(ctx, wallTiles, x - 6, y - 18, w + 12, 18, 1, art.RNG(b.id + key + 'c')); ctx.fillStyle = 'rgba(0,0,0,.4)'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 4 + i * (w / 3.2), y - 18, 14, 10); }
            art.damage(ctx, x, y, w, h, 1 - frac, b.id + key + b.round);
            if (b.burning[key] || (key === 'curtain' && b.burning.curtain)) { if (fireImg) { ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(fireImg, x + w / 2 - 70, y + h - 150, 140, 140); ctx.restore(); } else art.flames(ctx, x, y + h * 0.5, w, b.id + key); } }
        if (showLabel) label(x, key.startsWith('tower') ? y + 56 : y, w, `${name} ${sec.hp}/${sec.max}`, sec, frac);
        if (b.weak === key && sec.hp > 0) { ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 30, 0, 7); ctx.moveTo(x + w / 2 - 40, y + h / 2); ctx.lineTo(x + w / 2 + 40, y + h / 2); ctx.moveTo(x + w / 2, y + h / 2 - 40); ctx.lineTo(x + w / 2, y + h / 2 + 40); ctx.stroke(); }
        if (b.mines.some((m) => m.s === key)) { ctx.fillStyle = '#e6b93b'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('SAPPERS', x + 8, y + h + 16); } };
    if (b.wallType) {
        drawWall('curtain', L.curtainL, S.curtain, 'Curtain'); drawWall('curtain', L.curtainR, S.curtain, '', false);
        drawWall('towerL', L.towerL, S.towerL, 'Left tower'); drawWall('towerR', L.towerR, S.towerR, 'Right tower');
        // gate: wall behind, real DCSS gate sprites on top
        const [gx, gy, gw, gh] = L.gate; const gs = S.gate; const open = b.phase !== 'wall' && gs && gs.hp <= 0;
        SP.tileFill(ctx, wallTiles, gx, gy, gw, gh, 2, art.RNG(b.id + 'gate')); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(gx, gy, gw, gh);
        const parts = gs.hp <= 0 ? [gate.bl, gate.bm, gate.br] : [gate.l, gate.m, gate.r]; const gsx = 2.7, tw = 32 * gsx; ctx.imageSmoothingEnabled = false;
        parts.forEach((im, i) => { if (im) ctx.drawImage(im, gx + gw / 2 - tw * 1.5 + i * tw, gy + gh - tw, tw, tw); }); ctx.imageSmoothingEnabled = true;
        if (gs.hp > 0) art.damage(ctx, gx, gy, gw, gh, 1 - gs.hp / gs.max, b.id + 'gd' + b.round); if (b.burning.gate && fireImg) { ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(fireImg, gx + gw / 2 - 80, gy + gh - 160, 160, 160); ctx.restore(); }
        label(gx, gy, gw, `Gate ${gs.hp}/${gs.max}`, gs, gs.hp / gs.max);
        if (b.weak === 'gate' && gs.hp > 0) { ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(gx + gw / 2, gy + gh / 2, 34, 0, 7); ctx.stroke(); }
        if (b.mines.some((m) => m.s === 'gate')) { ctx.fillStyle = '#e6b93b'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('SAPPERS', gx + 8, gy + gh + 16); }
        // turrets: real DCSS statues on their mounts
        for (const t of b.turrets) { const m = { towerL: [170, 150], towerR: [790, 150], gate: [480, 196] }[t.mount]; const k = b.turrets.filter((x) => x.mount === t.mount).indexOf(t); const im = await SP.cq(`turrets/${TURRET_ART[t.kind] || 'statue_archer'}.png`); const dead = !!t._silenced || (S[t.mount] && S[t.mount].hp <= 0);
            SP.standing(ctx, im, 'tur' + t.kind, m[0] + (k - 0.5) * 46, m[1] + 4, 70, { alpha: dead ? 0.3 : 1, shadow: false }); ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('L' + t.lvl, m[0] + (k - 0.5) * 46, m[1] + 16); ctx.textAlign = 'left'; }
    }
    // golems: bot enemy sprites (earth golems), realm Titan for titan lairs
    const isTitan = /titan|colossus|maw|treant|behemoth|caldera|ifrit/i.test(b.tileName) || b.isTitan; const realm = (b.tileId || '').split(':')[0];
    const gs0 = b.golems.filter((g) => g.hp > 0); const golemGround = b.phase === 'wall' ? 395 : 540;
    for (const [i, g] of b.golems.entries()) { if (g.hp <= 0) continue; const titan = isTitan && i === 0 && b.phase !== 'wall';
        const im = titan ? (await SP.cq(`golems/titan_${realm}.png`)) || (await SP.cq(`golems/${g.kind}.png`)) : await SP.cq(`golems/${g.kind}.png`); const ch = titan ? 340 : (GOLEM_H[g.kind] || 190) * (1 + 0.04 * (g.lvl - 1));
        const x = b.phase === 'wall' ? 420 + i * 70 : 600 + (gs0.indexOf(g) - (gs0.length - 1) / 2) * Math.min(170, 330 / Math.max(1, gs0.length - 1 || 1)) + 140;
        const hh = b.phase === 'wall' ? 120 : ch; const r = SP.standing(ctx, im, 'gol' + g.kind + (titan ? realm : ''), x, golemGround, hh, { alpha: b.phase === 'wall' ? 0.4 : 1, flip: true });
        if (b.phase !== 'wall') { art.bar(ctx, x - 40, golemGround + 8, 80, g.hp / g.max, '#d9473a'); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText(`[${i + 1}] ${titan ? 'TITAN' : g.kind} ${g.hp}/${g.max}`, x, golemGround + 30); ctx.shadowBlur = 0; ctx.textAlign = 'left'; } }
    // the invading party: their REAL character sprites, facing the wall
    const ms = Object.values(b.party); const step = Math.min(118, 470 / Math.max(1, ms.length)); const ch = ms.length > 6 ? 190 : 225; const pg = 590;
    for (const [i, m] of ms.entries()) { const x = 80 + step * i + (ms.length ? 20 : 0); const im = m.sprite ? await SP.character(m.sprite) : null;
        if (im) SP.standing(ctx, im, 'ch' + m.sprite, x, pg, ch, { alpha: m.hp > 0 ? 1 : 0.28, smooth: true }); else { ctx.fillStyle = '#888'; ctx.fillRect(x - 20, pg - 120, 40, 120); }
        ctx.textAlign = 'center'; ctx.font = 'bold 12px sans-serif'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillStyle = '#f2e6c8'; ctx.fillText(m.name.slice(0, 12), x, pg + 16); ctx.shadowBlur = 0; art.bar(ctx, x - 36, pg + 22, 72, m.hp / m.max); ctx.font = '11px sans-serif'; ctx.fillStyle = m.hp > 0 ? '#cfc4a4' : '#e86a5a'; ctx.fillText(m.hp > 0 ? `${m.hp}/${m.max}` : 'DOWN', x, pg + 46);
        if (m.hp > 0) { ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = m.action ? '#8be78b' : '#aaa'; ctx.fillText(m.action ? ACTION_TAG[m.action] || m.action : '...', x, pg - ch - 6); } ctx.textAlign = 'left'; }
    // env card strip + title
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 44, W, 40); ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 16px serif'; const cn = card.name.toUpperCase(); const cw = ctx.measureText(cn).width; ctx.fillText(cn, 14, 70); ctx.font = '13px serif'; ctx.fillStyle = '#eadfc0'; ctx.fillText(card.text.slice(0, 118), 14 + cw + 16, 70);
    title(ctx, W, `${b.tileName} — ${b.attacker} assault${b.defender ? ' vs ' + b.defender : ''}`, `Round ${b.round}/12 · ${b.phase === 'wall' ? 'BREAK THE WALL' : b.phase === 'golems' ? 'FACE THE GARRISON' : b.phase.toUpperCase()}`);
    if (b.outcome) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 250, W, 110); ctx.fillStyle = b.outcome === 'won' ? '#ffe28a' : '#e86a5a'; ctx.font = 'bold 56px serif'; ctx.textAlign = 'center'; ctx.fillText(b.outcome === 'won' ? 'VICTORY' : 'REPELLED', W / 2, 330); ctx.textAlign = 'left'; }
    return c.toBuffer('image/png');
}

// ── environment card (portrait collectible-style) ─────────────────────────────────────────────
async function envCardInProcess(cardId, biome) {
    const card = envCards.BY_ID[cardId] || envCards.BY_ID.clear; const W = 520, H = 760; const { c, ctx } = ctxOf(W, H); const bm = biome || (card.biomes.includes('*') ? 'isle' : card.biomes[0]);
    ctx.fillStyle = '#17120c'; ctx.fillRect(0, 0, W, H); const aw = W - 40, ah = 360; ctx.save(); ctx.translate(20, 70); ctx.beginPath(); ctx.rect(0, 0, aw, ah); ctx.clip();
    const bg = await SP.asset(SP.CARD_BG[card.id] || SP.BIOME_BG[bm]); SP.cover(ctx, bg, aw, ah); ctx.fillStyle = art.hex(card.palette[0], 0.22); ctx.fillRect(0, 0, aw, ah); art.weather(ctx, aw, ah, card, 210, 'card');
    const fam = SP.FLOOR_FAM[bm] || 'isle'; await groundStrip(ctx, aw, 250, ah, bm, card, 'card'); const wt = await SP.variants('walls', bm, 4); SP.tileFill(ctx, wt, aw / 2 - 96, 150, 192, 128, 2, art.RNG('cw' + cardId));
    const gm = await SP.cq('golems/stone.png'); SP.standing(ctx, gm, 'gol-stone', aw / 2 + 120, 330, 150, { flip: true }); ctx.restore();
    ctx.strokeStyle = card.palette[1]; ctx.lineWidth = 6; ctx.strokeRect(20, 70, aw, ah); ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 30px serif'; ctx.textAlign = 'center'; ctx.fillText(card.name.toUpperCase(), W / 2, 50);
    ctx.font = 'italic 17px serif'; ctx.fillStyle = '#d9c9a0'; ctx.textAlign = 'left'; wrap(ctx, card.text, 30, 468, W - 60, 24);
    const rows = [['Ram', card.mods.ram], ['Ladder', card.mods.ladder], ['Sapper', card.mods.sapper], ['Fire', card.mods.fire], ['Rune', card.mods.rune], ['Shield', card.mods.shield], ['Scout', card.mods.scout], ['Turrets', card.turret == null ? 1 : card.turret], ['Golems', card.golem || 1]];
    rows.forEach(([n, v], i) => { const col = i % 3, row = Math.floor(i / 3); const x = 30 + col * 160, y = 550 + row * 52; ctx.fillStyle = '#241c12'; ctx.fillRect(x, y, 150, 44); ctx.fillStyle = '#bfae86'; ctx.font = '13px sans-serif'; ctx.fillText(n, x + 8, y + 18); ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = v > 1.01 ? '#7be07b' : v < 0.99 ? '#ef7a6a' : '#ddd'; ctx.fillText(`x${(+v).toFixed(2).replace(/0$/, '')}`, x + 8, y + 38); });
    const tags = [card.hazard ? `Hazard ${Math.round(card.hazard * 100)}% HP` : null, card.repair ? `Wall repair ${Math.round(card.repair * 100)}%` : null, ...(card.flags || [])].filter(Boolean); ctx.fillStyle = '#c9a24a'; ctx.font = '13px sans-serif'; ctx.fillText(tags.join('  ·  ').slice(0, 70), 30, 730);
    ctx.textAlign = 'right'; ctx.fillStyle = '#8a7a55'; ctx.fillText(card.biomes.includes('*') ? 'ANY REALM' : card.biomes.join(' / ').toUpperCase(), W - 30, 730);
    return c.toBuffer('image/png');
}

// ── realm war map ─────────────────────────────────────────────────────────────────────────────
function kindIcon(ctx, kind, x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2; ctx.beginPath();
    switch (kind) {
        case 'gem_vein': ctx.fillStyle = '#58e6ff'; ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.8, 0); break;
        case 'ley_gate': ctx.arc(0, 0, s * 0.8, 0, 7); ctx.moveTo(s * 0.4, 0); ctx.arc(0, 0, s * 0.4, 0, 7); break;
        case 'shrine': ctx.moveTo(0, -s); ctx.lineTo(s, s * 0.8); ctx.lineTo(-s, s * 0.8); break;
        case 'village': ctx.moveTo(-s * 0.8, s * 0.7); ctx.lineTo(-s * 0.8, 0); ctx.lineTo(0, -s * 0.8); ctx.lineTo(s * 0.8, 0); ctx.lineTo(s * 0.8, s * 0.7); break;
        case 'forest': ctx.fillStyle = '#2f6a34'; ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(-s * 0.7, s * 0.6); break;
        case 'pass': ctx.fillStyle = '#9a8f84'; ctx.moveTo(-s, s * 0.7); ctx.lineTo(-s * 0.3, -s * 0.6); ctx.lineTo(s * 0.1, s * 0.1); ctx.lineTo(s * 0.5, -s * 0.4); ctx.lineTo(s, s * 0.7); break;
        default: ctx.restore(); return;
    } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
async function mapInProcess(snap) { // snap: {seed, realm, tiles:[{id,owner,shield}], guilds, me:{at, sprite}, marches, title, sub}
    const T = 34, PAD = 20; const g = map.generate(snap.seed); const W = map.W * T + PAD * 2 + 230, H = map.H * T + PAD * 2 + 50; const { c, ctx } = ctxOf(W, H);
    const realm = g.realms.find((r) => r.key === snap.realm); const biome = realm.biome; ctx.fillStyle = '#14100b'; ctx.fillRect(0, 0, W, H);
    const fl = await SP.variants('floors', SP.FLOOR_FAM[biome], 3); const names = snap.guilds.map((x) => x.name); const by = Object.fromEntries(snap.tiles.map((t) => [t.id, t]));
    const sp = { keep: await SP.cq('turrets/statue_iron.png'), fortress: await SP.cq('gates/gate_closed_middle.png'), ruins: await SP.cq('turrets/crumbled_column_1.png'), titan: await SP.cq(`golems/titan_${snap.realm}.png`) }; ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) { const id = map.tileId(snap.realm, x, y); const st = g.tiles.get(id); const o = by[id] || {}; const px = PAD + x * T, py = 44 + y * T;
        const fim = fl[(x * 7 + y * 13) % fl.length]; if (fim) ctx.drawImage(fim, px, py, T, T); else { ctx.fillStyle = '#777'; ctx.fillRect(px, py, T, T); }
        if (o.owner) { const col = ownerColor(names, o.owner); ctx.fillStyle = art.hex(col, 0.42); ctx.fillRect(px, py, T, T); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, T - 2, T - 2); }
        ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 1; ctx.strokeRect(px, py, T, T);
        const im = sp[st.kind]; if (im) { const bx = SP.contentBox('mk' + st.kind, im); const sc = (T - 4) / Math.max(bx.w, bx.h); ctx.drawImage(im, px + T / 2 - (bx.x + bx.w / 2) * sc, py + T / 2 - (bx.y + bx.h / 2) * sc, im.width * sc, im.height * sc); } else { ctx.imageSmoothingEnabled = true; kindIcon(ctx, st.kind, px + T / 2, py + T / 2, T * 0.3); ctx.imageSmoothingEnabled = false; }
        if (o.shield) { ctx.strokeStyle = '#fff'; ctx.setLineDash([3, 3]); ctx.strokeRect(px + 4, py + 4, T - 8, T - 8); ctx.setLineDash([]); } }
    ctx.imageSmoothingEnabled = true; ctx.strokeStyle = 'rgba(20,10,0,.8)'; ctx.lineWidth = 3; for (let i = 0; i <= 4; i++) { const x = PAD + i * 5 * T; ctx.beginPath(); ctx.moveTo(x, 44); ctx.lineTo(x, 44 + 15 * T); ctx.stroke(); } for (let j = 0; j <= 3; j++) { const y = 44 + j * 5 * T; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(PAD + 20 * T, y); ctx.stroke(); }
    ctx.font = 'bold 12px serif'; ctx.textAlign = 'center'; realm.provinces.forEach((p) => { const tx = PAD + (p.col * 5 + 2.5) * T, ty = 44 + p.row * 5 * T + 13; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(tx - ctx.measureText(p.name.toUpperCase()).width / 2 - 3, ty - 11, ctx.measureText(p.name.toUpperCase()).width + 6, 15); ctx.fillStyle = '#f2e6c8'; ctx.fillText(p.name.toUpperCase(), tx, ty); }); ctx.textAlign = 'left';
    const center = (id) => { const q = map.parse(id); return q.realm === snap.realm ? [PAD + (q.x + 0.5) * T, 44 + (q.y + 0.5) * T] : null; };
    for (const m of snap.marches || []) { const a = center(m.from), b2 = center(m.to); if (a && b2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b2); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#ffdf6a'; ctx.beginPath(); ctx.arc(b2[0], b2[1], 6, 0, 7); ctx.fill(); } }
    const me = center(snap.me.at); if (me) { const ch = snap.me.sprite ? await SP.character(snap.me.sprite) : null; if (ch) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(me[0], me[1] - 6, 22, 0, 7); ctx.fill(); ctx.save(); ctx.beginPath(); ctx.arc(me[0], me[1] - 6, 21, 0, 7); ctx.clip(); const bx = SP.contentBox('ch' + snap.me.sprite, ch); const sc = 56 / bx.h; ctx.drawImage(ch, me[0] - (bx.x + bx.w / 2) * sc, me[1] - 28 - bx.y * sc, ch.width * sc, ch.height * sc); ctx.restore(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(me[0], me[1] - 6, 22, 0, 7); ctx.stroke(); } else { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(me[0], me[1], 9, 0, 7); ctx.fill(); } }
    title(ctx, W, `${snap.title || realm.name} — ${realm.name}`, snap.sub || '');
    const px = PAD * 2 + map.W * T; ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 15px serif'; ctx.fillText('STANDINGS', px, 70);
    snap.guilds.forEach((gd, i) => { const y = 92 + i * 30; ctx.fillStyle = ownerColor(names, gd.name); ctx.fillRect(px, y - 12, 14, 14); ctx.fillStyle = '#eadfc0'; ctx.font = '13px sans-serif'; ctx.fillText(`${gd.name.slice(0, 14)}  ${gd.score}  (${gd.tiles})`, px + 22, y); });
    const ly = 92 + snap.guilds.length * 30 + 20; ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 15px serif'; ctx.fillText('LEGEND', px, ly);
    const leg = [['keep', 'Guild Keep'], ['fortress', 'Fortress'], ['ley_gate', 'Ley Gate'], ['gem_vein', 'Aether Vein'], ['titan', 'Titan Lair'], ['ruins', 'Ruins'], ['shrine', 'Shrine'], ['village', 'Village'], ['pass', 'Pass']];
    for (const [i, [k, n]] of leg.entries()) { const y = ly + 22 + i * 26; ctx.fillStyle = '#2a241a'; ctx.fillRect(px, y - 16, 24, 24); const im = sp[k]; if (im) { ctx.imageSmoothingEnabled = false; const bx = SP.contentBox('mk' + k, im); const sc = 22 / Math.max(bx.w, bx.h); ctx.drawImage(im, px + 12 - (bx.x + bx.w / 2) * sc, y - 4 - (bx.y + bx.h / 2) * sc, im.width * sc, im.height * sc); ctx.imageSmoothingEnabled = true; } else kindIcon(ctx, k, px + 12, y - 4, 7); ctx.fillStyle = '#eadfc0'; ctx.font = '13px sans-serif'; ctx.fillText(n, px + 34, y + 2); }
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
