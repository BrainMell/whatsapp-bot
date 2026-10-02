// ============================================
// 🗺️ RUINS MAP RENDERER — Guild War Overhaul 2026-10-03
// Clones the worldMapRenderer Royal Decree kit (node-canvas, bot-owned
// fonts, parchment palette). Per spec: NO banner and NO rank plate on this
// sheet — the map replaces the attack/encounter visual area, title only.
// Renders the PLAYER'S fog view: undiscovered rooms hidden, explored kept.
// Renders are cached per (player, discoveredCount, occupantsHash).
// ============================================

const fs = require('fs');
const path = require('path');

const PAL = {
    parchment: '#EADDC4',
    parchmentDeep: '#E1D1AF',
    ink: '#3A2A1E',
    inkSoft: '#5A4634',
    frame: '#A67C2E',
    wax: '#8B1A2B',
    goldSoft: 'rgba(166,124,46,0.5)',
    plate: 'rgba(58,42,30,0.06)',
    fog: 'rgba(58,42,30,0.14)',
    cleared: '#8f9c86',
    active: '#A64B2E',
    unexplored: '#7A6A52',
    you: '#8B1A2B',
    mate: '#2E6E73',
    enemy: '#9C5B23',
    core: '#4A3A8A',
};

const W = 1000;
const H = 1400;

// ─── font registration (same kit as worldMapRenderer) ─────────────────────
let _fontsReady = false;
function _ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) throw new Error('no font registration API in canvas build');
        const F = path.join(__dirname, '..', '..', 'rpgasset', 'fonts');
        const isRealFont = (p) => {
            try {
                if (!fs.existsSync(p)) return false;
                const head = fs.readFileSync(p).slice(0, 4);
                return head.equals(Buffer.from([0x00, 0x01, 0x00, 0x00]))
                    || head.toString('latin1') === 'OTTO'
                    || head.toString('latin1') === 'true';
            } catch (e) { return false; }
        };
        const regs = [
            ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
            ['CinzelDecorative-Bold.ttf', { family: 'Cinzel Deco B' }],
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['IMFellEnglish-Regular.ttf', { family: 'IM Fell' }],
            ['IMFellEnglish-Italic.ttf', { family: 'IM Fell Italic' }],
            ['MedievalSharp.ttf', { family: 'Medieval' }],
        ];
        let registered = 0;
        for (const [file, opts] of regs) {
            const p = path.join(F, file);
            if (!isRealFont(p)) continue;
            try { registerFont(p, opts); registered++; } catch (e) { /* skip */ }
        }
        if (!registered) throw new Error('no usable font files registered');
        _fontsReady = true;
        return true;
    } catch (e) {
        try { console.error('[ruinsMapRenderer] font registration failed:', e.message); } catch (_) {}
        return false;
    }
}

function _bg(ctx) {
    ctx.fillStyle = PAL.parchment;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = PAL.parchmentDeep;
    const rnd = _mulberry32(11);
    for (let i = 0; i < 8; i++) {
        const x = rnd() * W, y = rnd() * H, r = 60 + rnd() * 120;
        ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, rnd() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function _frame(ctx) {
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, W - 52, H - 52);
    ctx.lineWidth = 1;
    ctx.strokeRect(36, 36, W - 72, H - 72);
    ctx.lineWidth = 2;
    const t = 16;
    [[36, 36, 1, 1], [W - 36, 36, -1, 1], [36, H - 36, 1, -1], [W - 36, H - 36, -1, -1]].forEach(([x, y, sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(x + sx * t, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * t);
        ctx.stroke();
    });
}

function _centered(ctx, text, y, font, color) {
    ctx.font = font;
    ctx.fillStyle = color || PAL.ink;
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, y);
}

function _titleBlock(ctx, kicker, title, subtitle) {
    _centered(ctx, kicker, 78, '15px "Cinzel"', PAL.inkSoft);
    _centered(ctx, title, 124, '40px "Cinzel Deco"', PAL.ink);
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 130, 144); ctx.lineTo(W / 2 + 130, 144); ctx.stroke();
    ctx.fillStyle = PAL.wax;
    ctx.fillRect(W / 2 - 5, 138, 10, 12);
    if (subtitle) _centered(ctx, subtitle, 172, 'italic 15px "IM Fell Italic"', PAL.inkSoft);
}

