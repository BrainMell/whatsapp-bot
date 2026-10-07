// ============================================
// 🗺️ RUINS WAR MAP — landscape rewrite (presentation overhaul 2026-10-04)
// Owner spec §3/§4: the map is the game's UI — LANDSCAPE, compact, legible
// at a glance, themed to The Ruins (dark stone + moss + torch gold — NOT
// the old portrait parchment ledger). Two visual states:
//   style 'explore' (default) — cool stone frame, standard chart
//   style 'return'  — post-encounter treatment: ember vignette + THE WAY
//                     ONWARD ribbon (same world, its own visual mode)
// Renders the PLAYER'S fog view only. Renders run in the child pool
// (node-canvas blocks the loop); falls back in-process, never hard-fails.
// ============================================

const fs = require('fs');
const path = require('path');

const W = 1500;
const H = 1000;

const PAL = {
    bg0: '#1c1f18', bg1: '#262b20',
    stone: '#3d4434', stoneHi: '#4c5540', moss: 'rgba(90,110,60,0.16)',
    ink: '#e8dfc8', inkSoft: 'rgba(220,205,160,0.72)', inkDim: 'rgba(200,190,150,0.4)',
    corridor: 'rgba(214,198,150,0.30)',
    fog: 'rgba(210,200,160,0.10)',
    cleared: 'rgba(126,152,110,0.85)',
    active: '#e07840',
    unexplored: '#8b8468',
    you: '#ffd24a',
    mate: '#5fc4b0',
    enemy: '#e0a040',
    core: '#a97ef0',
    warden: '#b04030',
    ember: 'rgba(224,120,64,0.55)',
};

// room glyphs — ONLY the DejaVu-verified whitelist (docs/CARD-SYSTEM.md §6)
const TYPE_GLYPH = {
    empty: '', combat: '⚔', puzzle: '✥', discovery: '⚑', reward: '◈',
    hazard: '☠', lore: '✺', coop: '✚', secret: '✦', anomaly: '✷',
    landmark: '▲', core: '⨀', finale: '☠',
};
const TYPE_LABEL = {
    empty: 'Empty hall', combat: 'Guarded', puzzle: 'Sealed', discovery: 'Buried find',
    reward: 'Vault', hazard: 'Trapped', lore: 'Inscribed', coop: 'Guardians (co-op)',
    secret: 'Hidden', anomaly: 'Anomaly', landmark: 'Landmark', core: 'World Core',
    finale: 'Warden',
};

// ─── font registration (same kit as the parchment cards) ─────────────────
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
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['IMFellEnglish-Regular.ttf', { family: 'IM Fell' }],
            ['IMFellEnglish-Italic.ttf', { family: 'IM Fell Italic' }],
        ];
        for (const [file, opts] of regs) {
            const p = path.join(F, file);
            if (isRealFont(p)) { try { registerFont(p, opts); } catch (e) { /* skip */ } }
        }
        _fontsReady = true;
        return true;
    } catch (e) {
        try { console.error('[ruinsMapRenderer] font registration failed:', e.message); } catch (_) {}
        return false;
    }
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

