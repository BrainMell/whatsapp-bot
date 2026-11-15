'use strict';
// 🧭 TRAVEL UI art for the conquest war map: dashed route, start/destination markers, progress marker, side panel, realm minimap.
// Pure canvas (no emoji, so it renders the same everywhere). Called from scene3d.warMapScene when snap.route is present.
const map = require('./mapgen');
const GOLD = '#ffd45a', INK = '#14100b';
const MODE_TXT = { depart: 'MARCH ORDERS', transit: 'IN TRANSIT', arrive: 'ARRIVED' };
const TERR = { plain: 'Open ground', forest: 'Forest', hills: 'Hills', mountain: 'Mountains', marsh: 'Marsh', farm: 'Farmland', lake: 'Lake' };

function fmt(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`; }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function tag(ctx, text, x, y, o = {}) { // rounded name plate, anchored above (x,y); o.below puts it under the point
    ctx.font = `bold ${o.size || 14}px sans-serif`; const w = ctx.measureText(text).width + 18, h = (o.size || 14) + 10; const bx = x - w / 2; let by = y - h;
    if (o.below) { by = y + 30; ctx.fillStyle = o.bg || 'rgba(14,10,6,.88)'; rr(ctx, bx, by, w, h, 7); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = o.line || GOLD; ctx.stroke(); ctx.fillStyle = o.fg || '#f6ecd2'; ctx.textAlign = 'center'; ctx.fillText(text, x, by + h - 7); return; }
    ctx.fillStyle = o.bg || 'rgba(14,10,6,.88)'; rr(ctx, bx, by, w, h, 7); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = o.line || GOLD; ctx.stroke();
    ctx.fillStyle = o.fg || '#f6ecd2'; ctx.textAlign = 'center'; ctx.fillText(text, x, by + h - 7);
    ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 8); ctx.closePath(); ctx.fillStyle = o.bg || 'rgba(14,10,6,.88)'; ctx.fill();
}
function along(pts, f) { // point + direction at fraction f of a polyline
    if (pts.length < 2) return { x: pts[0].x, y: pts[0].y, a: 0 }; const L = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); L.push(d); tot += d; }
    let t = Math.max(0, Math.min(1, f)) * tot; for (let i = 0; i < L.length; i++) { if (t <= L[i] || i === L.length - 1) { const k = L[i] ? Math.min(1, t / L[i]) : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k, a: Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x), i, k }; } t -= L[i]; }
    return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, a: 0 };
}
function path2(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); }
function chevron(ctx, x, y, a, s, col) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.8); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s * 0.7, s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
function ring(ctx, x, y, r, col, lw, a = 1) { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, 7); ctx.stroke(); ctx.restore(); }

/** pts = projected centres of every path tile (null where off-window) */
async function drawRoute(ctx, R, pts, o) {
    const over = o.over; const live = pts.filter(Boolean); if (!live.length) return;
    const lw = over ? 3 : 5; const f = Math.max(0, Math.min(1, R.progress || 0));
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (R.mode !== 'arrive' && live.length > 1) {
        // dark under-stroke so the route reads on any terrain
        ctx.strokeStyle = 'rgba(10,6,2,.55)'; ctx.lineWidth = lw + 4; ctx.setLineDash([]); path2(ctx, live); ctx.stroke();
        // remaining = white dashes ; travelled = solid gold
        const done = along(live, f); const idx = done.i || 0;
        const head = live.slice(0, idx + 1).concat([{ x: done.x, y: done.y }]); const tail = [{ x: done.x, y: done.y }].concat(live.slice(idx + 1));
        ctx.strokeStyle = '#fff'; ctx.lineWidth = lw; ctx.setLineDash([lw * 2.4, lw * 1.9]); ctx.shadowColor = '#000'; ctx.shadowBlur = 5; path2(ctx, tail); ctx.stroke();
        ctx.setLineDash([]); if (f > 0.001) { ctx.strokeStyle = GOLD; ctx.lineWidth = lw + 1; path2(ctx, head); ctx.stroke(); }
        ctx.shadowBlur = 0;
        // direction chevrons
        const n = Math.max(2, Math.min(12, Math.round(live.length / 3))); for (let i = 1; i <= n; i++) { const q = along(live, i / (n + 1)); chevron(ctx, q.x, q.y, q.a, over ? 5 : 8, (i / (n + 1)) <= f ? GOLD : '#fff'); }
        // tile ticks: a small dot per tile, a number every 5
        if (!over) live.forEach((p, i) => { if (i === 0 || i === live.length - 1) return; ctx.fillStyle = i / live.length <= f ? GOLD : 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 7); ctx.fill(); if (i % 5 === 0 && live.length > 6) { ctx.fillStyle = 'rgba(14,10,6,.8)'; ctx.fillRect(p.x - 10, p.y + 7, 20, 14); ctx.fillStyle = '#f6ecd2'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i), p.x, p.y + 18); } });
    }
    const A = pts[0], B = pts[pts.length - 1]; const close = !!(A && B && Math.hypot(A.x - B.x, A.y - B.y) < 220);
    // origin marker
    if (A && R.mode !== 'arrive') { ring(ctx, A.x, A.y + 4, over ? 8 : 20, '#8fd6ff', 3, 0.95); ctx.fillStyle = '#8fd6ff'; ctx.beginPath(); ctx.arc(A.x, A.y + 4, over ? 3 : 6, 0, 7); ctx.fill(); if (!over) tag(ctx, 'FROM  ' + (R.fromName || 'start'), A.x, A.y - 18, { line: '#8fd6ff', below: true }); }
    // destination marker: pulsing target rings + pin plate
    if (B) {
        const T = R.mode === 'arrive' ? GOLD : '#ff7a5a'; ring(ctx, B.x, B.y + 4, over ? 14 : 44, T, 3, 0.9); ring(ctx, B.x, B.y + 4, over ? 8 : 28, T, 3, 0.9); ring(ctx, B.x, B.y + 4, over ? 3 : 12, T, 4, 1);
        ctx.fillStyle = T; ctx.beginPath(); ctx.arc(B.x, B.y + 4, over ? 2.5 : 5, 0, 7); ctx.fill();
        tag(ctx, (R.mode === 'arrive' ? 'ARRIVED  ' : 'TARGET  ') + (R.toName || 'destination'), B.x, B.y - (over ? 14 : 62), { line: T, size: over ? 13 : 15 });
    }
    // party marker
    const pos = R.mode === 'depart' ? A : R.mode === 'arrive' ? B : (() => { const q = along(live, f); return { x: q.x, y: q.y }; })();
    if (pos) {
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 4, over ? 8 : 17, over ? 3 : 6.5, 0, 0, 7); ctx.fill();
        if (o.sprite && !over) { const h = 64, w = h * o.sprite.width / o.sprite.height; ctx.drawImage(o.sprite, pos.x - w / 2, pos.y - h + 6, w, h); } else { ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(pos.x, pos.y - 2, over ? 5 : 8, 0, 7); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); }
        if (R.mode === 'transit') tag(ctx, `${R.party > 1 ? R.party + ' marching' : 'You'}  ${fmt(R.etaSec)} left`, pos.x, pos.y - (over ? 14 : 70), { line: GOLD, size: over ? 12 : 14, below: close });
    }
    ctx.restore();
}

/** realm minimap with territory colours, the route and the camera window */
function minimap(ctx, x, y, w, h, snap, g, realm, colHex, names, R, rp, win) {
    ctx.save(); ctx.fillStyle = '#0d1520'; rr(ctx, x, y, w, h, 8); ctx.fill(); ctx.clip();
    const sx = w / map.W, sy = h / map.H; const own = {}; for (const t of snap.tiles) if (t.owner) own[t.id] = t.owner;
    for (const t of g.tiles.values()) { if (t.realm !== snap.realm) continue; const o = own[t.id]; ctx.fillStyle = o ? colHex(o) : '#7d8a5c'; ctx.fillRect(x + t.x * sx, y + t.y * sy * 0.92 + 2, Math.max(1.4, sx), Math.max(1.4, sy)); }
    if (win) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(x + win.x0 * sx, y + win.y0 * sy * 0.92 + 2, win.vw * sx, win.vh * sy * 0.92); }
    if (rp && rp.length > 1) { ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.beginPath(); rp.forEach((q, i) => { const px = x + q.x * sx, py = y + q.y * sy * 0.92 + 2; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); }
    if (rp && rp.length) { const a = rp[0], b = rp[rp.length - 1]; ctx.fillStyle = '#8fd6ff'; ctx.beginPath(); ctx.arc(x + a.x * sx, y + a.y * sy * 0.92 + 2, 3.5, 0, 7); ctx.fill(); ctx.fillStyle = '#ff7a5a'; ctx.beginPath(); ctx.arc(x + b.x * sx, y + b.y * sy * 0.92 + 2, 4, 0, 7); ctx.fill(); }
    ctx.restore(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; rr(ctx, x, y, w, h, 8); ctx.stroke();
}

function panel(ctx, px, W, H, snap, R, g, rpIds, colHex, extra) {
    const w = W - px - 8; ctx.fillStyle = 'rgba(16,12,8,.92)'; ctx.fillRect(px - 8, 52, w + 8, H - 60);
    let y = 78; ctx.textAlign = 'left'; ctx.fillStyle = GOLD; ctx.font = 'bold 17px serif'; ctx.fillText(MODE_TXT[R.mode] || 'MARCH', px, y);
    ctx.fillStyle = '#a99c78'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(R.type === 'teleport' || R.type === 'skyfall' ? (R.type === 'skyfall' ? 'SKYFALL' : 'WAR WRIT') : R.type === 'muster' ? 'MUSTER' : 'MARCH', px + w - 16, y); ctx.textAlign = 'left';
    y += 14; extra.minimap(px, y, w - 8, 120); y += 138;
    const line = (k, v, c) => { ctx.fillStyle = '#a99c78'; ctx.font = '12px sans-serif'; ctx.fillText(k, px, y); ctx.fillStyle = c || '#f6ecd2'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(String(v).slice(0, 26), px + 78, y); y += 22; };
    line('From', R.fromName || '-', '#8fd6ff'); line('To', R.toName || '-', '#ff9a7a'); line('Kind', R.kindLabel || '-'); line('Holder', R.owner || 'Unclaimed', R.owner ? '#ffb0a0' : '#c8e6a0');
    line('Distance', `${R.distance} tile${R.distance === 1 ? '' : 's'}`);
    // clock + progress bar
    y += 4; ctx.fillStyle = 'rgba(255,255,255,.07)'; rr(ctx, px - 2, y - 4, w - 12, 62, 8); ctx.fill();
    ctx.fillStyle = '#a99c78'; ctx.font = '12px sans-serif'; ctx.fillText(R.mode === 'arrive' ? 'ARRIVED AFTER' : 'ARRIVAL IN', px + 6, y + 12);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px serif'; ctx.fillText(R.mode === 'arrive' ? fmt(R.totalSec) : fmt(R.etaSec), px + 6, y + 42);
    const bx = px + 96, bw = w - 126; ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(ctx, bx, y + 26, bw, 14, 7); ctx.fill(); const pf = R.mode === 'arrive' ? 1 : Math.max(0.02, Math.min(1, R.progress || 0)); const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#ffb43a'); gr.addColorStop(1, '#ffe27a'); ctx.fillStyle = gr; rr(ctx, bx, y + 26, bw * pf, 14, 7); ctx.fill();
    ctx.fillStyle = '#a99c78'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(Math.round(pf * 100) + '%', bx + bw, y + 20); ctx.textAlign = 'left'; y += 78;
    // terrain crossed
    const cnt = {}; for (const id of rpIds) { const t = g.tiles.get(id); if (t) { const k = t.kind !== 'plain' && ['village', 'pass', 'ruins', 'shrine', 'gem_vein', 'fortress', 'ley_gate', 'titan', 'keep'].includes(t.kind) ? map.KINDS[t.kind].label : (TERR[t.terrain] || 'Open ground'); cnt[k] = (cnt[k] || 0) + 1; } }
    ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 13px serif'; ctx.fillText('ALONG THE ROUTE', px, y); y += 18; ctx.font = '12px sans-serif';
    Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([k, n]) => { ctx.fillStyle = '#d9cba3'; ctx.fillText(k, px, y); ctx.fillStyle = '#ffe28a'; ctx.textAlign = 'right'; ctx.fillText('x' + n, px + w - 16, y); ctx.textAlign = 'left'; y += 17; });
    y += 8; ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 13px serif'; ctx.fillText('DEFENCES AT TARGET', px, y); y += 18; ctx.font = '12px sans-serif';
    (R.defence && R.defence.length ? R.defence : ['None known - free to claim']).slice(0, 4).forEach((d) => { ctx.fillStyle = R.defence && R.defence.length ? '#ffb090' : '#c8e6a0'; ctx.fillText(d.slice(0, 34), px, y); y += 17; });
    if (R.warn) { y += 4; ctx.fillStyle = '#ff9a7a'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(R.warn.slice(0, 38), px, y); y += 16; }
    ctx.fillStyle = '#a99c78'; ctx.font = '12px sans-serif'; const foot = R.mode === 'arrive' ? (R.next || '') : 'cq recall = cancel  |  cq status = refresh'; const fw = foot.split(' '); let ln = '', yy = H - 40; const out = []; for (const w2 of fw) { if ((ln + ' ' + w2).trim().length > 40) { out.push(ln.trim()); ln = w2; } else ln += ' ' + w2; } out.push(ln.trim()); out.slice(0, 3).forEach((t, i) => ctx.fillText(t, px, yy + i * 16 - (out.length > 1 ? 16 : 0) + 16));
}
module.exports = { drawRoute, minimap, panel, fmt, MODE_TXT };
