'use strict';
// 🎨 Procedural art for conquest: environment scenes, wall sections, golems, turrets. Pure node-canvas, zero external assets
// (no licence exposure). Every function draws into a given ctx; render.js composes them.
const { mulberry32, hashStr } = require('./mapgen');
const envCards = require('./envCards');
const RNG = (s) => mulberry32(hashStr(String(s)));
const hex = (c, a = 1) => { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

// ── weather / ambience families keyed by card id ──────────────────────────────────────────────
const FAMILY = { rain: 'rain', fog: 'fog', whiteout: 'snow', sandstorm: 'sand', heatwave: 'heat', thunder: 'storm', aurora: 'aurora', tailwind: 'wind', clear: 'dawn', night: 'night', mud: 'mud', sinkhole: 'sink', rockslide: 'rocks', quake: 'quake', thinice: 'ice', lava: 'lava', tide: 'tide', quicksand: 'sand2', thornbriar: 'briar', oil: 'oil', volley: 'arrows', wardsurge: 'ward', awaken: 'sigil', mender: 'menders', tar: 'tar', ravens: 'ravens', rot: 'rot', deserter: 'candle', eclipse: 'eclipse' };

function sky(ctx, W, H, card, horizon) { const g = ctx.createLinearGradient(0, 0, 0, horizon); g.addColorStop(0, card.palette[0]); g.addColorStop(1, card.palette[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon); }
function ground(ctx, W, H, horizon, card, fam) {
    const base = { mud: '#4b3a2a', lava: '#2a1410', tide: '#1b4a6a', ice: '#cfe4f2', snow: '#dfe9ef', sand: '#b98a4c', sand2: '#c9a15e', tar: '#14120e' }[fam] || hex(card.palette[0]).replace(/rgba\((\d+),(\d+),(\d+),1\)/, (m, r, g, b) => `rgb(${Math.round(r * 0.55)},${Math.round(g * 0.55)},${Math.round(b * 0.55)})`);
    const g = ctx.createLinearGradient(0, horizon, 0, H); g.addColorStop(0, base); g.addColorStop(1, '#0b0b0b'); ctx.fillStyle = g; ctx.fillRect(0, horizon, W, H - horizon);
}
function weather(ctx, W, H, card, horizon, seed, t = 0) {
    const fam = FAMILY[card.id] || 'dawn'; const r = RNG(seed + card.id); ctx.save();
    const lines = (n, dx, dy, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); for (let i = 0; i < n; i++) { const x = r() * W, y = r() * H; ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); } ctx.stroke(); };
    const dots = (n, rad, col, y0 = 0, y1 = H) => { ctx.fillStyle = col; for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(r() * W, y0 + r() * (y1 - y0), rad * (0.5 + r()), 0, 7); ctx.fill(); } };
    const band = (y, h, col) => { const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, hex(col, 0)); g.addColorStop(0.5, hex(col, 0.45)); g.addColorStop(1, hex(col, 0)); ctx.fillStyle = g; ctx.fillRect(0, y, W, h); };
    switch (fam) {
        case 'rain': lines(240, -10, 26, 'rgba(190,210,235,.45)', 1.2); band(horizon - 40, 90, '#8aa2b8'); break;
        case 'fog': for (let i = 0; i < 6; i++) band(horizon - 90 + i * 45, 110, '#e4eaec'); break;
        case 'snow': dots(220, 3, 'rgba(255,255,255,.85)'); lines(60, 40, 8, 'rgba(255,255,255,.4)', 2); break;
        case 'sand': case 'sand2': lines(200, 70, 4, 'rgba(235,190,120,.35)', 1.5); band(horizon - 20, 140, '#c98f4b'); break;
        case 'heat': { ctx.fillStyle = 'rgba(255,230,150,.9)'; ctx.beginPath(); ctx.arc(W * 0.8, horizon * 0.35, 46, 0, 7); ctx.fill(); band(horizon - 30, 80, '#ffd27a'); break; }
        case 'storm': { lines(180, -8, 22, 'rgba(180,195,230,.4)', 1.2); ctx.strokeStyle = '#e8ecff'; ctx.lineWidth = 4; ctx.shadowColor = '#9fb2ff'; ctx.shadowBlur = 18; ctx.beginPath(); let x = W * (0.2 + r() * 0.6), y = 0; ctx.moveTo(x, y); while (y < horizon) { x += (r() - 0.5) * 60; y += 30 + r() * 25; ctx.lineTo(x, y); } ctx.stroke(); break; }
        case 'aurora': for (let k = 0; k < 3; k++) { ctx.strokeStyle = hex(['#4de2b4', '#7a8cff', '#b080ff'][k], 0.35); ctx.lineWidth = 26; ctx.beginPath(); for (let x = 0; x <= W; x += 20) { const y = 70 + k * 36 + Math.sin(x / 90 + k + t) * 24; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); } dots(60, 1.4, 'rgba(255,255,255,.8)', 0, horizon); break;
        case 'wind': lines(70, 90, -6, 'rgba(235,245,240,.4)', 2); break;
        case 'dawn': { const g = ctx.createRadialGradient(W * 0.2, horizon, 8, W * 0.2, horizon, 260); g.addColorStop(0, 'rgba(255,230,160,.9)'); g.addColorStop(1, 'rgba(255,230,160,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); break; }
        case 'night': dots(110, 1.4, 'rgba(255,255,255,.85)', 0, horizon); ctx.fillStyle = '#e8e6d0'; ctx.beginPath(); ctx.arc(W * 0.15, 70, 22, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H); break;
        case 'eclipse': ctx.fillStyle = '#05050a'; ctx.beginPath(); ctx.arc(W * 0.5, 90, 52, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(200,162,255,.9)'; ctx.lineWidth = 6; ctx.shadowColor = '#c8a2ff'; ctx.shadowBlur = 30; ctx.stroke(); break;
        case 'mud': case 'sink': { for (let i = 0; i < 9; i++) { ctx.fillStyle = 'rgba(20,12,6,.55)'; ctx.beginPath(); ctx.ellipse(r() * W, horizon + 40 + r() * (H - horizon - 100), 40 + r() * 50, 10 + r() * 10, 0, 0, 7); ctx.fill(); } break; }
        case 'rocks': for (let i = 0; i < 14; i++) { ctx.fillStyle = hex('#7d746a', 0.9); const x = r() * W, y = r() * horizon, s = 8 + r() * 18; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + s * 0.4); ctx.lineTo(x + s * 0.3, y + s); ctx.closePath(); ctx.fill(); } break;
        case 'quake': ctx.strokeStyle = 'rgba(10,6,4,.9)'; ctx.lineWidth = 3; for (let i = 0; i < 6; i++) { let x = r() * W, y = horizon + 10; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 40; y += 20 + r() * 14; ctx.lineTo(x, y); } ctx.stroke(); } break;
        case 'ice': ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; for (let i = 0; i < 14; i++) { ctx.beginPath(); const x = r() * W, y = horizon + r() * (H - horizon); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 30); ctx.stroke(); } break;
        case 'lava': { const g = ctx.createLinearGradient(0, horizon, 0, H); g.addColorStop(0, '#ff6a2a'); g.addColorStop(1, '#a01e0a'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, horizon + 60); for (let x = 0; x <= W; x += 30) ctx.lineTo(x, horizon + 70 + Math.sin(x / 40) * 10); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill(); dots(60, 2.2, 'rgba(255,170,60,.9)', horizon - 120, horizon + 80); break; }
        case 'tide': for (let i = 0; i < 5; i++) { ctx.strokeStyle = `rgba(200,235,250,${0.25 + i * 0.1})`; ctx.lineWidth = 3; ctx.beginPath(); for (let x = 0; x <= W; x += 14) { const y = horizon + 40 + i * 30 + Math.sin(x / 30 + i) * 6; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); } break;
        case 'briar': for (let i = 0; i < 40; i++) { ctx.strokeStyle = '#2f5a2a'; ctx.lineWidth = 2.5; let x = r() * W, y = H; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y -= 20 + r() * 20; ctx.lineTo(x, y); } ctx.stroke(); } break;
        case 'oil': case 'tar': dots(40, 3, fam === 'tar' ? 'rgba(10,8,6,.9)' : 'rgba(220,160,50,.8)', horizon - 60, horizon + 140); break;
        case 'arrows': ctx.strokeStyle = '#d8c690'; ctx.lineWidth = 2; for (let i = 0; i < 60; i++) { const x = r() * W, y = r() * horizon; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y + 22); ctx.stroke(); } break;
        case 'ward': { ctx.strokeStyle = 'rgba(176,128,255,.8)'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(W / 2, horizon + 20, 150 + i * 40, Math.PI, 0); ctx.stroke(); } break; }
        case 'sigil': ctx.fillStyle = 'rgba(126,214,193,.35)'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(W * (0.15 + i * 0.12), horizon + 80, 22, 0, 7); ctx.fill(); } break;
        case 'menders': ctx.fillStyle = '#6a5a44'; for (let i = 0; i < 9; i++) { const x = 130 + r() * (W - 260); ctx.fillRect(x, horizon - 6, 6, 14); ctx.fillRect(x - 3, horizon - 12, 12, 5); } break;
        case 'ravens': ctx.strokeStyle = '#0c0c14'; ctx.lineWidth = 3; for (let i = 0; i < 30; i++) { const x = r() * W, y = r() * horizon; ctx.beginPath(); ctx.moveTo(x - 8, y + 3); ctx.quadraticCurveTo(x - 3, y - 6, x, y); ctx.quadraticCurveTo(x + 3, y - 6, x + 8, y + 3); ctx.stroke(); } break;
        case 'rot': dots(60, 2, 'rgba(100,80,30,.7)', horizon - 30, horizon + 160); break;
        case 'candle': { const g = ctx.createRadialGradient(W * 0.5, horizon + 60, 4, W * 0.5, horizon + 60, 90); g.addColorStop(0, 'rgba(255,220,130,.95)'); g.addColorStop(1, 'rgba(255,220,130,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); break; }
        default: break;
    }
    ctx.restore();
}

