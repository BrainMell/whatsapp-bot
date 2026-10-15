'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  HOMESTEAD — the joker base builder (isometric house builder)
// ═══════════════════════════════════════════════════════════════════════════
//  Every adventurer owns a 12x12 isometric room. Furniture is bought with
//  ZENI (one instance per purchase), placed on the grid, rearranged, stored
//  again, and the whole room renders as an animated WhatsApp "GIF" (mp4,
//  gifPlayback) with live torches / hearth / cauldron / wishing well.
//
//  Commands (handled here, dispatched from engine.js):
//    .home                          view your room + status
//    .home catalog [page]           outfitter card pages
//    .home buy <name>               buy furniture / theme with ZENI
//    .home place <name> [x y]       place owned furniture (auto-spot if no coords)
//    .home move <x> <y> <tx> <ty>   rearrange
//    .home store <x> <y>            pick furniture back up
//    .home themes / theme <id>      list / switch-buy room skins
//    .home visit @user              see someone else's room
//    .home help                     command overview
//
//  Geometry contract with homesteadRenderer.js (keep in sync):
//    grid N=12; item/rug footprint top-left tile (x,y); wall banners use
//    x = wall tile index 1..N-2 and y = 0 (left wall) / 1 (right wall).
//    Rugs may overlap rugs; items may overlap nothing.
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

// ── helpers ──
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

