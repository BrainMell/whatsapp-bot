// ============================================
// TTT TOURNAMENT - IMAGE RENDERER (pure node canvas, no Go service needed)
// Cards: lobby, bracket map, champion ceremony, hall of fame.
// Everything is drawn with shapes (no emoji glyphs) so it renders the same on any box.
// ============================================
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
let _fonts = false;
function ensureFonts() {
    if (_fonts) return;
    _fonts = true;
    try {
        const canvas = require('canvas');
        const reg = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!reg) return;
        const regular = path.join(FONT_DIR, 'DejaVuSans.ttf');
        const bold = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');
        if (canvas.registerFont) {
            if (fs.existsSync(regular)) canvas.registerFont(regular, { family: 'TTTSans' });
            if (fs.existsSync(bold)) canvas.registerFont(bold, { family: 'TTTSans', weight: 'bold' });
        } else {
            if (fs.existsSync(regular)) reg(regular, 'TTTSans');
            if (fs.existsSync(bold)) reg(bold, 'TTTSans');
        }
    } catch (e) { /* fall back to system sans */ }
}
const F = (px, bold) => `${bold ? 'bold ' : ''}${px}px TTTSans, "DejaVu Sans", sans-serif`;

const PAL = {
    bg0: '#070b1c', bg1: '#0f1736', bg2: '#1a1650',
    gold: '#ffcf4a', goldD: '#b8891a', ice: '#58d6ff', rose: '#ff5c7a', violet: '#9a6bff',
    text: '#eaf0ff', dim: '#7f8bb3', card: 'rgba(255,255,255,0.06)', line: 'rgba(120,150,255,0.35)',
};

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function hue(name) { return hash(name) % 360; }
function clip(s, n) { s = String(s || '?'); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function arena(ctx, W, H, tint = 0) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, PAL.bg0); g.addColorStop(0.55, PAL.bg1); g.addColorStop(1, PAL.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // faint tic-tac-toe lattice floor
    ctx.save();
    ctx.strokeStyle = 'rgba(110,140,255,0.07)'; ctx.lineWidth = 2;
    const step = 90;
    for (let x = -step; x < W + step; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = -step; y < H + step; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // ghost X / O marks scattered on the lattice
    const rnd = (n) => ((hash('m' + n + tint) % 1000) / 1000);
    for (let i = 0; i < 26; i++) {
        const gx = Math.floor(rnd(i) * (W / step)) * step + step / 2, gy = Math.floor(rnd(i + 99) * (H / step)) * step + step / 2;
        ctx.globalAlpha = 0.07; ctx.lineWidth = 5;
        if (i % 2) { ctx.strokeStyle = PAL.ice; ctx.beginPath(); ctx.arc(gx, gy, 18, 0, 7); ctx.stroke(); }
        else { ctx.strokeStyle = PAL.rose; ctx.beginPath(); ctx.moveTo(gx - 16, gy - 16); ctx.lineTo(gx + 16, gy + 16); ctx.moveTo(gx + 16, gy - 16); ctx.lineTo(gx - 16, gy + 16); ctx.stroke(); }
    }
    ctx.restore();
    // vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

function drawX(ctx, cx, cy, r, color, lw = 6) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); ctx.restore();
}
function drawO(ctx, cx, cy, r, color, lw = 6) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

function crown(ctx, cx, cy, s, color = PAL.gold) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
    const g = ctx.createLinearGradient(0, -30, 0, 22); g.addColorStop(0, '#fff2b0'); g.addColorStop(1, color);
    ctx.fillStyle = g; ctx.strokeStyle = PAL.goldD; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-34, 20); ctx.lineTo(-40, -18); ctx.lineTo(-18, -2); ctx.lineTo(0, -28); ctx.lineTo(18, -2); ctx.lineTo(40, -18); ctx.lineTo(34, 20); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAL.rose; ctx.beginPath(); ctx.arc(0, 6, 5, 0, 7); ctx.fill();
    ctx.fillStyle = PAL.ice; ctx.beginPath(); ctx.arc(-20, 8, 3.5, 0, 7); ctx.arc(20, 8, 3.5, 0, 7); ctx.fill();
    ctx.restore();
}

