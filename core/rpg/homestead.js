'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  HOMESTEAD — the joker base builder (isometric house builder)
//  Overhauled 2026-10-15 per owner spec "Isometric Furniture and Base
//  Building": §2 collision-safe placement, §3 select/move/rotate/moveto with
//  labelled grid preview, §4 atomic purchases (no lost money, no lost items,
//  no duplicate charges), §1 shadows live in isoShadow.js (renderer side).
// ═══════════════════════════════════════════════════════════════════════════
//  Commands (dispatched from engine.js, prefix-agnostic):
//    .home                          → OUTDOOR BASE MAP (delegates to baseBuilder)
//    .home house [#id]              → enter a house interior by structure id
//    .home catalog [page]           outfitter card pages
//    .home buy <name>               buy furniture / theme with ZENI (atomic)
//    .home place <name> [x y]       place owned furniture (auto-spot / auto-relocate)
//    .home select                  owned-furniture NAMES card (placed vs storage)
//    .home select <name>           select placed piece → grid preview (image);
//                                  owned-in-storage piece → placement mode (grid)
//    .home move <l|r|u|d> [n]       nudge the selection (screen directions)
//    .home moveto <x> <y>           send the selection to a coordinate
//    .home rotate                   turn the selection to its other facing
//    .home deselect                 clear the selection
//    .home store <x y> | .home store (uses selection)
//    .home themes / theme <id>      list / switch-buy room skins
//    .home visit @user              see someone else's room
//    .home help                     command overview
//
//  Geometry contract with homesteadRenderer.js (keep in sync):
//    grid N=12; footprint top-left tile (x,y); wall pieces use
//    x = wall tile index 1..N-2 and y = 0 (left wall) / 1 (right wall).
//    Rugs may overlap rugs; items may overlap nothing.
//  Persistence contract (§4): `owned` and `placed` hold INSTANCE objects
//    { id|item, uid, ... } so every write is a uid-precise $pull/$push —
//    concurrent buy + place on sibling instances can never clobber each
//    other (the old whole-array $set was the "bought items vanish" bug).
// ═══════════════════════════════════════════════════════════════════════════

const Homestead = require('../models/Homestead');
const renderer = require('./homesteadRenderer');
const economy = require('./economy');
const rooms = require('./homesteadRooms');

const N = renderer.N;
const CAT = renderer.catalog;

// starter layout for a brand-new homestead — humble but alive
const STARTER_PLACED = [
    { item: 'bed_bedroll', x: 2, y: 2 },
    { item: 'crate_old', x: 5, y: 2 },
    { item: 'chair_wood', x: 6, y: 4 },
];
const STARTER_OWNED = ['plant_flower'];

// ── per-user render locks (WhatsApp retries can double-fire) ──
const renderLocks = new Set();
// ── per-user mutation locks (serialize buy/place/store/move per player) ──
const opLocks = new Set();
// Task 24 (owner 06:30Z, "just que the shi"): a second action from the same
// user WAITS silently for the running one instead of bouncing with the
// "⏳ still settling" message. Same 30s fail-safe cap as baseBuilder.
const OP_WAIT_MAX_MS = 30000;
async function waitOpLock(jid) {
    const t0 = Date.now();
    while (opLocks.has(jid)) {
        if (Date.now() - t0 > OP_WAIT_MAX_MS) break;
        await new Promise((r) => setTimeout(r, 200));
    }
}
// ── purchase idempotency: message-id → expiry (WhatsApp redeliveries) ──
const seenMsgIds = new Map();
setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [k, ts] of seenMsgIds) if (ts < cutoff) seenMsgIds.delete(k);
}, 60 * 1000).unref();
// ── selection state (session-scoped): jid → placed uid ──
const selection = new Map();
// QoL (owner 21:34Z): selections hold 5 minutes of ACTIVITY, then expire —
// no more a stale `move` hours later teleporting a piece by accident. Rolling:
// every read that lands refreshes the clock. Lazy checks only, no timers.
const SEL_TTL_MS = 5 * 60 * 1000;
const selectionTs = new Map();
function selSet(jid, uid2) { cancelMovePreview(jid); selection.set(jid, uid2); selectionTs.set(jid, Date.now()); }
function selClear(jid) { cancelMovePreview(jid); selection.delete(jid); selectionTs.delete(jid); }
function selGet(jid) {
    const uid2 = selection.get(jid);
    if (!uid2) return null;
    if (Date.now() - (selectionTs.get(jid) || 0) > SEL_TTL_MS) {
        selection.delete(jid); selectionTs.delete(jid); cancelMovePreview(jid);
        return 'EXPIRED';
    }
    selectionTs.set(jid, Date.now());   // rolling re-arm
    return uid2;
}
// ── placement mode (§5 inventory flow): jid → owned item id awaiting placement ──
const pendingPlace = new Map();
// Explicit furniture picker mode: the next bare number/name selects an item.
// Session-scoped by sender and short-lived so normal chat is never hijacked.
const selectMode = new Map();
const SELECT_MODE_TTL_MS = 5 * 60 * 1000;
// ── BARE-MOVE previews (owner 21:34Z "just use right left or coords directly
// with a timer"): direct moves ack with TEXT instantly (no 10-25s bake per
// step) and the animated preview renders ONCE on a 2.5s idle timer — rapid
// `.home right right right` = three instant acks, one preview at the end.
const movePreviews = new Map();   // jid → { t, uid, fromX, fromY }
const MOVE_PREVIEW_IDLE_MS = 2500;
function cancelMovePreview(jid) {
    const m = movePreviews.get(jid);
    if (m) { try { clearTimeout(m.t); } catch (e) {} movePreviews.delete(jid); }
}
// ── shop session: jid → { ids, ts } — the last catalog page's item ids so
// `.home buy 3` buys the card wearing number 3 on the page you were shown
const lastShop = new Map();
setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, v] of lastShop) if (v.ts < cutoff) lastShop.delete(k);
}, 60 * 1000).unref();

// ── helpers ──
let _uidCounter = 0;
function uid() { return `${Date.now().toString(36)}${(_uidCounter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`; }

/** footprint of a placed piece after its rotation (odd quarter-turns swap fw/fh) */
function effDef(p, d) {
    const r = ((p && p.r) || 0) % 4;
    return (r % 2 === 1 && d.fw !== d.fh) ? { ...d, fw: d.fh, fh: d.fw } : d;
}

function cellsOf(x, y, def) {
    const out = [];
    for (let ix = 0; ix < def.fw; ix++)
        for (let iy = 0; iy < def.fh; iy++) out.push([x + ix, y + iy]);
    return out;
}

function overlaps(aCells, bCells) {
    for (const [ax, ay] of aCells)
        for (const [bx, by] of bCells) if (ax === bx && ay === by) return true;
    return false;
}

/** Can def be placed at (x,y)? ignoreUid lets moves skip the moved item. */
function canPlace(rec, x, y, def, ignoreUid = null, lvl = 0) {
    if (def.layer === 'wall') {
        if (!Number.isInteger(x) || x < 1 || x > N - 2) return false;
        if (y !== 0 && y !== 1) return false;
        return !rec.placed.some((p) =>
            p.uid !== ignoreUid &&
            (renderer.itemDef(p.item) || {}).layer === 'wall' &&
            p.x === x && p.y === y);
    }
    if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (!rooms.footprintValid(rec, x, y, def, lvl)) return false;
    const cells = cellsOf(x, y, def);
    for (const p of rec.placed) {
        if (p.uid === ignoreUid) continue;
        if ((p.lvl || 0) !== lvl) continue;
        const d = renderer.itemDef(p.item);
        if (!d || d.layer === 'wall') continue;
        if (def.layer === 'rug' && d.layer === 'rug') continue; // rugs stack on rugs
        if (overlaps(cells, cellsOf(p.x, p.y, effDef(p, d)))) return false;
    }
    return true;
}

/** First free spot for def, spiralling out from the room centre. */
function findFreeSpot(rec, def, lvl = 0) {
    const mid = (lvl === 1 ? 3 : Math.floor(N / 2)) - Math.floor(def.fw / 2);
    for (let ring = 0; ring < 20; ring++) {
        for (let y = mid - ring; y <= mid + ring; y++) {
            for (let x = mid - ring; x <= mid + ring; x++) {
                const onRing = (x === mid - ring || x === mid + ring || y === mid - ring || y === mid + ring);
                if (!onRing) continue;
                if (canPlace(rec, x, y, def, null, lvl)) return { x, y };
            }
        }
    }
    return null;
}

/** §2: nearest free spot spiralling around a REQUESTED position. */
function findFreeNear(rec, def, rx, ry, ignoreUid = null, lvl = 0) {
    if (canPlace(rec, rx, ry, def, ignoreUid, lvl)) return { x: rx, y: ry };
    for (let ring = 1; ring < N * 3; ring++) {
        // try candidates on this ring ordered by distance from the request
        const cands = [];
        for (let dy = -ring; dy <= ring; dy++) {
            for (let dx = -ring; dx <= ring; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
                cands.push([rx + dx, ry + dy, dx * dx + dy * dy]);
            }
        }
        cands.sort((a, b) => a[2] - b[2]);
        for (const [x, y] of cands) {
            if (canPlace(rec, x, y, def, ignoreUid, lvl)) return { x, y };
        }
    }
    return null;
}

/** Resolve "noble bed" / "bed_noble" / "bed" → item def (unique prefix match). */
function resolveItem(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return null;
    const items = CAT().items;
    let hit = items.find((it) => it.id === q);
    if (hit) return hit;
    hit = items.find((it) => it.name.toLowerCase() === q);
    if (hit) return hit;
    const starts = items.filter((it) => it.id.startsWith(q) || it.name.toLowerCase().startsWith(q));
    if (starts.length === 1) return starts[0];
    const incl = items.filter((it) => it.id.includes(q) || it.name.toLowerCase().includes(q));
    return incl.length === 1 ? incl[0] : null;
}

function normalizeJid(j) {
    return String(j || '').split(':')[0].split('?')[0];
}

/** §4: `owned` holds instance objects now — backfill legacy string docs. */
function migrateRec(rec) {
    let dirty = false;
    const owned = [];
    for (const o of rec.owned || []) {
        if (typeof o === 'string') { owned.push({ id: o, uid: uid() }); dirty = true; }
        else if (o && o.id) owned.push(o);
        else dirty = true;
    }
    const placed = [];
    for (const p of rec.placed || []) {
        if (!p.uid) { placed.push({ ...p, uid: uid() }); dirty = true; }
        else placed.push(p);
    }
    rec.owned = owned;
    rec.placed = placed;
    return dirty;
}