/** Can def be placed at (x,y)? ignoreIdx lets move skip the moved item. */
function canPlace(rec, x, y, def, ignoreIdx = -1) {
    if (def.layer === 'wall') {
        // banner: x = wall index, y = side (0 left / 1 right)
        if (!Number.isInteger(x) || x < 1 || x > N - 2) return false;
        if (y !== 0 && y !== 1) return false;
        return !rec.placed.some((p, i) =>
            i !== ignoreIdx &&
            (renderer.itemDef(p.item) || {}).layer === 'wall' &&
            p.x === x && p.y === y);
    }
    if (x < 0 || y < 0 || x + def.fw > N || y + def.fh > N) return false;
    const cells = cellsOf(x, y, def);
    for (let i = 0; i < rec.placed.length; i++) {
        if (i === ignoreIdx) continue;
        const p = rec.placed[i];
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

async function loadRec(userId) {
    let rec = await Homestead.findOne({ userId }).lean();
    if (!rec) {
        // first open: seed the starter homestead
        const doc = await Homestead.findOneAndUpdate(
            { userId },
            { $setOnInsert: { userId, theme: 'oakhaven', themesOwned: ['oakhaven'], owned: [...STARTER_OWNED], placed: [...STARTER_PLACED] } },
            { new: true, upsert: true },
        ).lean();
        rec = doc;
    }
    rec.placed = (rec.placed || []).filter((p) => renderer.itemDef(p.item));
    rec.owned = (rec.owned || []).filter((id) => renderer.itemDef(id));
    rec.themesOwned = (rec.themesOwned || []).filter((t) => renderer.THEMES[t]);
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

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMMANDS
// ═══════════════════════════════════════════════════════════════════════════
async function viewRoom(ctx, rec, opts = {}) {
    const { sock, chatId, reply } = ctx;
    if (renderLocks.has(rec.userId)) {
        return reply('⏳ Your homestead portrait is still being painted — one moment, try again in a few seconds.');
    }
    renderLocks.add(rec.userId);
    try {
        const state = {
            owner: opts.ownerName || economy.getDisplayName(rec.userId),
            theme: rec.theme,
            placed: rec.placed,
        };
        const media = await renderer.renderRoomImage(state, { pop: opts.pop || null, hint: opts.hint });
        const comfort = rec.placed.reduce((s, p) => s + ((renderer.itemDef(p.item) || {}).comfort || 0), 0);
        const theme = renderer.THEMES[rec.theme] || renderer.THEMES.oakhaven;
        const cap = `🏠 *${state.owner}'s Homestead* — ${theme.name}\n\n` +
            `♥ Comfort *${comfort}*  •  🪑 ${rec.placed.length} pieces placed  •  📦 ${rec.owned.length} in storage\n` +
            (opts.pop ? `✨ The *${(renderer.itemDef(opts.pop.item) || {}).name}* was placed!\n` : '') +
            `\n_${opts.hint || '.home place <item> • .home catalog • .home help'}_`;
        if (media.contentType === 'video/mp4') {
            await sock.sendMessage(chatId, { video: media.buffer, gifPlayback: true, caption: cap }, { quoted: ctx.m });
        } else {
            await sock.sendMessage(chatId, { image: media.buffer, caption: cap }, { quoted: ctx.m });
        }
    } finally {
        renderLocks.delete(rec.userId);
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

async function cmdBuy(ctx, rec, args) {
    const query = args.join(' ');
    const it = resolveItem(query);
    if (!it) {
        const sug = CAT().items.filter((x) => x.id.includes(query.slice(0, 4))).slice(0, 4).map((x) => x.name);
        return ctx.reply(`❌ No furniture called *${query || '—'}*.\n` +
            (sug.length ? `Did you mean: ${sug.join(', ')}?\n` : '') +
            `Browse: \`${ctx.prefix} home catalog\``);
    }
    // theme purchase shortcut (themes are ids, not catalog items)
    const balance = economy.getBalance(ctx.senderJid);
    if (balance < it.price) {
        return ctx.reply(`💰 Not enough ZENI — *${it.name}* costs *${it.price.toLocaleString()}* and you have *${balance.toLocaleString()}*.\n_Earn more by hunting, quests and games._`);
    }
    economy.removeMoney(ctx.senderJid, it.price, `Homestead: bought ${it.name}`);
    await Homestead.updateOne(
        { userId: ctx.senderJid },
        { $push: { owned: it.id }, $setOnInsert: { userId: ctx.senderJid, theme: 'oakhaven' }, $set: { updatedAt: Date.now() } },
        { upsert: true },
    );
    return ctx.reply(`${RARITY_STAR[it.rarity]} Bought *${it.name}* for *${it.price.toLocaleString()}* ZENI!\n\nPlace it: \`${ctx.prefix} home place ${it.id}\``);
}

async function cmdPlace(ctx, rec, args) {
    const query = args[0];
    const it = resolveItem(query);
    if (!it) return ctx.reply(`❌ Place what? Try: \`${ctx.prefix} home place bed_noble\` — owned pieces: ${rec.owned.length ? rec.owned.join(', ') : '_none, visit the catalog_'} `);
    const ownedIdx = rec.owned.indexOf(it.id);
    if (ownedIdx === -1) {
        return ctx.reply(`📦 You don't own *${it.name}* yet.\nBuy it: \`${ctx.prefix} home buy ${it.id}\` (${it.price.toLocaleString()} ZENI)`);
    }

    let x, y;
    if (it.layer === 'wall') {
        // .home place banner_crimson [wallIndex] [left|right]
        x = Number.isInteger(parseInt(args[1], 10)) ? parseInt(args[1], 10) : 4;
        const side = String(args[2] || '').toLowerCase();
        y = side.startsWith('r') ? 1 : 0;
    } else if (Number.isFinite(parseInt(args[1], 10)) && Number.isFinite(parseInt(args[2], 10))) {
        x = parseInt(args[1], 10); y = parseInt(args[2], 10);
    } else {
        const spot = findFreeSpot(rec, it);
        if (!spot) return ctx.reply('🏠 Your room is full! Store something first: `.home store <x> <y>`');
        x = spot.x; y = spot.y;
    }
    if (!canPlace(rec, x, y, it)) {
        return ctx.reply(`🚧 That spot is blocked (or out of bounds).\nFree spot suggestion: \`${ctx.prefix} home place ${it.id}\` without coordinates.`);
    }

    rec.owned.splice(ownedIdx, 1);
    rec.placed.push({ item: it.id, x, y });
    await savePlaced(ctx.senderJid, rec.placed, { owned: rec.owned });
    await viewRoom(ctx, { ...rec, owned: rec.owned, placed: rec.placed }, { pop: { item: it.id, x, y } });
}

async function cmdMove(ctx, rec, args) {
    const [fx, fy, tx, ty] = args.map((a) => parseInt(a, 10));
    if ([fx, fy, tx, ty].some((v) => !Number.isFinite(v))) {
        return ctx.reply(`Usage: \`${ctx.prefix} home move <fromX> <fromY> <toX> <toY>\``);
    }
    const idx = rec.placed.findIndex((p) => {
        const d = renderer.itemDef(p.item);
        if (!d) return false;
        if (d.layer === 'wall') return p.x === fx && p.y === (fy === 1 ? 1 : 0);
        return fx >= p.x && fx < p.x + d.fw && fy >= p.y && fy < p.y + d.fh;
    });
    if (idx === -1) return ctx.reply(`❌ Nothing stands at (${fx}, ${fy}).`);
    const p = rec.placed[idx];
    const d = renderer.itemDef(p.item);
    let nx = tx, ny = ty;
    if (d.layer === 'wall') { ny = ty === 1 ? 1 : 0; }
    if (!canPlace(rec, nx, ny, d, idx)) return ctx.reply('🚧 Can\'t put it there — blocked or out of bounds.');
    rec.placed[idx] = { item: p.item, x: nx, y: ny };
    await savePlaced(ctx.senderJid, rec.placed);
    await viewRoom(ctx, { ...rec, placed: rec.placed }, {});
}

async function cmdStore(ctx, rec, args) {
    const [fx, fy] = args.map((a) => parseInt(a, 10));
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) {
        return ctx.reply(`Usage: \`${ctx.prefix} home store <x> <y>\``);
    }
    const idx = rec.placed.findIndex((p) => {
        const d = renderer.itemDef(p.item);
        if (!d) return false;
        if (d.layer === 'wall') return p.x === fx && p.y === (fy === 1 ? 1 : 0);
        return fx >= p.x && fx < p.x + d.fw && fy >= p.y && fy < p.y + d.fh;
    });
    if (idx === -1) return ctx.reply(`❌ Nothing stands at (${fx}, ${fy}).`);
    const [gone] = rec.placed.splice(idx, 1);
    rec.owned.push(gone.item);
    await savePlaced(ctx.senderJid, rec.placed, { owned: rec.owned });
    return ctx.reply(`📦 Picked up *${(renderer.itemDef(gone.item) || {}).name}* — it's back in your storage.`);
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
        `🏠 *THE HOMESTEAD* — your own isometric room\n\n` +
        `• \`${p} home\` — view your room (animated!)\n` +
        `• \`${p} home catalog\` — furniture outfitter\n` +
        `• \`${p} home buy <name>\` — buy with ZENI\n` +
        `• \`${p} home place <name> [x y]\` — place furniture\n` +
        `• \`${p} home move <x y> <toX toY>\` — rearrange\n` +
        `• \`${p} home store <x y>\` — pick furniture up\n` +
        `• \`${p} home themes\` / \`${p} home theme <id>\` — room skins\n` +
        `• \`${p} home visit @user\` — peek at a friend's room\n\n` +
        `_Comfort grows with every piece — legendary furniture shines brightest._`,
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY — called from engine.js
// ctx: { sock, chatId, senderJid, m, reply, text, prefix }
//   text = full lowercased command text (".home place bed 3 4")
// ═══════════════════════════════════════════════════════════════════════════
async function handleCommand(ctx) {
    const tokens = String(ctx.text || '').trim().split(/\s+/).filter(Boolean);
    // tokens[0] = ".home" / ".base" / "home"/"base" (prefix-stripped variants)
    const sub = (tokens[1] || '').toLowerCase();
    const args = tokens.slice(2);

    if (!economy.isRegistered(ctx.senderJid)) {
        return ctx.reply(`❌ You need to register first!\n\nType: \`${ctx.prefix} register <nickname>\``);
    }

    const rec = await loadRec(ctx.senderJid);

    try {
        switch (sub) {
            case '': case 'view': case 'room': case 'my':
                return viewRoom(ctx, rec, {});
            case 'catalog': case 'shop': case 'furni':
                return cmdCatalog(ctx, rec, args);
            case 'buy':
                if (!args.length) return ctx.reply(`Usage: \`${ctx.prefix} home buy <name>\` — browse: \`${ctx.prefix} home catalog\``);
                return cmdBuy(ctx, rec, args);
            case 'place': case 'put':
                if (!args.length) return ctx.reply(`Usage: \`${ctx.prefix} home place <name> [x y]\` — owned: ${rec.owned.length ? rec.owned.join(', ') : 'none yet'}`);
                return cmdPlace(ctx, rec, args);
            case 'move':
                return cmdMove(ctx, rec, args);
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
    return `🏠 *THE HOMESTEAD*\n• \`${p} home\` • \`${p} home catalog\` • \`${p} home buy <name>\`\n• \`${p} home place <name> [x y]\` • \`${p} home move\` • \`${p} home store\`\n• \`${p} home themes\` • \`${p} home visit @user\` • \`${p} home help\``;
}

module.exports = { handleCommand };