function avatar(ctx, cx, cy, r, name, ring) {
    const h = hue(name);
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, `hsl(${h},75%,58%)`); g.addColorStop(1, `hsl(${(h + 50) % 360},70%,32%)`);
    ctx.save();
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = ring || 'rgba(255,255,255,0.55)'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = F(Math.round(r * 0.95), true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(name || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase() || '?', cx, cy + 1);
    ctx.restore();
}

function banner(ctx, W, title, sub) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // title glow
    ctx.shadowColor = 'rgba(255,207,74,0.65)'; ctx.shadowBlur = 24;
    ctx.fillStyle = PAL.gold; ctx.font = F(46, true);
    ctx.fillText(clip(String(title).toUpperCase(), 26), W / 2, 66);
    ctx.shadowBlur = 0;
    // flanking X / O
    drawX(ctx, 60, 50, 14, PAL.rose, 7); drawO(ctx, W - 60, 50, 15, PAL.ice, 7);
    if (sub) { ctx.fillStyle = PAL.dim; ctx.font = F(20, false); ctx.fillText(sub, W / 2, 98); }
    // rule
    const g = ctx.createLinearGradient(80, 0, W - 80, 0); g.addColorStop(0, 'rgba(255,207,74,0)'); g.addColorStop(0.5, 'rgba(255,207,74,0.9)'); g.addColorStop(1, 'rgba(255,207,74,0)');
    ctx.fillStyle = g; ctx.fillRect(80, 112, W - 160, 3);
    ctx.restore();
}

function chip(ctx, x, y, label, color) {
    ctx.save();
    ctx.font = F(17, true);
    const w = ctx.measureText(label).width + 28;
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; rr(ctx, x, y, w, 32, 16); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + 14, y + 17);
    ctx.restore();
    return w + 10;
}

const GRID_LABEL = { 3: '3x3 CLASSIC', 8: '8x8 MEGA', 16: '16x16 ULTRA', mixed: 'MIXED - ESCALATING' };
function gridLabel(g) { return GRID_LABEL[g] || String(g); }