// ── wall sections ─────────────────────────────────────────────────────────────────────────────
function brickPattern(ctx, x, y, w, h, type, seed) {
    const r = RNG(seed); const base = { wood: '#7a5230', stone: '#8a8c8e', runed: '#3a3550' }[type] || '#8a8c8e'; ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5;
    if (type === 'wood') { for (let i = x; i < x + w; i += 14) { ctx.beginPath(); ctx.moveTo(i, y); ctx.lineTo(i, y + h); ctx.stroke(); } for (let k = 0; k < 14; k++) { ctx.beginPath(); const yy = y + r() * h; ctx.moveTo(x + r() * w, yy); ctx.lineTo(x + r() * w, yy + 2); ctx.stroke(); } }
    else { for (let j = 0; j * 16 < h; j++) { const yy = y + j * 16; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); for (let i = (j % 2) * 14; i < w; i += 28) { ctx.beginPath(); ctx.moveTo(x + i, yy); ctx.lineTo(x + i, yy + 16); ctx.stroke(); } } }
    if (type === 'runed') { ctx.strokeStyle = '#8f6cff'; ctx.shadowColor = '#8f6cff'; ctx.shadowBlur = 8; ctx.lineWidth = 2; for (let i = 0; i < Math.max(2, Math.floor(w / 36)); i++) { const gx = x + 14 + i * 34, gy = y + h * (0.2 + r() * 0.5); ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 8, gy + 10); ctx.lineTo(gx - 4, gy + 18); ctx.moveTo(gx - 6, gy + 6); ctx.lineTo(gx + 10, gy + 4); ctx.stroke(); } ctx.shadowBlur = 0; }
}
function damage(ctx, x, y, w, h, frac, seed) { // frac = 0..1 damage
    const r = RNG(seed); const n = Math.round(frac * 14); ctx.strokeStyle = 'rgba(8,6,4,.85)'; ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) { let cx = x + r() * w, cy = y + r() * h * 0.7; ctx.beginPath(); ctx.moveTo(cx, cy); for (let k = 0; k < 4; k++) { cx += (r() - 0.5) * 26; cy += 8 + r() * 16; ctx.lineTo(cx, cy); } ctx.stroke(); }
    if (frac > 0.6) { ctx.fillStyle = 'rgba(10,8,6,.8)'; for (let i = 0; i < 4; i++) ctx.fillRect(x + r() * (w - 12), y + r() * (h - 12), 8 + r() * 14, 8 + r() * 12); }
}
function rubble(ctx, x, y, w, h, seed) { const r = RNG(seed); for (let i = 0; i < 26; i++) { ctx.fillStyle = `rgb(${90 + r() * 50},${86 + r() * 40},${80 + r() * 40})`; const s = 5 + r() * 12; ctx.fillRect(x + r() * (w - s), y + h - s - r() * h * 0.35, s, s * 0.8); } }
function flames(ctx, x, y, w, seed, t = 0) { const r = RNG(seed); for (let i = 0; i < 7; i++) { const fx = x + r() * w, fh = 20 + r() * 34; const g = ctx.createLinearGradient(0, y, 0, y - fh); g.addColorStop(0, '#ffcf4a'); g.addColorStop(0.6, '#ff6a1a'); g.addColorStop(1, 'rgba(255,60,10,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(fx - 8, y); ctx.quadraticCurveTo(fx, y - fh * 1.4, fx + 8, y); ctx.fill(); } }
function bar(ctx, x, y, w, frac, col = '#6dd36d') { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x, y, w, 8); ctx.fillStyle = frac > 0.5 ? col : frac > 0.25 ? '#e6b93b' : '#d9473a'; ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * frac), 6); }