async function loadRec(userId) {
    let rec = await Homestead.findOne({ userId }).lean();
    if (!rec) {
        // first open: seed the starter homestead (uid-stamped instances)
        let doc = await Homestead.findOneAndUpdate(
            { userId },
            { $setOnInsert: { userId, theme: 'oakhaven', themesOwned: ['oakhaven'], owned: STARTER_OWNED.map((id) => ({ id, uid: uid() })), placed: STARTER_PLACED.map((p) => ({ ...p, uid: uid() })) } },
            { upsert: true, returnDocument: 'after' },
        ).lean();
        if (!doc || !doc.placed) doc = await Homestead.findOne({ userId }).lean();
        rec = doc;
    }
    if (!rec) throw new Error('homestead record could not be created — try again');
    rec.owned = rec.owned || [];
    rec.placed = rec.placed || [];
    const dirty = migrateRec(rec);
    rec.placed = rec.placed.filter((p) => renderer.itemDef(p.item));
    rec.owned = rec.owned.filter((o) => renderer.itemDef(o.id));
    rec.themesOwned = (rec.themesOwned || []).filter((t) => renderer.THEMES[t]);
    if (dirty) {
        await Homestead.updateOne(
            { userId },
            { $set: { owned: rec.owned, placed: rec.placed, updatedAt: Date.now() } },
            { upsert: true },
        ).catch(() => {});
    }
    return rec;
}

async function savePlaced(userId, placed, extra = {}) {
    const comfort = placed.reduce((s, p) => s + ((renderer.itemDef(p.item) || {}).comfort || 0), 0);
    await Homestead.updateOne(
        { userId },
        { $set: { placed, comfort, updatedAt: Date.now(), ...extra } },
        { upsert: true },
    );
}

// ── formatting ──
const RARITY_STAR = { common: '⚪', uncommon: '🟢', rare: '🔵', epic: '🟣', legendary: '🟠' };
function itemName(it) { return `${RARITY_STAR[it.rarity] || '⚪'} *${it.name}*`; }

