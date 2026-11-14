'use strict';
// 🎨 Procedural art for conquest: environment scenes, wall sections, golems, turrets. Pure node-canvas, zero external assets
// (no licence exposure). Every function draws into a given ctx; render.js composes them.
const { mulberry32, hashStr } = require('./mapgen');
const envCards = require('./envCards');
const RNG = (s) => mulberry32(hashStr(String(s)));
const hex = (c, a = 1) => { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

// ── weather / ambience families keyed by card id ──────────────────────────────────────────────
const FAMILY = { rain: 'rain', fog: 'fog', whiteout: 'snow', sandstorm: 'sand', heatwave: 'heat', thunder: 'storm', aurora: 'aurora', tailwind: 'wind', clear: 'dawn', night: 'night', mud: 'mud', sinkhole: 'sink', rockslide: 'rocks', quake: 'quake', thinice: 'ice', lava: 'lava', tide: 'tide', quicksand: 'sand2', thornbriar: 'briar', oil: 'oil', volley: 'arrows', wardsurge: 'ward', awaken: 'sigil', mender: 'menders', tar: 'tar', ravens: 'ravens', rot: 'rot', deserter: 'candle', eclipse: 'eclipse' };

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

// ── wall damage overlays (drawn over the real wall tiles) ──
function damage(ctx, x, y, w, h, frac, seed) { // frac = 0..1 damage
    const r = RNG(seed); const n = Math.round(frac * 14); ctx.strokeStyle = 'rgba(8,6,4,.85)'; ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) { let cx = x + r() * w, cy = y + r() * h * 0.7; ctx.beginPath(); ctx.moveTo(cx, cy); for (let k = 0; k < 4; k++) { cx += (r() - 0.5) * 26; cy += 8 + r() * 16; ctx.lineTo(cx, cy); } ctx.stroke(); }
    if (frac > 0.6) { ctx.fillStyle = 'rgba(10,8,6,.8)'; for (let i = 0; i < 4; i++) ctx.fillRect(x + r() * (w - 12), y + r() * (h - 12), 8 + r() * 14, 8 + r() * 12); }
}
function rubble(ctx, x, y, w, h, seed) { const r = RNG(seed); for (let i = 0; i < 26; i++) { ctx.fillStyle = `rgb(${90 + r() * 50},${86 + r() * 40},${80 + r() * 40})`; const s = 5 + r() * 12; ctx.fillRect(x + r() * (w - s), y + h - s - r() * h * 0.35, s, s * 0.8); } }
function flames(ctx, x, y, w, seed, t = 0) { const r = RNG(seed); for (let i = 0; i < 7; i++) { const fx = x + r() * w, fh = 20 + r() * 34; const g = ctx.createLinearGradient(0, y, 0, y - fh); g.addColorStop(0, '#ffcf4a'); g.addColorStop(0.6, '#ff6a1a'); g.addColorStop(1, 'rgba(255,60,10,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(fx - 8, y); ctx.quadraticCurveTo(fx, y - fh * 1.4, fx + 8, y); ctx.fill(); } }
function bar(ctx, x, y, w, frac, col = '#6dd36d') { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x, y, w, 8); ctx.fillStyle = frac > 0.5 ? col : frac > 0.25 ? '#e6b93b' : '#d9473a'; ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * frac), 6); }

module.exports = { weather, damage, rubble, flames, bar, FAMILY, hex, RNG };