// ---------------------------------------------------------------
// LOBBY CARD
// ---------------------------------------------------------------
function renderLobby(t) {
    ensureFonts();
    const slots = Math.max(t.maxPlayers, t.players.length);
    const cols = 4, rows = Math.max(2, Math.ceil(slots / cols));
    const W = 1000, H = 230 + rows * 104 + 70;
    const c = createCanvas(W, H), ctx = c.getContext('2d');
    arena(ctx, W, H, 1);
    banner(ctx, W, t.name, 'REGISTRATION OPEN - ' + t.players.length + ' / ' + t.maxPlayers + ' ENTERED');
    let x = 80;
    x += chip(ctx, x, 132, gridLabel(t.grid), PAL.ice);
    x += chip(ctx, x, 132, 'BEST OF ' + t.bestOf, PAL.violet);
    x += chip(ctx, x, 132, 'SINGLE ELIMINATION', PAL.rose);
    for (let i = 0; i < rows * cols; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const tx = 70 + col * 215, ty = 196 + row * 104;
        const p = t.players[i];
        ctx.save();
        rr(ctx, tx, ty, 200, 90, 16);
        ctx.fillStyle = p ? 'rgba(88,214,255,0.10)' : 'rgba(255,255,255,0.03)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = p ? 'rgba(88,214,255,0.65)' : 'rgba(255,255,255,0.12)';
        if (!p) ctx.setLineDash([7, 7]); ctx.stroke(); ctx.setLineDash([]);
        if (p) {
            avatar(ctx, tx + 44, ty + 45, 28, p.name, i === 0 ? PAL.gold : null);
            ctx.fillStyle = PAL.text; ctx.font = F(19, true); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            ctx.fillText(clip(p.name, 11), tx + 82, ty + 42);
            ctx.fillStyle = i === 0 ? PAL.gold : PAL.dim; ctx.font = F(14, false);
            ctx.fillText(i === 0 ? 'HOST' : 'SEED ' + (p.seed || '?'), tx + 82, ty + 64);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.font = F(28, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('?', tx + 100, ty + 45);
        }
        ctx.restore();
    }
    ctx.fillStyle = PAL.dim; ctx.font = F(18, false); ctx.textAlign = 'center';
    ctx.fillText('.j tourney join   |   host: .j tourney start', W / 2, H - 26);
    return c.toBuffer('image/png');
}

// ---------------------------------------------------------------
// BRACKET MAP
// ---------------------------------------------------------------
function roundName(r, total) {
    const left = total - r;
    if (left === 1) return 'FINAL';
    if (left === 2) return 'SEMI-FINALS';
    if (left === 3) return 'QUARTER-FINALS';
    return 'ROUND OF ' + Math.pow(2, left);
}

function renderBracket(t) {
    ensureFonts();
    const R = t.rounds.length;
    const first = t.rounds[0].length;
    const CW = 250, GAP = 56, MH = 84, PADX = 50, TOP = 170;
    const unit = MH + 26;
    const W = Math.max(1000, PADX * 2 + R * CW + (R - 1) * GAP + 190);
    const H = TOP + first * unit + 90;
    const c = createCanvas(W, H), ctx = c.getContext('2d');
    arena(ctx, W, H, 2);
    banner(ctx, W, t.name, t.status === 'done' ? 'TOURNAMENT COMPLETE' : t.status === 'running' ? 'LIVE BRACKET - ' + t.players.length + ' CONTENDERS' : 'BRACKET PREVIEW');

    // y-centre per match
    const cy = [];
    for (let r = 0; r < R; r++) {
        cy[r] = [];
        for (let m = 0; m < t.rounds[r].length; m++) {
            cy[r][m] = r === 0 ? TOP + m * unit + MH / 2 : (cy[r - 1][m * 2] + cy[r - 1][m * 2 + 1]) / 2;
        }
    }
    const colX = (r) => PADX + r * (CW + GAP);

    // connectors first
    ctx.save(); ctx.lineWidth = 3; ctx.lineJoin = 'round';
    for (let r = 1; r < R; r++) {
        for (let m = 0; m < t.rounds[r].length; m++) {
            for (const k of [0, 1]) {
                const src = t.rounds[r - 1][m * 2 + k];
                const x1 = colX(r - 1) + CW, y1 = cy[r - 1][m * 2 + k], x2 = colX(r), y2 = cy[r][m];
                ctx.strokeStyle = src && src.status === 'done' ? 'rgba(255,207,74,0.85)' : PAL.line;
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + GAP / 2, y1); ctx.lineTo(x1 + GAP / 2, y2); ctx.lineTo(x2, y2); ctx.stroke();
            }
        }
    }
    ctx.restore();

    for (let r = 0; r < R; r++) {
        // round header
        ctx.save();
        ctx.textAlign = 'center'; ctx.fillStyle = PAL.ice; ctx.font = F(18, true);
        ctx.fillText(roundName(r, R), colX(r) + CW / 2, TOP - 28);
        ctx.fillStyle = PAL.dim; ctx.font = F(14, false);
        const g = t.gridFor(r);
        ctx.fillText(gridLabel(g).split(' ')[0] + '  -  BEST OF ' + t.bestOf, colX(r) + CW / 2, TOP - 8);
        ctx.restore();
        for (let m = 0; m < t.rounds[r].length; m++) drawMatch(ctx, t, t.rounds[r][m], colX(r), cy[r][m] - MH / 2, CW, MH);
    }

    // champion slot
    const last = t.rounds[R - 1][0];
    const chx = colX(R - 1) + CW + GAP * 0.5, chy = cy[R - 1][0];
    ctx.save();
    ctx.strokeStyle = last && last.status === 'done' ? PAL.gold : PAL.line; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(colX(R - 1) + CW, chy); ctx.lineTo(chx + 20, chy); ctx.stroke();
    crown(ctx, chx + 60, chy - 14, 1.1, last && last.status === 'done' ? PAL.gold : '#555a73');
    ctx.textAlign = 'center'; ctx.font = F(15, true);
    if (t.champion) { ctx.fillStyle = PAL.gold; ctx.fillText(clip(t.champion.name, 11), chx + 60, chy + 40); }
    else { ctx.fillStyle = PAL.dim; ctx.fillText('CHAMPION', chx + 60, chy + 40); }
    ctx.restore();
    return c.toBuffer('image/png');
}