function gridOptsFor(p, def, valid = true) {
    const e = effDef(p, def);
    return {
        grid: {
            x: p.x, y: p.y, fw: e.fw, fh: e.fh, valid, lvl: p.lvl || 0,
            label: `${def.name} (${p.x},${p.y})${p.lvl ? ' ↑ loft' : ''}`,
        },
        // v5: the selected piece itself renders GLOWING and visible THROUGH
        // walls (owner 2026-10-24 21:00Z) — sprite pass over the room raster
        hl: { item: p.item, x: p.x, y: p.y, r: p.r, f: p.f, lvl: p.lvl || 0, valid },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMMANDS
// ═══════════════════════════════════════════════════════════════════════════
async function viewRoom(ctx, rec, opts = {}) {
    const { sock, chatId, reply } = ctx;
    if (renderLocks.has(rec.userId)) {
        console.log(`[homestead] render lock held for ${rec.userId} — replying ⏳`);
        return reply('⏳ Your homestead portrait is still being painted — one moment, try again in a few seconds.');
    }
    renderLocks.add(rec.userId);
    console.log(`[homestead] render start for ${rec.userId} (${rec.placed.length} placed, theme=${rec.theme})`);
    try {
        try {
            if (ctx.m?.key) await sock.sendMessage(chatId, { react: { text: '🎨', key: ctx.m.key } });
        } catch (e) { /* react is best-effort */ }
        const state = {
            owner: opts.ownerName || economy.getDisplayName(rec.userId),
            theme: rec.theme,
            placed: rec.placed,
            annex: rec.annex || [],
            upper: !!rec.upper,
            upperWalls: !!rec.upperWalls,
            style: rec.style || 'default',
        };
        // render watchdog: a hung render must never ghost the command
        let media;
        try {
            let watchdogTimer;
            media = await Promise.race([
                // static:true = the plain "regular house view" as a single PNG
                // (owner nitpick 2026-10-24 21:29Z: `.j base 1` doesn't need the
                // animated mp4 bake) — animated stays the default everywhere else.
                renderer.renderRoomImage(state, { pop: opts.pop || null, hint: opts.hint, grid: opts.grid || null, hl: opts.hl || null, static: opts.static === true }),
                new Promise((_, reject) => {
                    watchdogTimer = setTimeout(() => reject(new Error('render watchdog: room render exceeded 90s')), 90000);
                    if (watchdogTimer.unref) watchdogTimer.unref();
                }),
            ]);
            if (watchdogTimer) clearTimeout(watchdogTimer);
        } catch (renderErr) {
            console.error('[homestead] render failed/stalled:', renderErr.message);
            return reply(`🔥 The painter fell asleep at the easel (render stalled). Try \`${ctx.prefix} home\` once more in a minute.`);
        }
        console.log(`[homestead] render done (${media.contentType}, ${media.buffer ? media.buffer.length : 0} bytes) — sending`);
        try {
            if (ctx.m?.key) await sock.sendMessage(chatId, { react: { text: '✅', key: ctx.m.key } });
        } catch (e) { /* best-effort */ }
        const comfort = rec.placed.reduce((s, p) => s + ((renderer.itemDef(p.item) || {}).comfort || 0), 0);
        const theme = renderer.THEMES[rec.theme] || renderer.THEMES.oakhaven;
        const cap = `🏠 *${state.owner}'s Homestead* — ${theme.name}\n\n` +
            `♥ Comfort *${comfort}*  •  🪑 ${rec.placed.length} pieces placed  •  📦 ${rec.owned.length} in storage\n` +
            (opts.pop ? `✨ The *${(renderer.itemDef(opts.pop.item) || {}).name}* was placed!\n` : '') +
            (opts.grid ? `🎯 Selected: *${opts.grid.label}*\n_${ctx.prefix} home move <left|right|up|down> [n] • ${ctx.prefix} home moveto <x> <y> • ${ctx.prefix} home rotate_\n` : '') +
            `\n_${opts.hint || `${ctx.prefix} home place <item> • ${ctx.prefix} home catalog • ${ctx.prefix} home help`}_`;
        try {
            if (media.contentType === 'video/mp4') {
                await sock.sendMessage(chatId, { video: media.buffer, gifPlayback: true, caption: cap }, { quoted: ctx.m });
            } else {
                await sock.sendMessage(chatId, { image: media.buffer, caption: cap }, { quoted: ctx.m });
            }
        } catch (sendErr) {
            console.error('[homestead] media send failed:', sendErr.message);
            return reply(`🏠 The portrait is painted but WhatsApp refused delivery (${String(sendErr.message).slice(0, 60)}). Try again shortly.`);
        }
    } finally {
        renderLocks.delete(rec.userId);
        console.log(`[homestead] render lock released for ${rec.userId}`);
    }
}

async function cmdCatalog(ctx, rec, args) {
    const items = CAT().items;
    const balance = economy.getBalance(ctx.senderJid);
    const houseLv = await houseLevel(ctx.senderJid);
    // search mode: `.home catalog <word>` — a non-numeric first arg filters the
    // shop by name/id (renderer draws the term in the header, architect page off)
    const term = args.length && !/^\d+$/.test(args[0]) ? args.join(' ').trim().toLowerCase().slice(0, 40) : '';
    if (term) {
        const needle = term.replace(/\s+/g, '_');
        const hits = items.filter((it) => it.name.toLowerCase().includes(term) || it.id.includes(needle));
        if (!hits.length) {
            const sug = items.filter((it) => it.id.includes(term.slice(0, 4).replace(/\s+/g, '_'))).slice(0, 4).map((x) => x.name);
            return ctx.reply(`🔍 Nothing matching *${term}* in the outfitter.\n` +
                (sug.length ? `Closest: ${sug.join(', ')}\n` : '') +
                `Full shop: \`${ctx.prefix} home catalog\``);
        }
        const pages = Math.max(1, Math.ceil(hits.length / 12));
        let page = args.map((a) => parseInt(a, 10)).find((n) => Number.isFinite(n) && n >= 1) || 1;
        if (page > pages) page = pages;
        const buf = await renderer.renderCatalogPage(page - 1, pages, { balance, houseLv, items: hits, searchTerm: term });
        const slice = hits.slice((page - 1) * 12, page * 12);
        lastShop.set(ctx.senderJid, { ids: slice.map((it) => it.id), ts: Date.now() });
        const list = slice.map((it, i) => `${i + 1}. ${it.name} — ◆${it.price.toLocaleString()}${houseLv < rooms.itemMinHouse(it) ? ' 🔒' : ''}`).join('\n');
        return ctx.sock.sendMessage(ctx.chatId, {
            image: buf,
            caption: `🔍 *Outfitter:* "${term}" — ${hits.length} match${hits.length === 1 ? '' : 'es'} (page ${page}/${pages})\n💰 Your purse: *${Number(balance).toLocaleString()} ZENI*\n\n` +
                `${list}\n\n` +
                `_${ctx.prefix} home buy <number|name> — buy it • ${ctx.prefix} home catalog — full shop_`,
        }, { quoted: ctx.m });
    }
    const pages = Math.max(1, Math.ceil(items.length / 12)) + 1;   // +1 = architect page
    let page = parseInt(args[0], 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > pages) page = pages;
    const buf = await renderer.renderCatalogPage(page - 1, pages, { balance, houseLv });
    let cap;
    if (page === pages) {
        // architect page — no numbered cards, no shop session
        cap = `🏗️ *The Architect* — page ${page}/${pages}\n💰 Your purse: *${Number(balance).toLocaleString()} ZENI*\n\n` +
            `_Expand with \`${ctx.prefix} home rooms\` — annexes, loft, second-floor walls_`;
    } else {
        // names in the caption too (owner 21:34Z) + shop session for buy-by-number
        const slice = items.slice((page - 1) * 12, page * 12);
        lastShop.set(ctx.senderJid, { ids: slice.map((it) => it.id), ts: Date.now() });
        const list = slice.map((it, i) => `${i + 1}. ${it.name} — ◆${it.price.toLocaleString()}${houseLv < rooms.itemMinHouse(it) ? ' 🔒' : ''}`).join('\n');
        cap = `🛒 *Homestead Outfitter* — page ${page}/${pages} — 🏠 House Lv.${houseLv}\n💰 Your purse: *${Number(balance).toLocaleString()} ZENI*\n\n` +
            `${list}\n\n` +
            `_${ctx.prefix} home buy <number|name> — buy it • ${ctx.prefix} home catalog ${page < pages - 1 ? page + 1 : 1} — turn the page_`;
    }
    await ctx.sock.sendMessage(ctx.chatId, {
        image: buf,
        caption: cap,
    }, { quoted: ctx.m });
}

// ── §4 ATOMIC BUY: dedupe → per-user lock → conditional debit → item push →
//    refund compensation on any failure. Money and item can never diverge.
async function cmdBuy(ctx, rec, args) {
    let query = args.join(' ');
    // buy-by-number (owner 21:34Z): numbers buy the numbered card off your LAST
    // shop page — `.home catalog bed` then `.home buy 3`
    const shopSes = lastShop.get(ctx.senderJid);
    if (/^\d+$/.test(query) && shopSes && Date.now() - shopSes.ts < 10 * 60 * 1000) {
        const id = shopSes.ids[parseInt(query, 10) - 1];
        if (!id) return ctx.reply(`❌ That shop page only shows ${shopSes.ids.length} items — no number ${query}.\nBrowse: \`${ctx.prefix} home catalog\``);
        query = id;
    }
    const it = resolveItem(query);
    if (!it) {
        const sug = CAT().items.filter((x) => x.id.includes(query.slice(0, 4))).slice(0, 4).map((x) => x.name);
        const numHint = /^\d+$/.test(query) ? `\nNumbers buy off your last shop page — browse \`${ctx.prefix} home catalog\` first.` : '';
        return ctx.reply(`❌ No furniture called *${query || '—'}*.\n` +
            (sug.length ? `Did you mean: ${sug.join(', ')}?\n` : '') + numHint +
            `Browse: \`${ctx.prefix} home catalog\``);
    }

    // house-level gate: a better house opens more of the shop
    const hl = await houseLevel(ctx.senderJid);
    const need = rooms.itemMinHouse(it);
    if (hl < need) {
        return ctx.reply(`🔒 *${it.name}* is stocked for a *${rooms.HOUSE_NAMES[need]}* (house Lv.${need}) and up.\nYour house is Lv.${hl} — \`${ctx.prefix} base upgrade house\` to unlock more of the shop.`);
    }

    // WhatsApp redelivery / double-tap guard (same message id = same purchase)
    const msgKey = `${ctx.senderJid}|${ctx.m?.key?.id || ''}`;
    if (ctx.m?.key?.id) {
        if (seenMsgIds.has(msgKey)) return ctx.reply(`♻️ That purchase already went through — *${it.name}* is in your storage.`);
        seenMsgIds.set(msgKey, Date.now());
    }
    await waitOpLock(ctx.senderJid);
    opLocks.add(ctx.senderJid);
    try {
        const balance = economy.getBalance(ctx.senderJid);
        if (balance < it.price) {
            return ctx.reply(`💰 Not enough ZENI — *${it.name}* costs *${it.price.toLocaleString()}* and you have *${balance.toLocaleString()}*.\n_Earn more by hunting, quests and games._`);
        }
        // 1. conditional debit (economy.removeMoney re-checks the wallet synchronously)
        if (!economy.removeMoney(ctx.senderJid, it.price, `Homestead: bought ${it.name}`)) {
            return ctx.reply(`💰 Not enough ZENI — *${it.name}* costs *${it.price.toLocaleString()}* and you have *${balance.toLocaleString()}*.`);
        }
        // 2. deliver the item (single atomic $push of ONE instance)
        try {
            const inst = { id: it.id, uid: uid() };
            const r = await Homestead.updateOne(
                { userId: ctx.senderJid },
                { $push: { owned: inst }, $set: { updatedAt: Date.now() } },
                { upsert: true },
            );
            if (!r.acknowledged) throw new Error('write not acknowledged');
        } catch (writeErr) {
            // 3. compensate: money back before reporting failure
            console.error('[homestead] buy delivery failed — refunding:', writeErr.message);
            economy.addMoney(ctx.senderJid, it.price, `Homestead: refund ${it.name}`);
            return ctx.reply(`🔥 The outfitter dropped your ZENI back on the counter (storage write failed). Nothing was lost — try again.`);
        }
        return ctx.reply(`${RARITY_STAR[it.rarity]} Bought *${it.name}* for *${it.price.toLocaleString()}* ZENI!\n\nPlace it: \`${ctx.prefix} home place ${it.id}\``);
    } finally {
        opLocks.delete(ctx.senderJid);
    }
}

async function cmdPlace(ctx, rec, args) {
    const query = args[0];
    const it = resolveItem(query);
    if (!it) return ctx.reply(`❌ Place what? Try: \`${ctx.prefix} home place bed_noble\` — owned pieces: ${rec.owned.length ? rec.owned.map((o) => o.id).join(', ') : '_none, visit the catalog_'} `);
    const inst = rec.owned.find((o) => o.id === it.id);
    if (!inst) {
        return ctx.reply(`📦 You don't own *${it.name}* yet.\nBuy it: \`${ctx.prefix} home buy ${it.id}\` (${it.price.toLocaleString()} ZENI)`);
    }

    let x, y, relocated = null;
    if (it.layer === 'wall') {
        x = Number.isInteger(parseInt(args[1], 10)) ? parseInt(args[1], 10) : 4;
        const side = String(args[2] || '').toLowerCase();
        y = side.startsWith('r') ? 1 : 0;
        if (!canPlace(rec, x, y, it)) return ctx.reply('🚧 That banner slot is taken. Pick another wall index (1-10).');
    } else if (Number.isFinite(parseInt(args[1], 10)) && Number.isFinite(parseInt(args[2], 10))) {
        let rx = parseInt(args[1], 10); let ry = parseInt(args[2], 10);
        // OFF-GRID CLAMP LAW (owner 2026-10-16 21:23Z "if the player goes off
        // the grid"): snap the request into room bounds BEFORE the nearest-free
        // spiral — an off-map coordinate settles flush at the nearest edge, and
        // an overhanging 2x2 pulls inboard to sit flush, never an error.
        const cl0 = rooms.clampTo(rec, rx, ry, it, 0);
        const clx = cl0.x, cly = cl0.y;
        // §2: requested spot blocked → nearest fitting spot around it, never a rejection
        const spot = findFreeNear(rec, it, clx, cly);
        if (!spot) return ctx.reply('🏠 Nowhere in the room fits that piece right now — store something first: `.home store <x> <y>`');
        if (spot.x !== rx || spot.y !== ry) relocated = spot;
        x = spot.x; y = spot.y;
    } else {
        const spot = findFreeSpot(rec, it);
        if (!spot) return ctx.reply('🏠 Your room is full! Store something first: `.home store <x> <y>`');
        x = spot.x; y = spot.y;
    }

    const placedInst = { item: it.id, x, y, uid: inst.uid || uid(), ...(it.layer === 'item' && { f: false }) };
    // §4: uid-precise atomic swap — pull ONE owned instance, push ONE placed
    await Homestead.updateOne(
        { userId: ctx.senderJid },
        { $pull: { owned: { uid: inst.uid } }, $push: { placed: placedInst }, $set: { updatedAt: Date.now() } },
        { upsert: true },
    );
    rec.owned = rec.owned.filter((o) => o.uid !== inst.uid);
    rec.placed = [...rec.placed, placedInst];
    if (pendingPlace.get(ctx.senderJid) === it.id) pendingPlace.delete(ctx.senderJid); // §5 placement mode satisfied
    const opts = { pop: { item: it.id, x, y } };
    if (relocated) opts.hint = `(${args[1]},${args[2]}) was blocked or off the grid — the *${it.name}* settled at (${x},${y}) instead.`;
    await viewRoom(ctx, { ...rec }, opts);
}

async function cmdSelect(ctx, rec, args) {
    const query = args.join(' ');
    if (!query) {
        if (!rec.owned.length && !rec.placed.length) {
            selectMode.delete(ctx.senderJid);
            return cmdInventory(ctx, rec);
        }
        selectMode.set(ctx.senderJid, Date.now());
        return cmdInventory(ctx, rec);
    }
    // Numbered law (one numbering with the furniture card — renderer
    // inventoryRows): `.home select 7` picks the piece wearing number 7.
    // Placed rows select, storage rows arm placement. Paging the card itself
    // lives at `.home inv <page>` now.
    if (/^\d+$/.test(query)) {
        const rows = renderer.inventoryRows(rec);
        const row = rows[parseInt(query, 10) - 1];
        if (!row || !row.d || !row.d.id) {
            return ctx.reply(`❌ No piece #${query} — you own ${rows.length} piece${rows.length === 1 ? '' : 's'}. \`${ctx.prefix} home select\` lists them with their numbers.`);
        }
        selectMode.delete(ctx.senderJid);
        if (!row.placed) {
            // storage row → placement mode (same flow as select-by-name on storage)
            const it = row.d;
            pendingPlace.set(ctx.senderJid, it.id);
            selClear(ctx.senderJid);
            const spot = findFreeSpot(rec, it);
            const grid = spot ? { x: spot.x, y: spot.y, fw: it.fw, fh: it.fh, valid: true, label: `${it.name} → (${spot.x},${spot.y})` } : null;
            return viewRoom(ctx, rec, { grid, hint: `Placement mode — *${it.name}* (in storage). Confirm: \`${ctx.prefix} home place ${it.id} <x> <y>\`${spot ? ` (suggested spot ${spot.x},${spot.y})` : ''} • Cancel: \`${ctx.prefix} home deselect\`.` });
        }
        const pp = rec.placed.find((q) => q.uid === row.uid);
        if (!pp) return ctx.reply('🕯️ That selection is gone — pick another piece.');
        selSet(ctx.senderJid, pp.uid);
        pendingPlace.delete(ctx.senderJid);
        // wall pieces live on wall slots (y = side index, not a floor row) —
        // select them without the floor footprint grid
        if (row.d.layer === 'wall') {
            return viewRoom(ctx, rec, { hint: `Selected the *${row.d.name}* (wall slot ${pp.x}) — \`${ctx.prefix} home store\` takes it down.` });
        }
        return viewRoom(ctx, rec, { ...gridOptsFor(pp, row.d), hint: `Selected the *${row.d.name}*. Move it with \`${ctx.prefix} home move <left|right|up|down>\`` });
    }
    const it = resolveItem(query);
    if (!it) return ctx.reply(`❌ Nothing called *${query}*. Browse every piece you own: \`${ctx.prefix} home select\`.`);
    const cand = rec.placed.filter((p) => p.item === it.id && (renderer.itemDef(p.item) || {}).layer !== 'wall');
    if (!cand.length) {
        if (rec.owned.some((o) => o.id === it.id)) {
            // §5: owned-but-unplaced → PLACEMENT MODE (grid preview + suggested spot)
            pendingPlace.set(ctx.senderJid, it.id);
            selectMode.delete(ctx.senderJid);
            selClear(ctx.senderJid);
            const spot = findFreeSpot(rec, it);
            const grid = spot ? { x: spot.x, y: spot.y, fw: it.fw, fh: it.fh, valid: true, label: `${it.name} → (${spot.x},${spot.y})` } : null;
            return viewRoom(ctx, rec, { grid, hint: `Placement mode — *${it.name}* (in storage). Confirm: \`${ctx.prefix} home place ${it.id} <x> <y>\`${spot ? ` (suggested spot ${spot.x},${spot.y})` : ''} • Cancel: \`${ctx.prefix} home deselect\`.` });
        }
        return ctx.reply(`❌ You don't own a *${it.name}*. Your furniture: \`${ctx.prefix} home select\` • Shop: \`${ctx.prefix} home catalog\`.`);
    }
    const p = cand[0];
    selectMode.delete(ctx.senderJid);
    selSet(ctx.senderJid, p.uid);
    pendingPlace.delete(ctx.senderJid);
    await viewRoom(ctx, rec, { ...gridOptsFor(p, it), hint: `Selected the *${it.name}*. Move it with \`${ctx.prefix} home move <left|right|up|down>\`` });
}

// §5: readable names card — every owned piece, placed vs storage (pagination)
async function cmdInventory(ctx, rec, page) {
    if (!rec.owned.length && !rec.placed.length) {
        return ctx.reply(`📦 You own no furniture yet.\nBrowse: \`${ctx.prefix} home catalog\` — then \`${ctx.prefix} home buy <name>\`.`);
    }
    const buf = await renderer.renderInventoryCard(rec, { prefix: ctx.prefix, page });
    // names in the caption too (owner 21:34Z) — the card's current page, with
    // the SAME numbers and space tags the card draws
    const rows = renderer.inventoryRows(rec);
    const per = renderer.INV_ROWS_PER_PAGE || 12;
    const totalPages = Math.max(1, Math.ceil(rows.length / per));
    let pg = parseInt(page, 10);
    if (!Number.isFinite(pg) || pg < 1) pg = 1;
    if (pg > totalPages) pg = totalPages;
    const slice = rows.slice((pg - 1) * per, pg * per);
    const list = slice.map((r) => `#${r.n} ${r.d.name || r.d.id}${r.placed ? ` — ${r.status}` : ' — 📦 storage'}`).join('\n');
    const selectHint = selectMode.has(ctx.senderJid)
        ? `\n\n🟡 *Select mode is on.* Reply with the item's number or name. Type \`cancel\` to exit.`
        : '';
    const cap = `🪑 *Your Furniture* — page ${pg}/${totalPages} — 📍 ${rec.placed.length} placed • 📦 ${rec.owned.length} in storage\n\n` +
        `${list}${selectHint}\n\n` +
        `_${ctx.prefix} home select <number|name> — select it • ${ctx.prefix} home remove <numbers> — pick up (2-5 works)_\n` +
        `_${ctx.prefix} home right/left/up/down — steer it • ${ctx.prefix} home to loft/east/… — hop spaces_` +
        (pg < totalPages ? `\n_${ctx.prefix} home inv ${pg + 1} — next page_` : '');
    await ctx.sock.sendMessage(ctx.chatId, { image: buf, caption: cap }, { quoted: ctx.m });
}

/** Step-walk the selection `steps` tiles in `dir`, stopping at the last legal
 *  cell (leap-frogs a 1-cell obstacle/partition once so pieces can cross into
 *  an annex). Shared by the classic `move` and the bare fast path. */
function stepWalk(rec, p, d, dir, steps) {
    let nx = p.x, ny = p.y, moved = 0;
    for (let i = 0; i < steps; i++) {
        const tx = nx + dir[0], ty = ny + dir[1];
        if (!canPlace(rec, tx, ty, effDef(p, d), p.uid, p.lvl || 0)) {
            // leap a 1-cell obstacle/partition once so pieces can cross into an annex
            const jx = tx + dir[0], jy = ty + dir[1];
            if (steps > 1 && canPlace(rec, jx, jy, effDef(p, d), p.uid, p.lvl || 0) && i + 1 < steps) { nx = jx; ny = jy; moved++; i++; continue; }
            break;
        }
        nx = tx; ny = ty; moved++;
    }
    return { nx, ny, moved };
}

/** Screen-direction nudge for the selection (§3): right/left = ±X, up/down = ∓Y. */
async function cmdMove(ctx, rec, args) {
    const selUid = selGet(ctx.senderJid);
    if (selUid === 'EXPIRED') return ctx.reply(`⏱️ Selection expired (holds 5 min) — pick the piece again: \`${ctx.prefix} home select <number|name>\`.`);
    if (!selUid) return ctx.reply(`Select a piece first: \`${ctx.prefix} home select <name>\` — or \`${ctx.prefix} home move\` after a preview.`);
    const idx = rec.placed.findIndex((p) => p.uid === selUid);
    if (idx === -1) { selection.delete(ctx.senderJid); return ctx.reply('🕯️ That selection is gone — pick another piece.'); }
    const p = rec.placed[idx];
    const d = renderer.itemDef(p.item);
    const dirRaw = String(args[0] || '').toLowerCase().replace(/[^a-z]/g, '');
    const DIRS = { right: [1, 0], r: [1, 0], east: [1, 0], left: [-1, 0], l: [-1, 0], west: [-1, 0], down: [0, 1], d: [0, 1], south: [0, 1], up: [0, -1], u: [0, -1], north: [0, -1],
        // screen diagonals (iso): up-right = along the back-right wall etc.
        upright: [1, -1], ur: [1, -1], upleft: [-1, -1], ul: [-1, -1], downright: [1, 1], dr: [1, 1], downleft: [-1, 1], dl: [-1, 1] };
    const dir = DIRS[dirRaw];
    if (!dir) {
        return ctx.reply(`Usage: \`${ctx.prefix} home move <left|right|up|down> [steps]\`\n_(right = +X, left = −X, down = +Y, up = −Y — the labelled axes on the preview)_`);
    }
    let steps = parseInt(args[1], 10);
    if (!Number.isFinite(steps) || steps < 1) steps = 1;
    if (steps > 17) steps = 17;

    if (d.layer === 'wall') return ctx.reply(`🖼️ *${d.name}* hangs on the wall — move it with \`${ctx.prefix} home place ${p.item} <slot 1-10> <left|right>\`.`);

    const { nx, ny, moved } = stepWalk(rec, p, d, dir, steps);
    if (!moved) return ctx.reply(`🚧 *${d.name}* is blocked that way — it stays at (${p.x},${p.y}).`);
    const fx = p.x, fy = p.y;
    await Homestead.updateOne(
        { userId: ctx.senderJid, 'placed.uid': p.uid },
        { $set: { 'placed.$.x': nx, 'placed.$.y': ny, updatedAt: Date.now() } },
    );
    p.x = nx; p.y = ny;
    rec.placed[idx] = p;
    // slide animation: pop carries the origin cell so the renderer plays the
    // locomotion (owner 2026-10-16 "moving doesn't trigger an animation")
    await viewRoom(ctx, rec, { ...gridOptsFor(p, d), pop: { item: p.item, x: nx, y: ny, from: { x: fx, y: fy } }, hint: moved < steps ? `Stopped after ${moved} step${moved > 1 ? 's' : ''} (blocked).` : null });
}

async function cmdMoveTo(ctx, rec, args) {
    const selUid = selGet(ctx.senderJid);
    if (selUid === 'EXPIRED') return ctx.reply(`⏱️ Selection expired (holds 5 min) — pick the piece again: \`${ctx.prefix} home select <number|name>\`.`);
    if (!selUid) return ctx.reply(`Select a piece first: \`${ctx.prefix} home select <name>\`.`);
    const p = rec.placed.find((q) => q.uid === selUid);
    if (!p) { selection.delete(ctx.senderJid); return ctx.reply('🕯️ That selection is gone — pick another piece.'); }
    const d = renderer.itemDef(p.item);
    if (d.layer === 'wall') return ctx.reply(`🖼️ Wall pieces move by slot: \`${ctx.prefix} home place ${p.item} <slot 1-10> <left|right>\`.`);
    const tx = parseInt(args[0], 10), ty = parseInt(args[1], 10);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
        return ctx.reply(`Usage: \`${ctx.prefix} home moveto <x> <y>\` — e.g. \`${ctx.prefix} home moveto 5 7\``);
    }
    // OFF-GRID CLAMP LAW (owner 2026-10-16 21:23Z "if the player goes off the
    // grid"): a request past the bounds snaps to the nearest legal cell INSIDE
    // the grid before the free-spot spiral — moveto 99 99 parks the piece at
    // the south edge, moveto -3 5 at the west edge, and a double-grid piece
    // pulled flush instead of overhanging. The spiral then only has to dodge
    // occupied tiles, so it can never dead-end off the map.
    const cl1 = rooms.clampTo(rec, tx, ty, effDef(p, d), p.lvl || 0);
    const clx = cl1.x, cly = cl1.y;
    const clamped = (clx !== tx || cly !== ty);
    const spot = findFreeNear(rec, effDef(p, d), clx, cly, p.uid, p.lvl || 0);
    if (!spot) return ctx.reply('🏠 Nowhere in the room fits it right now — free some space first.');
    const fx0 = p.x, fy0 = p.y;
    await Homestead.updateOne(
        { userId: ctx.senderJid, 'placed.uid': p.uid },
        { $set: { 'placed.$.x': spot.x, 'placed.$.y': spot.y, updatedAt: Date.now() } },
    );
    p.x = spot.x; p.y = spot.y;
    const hint = clamped
        ? `(${tx},${ty}) is off the grid — *${d.name}* settled at the nearest legal spot (${spot.x},${spot.y}).`
        : ((spot.x !== clx || spot.y !== cly) ? `(${tx},${ty}) was blocked — *${d.name}* settled at (${spot.x},${spot.y}).` : null);
    await viewRoom(ctx, rec, { ...gridOptsFor(p, d), pop: { item: p.item, x: spot.x, y: spot.y, from: { x: fx0, y: fy0 } }, hint });
}

// ── BARE MOVEMENT fast paths (owner 21:34Z "just use right left or coords
// directly with a timer"): instant text acks — the animated preview renders
// ONCE when steering pauses for 2.5s. DB writes stay per-move atomic.
function armMovePreview(ctx, uid2, from) {
    const prev = movePreviews.get(ctx.senderJid);
    const keepFrom = (prev && prev.uid === uid2) ? { x: prev.fromX, y: prev.fromY } : from;
    cancelMovePreview(ctx.senderJid);
    const t = setTimeout(async () => {
        movePreviews.delete(ctx.senderJid);
        try {
            const rec2 = await loadRec(ctx.senderJid);
            const p2 = rec2.placed.find((q) => q.uid === uid2);
            if (!p2) return;
            const d2 = renderer.itemDef(p2.item);
            if (!d2) return;
            await viewRoom(ctx, rec2, { ...gridOptsFor(p2, d2), pop: { item: p2.item, x: p2.x, y: p2.y, from: keepFrom } });
        } catch (e) { console.error('[homestead] move preview failed:', e.message); }
    }, MOVE_PREVIEW_IDLE_MS);
    if (t.unref) t.unref();
    movePreviews.set(ctx.senderJid, { t, uid: uid2, fromX: keepFrom.x, fromY: keepFrom.y });
}

const DIRS_FAST = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1], upright: [1, -1], upleft: [-1, -1], downright: [1, 1], downleft: [-1, 1] };

