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
// ── purchase idempotency: message-id → expiry (WhatsApp redeliveries) ──
const seenMsgIds = new Map();
setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [k, ts] of seenMsgIds) if (ts < cutoff) seenMsgIds.delete(k);
}, 60 * 1000).unref();
// ── selection state (session-scoped): jid → placed uid ──
const selection = new Map();
// ── placement mode (§5 inventory flow): jid → owned item id awaiting placement ──
const pendingPlace = new Map();

// ── helpers ──
let _uidCounter = 0;
function uid() { return `${Date.now().toString(36)}${(_uidCounter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`; }

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
function canPlace(rec, x, y, def, ignoreUid = null) {
    if (def.layer === 'wall') {
        if (!Number.isInteger(x) || x < 1 || x > N - 2) return false;
        if (y !== 0 && y !== 1) return false;
        return !rec.placed.some((p) =>
            p.uid !== ignoreUid &&
            (renderer.itemDef(p.item) || {}).layer === 'wall' &&
            p.x === x && p.y === y);
    }
    if (x < 0 || y < 0 || x + def.fw > N || y + def.fh > N) return false;
    const cells = cellsOf(x, y, def);
    for (const p of rec.placed) {
        if (p.uid === ignoreUid) continue;
        const d = renderer.itemDef(p.item);
        if (!d || d.layer === 'wall') continue;
        if (def.layer === 'rug' && d.layer === 'rug') continue; // rugs stack on rugs
        if (overlaps(cells, cellsOf(p.x, p.y, d))) return false;
    }
    return true;
}

/** First free spot for def, spiralling out from the room centre. */
function findFreeSpot(rec, def) {
    const mid = Math.floor(N / 2) - Math.floor(def.fw / 2);
    for (let ring = 0; ring < N; ring++) {
        for (let y = mid - ring; y <= mid + ring; y++) {
            for (let x = mid - ring; x <= mid + ring; x++) {
                const onRing = (x === mid - ring || x === mid + ring || y === mid - ring || y === mid + ring);
                if (!onRing) continue;
                if (canPlace(rec, x, y, def)) return { x, y };
            }
        }
    }
    return null;
}