function _mulberry32(seedU32) {
    let a = seedU32 >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// room glyphs — ONLY the DejaVu-verified whitelist (docs/CARD-SYSTEM.md §6;
// probing note: ⌛ ⛨ ⛓ are known tofu, emoji have NO coverage at all)
const TYPE_GLYPH = {
    empty: '', combat: '⚔', puzzle: '✥', discovery: '⚑', reward: '◈',
    hazard: '☠', lore: '✺', coop: '✚', secret: '✦', anomaly: '✷',
    landmark: '▲', core: '⨀',
};
const TYPE_LABEL = {
    empty: 'Empty hall', combat: 'Guarded', puzzle: 'Sealed', discovery: 'Buried find',
    reward: 'Vault', hazard: 'Trapped', lore: 'Inscribed', coop: 'Guardians (co-op)',
    secret: 'Hidden', anomaly: 'Anomaly', landmark: 'Landmark', core: 'World Core',
};

// ── main render ──
// opts: { player, discovered:Set, eventDoc, extras:{mates,enemyPings}, title }
//
// ⚔️ LOAD FIX (L2 measured a 5.2s event-loop stall from 12 concurrent
// node-canvas draws — canvas blocks the loop). Renders are offloaded to a
// child-process pool (max 2 concurrent; excess queues). Falls back to
// in-process drawing if the child cannot start, so a render never hard-fails.
const { fork } = require('child_process');
const _renderPool = { children: [], queue: [], inflight: 0, max: 2 };
let _renderSeq = 0;

function _spawnChild() {
    const child = fork(path.join(__dirname, 'renderWorker.js'), [], { stdio: 'ignore' });
    child.on('exit', () => {
        const i = _renderPool.children.indexOf(child);
        if (i !== -1) _renderPool.children.splice(i, 1);
    });
    _renderPool.children.push(child);
    return child;
}

function _renderViaChild(doc, player, extras) {
    return new Promise((resolve, reject) => {
        const task = () => {
            const child = _renderPool.children.length ? _renderPool.children[0] : _spawnChild();
            const id = ++_renderSeq;
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('render timeout (10s)'));
            }, 10000);
            const onMsg = (m) => {
                if (!m || m.id !== id) return;
                cleanup();
                if (m.error) reject(new Error(m.error));
                else resolve(Buffer.from(m.png, 'base64'));
            };
            const cleanup = () => {
                clearTimeout(timeout);
                child.off('message', onMsg);
                _renderPool.inflight--;
                const next = _renderPool.queue.shift();
                if (next) { _renderPool.inflight++; next(); }
            };
            child.on('message', onMsg);
            child.send({ type: 'render', id, doc, player, extras });
        };
        if (_renderPool.inflight >= _renderPool.max) _renderPool.queue.push(task);
        else { _renderPool.inflight++; task(); }
    });
}

async function renderRuinsMap(eventDoc, player, extras = {}) {
    try {
        // serialize the mongoose doc once; the child draws OFF the event loop
        const plainDoc = typeof eventDoc.toObject === 'function' ? eventDoc.toObject({ depopulate: true }) : eventDoc;
        const plainPlayer = typeof player.toObject === 'function' ? player.toObject({ depopulate: true }) : player;
        return await _renderViaChild(plainDoc, plainPlayer, extras);
    } catch (e) {
        // fallback: better to block briefly than fail the player's map
        return _renderInProcess(eventDoc, player, extras);
    }
}