async function cmdMoveFast(ctx, rec, dirWord, args) {
    const selUid = selGet(ctx.senderJid);
    if (selUid === 'EXPIRED') return ctx.reply(`⏱️ Selection expired (holds 5 min) — pick the piece again: \`${ctx.prefix} home select <number|name>\`.`);
    if (!selUid) return ctx.reply(`Select a piece first: \`${ctx.prefix} home select <number|name>\` — then just type \`${ctx.prefix} home right\`.`);
    const p = rec.placed.find((q) => q.uid === selUid);
    if (!p) { selClear(ctx.senderJid); return ctx.reply('🕯️ That selection is gone — pick another piece.'); }
    const d = renderer.itemDef(p.item);
    if (d.layer === 'wall') return ctx.reply(`🖼️ *${d.name}* hangs on the wall — move it with \`${ctx.prefix} home place ${p.item} <slot 1-10> <left|right>\`.`);
    let steps = parseInt(args[0], 10);
    if (!Number.isFinite(steps) || steps < 1) steps = 1;
    if (steps > 17) steps = 17;
    const { nx, ny, moved } = stepWalk(rec, p, d, DIRS_FAST[dirWord], steps);
    if (!moved) return ctx.reply(`🚧 *${d.name}* is blocked that way — it stays at (${p.x},${p.y}).`);
    const from = { x: p.x, y: p.y };
    await Homestead.updateOne(
        { userId: ctx.senderJid, 'placed.uid': p.uid },
        { $set: { 'placed.$.x': nx, 'placed.$.y': ny, updatedAt: Date.now() } },
    );
    p.x = nx; p.y = ny;
    armMovePreview(ctx, p.uid, from);
    const burst = movePreviews.get(ctx.senderJid);
    const first = burst && burst.fromX === from.x && burst.fromY === from.y;
    return ctx.reply(`➡️ (${nx},${ny})${moved < steps ? ` — stopped after ${moved} step${moved > 1 ? 's' : ''} (blocked)` : ''}${first ? `\n_⏱️ preview renders when you pause — keep steering: \`${ctx.prefix} home right/left/up/down\`_` : ''}`);
}

async function cmdMoveFastTo(ctx, rec, tx, ty) {
    const selUid = selGet(ctx.senderJid);
    if (selUid === 'EXPIRED') return ctx.reply(`⏱️ Selection expired (holds 5 min) — pick the piece again: \`${ctx.prefix} home select <number|name>\`.`);
    if (!selUid) return ctx.reply(`Select a piece first: \`${ctx.prefix} home select <number|name>\` — then \`${ctx.prefix} home ${tx} ${ty}\` sends it there.`);
    const p = rec.placed.find((q) => q.uid === selUid);
    if (!p) { selClear(ctx.senderJid); return ctx.reply('🕯️ That selection is gone — pick another piece.'); }
    const d = renderer.itemDef(p.item);
    if (d.layer === 'wall') return ctx.reply(`🖼️ Wall pieces move by slot: \`${ctx.prefix} home place ${p.item} <slot 1-10> <left|right>\`.`);
    // same clamp + nearest-free laws as the classic moveto
    const cl1 = rooms.clampTo(rec, tx, ty, effDef(p, d), p.lvl || 0);
    const spot = findFreeNear(rec, effDef(p, d), cl1.x, cl1.y, p.uid, p.lvl || 0);
    if (!spot) return ctx.reply('🏠 Nowhere in the room fits it right now — free some space first.');
    const from = { x: p.x, y: p.y };
    await Homestead.updateOne(
        { userId: ctx.senderJid, 'placed.uid': p.uid },
        { $set: { 'placed.$.x': spot.x, 'placed.$.y': spot.y, updatedAt: Date.now() } },
    );
    p.x = spot.x; p.y = spot.y;
    armMovePreview(ctx, p.uid, from);
    const burst = movePreviews.get(ctx.senderJid);
    const first = burst && burst.fromX === from.x && burst.fromY === from.y;
    const note = (cl1.x !== tx || cl1.y !== ty) ? ` (${tx},${ty}) was off the grid — snapped inside` : ((spot.x !== cl1.x || spot.y !== cl1.y) ? ` (${tx},${ty}) was blocked — settled nearby` : '');
    return ctx.reply(`➡️ (${spot.x},${spot.y})${note}${first ? `\n_⏱️ preview renders when you pause_` : ''}`);
}