// ── turrets ───────────────────────────────────────────────────────────────────────────────────
function turret(ctx, x, y, kind, lvl = 1, silenced = false) {
    ctx.save(); ctx.translate(x, y); if (silenced) ctx.globalAlpha = 0.35; ctx.fillStyle = '#4a3a28'; ctx.fillRect(-14, 0, 28, 8);
    if (kind === 'ballista') { ctx.strokeStyle = '#2b1d10'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-18, -10); ctx.quadraticCurveTo(0, -26, 18, -10); ctx.stroke(); ctx.strokeStyle = '#d8c690'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -22); ctx.stroke(); }
    else if (kind === 'flame') { ctx.fillStyle = '#3a2a22'; ctx.fillRect(-9, -14, 18, 14); flames(ctx, -8, -12, 16, 'tf' + x); }
    else if (kind === 'arc') { ctx.strokeStyle = '#6fd3ff'; ctx.lineWidth = 3; ctx.shadowColor = '#6fd3ff'; ctx.shadowBlur = 12; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, -12, 6 + i * 4, 0, 7); ctx.stroke(); } }
    else { ctx.fillStyle = '#a8e4ff'; ctx.shadowColor = '#a8e4ff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(9, -10); ctx.lineTo(0, 0); ctx.lineTo(-9, -10); ctx.closePath(); ctx.fill(); }
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('L' + lvl, 0, 20); ctx.restore();
}