function _renderInProcess(eventDoc, player, extras = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');

    _bg(ctx);
    _frame(ctx);
    _titleBlock(ctx,
        'GUILD WAR — THE RUINS',
        extras.title || 'Charted Reaches',
        `${eventDoc.type === 'alignment' ? 'Alignment of Worlds' : 'A dead world, half-remembered'} · chamber ${player.roomId}`);

    // ── grid geometry ──
    const gx0 = 80, gy0 = 210;
    const gx1 = W - 80, gy1 = H - 260;
    const side = Math.max(1, eventDoc.side || 1);
    const cellW = (gx1 - gx0) / side;
    const cellH = (gy1 - gy0) / side;
    const cx = (r) => gx0 + (r.x + 0.5) * cellW;
    const cy = (r) => gy0 + (r.y + 0.5) * cellH;

    const discovered = new Set(player.discovered || []);
    const roomsMap = new Map();
    for (const r of eventDoc.rooms) roomsMap.set(r.key, r);
    const openEdges = new Set(eventDoc.edges || []); // "x,y|dir" — pruned topology

    const rnd = _mulberry32(Math.floor(cellW * cellH) + side);
    const dotR = Math.max(5, Math.min(11, Math.floor(Math.min(cellW, cellH) * 0.22)));

    // ── paths between discovered rooms (and their open edges) ──
    ctx.strokeStyle = 'rgba(58,42,30,0.35)';
    ctx.lineWidth = 1.4;
    for (const r of eventDoc.rooms) {
        if (!discovered.has(r.key)) continue;
        for (const dir of ['e', 's']) {
            const [x, y] = r.key.split(',').map(Number);
            const [dx, dy] = { e: [1, 0], s: [0, 1] }[dir];
            const nk = `${x + dx},${y + dy}`;
            if (!openEdges.has(`${r.key}|${dir}`) || !discovered.has(nk)) continue;
            const other = roomsMap.get(nk);
            if (!other) continue;
            ctx.beginPath();
            ctx.moveTo(cx(r), cy(r));
            ctx.lineTo(cx(other), cy(other));
            ctx.stroke();
        }
    }

    // ── rooms ──
    for (const r of eventDoc.rooms) {
        const known = discovered.has(r.key);
        const px = cx(r), py = cy(r);
        if (!known) {
            // unexplored: faint dot only (the world exists; you have not seen it)
            ctx.fillStyle = PAL.fog;
            ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
            continue;
        }
        let color = r.state === 'CLEARED' ? PAL.cleared : r.state === 'ACTIVE' ? PAL.active : PAL.unexplored;
        if (r.type === 'core') color = PAL.core;

        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(px, py, dotR, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(58,42,30,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const glyph = TYPE_GLYPH[r.type] || '';
        if (glyph) {
            ctx.font = `${Math.max(9, Math.floor(dotR * 1.5))}px "DejaVu Sans"`;
            ctx.fillStyle = '#F3ECD9';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(glyph, px, py + 0.5);
            ctx.textBaseline = 'alphabetic';
        }
    }

    // ── occupants: mates / recent enemies / you ──
    for (const m of extras.mates || []) {
        const r = roomsMap.get(m.roomId);
        if (!r || !discovered.has(m.roomId)) continue;
        ctx.strokeStyle = PAL.mate;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx(r), cy(r), dotR + 4, 0, Math.PI * 2); ctx.stroke();
    }
    for (const e of extras.enemyPings || []) {
        const r = roomsMap.get(e.roomId);
        if (!r || !discovered.has(e.roomId)) continue;
        ctx.strokeStyle = PAL.enemy;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(cx(r), cy(r), dotR + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
    }
    const me = roomsMap.get(player.roomId);
    if (me && discovered.has(player.roomId)) {
        ctx.fillStyle = PAL.you;
        ctx.beginPath();
        const mx = cx(me), myy = cy(me) - dotR - 9;
        ctx.moveTo(mx, myy - 7); ctx.lineTo(mx - 5.5, myy + 3); ctx.lineTo(mx + 5.5, myy + 3);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#F3ECD9'; ctx.lineWidth = 1; ctx.stroke();
    }

    // ── legend plate ──
    const ly = H - 225;
    ctx.fillStyle = PAL.plate;
    ctx.fillRect(60, ly, W - 120, 160);
    ctx.strokeStyle = PAL.frame; ctx.lineWidth = 1.2;
    ctx.strokeRect(60, ly, W - 120, 160);
    ctx.font = '15px "Cinzel"';
    ctx.fillStyle = PAL.ink;
    ctx.textAlign = 'left';
    ctx.fillText('CHART LEGEND', 84, ly + 28);
    ctx.font = '14px "IM Fell"';
    ctx.fillStyle = PAL.inkSoft;
    const legendItems = [
        `▲ you   ◯ ringed = guildmate   dashed ring = recent enemy movement`,
        `● cleared halls fade · ⚔ guarded · ✥ sealed · ⚑ buried finds · ◈ vaults`,
        `☠ trapped · ✺ inscribed · ✚ co-op · ✦ hidden · ✷ anomalies · ▲ landmarks`,
        `⨀ World Core — the heart of the ruin, first breach earns lasting glory`,
    ];
    let ty = ly + 54;
    for (const line of legendItems) { ctx.fillText(line, 84, ty); ty += 22; }
    ctx.font = 'italic 13px "IM Fell Italic"';
    ctx.fillText(`Carried relics: ${(player.relics || []).length ? (player.relics || []).map((r) => `${r.name} (${r.tier})`).join(', ') : 'none — hand-ins secure their value'}`, 84, ty + 6);

    // score line
    _centered(ctx, `${player.guildName || player.guildId} — ${player.score || 0} GP · lives ${player.lives ?? 3} · discovered ${(player.discovered || []).length} of ${eventDoc.rooms.length} chambers`, H - 44, 'italic 15px "IM Fell Italic"', PAL.inkSoft);
    void rnd;

    return c.toBuffer('image/png');
}

module.exports = { renderRuinsMap, TYPE_GLYPH, TYPE_LABEL, PAL };