// ── SPACE HOPPING (owner 21:34Z "select or change which room or space you
// wanna move to — the loft or maybe an additional room"): `.home to loft`
// drops the selection on a free loft tile, `.home to east` walks it into the
// East annex (space-local centre-out search, walled partitions respected),
// `.home to` lists every space with its head-count.
const SPACE_ALIAS = { main: 'main', hall: 'main', ground: 'main', down: 'main', floor: 'main', loft: 'loft', up: 'loft', upstairs: 'loft', top: 'loft', e: 'e', east: 'e', right: 'e', s: 's', south: 's', front: 's', n: 'n', north: 'n', back: 'n', w: 'w', west: 'w', left: 'w' };
const SPACE_NAME = { main: 'Main hall', e: 'East annex', s: 'South annex', n: 'North annex', w: 'West annex', loft: 'Loft' };

function spaceOf(rec, q) {
    if (q.lvl) return 'loft';
    return rooms.regionAt(rec, q.x, q.y) || '?';
}

async function cmdTo(ctx, rec, args) {
    const P = ctx.prefix;
    if (!args.length) {
        const counts = {};
        for (const q of rec.placed) {
            const k = spaceOf(rec, q);
            counts[k] = (counts[k] || 0) + 1;
        }
        const annexLines = rooms.annexList(rec).map((a) => `• *${SPACE_NAME[a.side]}* (${a.kind}) — ${counts[a.side] || 0}`);
        const loftLine = rec.upper ? `• *Loft* — ${counts.loft || 0}` : `• *Loft* — not yet (\`${P} home rooms loft\`)`;
        return ctx.reply(`🚪 *Your spaces*\n\n• *Main hall* — ${counts.main || 0}\n${annexLines.length ? annexLines.join('\n') + '\n' : ''}${loftLine}\n\n_Select a piece, then \`${P} home to <main|loft|east|south|north|west>\` — it hops there._`);
    }
    const selUid = selGet(ctx.senderJid);
    if (selUid === 'EXPIRED') return ctx.reply(`⏱️ Selection expired (holds 5 min) — pick the piece again: \`${P} home select <number|name>\`.`);
    if (!selUid) return ctx.reply(`Select a piece first: \`${P} home select <number|name>\` — then \`${P} home to loft\` hops it.`);
    const p = rec.placed.find((q) => q.uid === selUid);
    if (!p) { selClear(ctx.senderJid); return ctx.reply('🕯️ That selection is gone — pick another piece.'); }
    const d = renderer.itemDef(p.item);
    if (d.layer === 'wall') return ctx.reply(`🖼️ Banners hang on the main walls — \`${P} home place ${p.item} <slot> <left|right>\` moves them.`);
    const target = SPACE_ALIAS[String(args[0] || '').toLowerCase()];
    if (!target) {
        const sides = rooms.annexList(rec).map((a) => SPACE_NAME[a.side].split(' ')[0].toLowerCase());
        return ctx.reply(`❌ Unknown space *${args[0]}*.\nSpaces: main · loft${sides.length ? ' · ' + sides.join(' · ') : ''}\n_List: \`${P} home to\`_`);
    }
    if (target === 'loft') {
        if (!rec.upper) return ctx.reply(`🪜 You need a loft first: \`${P} home rooms loft\``);
        if (p.lvl) return ctx.reply(`⬆️ The *${d.name}* is already in the loft.`);
        const e2 = effDef(p, d);
        const spot = findFreeNear(rec, e2, 2, 2, p.uid, 1) || findFreeNear(rec, e2, 4, 4, p.uid, 1);
        if (!spot) return ctx.reply(`🏠 The loft is full — bring something down first (select it, \`${P} home to main\`).`);
        const from = { x: p.x, y: p.y };
        await Homestead.updateOne(
            { userId: ctx.senderJid, 'placed.uid': p.uid },
            { $set: { 'placed.$.lvl': 1, 'placed.$.x': spot.x, 'placed.$.y': spot.y, updatedAt: Date.now() } },
        );
        p.lvl = 1; p.x = spot.x; p.y = spot.y;
        return viewRoom(ctx, rec, { ...gridOptsFor(p, d), pop: { item: p.item, x: spot.x, y: spot.y, from }, hint: `The *${d.name}* is in the loft now (${spot.x},${spot.y}) — \`${P} home to main\` brings it down.` });
    }
    if (!p.lvl && spaceOf(rec, p) === target) return ctx.reply(`📍 The *${d.name}* is already in the ${SPACE_NAME[target]}.`);
    if (target !== 'main' && !rooms.annexList(rec).some((a) => a.side === target)) {
        return ctx.reply(`❌ You don't have a ${SPACE_NAME[target]} yet — build one: \`${P} home rooms\``);
    }
    const e2 = effDef(p, d);
    const b = target === 'main' ? { x0: 0, y0: 0, x1: rooms.N, y1: rooms.N } : rooms.SIDES[target];
    // nearest free spot INSIDE the target space (centre-out scan, space-local —
    // canPlace still enforces walled-partition law, so only clean landings win)
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    let best = null, bestDist = Infinity;
    for (let x = b.x0; x <= b.x1 - e2.fw; x++) {
        for (let y = b.y0; y <= b.y1 - e2.fh; y++) {
            if (!canPlace(rec, x, y, e2, p.uid, 0)) continue;
            const dist = Math.abs(x + e2.fw / 2 - cx) + Math.abs(y + e2.fh / 2 - cy);
            if (dist < bestDist) { bestDist = dist; best = { x, y }; }
        }
    }
    if (!best) return ctx.reply(`🏠 The ${SPACE_NAME[target]} has no free spot for it right now.`);
    const from = { x: p.x, y: p.y };
    await Homestead.updateOne(
        { userId: ctx.senderJid, 'placed.uid': p.uid },
        { $set: { 'placed.$.lvl': 0, 'placed.$.x': best.x, 'placed.$.y': best.y, updatedAt: Date.now() } },
    );
    p.lvl = 0; p.x = best.x; p.y = best.y;
    return viewRoom(ctx, rec, { ...gridOptsFor(p, d), pop: { item: p.item, x: best.x, y: best.y, from }, hint: `The *${d.name}* is in the ${SPACE_NAME[target]} now (${best.x},${best.y}).` });
}

async function cmdRotate(ctx, rec) {
    const selUid = selGet(ctx.senderJid);
    if (selUid === 'EXPIRED') return ctx.reply(`⏱️ Selection expired (holds 5 min) — pick the piece again: \`${ctx.prefix} home select <number|name>\`.`);
    if (!selUid) return ctx.reply(`Select a piece first: \`${ctx.prefix} home select <name>\`.`);
    const p = rec.placed.find((q) => q.uid === selUid);
    if (!p) { selection.delete(ctx.senderJid); return ctx.reply('🕯️ That selection is gone — pick another piece.'); }
    const d = renderer.itemDef(p.item);
    if (d.layer === 'wall') return ctx.reply('🖼️ Banners face one way — the wall decides that.');
    // quarter-turn rotation (0..3); odd turns swap a 2x1 footprint → needs room to swing
    const cur = ((p.r != null ? p.r : (p.f ? 2 : 0)) % 4 + 4) % 4;
    const arg = String(args && args[0] || '').toLowerCase();
    const nr = arg === 'back' || arg === 'ccw' || arg === 'left' ? (cur + 3) % 4 : (cur + 1) % 4;
    let nx = p.x, ny = p.y;
    const trial = { ...p, r: nr };
    if (!canPlace(rec, nx, ny, effDef(trial, d), p.uid, p.lvl || 0)) {
        const spot = findFreeNear(rec, effDef(trial, d), p.x, p.y, p.uid, p.lvl || 0);
        if (!spot || Math.abs(spot.x - p.x) + Math.abs(spot.y - p.y) > 3) return ctx.reply(`🚧 No room to turn the *${d.name}* here — move it somewhere roomier first.`);
        nx = spot.x; ny = spot.y;
    }
    const nf = nr >= 2;
    await Homestead.updateOne(
        { userId: ctx.senderJid, 'placed.uid': p.uid },
        { $set: { 'placed.$.r': nr, 'placed.$.f': nf, 'placed.$.x': nx, 'placed.$.y': ny, updatedAt: Date.now() } },
    );
    p.r = nr; p.f = nf; p.x = nx; p.y = ny;
    await viewRoom(ctx, rec, { ...gridOptsFor(p, d), pop: { item: p.item, x: p.x, y: p.y }, hint: `The *${d.name}* turns ${nr * 90}° (rotate again for the next quarter).` });
}