// ── golems ────────────────────────────────────────────────────────────────────────────────────
const GOLEM_STYLE = { clay: { body: '#a0643a', dark: '#6b3f22', eye: '#ffe08a', s: 0.85 }, stone: { body: '#8d9094', dark: '#585b5f', eye: '#9fe6ff', s: 1.0 }, iron: { body: '#5b6169', dark: '#2f3338', eye: '#ff4a3a', s: 1.15 }, rune: { body: '#1d1830', dark: '#0b0814', eye: '#7af0ff', s: 1.35 } };
function golem(ctx, x, y, kind, hpFrac = 1, lvl = 1) {
    const st = GOLEM_STYLE[kind] || GOLEM_STYLE.stone; const s = st.s * (1 + 0.04 * (lvl - 1)); ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const blk = (bx, by, bw, bh, c) => { ctx.fillStyle = c; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh); };
    blk(-30, -90, 60, 56, st.body); blk(-18, -128, 36, 34, st.body); // torso + head
    blk(-56, -88, 24, 60, st.dark); blk(32, -88, 24, 60, st.dark); // arms
    blk(-26, -34, 22, 40, st.dark); blk(4, -34, 22, 40, st.dark); // legs
    if (kind === 'iron') { ctx.fillStyle = '#9aa0a8'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-24 + (i % 3) * 24, -80 + Math.floor(i / 3) * 24, 2.6, 0, 7); ctx.fill(); } }
    if (kind === 'rune') { ctx.strokeStyle = '#7af0ff'; ctx.shadowColor = '#7af0ff'; ctx.shadowBlur = 12; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-12, -82); ctx.lineTo(0, -68); ctx.lineTo(12, -82); ctx.moveTo(0, -68); ctx.lineTo(0, -44); ctx.moveTo(-16, -56); ctx.lineTo(16, -56); ctx.stroke(); ctx.shadowBlur = 0; }
    if (kind === 'clay') { ctx.strokeStyle = 'rgba(40,20,10,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, -86); ctx.lineTo(0, -66); ctx.lineTo(-6, -44); ctx.stroke(); }
    ctx.fillStyle = st.eye; ctx.shadowColor = st.eye; ctx.shadowBlur = 10; ctx.fillRect(-11, -116, 7, 6); ctx.fillRect(4, -116, 7, 6); ctx.shadowBlur = 0;
    if (hpFrac < 0.6) { ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-20, -80); ctx.lineTo(-4, -60); ctx.lineTo(-14, -40); ctx.moveTo(10, -120); ctx.lineTo(4, -100); ctx.stroke(); }
    ctx.restore(); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 8, 40 * s, 8, 0, 0, 7); ctx.fill();
}
module.exports = { sky, ground, weather, brickPattern, damage, rubble, flames, bar, turret, golem, FAMILY, hex, RNG };