function _bg(ctx, style) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PAL.bg0);
    g.addColorStop(1, PAL.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // moss blotches (seeded — stable per render size)
    const rnd = _mulberry32(11);
    for (let i = 0; i < 26; i++) {
        const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 130;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = PAL.moss;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, rnd() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function _frame(ctx, style) {
    const isReturn = style === 'return';
    // outer stone edge
    ctx.strokeStyle = isReturn ? PAL.ember : 'rgba(200,190,150,0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 18, W - 36, H - 36);
    ctx.lineWidth = 1;
    ctx.strokeRect(26, 26, W - 52, H - 52);
    if (isReturn) {
        // post-encounter treatment: warm ember glow washing inward
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(224,120,64,0.16)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
}

function _header(ctx, eventDoc, player, extras, style) {
    // left: title block
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PAL.inkDim;
    ctx.font = '13px "Cinzel"';
    ctx.fillText('GUILD WAR · THE RUINS', 44, 58);
    ctx.fillStyle = PAL.ink;
    ctx.font = '30px "Cinzel Deco"';
    ctx.fillText(extras.title || 'Charted Reaches', 44, 92);
    ctx.fillStyle = PAL.inkSoft;
    ctx.font = 'italic 14px "IM Fell Italic"';
    const world = eventDoc.type === 'alignment' ? 'Alignment of Worlds' : 'a dead world, half-remembered';
    ctx.fillText(`${world} · chamber ${player.roomId} · ring ${Math.max(1, Math.round((extras.ring || 0) * 4) + 1)}`, 44, 116);

    // right: compact status
    ctx.textAlign = 'right';
    ctx.font = '15px "Cinzel"';
    ctx.fillStyle = PAL.inkSoft;
    const minsLeft = eventDoc.endsAt ? Math.max(0, Math.round((eventDoc.endsAt - Date.now()) / 60000)) : null;
    ctx.fillText(`${player.guildName || player.guildId} · ${player.score || 0} GP · lives ${player.lives ?? 3}${minsLeft != null ? ` · ${minsLeft}m left` : ''}`, W - 44, 66);
    ctx.font = '13px "IM Fell"';
    ctx.fillText(`discovered ${(player.discovered || []).length} of ${eventDoc.rooms.length} chambers`, W - 44, 88);

    // return-style ribbon
    if (style === 'return') {
        ctx.textAlign = 'center';
        const rw = 330, rx = (W - rw) / 2;
        ctx.fillStyle = 'rgba(224,120,64,0.14)';
        ctx.beginPath();
        ctx.moveTo(rx, 34); ctx.lineTo(rx + rw, 34); ctx.lineTo(rx + rw - 26, 66); ctx.lineTo(rx + 26, 66);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = PAL.ember; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#ffb27a';
        ctx.font = '16px "Cinzel"';
        ctx.fillText('THE WAY ONWARD', W / 2, 56);
        ctx.textAlign = 'left';
    }
}

// ── main render (in-process; the pool calls this in the worker) ──
function _renderInProcess(eventDoc, player, extras = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');
    const style = extras.style === 'return' ? 'return' : 'explore';

    _bg(ctx, style);
    _frame(ctx, style);
    _header(ctx, eventDoc, player, extras, style);

    // ── grid geometry (landscape, compact, SELF-ZOOMING) ──
    // The chart frames the DISCOVERED region (±1 room), centered — the map
    // stays legible at every stage of exploration and literally grows as
    // the player pushes deeper (owner spec §3: "update as the player explores").
    const gx0 = 70, gy0 = 150;
    const gx1 = W - 70, gy1 = H - 96;
    const side = Math.max(1, eventDoc.side || 1);
    const discovered = new Set(player.discovered || []);
    const roomsMap = new Map();
    for (const r of eventDoc.rooms) roomsMap.set(r.key, r);

    // viewport = bbox(discovered ∪ current) padded by 1, clamped to the world
    let wx0 = side, wy0 = side, wx1 = -1, wy1 = -1;
    const consider = (key) => {
        if (!key || !key.includes(',')) return;
        const [x, y] = key.split(',').map(Number);
        if (!roomsMap.has(key)) return;
        wx0 = Math.min(wx0, x); wy0 = Math.min(wy0, y);
        wx1 = Math.max(wx1, x); wy1 = Math.max(wy1, y);
    };
    for (const k of discovered) consider(k);
    consider(player.roomId);
    if (wx1 < 0) { wx0 = 0; wy0 = 0; wx1 = side - 1; wy1 = side - 1; } // nothing seen: whole world
    wx0 = Math.max(0, wx0 - 1); wy0 = Math.max(0, wy0 - 1);
    wx1 = Math.min(side - 1, wx1 + 1); wy1 = Math.min(side - 1, wy1 + 1);
    const winW = wx1 - wx0 + 1, winH = wy1 - wy0 + 1;

    const availW = gx1 - gx0, availH = gy1 - gy0;
    const cell = Math.min(availW / winW, availH / winH);
    const gridW = cell * winW, gridH = cell * winH;
    const ogx = gx0 + (availW - gridW) / 2; // origin of the framed window
    const ogy = gy0 + (availH - gridH) / 2;
    const chamberMode = cell >= 30; // real chambers when there is room; dots below that
    const inset = Math.max(2, cell * 0.16);

    const inWindow = (r) => r.x >= wx0 && r.x <= wx1 && r.y >= wy0 && r.y <= wy1;
    const px = (r) => ogx + (r.x - wx0 + 0.5) * cell;
    const py = (r) => ogy + (r.y - wy0 + 0.5) * cell;

    const openEdges = new Set(eventDoc.edges || []);

    // ── corridors between discovered rooms (drawn under the chambers) ──
    ctx.strokeStyle = PAL.corridor;
    ctx.lineWidth = Math.max(2, Math.min(7, cell * 0.14));
    ctx.lineCap = 'round';
    for (const r of eventDoc.rooms) {
        if (!discovered.has(r.key) || !inWindow(r)) continue;
        for (const dir of ['e', 's']) {
            const [x, y] = r.key.split(',').map(Number);
            const [dx, dy] = { e: [1, 0], s: [0, 1] }[dir];
            const nk = `${x + dx},${y + dy}`;
            if (!openEdges.has(`${r.key}|${dir}`) || !discovered.has(nk)) continue;
            const other = roomsMap.get(nk);
            if (!other) continue;
            ctx.beginPath();
            ctx.moveTo(px(r), py(r));
            ctx.lineTo(px(other), py(other));
            ctx.stroke();
        }
    }
    ctx.lineCap = 'butt';

    // ── rooms ──
    for (const r of eventDoc.rooms) {
        const known = discovered.has(r.key);
        if (!known || !inWindow(r)) continue;
        const x = px(r), y = py(r);
        let color = r.state === 'CLEARED' ? PAL.cleared : r.state === 'ACTIVE' ? PAL.active : PAL.unexplored;
        if (r.type === 'core') color = PAL.core;
        // ⏳ warden lairs burn red on every chart — the finale hunt targets
        if (r.type === 'finale' && r.state !== 'CLEARED') color = PAL.warden;
        const size = (chamberMode ? cell : cell * 0.5) - inset * 2;
        const rad = chamberMode ? Math.max(4, size * 0.22) : size;

        if (chamberMode) {
            ctx.fillStyle = 'rgba(0,0,0,0.30)';
            roundRect(ctx, x - size / 2 + 2, y - size / 2 + 3, size, size, rad); ctx.fill();
            ctx.fillStyle = color;
            roundRect(ctx, x - size / 2, y - size / 2, size, size, rad); ctx.fill();
            ctx.strokeStyle = 'rgba(10,10,6,0.6)';
            ctx.lineWidth = 1;
            roundRect(ctx, x - size / 2, y - size / 2, size, size, rad); ctx.stroke();
        } else {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, size / 2), 0, Math.PI * 2); ctx.fill();
        }

        const glyph = TYPE_GLYPH[r.type] || '';
        if (glyph && size >= 12) {
            ctx.font = `${Math.max(9, Math.floor(size * 0.5))}px "DejaVu Sans"`;
            ctx.fillStyle = '#12140e';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(glyph, x, y + 0.5);
            ctx.textBaseline = 'alphabetic';
        }
    }

    // ── occupants: mates / recent enemies / you ──
    const dotR = Math.max(4, Math.min(16, (chamberMode ? cell : cell * 0.5) * 0.42));
    for (const m of extras.mates || []) {
        const r = roomsMap.get(m.roomId);
        if (!r || !discovered.has(m.roomId) || !inWindow(r)) continue;
        ctx.strokeStyle = PAL.mate;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(px(r), py(r), dotR + 4, 0, Math.PI * 2); ctx.stroke();
    }
    for (const e of extras.enemyPings || []) {
        const r = roomsMap.get(e.roomId);
        if (!r || !discovered.has(e.roomId) || !inWindow(r)) continue;
        ctx.strokeStyle = PAL.enemy;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(px(r), py(r), dotR + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
    }
    const me = roomsMap.get(player.roomId);
    if (me && discovered.has(player.roomId)) {
        const mx = px(me), myy = py(me);
        // YOU marker: double pulse-ring + wax triangle + label
        ctx.strokeStyle = PAL.you;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(mx, myy, dotR + 8, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(mx, myy, dotR + 14, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
        const ty = myy - dotR - 12;
        ctx.fillStyle = PAL.you;
        ctx.beginPath();
        ctx.moveTo(mx, ty - 9); ctx.lineTo(mx - 7, ty + 4); ctx.lineTo(mx + 7, ty + 4);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#1a1c14'; ctx.lineWidth = 1; ctx.stroke();
        ctx.font = 'bold 12px "Cinzel"';
        ctx.textAlign = 'center';
        ctx.fillStyle = PAL.you;
        ctx.fillText('YOU', mx, ty - 14);
    }

    // ── compact legend line (not a plate — the map is the UI) ──
    ctx.textAlign = 'left';
    ctx.font = '13px "DejaVu Sans"';
    ctx.fillStyle = PAL.inkSoft;
    const legend = '▲ you · ◯ guildmate · dashed = enemy ping · ⚔ guarded · ✥ sealed · ⚑ find · ◈ vault · ☠ trapped · ✚ co-op · ✦ hidden · ✷ anomaly · ⨀ World Core';
    ctx.fillText(legend, 44, H - 40);
    ctx.font = 'italic 13px "IM Fell Italic"';
    ctx.fillStyle = PAL.inkDim;
    const carried = (player.relics || []).length ? (player.relics || []).map((r) => r.name).join(', ') : 'no relics carried';
    ctx.fillText(`carried: ${carried}`, 44, H - 20);
    ctx.textAlign = 'right';
    ctx.font = '13px "Cinzel"';
    ctx.fillStyle = PAL.inkDim;
    ctx.fillText('the chart grows as you explore', W - 44, H - 20);

    return c.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ── child-process pool (canvas blocks the loop — keep it off the bot) ──
// ⚔️ POOL PARALLELISM FIX (2026-10-07, mirrors roomScene.js): the pool
// capped inflight at 2 but always dispatched to children[0] — one child
// serialized every map render. Now spawns up to `max` children and routes
// each task to the LEAST-LOADED child (true parallel canvas).
const { fork } = require('child_process');
// lazy (keeps this module worker-safe): memory probe for the child pool
const _renderQ = () => require('../../utils/renderQueue');
const _renderPool = { children: [], queue: [], inflight: 0, max: 4 };
let _renderSeq = 0;

function _spawnChild() {
    // serialization 'advanced': structured-clone IPC (Buffers survive — JSON
    // IPC silently degrades them to plain objects)
    const child = fork(path.join(__dirname, 'renderWorker.js'), [], { stdio: 'ignore', serialization: 'advanced' });
    child._gwBusy = 0;
    child.on('exit', () => {
        const i = _renderPool.children.indexOf(child);
        if (i !== -1) _renderPool.children.splice(i, 1);
    });
    _renderPool.children.push(child);
    return child;
}

// least-loaded live child, spawning one while under the cap
// OWNER QUEUE RULE (2026-10-08): no NEW canvas child spawn when box memory
// is critical (mirrors roomScene.js).
function _pickChild() {
    let best = null;
    for (const c of _renderPool.children) {
        if (!best || (c._gwBusy || 0) < (best._gwBusy || 0)) best = c;
    }
    if (!best || ((best._gwBusy || 0) > 0 && _renderPool.children.length < _renderPool.max && _renderQ().canSpawnChild())) best = _spawnChild();
    return best;
}

function _renderViaChild(doc, player, extras) {
    return new Promise((resolve, reject) => {
        const task = () => {
            const child = _pickChild();
            const id = ++_renderSeq;
            child._gwBusy = (child._gwBusy || 0) + 1;
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('render timeout (10s)'));
            }, 10000);
            const onMsg = (m) => {
                if (!m || m.id !== id || m.kind !== 'map') return;
                cleanup();
                if (m.error) reject(new Error(m.error));
                else resolve(Buffer.from(m.png, 'base64'));
            };
            const cleanup = () => {
                clearTimeout(timeout);
                child.off('message', onMsg);
                child._gwBusy = Math.max(0, (child._gwBusy || 1) - 1);
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
        const plainDoc = typeof eventDoc.toObject === 'function' ? eventDoc.toObject({ depopulate: true }) : eventDoc;
        const plainPlayer = typeof player.toObject === 'function' ? player.toObject({ depopulate: true }) : player;
        return await _renderViaChild(plainDoc, plainPlayer, extras);
    } catch (e) {
        // OWNER QUEUE RULE (2026-10-08): memory/queue refusals are FINAL —
        // no in-process retry on a box that just said "no" (mirrors roomScene.js).
        if (e && (e.code === 'EMEM' || e.code === 'EQUEUEFULL')) throw e;
        return _renderInProcess(eventDoc, player, extras);
    }
}

module.exports = { renderRuinsMap, _renderInProcess, TYPE_GLYPH, TYPE_LABEL, PAL };