async function cmdStore(ctx, rec, args, sub = 'store') {
    // `remove <numbers>` — the furniture card's numbering: pick up numbered
    // PLACED pieces in one atomic swap (`remove 3`, `remove 2-5`, `remove 2 4`).
    // Coordinates stay on `store`/`pick` so `.home store 2 3` still means (x,y).
    if ((sub === 'remove' || sub === 'unplace') && args.length && args.every((a) => /^(\d+)(\s*-\s*\d+)?$/.test(a))) {
        const rows = renderer.inventoryRows(rec);
        const nums = new Set();
        for (const a of args) {
            const m = a.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
            const a0 = parseInt(m[1], 10), b0 = m[2] ? parseInt(m[2], 10) : a0;
            const lo = Math.min(a0, b0), hi = Math.max(a0, b0);
            if (hi - lo > 60) return ctx.reply('❌ That range is too wide — 60 pieces per pick-up at most.');
            for (let n = lo; n <= hi; n++) nums.add(n);
        }
        const picked = []; const skipped = [];
        for (const n of nums) {
            const row = rows[n - 1];
            if (!row || !row.d || !row.d.id) { skipped.push(`#${n} (no such piece)`); continue; }
            if (!row.placed) { skipped.push(`#${n} ${row.d.name || row.d.id} (already in storage)`); continue; }
            picked.push(row);
        }
        if (!picked.length) return ctx.reply(`❌ Nothing to pick up: ${skipped.join(', ')}.\n\`${ctx.prefix} home select\` lists your pieces with their numbers.`);
        // §4: ONE conditional update pulls every uid at once — money/instance
        // style atomicity for the batch (uids come fresh off inventoryRows)
        const uids = picked.map((r) => r.uid);
        await Homestead.updateOne(
            { userId: ctx.senderJid },
            { $pull: { placed: { uid: { $in: uids } } }, $push: { owned: { $each: picked.map((r) => ({ id: r.d.id, uid: r.uid })) } }, $set: { updatedAt: Date.now() } },
        );
        rec.placed = rec.placed.filter((q) => !uids.includes(q.uid));
        rec.owned = [...rec.owned, ...picked.map((r) => ({ id: r.d.id, uid: r.uid }))];
        if (uids.includes(selection.get(ctx.senderJid))) selClear(ctx.senderJid);
        const names = picked.map((r) => `#${r.n} *${r.d.name || r.d.id}*`).join(', ');
        return ctx.reply(`📦 Picked up ${picked.length} piece${picked.length === 1 ? '' : 's'}: ${names}` + (skipped.length ? `\nSkipped: ${skipped.join(', ')}.` : ''));
    }
    let p = null;
    const selUid = selGet(ctx.senderJid);
    if (selUid === 'EXPIRED') return ctx.reply(`⏱️ Selection expired (holds 5 min) — pick the piece again: \`${ctx.prefix} home select <number|name>\`.`);
    if ((!args.length || args[0] === undefined) && selUid) {
        p = rec.placed.find((q) => q.uid === selUid);
    } else {
        const [fx, fy] = args.map((a) => parseInt(a, 10));
        if (!Number.isFinite(fx) || !Number.isFinite(fy)) {
            return ctx.reply(`Usage: \`${ctx.prefix} home store <x> <y>\` — or select a piece and \`${ctx.prefix} home store\``);
        }
        const found = rec.placed.find((q) => {
            const d = renderer.itemDef(q.item);
            if (!d) return false;
            if (d.layer === 'wall') return q.x === fx && q.y === (fy === 1 ? 1 : 0);
            const e = effDef(q, d);
            return fx >= q.x && fx < q.x + e.fw && fy >= q.y && fy < q.y + e.fh;
        });
        p = found;
    }
    if (!p) return ctx.reply('❌ Nothing stands there (or nothing is selected).');
    // §4: atomic swap back to storage, instance identity preserved
    await Homestead.updateOne(
        { userId: ctx.senderJid },
        { $pull: { placed: { uid: p.uid } }, $push: { owned: { id: p.item, uid: p.uid } }, $set: { updatedAt: Date.now() } },
    );
    rec.placed = rec.placed.filter((q) => q.uid !== p.uid);
    rec.owned = [...rec.owned, { id: p.item, uid: p.uid }];
    if (selection.get(ctx.senderJid) === p.uid) selClear(ctx.senderJid);
    return ctx.reply(`📦 Picked up *${(renderer.itemDef(p.item) || {}).name}* — it's back in your storage.`);
}

async function cmdThemes(ctx, rec, args) {
    if (!args[0] || args[0] === 'list') {
        const lines = Object.entries(renderer.THEMES).map(([id, t]) => {
            const owned = rec.themesOwned.includes(id);
            return `${owned ? '✅' : '🔒'} *${t.name}* — ${t.price === 0 ? 'free' : t.price.toLocaleString() + ' ZENI'}${owned ? '' : `  →  \`${ctx.prefix} home theme ${id}\``}`;
        });
        return ctx.reply(`🎨 *Homestead Themes*\n\n${lines.join('\n')}\n\n_Switch: \`${ctx.prefix} home theme <id>\` — buying an unowned theme applies it instantly._`);
    }
    const id = String(args[0]).toLowerCase().replace(/[^a-z]/g, '');
    const theme = renderer.THEMES[id];
    if (!theme) return ctx.reply(`❌ Unknown theme. List: \`${ctx.prefix} home themes\``);
    if (rec.themesOwned.includes(id)) {
        rec.theme = id;
        await Homestead.updateOne({ userId: ctx.senderJid }, { $set: { theme: id, updatedAt: Date.now() } }, { upsert: true });
        return viewRoom(ctx, { ...rec, theme: id }, { hint: `.home theme <id> to reskin • .home themes to browse` });
    }
    const hlT = await houseLevel(ctx.senderJid);
    if (hlT < rooms.themeMinHouse(theme)) return ctx.reply(`🔒 *${theme.name}* needs a *${rooms.HOUSE_NAMES[rooms.themeMinHouse(theme)]}* (house Lv.${rooms.themeMinHouse(theme)}).`);
    const balance = economy.getBalance(ctx.senderJid);
    if (balance < theme.price) {
        return ctx.reply(`💰 Not enough ZENI — *${theme.name}* costs *${theme.price.toLocaleString()}* and you have *${balance.toLocaleString()}*.`);
    }
    economy.removeMoney(ctx.senderJid, theme.price, `Homestead: theme ${theme.name}`);
    rec.theme = id;
    rec.themesOwned.push(id);
    await Homestead.updateOne(
        { userId: ctx.senderJid },
        { $set: { theme: id, updatedAt: Date.now() }, $addToSet: { themesOwned: id } },
        { upsert: true },
    );
    await viewRoom(ctx, { ...rec, theme: id, themesOwned: rec.themesOwned }, { hint: `Welcome to ${theme.name}!` });
}

// ═══════════════════════════════════════════════════════════════════════════
// ARCHITECTURE — expansions, loft, second-floor walls, house styles, floors
// ═══════════════════════════════════════════════════════════════════════════
async function houseLevel(jid) {
    try { return await require('./baseBuilder').getStructureLevel(jid, 'house') || 1; } catch (e) { return 1; }
}

async function cmdBuild(ctx, rec, args) {
    const P = ctx.prefix;
    const hl = await houseLevel(ctx.senderJid);
    const annex = rooms.annexList(rec);
    const sub = String(args[0] || '').toLowerCase();
    const bal = economy.getBalance(ctx.senderJid);

    if (!sub || sub === 'list' || sub === 'shop') {
        const lock = (b) => hl >= b.minHouse ? '' : `  🔒 needs *${rooms.HOUSE_NAMES[b.minHouse]}* (house Lv.${b.minHouse})`;
        const B = rooms.BUILD;
        const sides = ['e', 's', 'n', 'w'].map((k) => {
            const a = annex.find((q) => q.side === k);
            return `${rooms.SIDES[k].name}: ${a ? `✅ ${a.kind === 'walled' ? 'walled annex' : 'open extension'}` : '— empty'}`;
        }).join('  •  ');
        return ctx.reply(
            `🏗️ *HOMESTEAD ARCHITECT* — your house is a *${rooms.HOUSE_NAMES[hl] || 'Hovel'}* (Lv.${hl})\n💰 ${Number(bal).toLocaleString()} ZENI\n\n` +
            `🚪 *${B.annex_walled.name}* — ${B.annex_walled.price.toLocaleString()} ZENI${lock(B.annex_walled)}\n   ${B.annex_walled.desc}\n   \`${P} home rooms annex <east|south|north|west> walled\`\n\n` +
            `🌿 *${B.annex_open.name}* — ${B.annex_open.price.toLocaleString()} ZENI${lock(B.annex_open)}\n   ${B.annex_open.desc}\n   \`${P} home rooms annex <east|south|north|west> open\`\n\n` +
            `🪜 *${B.loft.name}* — ${B.loft.price.toLocaleString()} ZENI${lock(B.loft)}${rec.upper ? '  ✅ built' : ''}\n   ${B.loft.desc}\n   \`${P} home rooms loft\`\n\n` +
            `🧱 *${B.loft_walls.name}* — ${B.loft_walls.price.toLocaleString()} ZENI${lock(B.loft_walls)}${rec.upperWalls ? '  ✅ built' : ''}\n   ${B.loft_walls.desc}\n   \`${P} home rooms loftwalls\`\n\n` +
            `Rooms: ${sides}\nRoom slots at this house level: *${annex.length}/${rooms.annexAllowance(hl)}* (upgrade the house for more)\n\n` +
            `_Move furniture upstairs: \`${P} home select <item>\` then \`${P} home to loft\` (or \`${P} home loft\`)._`);
    }

    // ── purchase paths ──
    let b, apply, okMsg;
    if (sub === 'annex' || sub === 'room' || sub === 'extend' || sub === 'extension') {
        const side = rooms.SIDE_ALIAS[String(args[1] || '').toLowerCase()];
        const kindRaw = String(args[2] || '').toLowerCase();
        const kind = kindRaw.startsWith('w') ? 'walled' : (kindRaw.startsWith('o') ? 'open' : null);
        if (!side || !kind) return ctx.reply(`Usage: \`${P} home rooms annex <east|south|north|west> <walled|open>\``);
        b = kind === 'walled' ? rooms.BUILD.annex_walled : rooms.BUILD.annex_open;
        if (hl < b.minHouse) return ctx.reply(`🔒 *${b.name}* needs a *${rooms.HOUSE_NAMES[b.minHouse]}* (house Lv.${b.minHouse}). Yours is Lv.${hl} — \`${P} base upgrade house\`.`);
        if (annex.some((q) => q.side === side)) return ctx.reply(`🚧 The ${rooms.SIDES[side].name} side already has a room.`);
        if (annex.length >= rooms.annexAllowance(hl)) return ctx.reply(`🔒 Your ${rooms.HOUSE_NAMES[hl]} supports *${rooms.annexAllowance(hl)}* extra room${rooms.annexAllowance(hl) === 1 ? '' : 's'}. Upgrade the house for more.`);
        apply = { $push: { annex: { side, kind } } };
        okMsg = `${kind === 'walled' ? '🚪' : '🌿'} Built a *${kind === 'walled' ? 'Walled Annex' : 'Open Extension'}* on the ${rooms.SIDES[side].name} side!`;
        var after = () => { rec.annex = [...annex, { side, kind }]; };
    } else if (sub === 'loft' || sub === 'upper' || sub === 'floor' || sub === 'topfloor') {
        b = rooms.BUILD.loft;
        if (rec.upper) return ctx.reply('🪜 You already have a loft.');
        if (hl < b.minHouse) return ctx.reply(`🔒 *${b.name}* needs a *${rooms.HOUSE_NAMES[b.minHouse]}* (house Lv.${b.minHouse}). Yours is Lv.${hl}.`);
        apply = { $set: { upper: true } };
        okMsg = '🪜 Built the *Top Floor Loft* — stairs, deck and railings!';
        var after = () => { rec.upper = true; };
    } else if (sub === 'loftwalls' || sub === 'upperwalls' || sub === 'walls' || sub === 'secondwalls') {
        b = rooms.BUILD.loft_walls;
        if (!rec.upper) return ctx.reply(`🪜 Build the loft first: \`${P} home rooms loft\``);
        if (rec.upperWalls) return ctx.reply('🧱 Your second-floor walls are already up.');
        if (hl < b.minHouse) return ctx.reply(`🔒 *${b.name}* needs a *${rooms.HOUSE_NAMES[b.minHouse]}* (house Lv.${b.minHouse}). Yours is Lv.${hl}.`);
        apply = { $set: { upperWalls: true } };
        okMsg = '🧱 Raised the *second-floor walls*!';
        var after = () => { rec.upperWalls = true; };
    } else {
        return ctx.reply(`❌ Unknown build option. See \`${P} home rooms\``);
    }

    await waitOpLock(ctx.senderJid);
    opLocks.add(ctx.senderJid);
    try {
        if (!economy.removeMoney(ctx.senderJid, b.price, `Homestead: ${b.name}`)) {
            return ctx.reply(`💰 Not enough ZENI — *${b.name}* costs *${b.price.toLocaleString()}* and you have *${Number(economy.getBalance(ctx.senderJid)).toLocaleString()}*.`);
        }
        try {
            const r = await Homestead.updateOne({ userId: ctx.senderJid }, { ...apply, $set: { ...(apply.$set || {}), updatedAt: Date.now() } }, { upsert: true });
            if (!r.acknowledged) throw new Error('write not acknowledged');
        } catch (e) {
            economy.addMoney(ctx.senderJid, b.price, `Homestead: refund ${b.name}`);
            return ctx.reply('🔥 The builders dropped your ZENI back on the counter (write failed). Nothing was lost — try again.');
        }
        after();
    } finally { opLocks.delete(ctx.senderJid); }
    await viewRoom(ctx, rec, { hint: okMsg });
}