function drawMatch(ctx, t, m, x, y, w, h) {
    const live = m.status === 'live', done = m.status === 'done';
    ctx.save();
    rr(ctx, x, y, w, h, 12);
    ctx.fillStyle = live ? 'rgba(255,92,122,0.13)' : 'rgba(255,255,255,0.05)'; ctx.fill();
    ctx.lineWidth = live ? 3 : 2; ctx.strokeStyle = live ? PAL.rose : done ? 'rgba(255,207,74,0.5)' : PAL.line; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 10, y + h / 2); ctx.lineTo(x + w - 10, y + h / 2); ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.stroke();
    [['a', y], ['b', y + h / 2]].forEach(([side, ry]) => {
        const p = m[side];
        const won = done && m.winner && p && m.winner === p.jid;
        const lost = done && m.winner && p && m.winner !== p.jid;
        const mid = ry + h / 4;
        if (!p) {
            ctx.fillStyle = m.bye && side === 'b' ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.16)'; ctx.font = F(15, false);
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(m.bye && side === 'b' ? 'BYE' : 'awaiting...', x + 50, mid);
            return;
        }
        if (won) { rr(ctx, x + 3, ry + 3, w - 6, h / 2 - 6, 9); ctx.fillStyle = 'rgba(255,207,74,0.16)'; ctx.fill(); }
        avatar(ctx, x + 26, mid, 13, p.name, won ? PAL.gold : null);
        ctx.globalAlpha = lost ? 0.4 : 1;
        ctx.fillStyle = won ? PAL.gold : PAL.text; ctx.font = F(16, true); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(clip(p.name, 13), x + 48, mid);
        ctx.globalAlpha = 1;
        if (!m.bye) {
            ctx.textAlign = 'right'; ctx.fillStyle = won ? PAL.gold : PAL.dim; ctx.font = F(18, true);
            ctx.fillText(String(m.wins[side]), x + w - 14, mid);
        }
        if (p.seed) { ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.font = F(11, false); ctx.fillText('#' + p.seed, x + w - 38, mid); }
    });
    if (live) {
        rr(ctx, x + w - 54, y - 10, 50, 20, 10); ctx.fillStyle = PAL.rose; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = F(12, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('LIVE', x + w - 29, y);
    }
    ctx.restore();
}