/** §2: nearest free spot spiralling around a REQUESTED position. */
function findFreeNear(rec, def, rx, ry, ignoreUid = null) {
    if (canPlace(rec, rx, ry, def, ignoreUid)) return { x: rx, y: ry };
    for (let ring = 1; ring < N * 2; ring++) {
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
            if (canPlace(rec, x, y, def, ignoreUid)) return { x, y };
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
    return {
        grid: {
            x: p.x, y: p.y, fw: def.fw, fh: def.fh, valid,
            label: `${def.name} (${p.x},${p.y})`,
        },
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
        };
        // render watchdog: a hung render must never ghost the command
        let media;
        try {
            let watchdogTimer;
            media = await Promise.race([
                renderer.renderRoomImage(state, { pop: opts.pop || null, hint: opts.hint, grid: opts.grid || null, static: !opts.pop && !!opts.grid }),
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
    const pages = Math.max(1, Math.ceil(items.length / 12));
    let page = parseInt(args[0], 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (page > pages) page = pages;
    const balance = economy.getBalance(ctx.senderJid);
    const buf = await renderer.renderCatalogPage(page - 1, pages, { balance });
    await ctx.sock.sendMessage(ctx.chatId, {
        image: buf,
        caption: `🛒 *Homestead Outfitter* — page ${page}/${pages}\n` +
            `💰 Your purse: *${Number(balance).toLocaleString()} ZENI*\n\n` +
            `_${ctx.prefix} home buy <name> — purchase an item_\n` +
            `_${ctx.prefix} home themes — room skins_`,
    }, { quoted: ctx.m });
}

// ── §4 ATOMIC BUY: dedupe → per-user lock → conditional debit → item push →
//    refund compensation on any failure. Money and item can never diverge.
async function cmdBuy(ctx, rec, args) {
    const query = args.join(' ');
    const it = resolveItem(query);
    if (!it) {
        const sug = CAT().items.filter((x) => x.id.includes(query.slice(0, 4))).slice(0, 4).map((x) => x.name);
        return ctx.reply(`❌ No furniture called *${query || '—'}*.\n` +
            (sug.length ? `Did you mean: ${sug.join(', ')}?\n` : '') +
            `Browse: \`${ctx.prefix} home catalog\``);
    }

    // WhatsApp redelivery / double-tap guard (same message id = same purchase)
    const msgKey = `${ctx.senderJid}|${ctx.m?.key?.id || ''}`;
    if (ctx.m?.key?.id) {
        if (seenMsgIds.has(msgKey)) return ctx.reply(`♻️ That purchase already went through — *${it.name}* is in your storage.`);
        seenMsgIds.set(msgKey, Date.now());
    }
    if (opLocks.has(ctx.senderJid)) {
        return ctx.reply('⏳ Your last homestead action is still settling — one moment.');
    }
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
        const clx = Math.max(0, Math.min(N - it.fw, rx));
        const cly = Math.max(0, Math.min(N - it.fh, ry));
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
        const sel = selection.get(ctx.senderJid);
        if (sel) {
            const p = rec.placed.find((q) => q.uid === sel);
            if (!p) { selection.delete(ctx.senderJid); return ctx.reply('🕯️ That selection is gone — pick another piece.'); }
            return viewRoom(ctx, rec, gridOptsFor(p, renderer.itemDef(p.item)));
        }
        // §5 placement mode still armed? → show the grid for the pending piece
        const pendId = pendingPlace.get(ctx.senderJid);
        if (pendId) {
            const pd = renderer.itemDef(pendId);
            if (pd) {
                const spot = findFreeSpot(rec, pd);
                const grid = spot ? { x: spot.x, y: spot.y, fw: pd.fw, fh: pd.fh, valid: true, label: `${pd.name} → (${spot.x},${spot.y})` } : null;
                return viewRoom(ctx, rec, { grid, hint: `Placement mode — *${pd.name}*. Confirm: \`${ctx.prefix} home place ${pd.id} <x> <y>\` (or bare \`${ctx.prefix} home place ${pd.id}\`). Cancel: \`${ctx.prefix} home deselect\`.` });
            }
            pendingPlace.delete(ctx.senderJid);
        }
        // §5 (redesign): no selection → NAMES CARD of every furniture item owned
        return cmdInventory(ctx, rec);
    }
    // §5: a bare page number pages the inventory card
    if (/^\d+$/.test(query) && !resolveItem(query)) return cmdInventory(ctx, rec, parseInt(query, 10));
    const it = resolveItem(query);
    if (!it) return ctx.reply(`❌ Nothing called *${query}*. Browse every piece you own: \`${ctx.prefix} home select\`.`);
    const cand = rec.placed.filter((p) => p.item === it.id && (renderer.itemDef(p.item) || {}).layer !== 'wall');
    if (!cand.length) {
        if (rec.owned.some((o) => o.id === it.id)) {
            // §5: owned-but-unplaced → PLACEMENT MODE (grid preview + suggested spot)
            pendingPlace.set(ctx.senderJid, it.id);
            selection.delete(ctx.senderJid);
            const spot = findFreeSpot(rec, it);
            const grid = spot ? { x: spot.x, y: spot.y, fw: it.fw, fh: it.fh, valid: true, label: `${it.name} → (${spot.x},${spot.y})` } : null;
            return viewRoom(ctx, rec, { grid, hint: `Placement mode — *${it.name}* (in storage). Confirm: \`${ctx.prefix} home place ${it.id} <x> <y>\`${spot ? ` (suggested spot ${spot.x},${spot.y})` : ''} • Cancel: \`${ctx.prefix} home deselect\`.` });
        }
        return ctx.reply(`❌ You don't own a *${it.name}*. Your furniture: \`${ctx.prefix} home select\` • Shop: \`${ctx.prefix} home catalog\`.`);
    }
    const p = cand[0];
    selection.set(ctx.senderJid, p.uid);
    pendingPlace.delete(ctx.senderJid);
    await viewRoom(ctx, rec, { ...gridOptsFor(p, it), hint: `Selected the *${it.name}*. Move it with \`${ctx.prefix} home move <left|right|up|down>\`` });
}

// §5: readable names card — every owned piece, placed vs storage (pagination)
async function cmdInventory(ctx, rec, page) {
    if (!rec.owned.length && !rec.placed.length) {
        return ctx.reply(`📦 You own no furniture yet.\nBrowse: \`${ctx.prefix} home catalog\` — then \`${ctx.prefix} home buy <name>\`.`);
    }
    const buf = await renderer.renderInventoryCard(rec, { prefix: ctx.prefix, page });
    const cap = `🪑 *Your Furniture* — 📍 ${rec.placed.length} placed • 📦 ${rec.owned.length} in storage\n\n` +
        `_${ctx.prefix} home select <name> — select a placed piece, or arm a storage piece for placement_\n` +
        `_${ctx.prefix} home place <name> [x y] — place a storage piece_\n` +
        `_${ctx.prefix} home store [x y] — pick a placed piece up_` +
        (page ? `\n_${ctx.prefix} home select ${page + 1} — next page_` : '');
    await ctx.sock.sendMessage(ctx.chatId, { image: buf, caption: cap }, { quoted: ctx.m });
}

/** Screen-direction nudge for the selection (§3): right/left = ±X, up/down = ∓Y. */
async function cmdMove(ctx, rec, args) {
    const selUid = selection.get(ctx.senderJid);
    if (!selUid) return ctx.reply(`Select a piece first: \`${ctx.prefix} home select <name>\` — or \`${ctx.prefix} home move\` after a preview.`);
    const idx = rec.placed.findIndex((p) => p.uid === selUid);
    if (idx === -1) { selection.delete(ctx.senderJid); return ctx.reply('🕯️ That selection is gone — pick another piece.'); }
    const p = rec.placed[idx];
    const d = renderer.itemDef(p.item);
    const dirRaw = String(args[0] || '').toLowerCase();
    const DIRS = { right: [1, 0], r: [1, 0], east: [1, 0], left: [-1, 0], l: [-1, 0], west: [-1, 0], down: [0, 1], d: [0, 1], south: [0, 1], up: [0, -1], u: [0, -1], north: [0, -1] };
    const dir = DIRS[dirRaw];
    if (!dir) {
        return ctx.reply(`Usage: \`${ctx.prefix} home move <left|right|up|down> [steps]\`\n_(right = +X, left = −X, down = +Y, up = −Y — the labelled axes on the preview)_`);
    }
    let steps = parseInt(args[1], 10);
    if (!Number.isFinite(steps) || steps < 1) steps = 1;
    if (steps > 11) steps = 11;

    if (d.layer === 'wall') return ctx.reply(`🖼️ *${d.name}* hangs on the wall — move it with \`${ctx.prefix} home place ${p.item} <slot 1-10> <left|right>\`.`);

    // step one tile at a time; stop at the last legal position (never overlaps)
    let nx = p.x, ny = p.y, moved = 0;
    for (let i = 0; i < steps; i++) {
        const tx = nx + dir[0], ty = ny + dir[1];
        if (!canPlace(rec, tx, ty, d, p.uid)) break;
        nx = tx; ny = ty; moved++;
    }
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
    const selUid = selection.get(ctx.senderJid);
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
    const clx = Math.max(0, Math.min(N - d.fw, tx));
    const cly = Math.max(0, Math.min(N - d.fh, ty));
    const clamped = (clx !== tx || cly !== ty);
    const spot = findFreeNear(rec, d, clx, cly, p.uid);
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

async function cmdRotate(ctx, rec) {
    const selUid = selection.get(ctx.senderJid);
    if (!selUid) return ctx.reply(`Select a piece first: \`${ctx.prefix} home select <name>\`.`);
    const p = rec.placed.find((q) => q.uid === selUid);
    if (!p) { selection.delete(ctx.senderJid); return ctx.reply('🕯️ That selection is gone — pick another piece.'); }
    const d = renderer.itemDef(p.item);
    if (d.layer === 'wall') return ctx.reply('🖼️ Banners face one way — the wall decides that.');
    const nf = !p.f;
    await Homestead.updateOne(
        { userId: ctx.senderJid, 'placed.uid': p.uid },
        { $set: { 'placed.$.f': nf, updatedAt: Date.now() } },
    );
    p.f = nf;
    await viewRoom(ctx, rec, { ...gridOptsFor(p, d), pop: { item: p.item, x: p.x, y: p.y }, hint: `The *${d.name}* turns to face ${nf ? 'the other way' : 'its original way'}.` });
}

async function cmdStore(ctx, rec, args) {
    let p = null;
    const selUid = selection.get(ctx.senderJid);
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
            return fx >= q.x && fx < q.x + d.fw && fy >= q.y && fy < q.y + d.fh;
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
    if (selection.get(ctx.senderJid) === p.uid) selection.delete(ctx.senderJid);
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
        `• \`${p} home catalog\` — furniture outfitter\n` +
        `• \`${p} home buy <name>\` — buy with ZENI\n` +
        `• \`${p} home place <name> [x y]\` — place furniture\n` +
        `• \`${p} home select\` — YOUR FURNITURE LIST (names card)\n` +
        `• \`${p} home select <name>\` — select a piece (grid preview / placement mode)\n` +
        `• \`${p} home move <left|right|up|down> [n]\` — nudge it\n` +
        `• \`${p} home moveto <x> <y>\` — send it to coordinates\n` +
        `• \`${p} home rotate\` — turn it around\n` +
        `• \`${p} home store [x y]\` — pick furniture up\n` +
        `• \`${p} home themes\` / \`${p} home theme <id>\` — room skins\n` +
        `• \`${p} base build/upgrade/info\` — outdoor structures\n\n` +
        `_Comfort grows with every piece — legendary furniture shines brightest._`,
    );
}

// ═══════════════════════════════════════════════════════════════════════════
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
    if (BASE_SUBS.includes(sub) || cmdWord === 'baseadmin' || (cmdWord === 'base' && sub !== 'catalog' && sub !== 'buy' && sub !== 'place' && sub !== 'select' && sub !== 'move' && sub !== 'moveto' && sub !== 'rotate' && sub !== 'store' && sub !== 'themes' && sub !== 'theme' && sub !== 'visit' && sub !== 'help')) {
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
            case 'move': case 'nudge':
                return cmdMove(ctx, rec, args);
            case 'moveto': case 'goto': case 'send':
                return cmdMoveTo(ctx, rec, args);
            case 'rotate': case 'turn': case 'flip':
                return cmdRotate(ctx, rec);
            case 'deselect': case 'unselect':
                selection.delete(ctx.senderJid);
                pendingPlace.delete(ctx.senderJid);
                return ctx.reply('✋ Selection cleared.');
            case 'store': case 'remove': case 'pick':
                return cmdStore(ctx, rec, args);
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

module.exports = { handleCommand, loadRec, viewRoom };