async function cmdLevel(ctx, rec, up) {
    const selUid = selGet(ctx.senderJid);
    if (selUid === 'EXPIRED') return ctx.reply(`⏱️ Selection expired (holds 5 min) — pick the piece again: \`${ctx.prefix} home select <number|name>\`.`);
    if (!selUid) return ctx.reply(`Select a piece first: \`${ctx.prefix} home select <name>\`.`);
    const p = rec.placed.find((q) => q.uid === selUid);
    if (!p) { selection.delete(ctx.senderJid); return ctx.reply('🕯️ That selection is gone — pick another piece.'); }
    const d = renderer.itemDef(p.item);
    if (d.layer === 'wall') return ctx.reply('🖼️ Wall pieces stay on the ground-floor walls.');
    const lvl = up ? 1 : 0;
    if ((p.lvl || 0) === lvl) return ctx.reply(up ? '⬆️ It is already upstairs.' : '⬇️ It is already on the ground floor.');
    if (up && !rec.upper) return ctx.reply(`🪜 You need a loft first: \`${ctx.prefix} home rooms loft\``);
    const e = effDef(p, d);
    const spot = findFreeNear(rec, e, up ? Math.min(p.x, 5) : p.x, up ? Math.min(p.y, 5) : p.y, p.uid, lvl);
    if (!spot) return ctx.reply(up ? '🏠 The loft has no free spot for that piece.' : '🏠 No free spot downstairs for that piece.');
    await Homestead.updateOne({ userId: ctx.senderJid, 'placed.uid': p.uid }, { $set: { 'placed.$.lvl': lvl, 'placed.$.x': spot.x, 'placed.$.y': spot.y, updatedAt: Date.now() } });
    p.lvl = lvl; p.x = spot.x; p.y = spot.y;
    await viewRoom(ctx, rec, { ...gridOptsFor(p, d), pop: { item: p.item, x: p.x, y: p.y }, hint: up ? `The *${d.name}* is now in the loft.` : `The *${d.name}* is back on the ground floor.` });
}

async function cmdStyles(ctx, rec, args) {
    const P = ctx.prefix;
    const id = String(args[0] || '').toLowerCase();
    if (!id) {
        const lines = Object.values(rooms.STYLES).map((st) => {
            const own = rooms.isStyleUnlocked(rec, st.id);
            const on = (rec.style || 'default') === st.id;
            return `${on ? '🏠' : own ? '✅' : '🔒'} *${st.name}* (\`${st.id}\`) — ${st.desc}${own ? '' : '\n    _Unlock requirements not announced yet._'}`;
        });
        return ctx.reply(`🏘️ *HOUSE STYLES* — remade houses\n\n${lines.join('\n')}\n\n_Apply an unlocked one: \`${P} home style <id>\`_`);
    }
    const st = rooms.STYLES[id];
    if (!st) return ctx.reply(`❌ Unknown style. List: \`${P} home styles\``);
    if (!rooms.isStyleUnlocked(rec, id)) return ctx.reply(`🔒 *${st.name}* is locked — its unlock requirements haven't been announced yet.`);
    rec.style = id;
    await Homestead.updateOne({ userId: ctx.senderJid }, { $set: { style: id, updatedAt: Date.now() } }, { upsert: true });
    await viewRoom(ctx, rec, { hint: `Your house is now the ${st.name}.` });
}

async function cmdVisit(ctx, rec, targetJid) {
    if (!targetJid) return ctx.reply(`Usage: \`${ctx.prefix} home visit @user\` (mention someone or reply to their message)`);
    const tRec = await loadRec(normalizeJid(targetJid));
    await viewRoom(ctx, tRec, { ownerName: economy.getDisplayName(tRec.userId), hint: `You are visiting ${economy.getDisplayName(tRec.userId)}'s homestead.` });
}