// ---------------------------------------------------------------
// CHAMPION CEREMONY
// ---------------------------------------------------------------
function renderChampion(t, podium) {
    ensureFonts();
    const W = 1000, H = 760;
    const c = createCanvas(W, H), ctx = c.getContext('2d');
    arena(ctx, W, H, 3);
    // sunburst rays
    ctx.save(); ctx.translate(W / 2, 290);
    for (let i = 0; i < 28; i++) {
        ctx.rotate((Math.PI * 2) / 28);
        const g = ctx.createLinearGradient(0, 0, 0, -520);
        g.addColorStop(0, 'rgba(255,207,74,0.32)'); g.addColorStop(1, 'rgba(255,207,74,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(60, -520); ctx.lineTo(-60, -520); ctx.closePath();
        if (i % 2 === 0) ctx.fill();
    }
    ctx.restore();
    // confetti
    for (let i = 0; i < 90; i++) {
        const h = hash('cf' + i);
        ctx.save(); ctx.translate(h % W, (h >> 8) % H); ctx.rotate((h % 628) / 100);
        ctx.fillStyle = [PAL.gold, PAL.rose, PAL.ice, PAL.violet, '#fff'][h % 5]; ctx.globalAlpha = 0.85;
        ctx.fillRect(-4, -9, 8, 18); ctx.restore();
    }
    banner(ctx, W, t.name, 'TOURNAMENT CHAMPION');
    const champ = podium[0];
    crown(ctx, W / 2, 190, 2.2);
    avatar(ctx, W / 2, 300, 78, champ.name, PAL.gold);
    ctx.save();
    ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(255,207,74,0.8)'; ctx.shadowBlur = 28;
    ctx.fillStyle = PAL.gold; ctx.font = F(54, true); ctx.fillText(clip(champ.name, 16), W / 2, 442);
    ctx.shadowBlur = 0; ctx.fillStyle = PAL.text; ctx.font = F(22, false);
    ctx.fillText(champ.line || '', W / 2, 478);
    ctx.restore();
    // podium
    const places = [
        { p: podium[1], x: 250, h: 120, col: '#c7cfe6', n: '2' },
        { p: podium[0], x: 500, h: 170, col: PAL.gold, n: '1' },
        { p: podium[2], x: 750, h: 90, col: '#cd8a4b', n: '3' },
    ];
    for (const pl of places) {
        const bx = pl.x - 100, by = H - 50 - pl.h;
        ctx.save();
        const g = ctx.createLinearGradient(0, by, 0, by + pl.h); g.addColorStop(0, pl.col); g.addColorStop(1, 'rgba(255,255,255,0.05)');
        ctx.fillStyle = g; rr(ctx, bx, by, 200, pl.h, 10); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.font = F(52, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(pl.n, pl.x, by + pl.h / 2 + 4);
        if (pl.p) {
            if (pl.n !== '1') avatar(ctx, pl.x, by - 34, 26, pl.p.name, pl.col);
            ctx.fillStyle = PAL.text; ctx.font = F(18, true); ctx.textBaseline = 'alphabetic';
            ctx.fillText(clip(pl.p.name, 13), pl.x, pl.n === '1' ? by - 12 : by - 76);
        }
        ctx.restore();
    }
    return c.toBuffer('image/png');
}

// ---------------------------------------------------------------
// HALL OF FAME
// ---------------------------------------------------------------
function renderHall(rows) {
    ensureFonts();
    const n = Math.max(3, Math.min(10, rows.length));
    const W = 1000, H = 190 + n * 74 + 50;
    const c = createCanvas(W, H), ctx = c.getContext('2d');
    arena(ctx, W, H, 4);
    banner(ctx, W, 'Hall of Champions', 'TIC-TAC-TOE TOURNAMENT LEADERBOARD');
    ctx.save(); ctx.fillStyle = PAL.dim; ctx.font = F(14, true); ctx.textAlign = 'center';
    ['TITLES', 'FINALS', 'MATCH W-L', 'POINTS'].forEach((h, i) => ctx.fillText(h, 520 + i * 118, 146));
    ctx.restore();
    if (!rows.length) {
        ctx.fillStyle = PAL.dim; ctx.font = F(24, false); ctx.textAlign = 'center'; ctx.fillText('No tournaments played yet. Be the first champion!', W / 2, 300);
    }
    rows.slice(0, 10).forEach((r, i) => {
        const y = 164 + i * 74;
        const medal = [PAL.gold, '#c7cfe6', '#cd8a4b'][i];
        ctx.save();
        rr(ctx, 50, y, W - 100, 64, 14);
        ctx.fillStyle = i === 0 ? 'rgba(255,207,74,0.13)' : 'rgba(255,255,255,0.05)'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = medal || PAL.line; ctx.globalAlpha = medal ? 0.9 : 0.6; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = medal || PAL.dim; ctx.font = F(26, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), 90, y + 33);
        avatar(ctx, 146, y + 32, 22, r.name, medal);
        ctx.fillStyle = PAL.text; ctx.font = F(22, true); ctx.textAlign = 'left'; ctx.fillText(clip(r.name, 15), 184, y + 24);
        ctx.fillStyle = PAL.dim; ctx.font = F(13, false); ctx.fillText(r.played + ' tournament' + (r.played === 1 ? '' : 's') + ' entered', 184, y + 46);
        ctx.textAlign = 'center'; ctx.font = F(22, true);
        ctx.fillStyle = r.titles ? PAL.gold : PAL.dim; ctx.fillText(String(r.titles), 520, y + 33);
        ctx.fillStyle = PAL.violet; ctx.fillText(String(r.finals), 638, y + 33);
        ctx.fillStyle = PAL.ice; ctx.fillText(r.matchW + '-' + r.matchL, 756, y + 33);
        ctx.fillStyle = PAL.text; ctx.fillText(String(r.pts), 874, y + 33);
        if (r.titles) crown(ctx, 506 - 38, y + 32, 0.3 + Math.min(r.titles, 5) * 0.03);
        ctx.restore();
    });
    return c.toBuffer('image/png');
}

module.exports = { renderLobby, renderBracket, renderChampion, renderHall, roundName, gridLabel };