function cmdHelp(ctx) {
    const p = ctx.prefix;
    return ctx.reply(
        `🏠 *THE HOMESTEAD* — base hub + isometric room\n\n` +
        `• \`${p} home\` — your outdoor base map\n` +
        `• \`${p} home house\` / \`${p} house\` — enter your house interior\n` +
        `• \`${p} home catalog\` — furniture outfitter • \`${p} home catalog <word>\` — search it\n` +
        `• \`${p} home buy <name>\` — buy with ZENI\n` +
        `• \`${p} home place <name> [x y]\` — place furniture\n` +
        `• \`${p} home select\` / \`${p} home inv [page]\` — YOUR FURNITURE (numbered list, names in the caption)\n` +
        `• \`${p} home select <number|name>\` — select a piece (selection holds 5 min)\n` +
        `• \`${p} home right|left|up|down [n]\` — steer it DIRECTLY (instant; preview renders when you pause) • \`${p} home 3 4\` — send it to (3,4)\n` +
        `• \`${p} home to <main|loft|east|south|north|west>\` — hop it to another space • \`${p} home to\` — list your spaces\n` +
        `• \`${p} home remove <numbers>\` — pick up numbered pieces (\`2-5\` works) • \`${p} home store [x y]\` — by coordinates\n` +
        `• \`${p} home move <left|right|up|down> [n]\` — nudge it • \`${p} home moveto <x> <y>\` — send it to coordinates\n` +
        `• \`${p} home rotate\` — quarter-turn (repeat for 90°/180°/270°) • \`${p} home move upleft 3\` — diagonals\n` +
        `• \`${p} home rooms\` — ARCHITECT: annex rooms (walled/open), top-floor loft, 2nd-floor walls\n` +
        `• \`${p} home loft\` / \`${p} home ground\` — send the selected piece upstairs / back down\n` +
        `• \`${p} home styles\` — remade house styles (locked)\n` +
        `• \`${p} home themes\` / \`${p} home theme <id>\` — room skins\n` +
        `• \`${p} base build/upgrade/info\` — outdoor structures\n\n` +
        `_Comfort grows with every piece — legendary furniture shines brightest._`,
    );
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle short, unprefixed WhatsApp replies while a user is editing furniture.
 * Returns true only when a recognized editing input was consumed; ordinary
 * chat text passes through untouched. Select mode accepts a bare number/name;
 * active selection accepts bare directions, coordinates, room hops, and edits.
 */
async function handleQuickInput(ctx) {
    const raw = String(ctx.rawText || ctx.text || '').trim();
    const prefix = String(ctx.prefix || '').toLowerCase();
    if (!raw || raw.startsWith('.') || (prefix && raw.toLowerCase().startsWith(prefix))) return false;

    const jid = ctx.senderJid;
    const now = Date.now();
    const modeAt = selectMode.get(jid);
    if (modeAt && now - modeAt > SELECT_MODE_TTL_MS) selectMode.delete(jid);
    const inSelectMode = selectMode.has(jid);
    const hasSelection = selection.has(jid);
    const pendingId = pendingPlace.get(jid);
    if (!inSelectMode && !hasSelection && !pendingId) return false;

    const input = raw.replace(/\s+/g, ' ').trim();
    const lower = input.toLowerCase();
    const coords = /^(?:to\s+)?(-?\d+)\s*(?:,\s*|\s+)(-?\d+)$/.exec(lower);
    const dir = /^(right|r|east|left|l|west|down|d|south|up|u|north|upright|ur|upleft|ul|downright|dr|downleft|dl)(?:\s+(\d+))?$/.exec(lower);
    const space = /^(?:to|room|space)\s+(main|hall|ground|floor|loft|upstairs|top|east|e|south|s|front|north|n|back|west|w|left|right|up|down)$/.exec(lower);
    const remove = /^(remove|pick\s+up)\s+(.+)$/i.exec(input);
    const promptAgain = /^(select|choose|pick|list|inventory)$/i.test(lower);
    const cancel = /^(cancel|exit|done|stop)$/i.test(lower);
    const rotate = /^(rotate|turn)$/i.test(lower);
    const store = /^(store|put\s+away)$/i.test(lower);
    const bareSelection = inSelectMode && (/^\d+$/.test(lower) || !!resolveItem(input));

    if (cancel) {
        selectMode.delete(jid);
        selClear(jid);
        pendingPlace.delete(jid);
        await ctx.reply('✋ Furniture editing closed. Your room is unchanged unless you already moved something.');
        return true;
    }
    if (promptAgain) {
        selectMode.set(jid, Date.now());
        const rec = await loadRec(jid);
        await cmdInventory(ctx, rec);
        return true;
    }
    if (!bareSelection && !(pendingId && coords) &&
        !((hasSelection && (dir || coords || space || rotate || store)) ||
          ((hasSelection || inSelectMode) && remove))) {
        return false;
    }

    const rec = await loadRec(jid);
    if (pendingId && coords) {
        await cmdPlace(ctx, rec, [pendingId, coords[1], coords[2]]);
        return true;
    }
    if (bareSelection) {
        await cmdSelect(ctx, rec, [input]);
        return true;
    }
    if (hasSelection && dir) {
        await cmdMoveFast(ctx, rec, dir[1], dir[2] ? [dir[2]] : []);
        return true;
    }
    if (hasSelection && coords) {
        await cmdMoveFastTo(ctx, rec, Number(coords[1]), Number(coords[2]));
        return true;
    }
    if (hasSelection && space) {
        await cmdTo(ctx, rec, [space[1]]);
        return true;
    }
    if (hasSelection && rotate) {
        await cmdRotate(ctx, rec);
        return true;
    }
    if (hasSelection && store) {
        await cmdStore(ctx, rec, [], 'store');
        return true;
    }
    if ((hasSelection || inSelectMode) && remove) {
        await cmdStore(ctx, rec, remove[2].trim().split(/\s+/), 'remove');
        return true;
    }
    return false;
}

// ENTRY — called from engine.js
// ctx: { sock, chatId, senderJid, m, reply, text, prefix }
//   text = full lowercased command text (".j home place bed 3 4")
// ═══════════════════════════════════════════════════════════════════════════
async function handleCommand(ctx) {
    // normalize: the command word may arrive as '.home', 'home', '.j home',
    // '.j', 'home', '.base.', '.j baseadmin' ... Extract the WORD reliably:
    // strip punctuation from token 0; if it IS a command word, done; else if
    // token 0 was a prefix token, look for the word in token 1.
    let tokens = String(ctx.text || '').trim().split(/\s+/).filter(Boolean);
    let cmdWord = '';
    if (tokens.length) {
        const first = tokens[0].replace(/^[.!/?#]+/, '').replace(/[.]+$/, '');
        if (/^(home|base|house|homestead|baseadmin)$/i.test(first)) {
            cmdWord = first.toLowerCase();
            tokens = tokens.slice(1);
        } else if (/^[.!/?#]/.test(tokens[0])) {
            tokens = tokens.slice(1);
            if (tokens.length && /^(home|base|house|homestead|baseadmin)\.?$/i.test(tokens[0])) {
                cmdWord = tokens[0].toLowerCase().replace(/[^a-z]/g, '');
                tokens = tokens.slice(1);
            }
        }
    }
    const sub = (tokens[0] || '').toLowerCase();
    const args = tokens.slice(1);

    if (!economy.isRegistered(ctx.senderJid)) {
        return ctx.reply(`❌ You need to register first!\n\nType: \`${ctx.prefix} register <nickname>\``);
    }

    // ── BARE MOVEMENT (owner 21:34Z "just use right left or coords directly
    // with a timer"): `.home right 2` / `.home up` / `.home 3 4` move the
    // selected piece INSTANTLY with a text ack; the animated preview renders
    // once on an idle timer when you stop steering. This MUST sit above the
    // structure route — `.home 3 4` is coords, while `.home 3` (single number)
    // stays structure #3. Only `.j base up` still means upgrade.
    if (cmdWord === 'home') {
        const DIR_SUBS = { right: 'right', r: 'right', east: 'right', left: 'left', l: 'left', west: 'left', down: 'down', d: 'down', south: 'down', up: 'up', u: 'up', north: 'up', upright: 'upright', ur: 'upright', upleft: 'upleft', ul: 'upleft', downright: 'downright', dr: 'downright', downleft: 'downleft', dl: 'downleft' };
        const dirSub = DIR_SUBS[sub];
        const coordPair = /^\d+$/.test(sub) && args.length >= 1 && /^-?\d+$/.test(args[0]);
        if (dirSub || coordPair) {
            try {
                const fRec = await loadRec(ctx.senderJid);
                if (dirSub) return cmdMoveFast(ctx, fRec, dirSub, args);
                return cmdMoveFastTo(ctx, fRec, parseInt(sub, 10), parseInt(args[0], 10));
            } catch (e) {
                console.error('[homestead] bare move error:', e.message);
                return ctx.reply('🔥 The piece jammed mid-slide — try again in a moment.');
            }
        }
    }

    // §6 routing: `.home` / `.base` bare → OUTDOOR BASE MAP; `.house` /
    // `house <#id>` / `<#id>` / `.homestead` → structure entry (lazy require —
    // baseBuilder calls back into viewRoom for interiors)
    const wantsStructure = (cmdWord === 'house')
        || (cmdWord === 'homestead' && (sub === '' || /^\d+$/.test(sub)))
        || ((cmdWord === 'home' || cmdWord === 'base') && (sub === 'house' || sub === 'inside' || sub === 'my' || sub === 'room' || sub === 'homestead' || /^\d+$/.test(sub) || (sub === 'view' && cmdWord !== 'base')));
    if (cmdWord === 'house' || wantsStructure) {
        if (cmdWord === 'house' && (sub === '' || /^\d+$/.test(sub))) {
            const baseBuilder = require('./baseBuilder');
            return baseBuilder.enterStructure(ctx, /^\d+$/.test(sub) ? sub : undefined);
        }
        if (wantsStructure) {
            const baseBuilder = require('./baseBuilder');
            const idArg = /^\d+$/.test(sub) ? sub : args[0];
            return baseBuilder.enterStructure(ctx, idArg);
        }
    }
    if (sub === '' && (cmdWord === 'home' || cmdWord === 'base')) {
        const baseBuilder = require('./baseBuilder');
        return baseBuilder.viewBase(ctx, {});
    }
    // base subcommands (build/upgrade/info/admin/map/...) route to baseBuilder —
    // `.j base upgrade mines`, `.j base build blacksmith 3`, `.j baseadmin ...`
    const BASE_SUBS = ['map', 'build', 'construct', 'upgrade', 'up', 'info', 'structures', 'ledger', 'list', 'admin', 'baseadmin'];
    if (BASE_SUBS.includes(sub) || cmdWord === 'baseadmin' || (cmdWord === 'base' && sub !== 'catalog' && sub !== 'buy' && sub !== 'place' && sub !== 'select' && sub !== 'move' && sub !== 'moveto' && sub !== 'rotate' && sub !== 'store' && sub !== 'remove' && sub !== 'unplace' && sub !== 'inv' && sub !== 'inventory' && sub !== 'items' && sub !== 'to' && sub !== 'space' && sub !== 'themes' && sub !== 'theme' && sub !== 'visit' && sub !== 'help')) {
        const baseBuilder = require('./baseBuilder');
        return baseBuilder.handleBaseCommand(ctx);
    }

    const rec = await loadRec(ctx.senderJid);

    try {
        switch (sub) {
            case 'catalog': case 'shop': case 'furni':
                return cmdCatalog(ctx, rec, args);
            case 'buy':
                if (!args.length) return ctx.reply(`Usage: \`${ctx.prefix} home buy <name>\` — browse: \`${ctx.prefix} home catalog\``);
                return cmdBuy(ctx, rec, args);
            case 'place': case 'put':
                if (!args.length) return ctx.reply(`Usage: \`${ctx.prefix} home place <name> [x y]\` — owned: ${rec.owned.length ? rec.owned.map((o) => o.id).join(', ') : 'none yet'}`);
                return cmdPlace(ctx, rec, args);
            case 'select': case 'sel': case 'grab':
                return cmdSelect(ctx, rec, args);
            case 'edit': case 'arrange':
                return cmdSelect(ctx, rec, []);
            case 'move': case 'nudge':
                return cmdMove(ctx, rec, args);
            case 'moveto': case 'goto': case 'send':
                return cmdMoveTo(ctx, rec, args);
            case 'rotate': case 'turn': case 'flip':
                return cmdRotate(ctx, rec);
            case 'deselect': case 'unselect':
                selClear(ctx.senderJid);
                pendingPlace.delete(ctx.senderJid);
                return ctx.reply('✋ Selection cleared.');
            case 'store': case 'pick': case 'remove': case 'unplace':
                return cmdStore(ctx, rec, args, sub);
            case 'inv': case 'inventory': case 'items':
                // `.home inv [page]` — the numbered furniture card (paging home)
                return cmdInventory(ctx, rec, args.length ? (parseInt(args[0], 10) || 1) : undefined);
            case 'to': case 'space': case 'spaces':
                // `.home to <space>` — room-hop the selection (main/loft/annexes)
                return cmdTo(ctx, rec, args);
            case 'rooms': case 'architect': case 'expand': case 'extend': case 'annex':
                return cmdBuild(ctx, rec, sub === 'rooms' || sub === 'architect' ? args : [sub === 'extend' ? 'annex' : 'annex', ...args]);
            case 'loft': case 'upstairs':
                return cmdLevel(ctx, rec, true);
            case 'ground': case 'downstairs':
                return cmdLevel(ctx, rec, false);
            case 'styles': case 'houses':
                return cmdStyles(ctx, rec, []);
            case 'style':
                return cmdStyles(ctx, rec, args);
            case 'themes':
                return cmdThemes(ctx, rec, []);
            case 'theme': case 'skin':
                if (!args.length) return cmdThemes(ctx, rec, []);
                return cmdThemes(ctx, rec, args);
            case 'visit': {
                let target = null;
                const q = ctx.m?.message?.extendedTextMessage?.contextInfo;
                if (q?.quotedMessage && q.participant) target = q.participant;
                else if (Array.isArray(q?.mentionedJid) && q.mentionedJid.length) target = q.mentionedJid[0];
                else {
                    const mention = ctx.rawText?.match(/@([0-9]{6,20})/);
                    if (mention) target = `${mention[1]}@s.whatsapp.net`;
                }
                return cmdVisit(ctx, rec, target);
            }
            case 'help': default:
                if (sub && sub !== 'help') {
                    return ctx.reply(`❌ Unknown homestead command \`${sub}\`.\n\n` + await helpText(ctx));
                }
                return cmdHelp(ctx);
        }
    } catch (e) {
        console.error('[homestead] command error:', e.message);
        return ctx.reply(`🔥 The homestead hearth flickered strangely... try again in a moment. (${e.message.slice(0, 80)})`);
    }
}

async function helpText(ctx) {
    const p = ctx.prefix;
    return `🏠 *THE HOMESTEAD*\n• \`${p} home\` (base map) • \`${p} house\` (interior) • \`${p} home catalog\`\n• \`${p} home buy/place/select/move/moveto/rotate/store\` • \`${p} home themes\` • \`${p} home visit @user\``;
}

module.exports = { handleCommand, handleQuickInput, loadRec, viewRoom };
