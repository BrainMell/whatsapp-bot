// ═══════════════════════════════════════════════════════════════════════════
//  BASE BUILDER (prototype) — `.j base` command family
// ═══════════════════════════════════════════════════════════════════════════
//
//  The homestead loop, playable entirely through WhatsApp:
//
//    .j base                 → the Homestead Chart (10 top-down environments)
//    .j base goto <n|name>   → travel: zooms into one environment (image)
//    .j base enter           → step into your house (Willow Creek, zone 1)
//    .j base place <item> [slot]  → put furniture on the 7x7 iso grid
//    .j base remove <slot|item|all> → take furniture back out
//    .j base exit            → back outside to Willow Creek
//    .j base view            → re-send the current view
//    .j base items           → the furniture catalogue
//    .j base reset           → strip the room bare
//    .j base help
//
//  State lives in Mongo (BaseBuild) so the homestead persists across devices
//  and bot restarts. The room slots are numbered on the rendered image —
//  players place by slot number and see the result in the same image round.
//
//  RPG integration path (later layers, deliberately not wired yet):
//    * furniture costs coins / requires materials (economy hook on place)
//    * build limits & room unlocks keyed to adventurer rank
//    * zones gate on progression, the house stores guild/shared storage
//  The command surface and state doc are shaped so those are additive.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const renderer = require('./baseBuilderRenderer');
const BaseBuild = require('../models/BaseBuild');
const economy = require('./economy');
const botConfig = require('../../botConfig');

const P = () => botConfig.getPrefix();

// ─── furniture aliases ────────────────────────────────────────────────────────
const ITEM_ALIASES = {
    bed: 'furn_bed', bedroll: 'furn_bed',
    sofa: 'furn_sofa', couch: 'furn_sofa',
    table: 'furn_table',
    chair: 'furn_chair', stool: 'furn_chair',
    shelf: 'furn_shelf', bookshelf: 'furn_shelf', shelves: 'furn_shelf',
    plant: 'furn_plant', flower: 'furn_plant',
    lamp: 'furn_lamp', light: 'furn_lamp',
    rug: 'furn_rug', carpet: 'furn_rug',
    chest: 'furn_chest', box: 'furn_chest', storage: 'furn_chest',
    fireplace: 'furn_fireplace', hearth: 'furn_fireplace',
};

// floor slots = rows 1..6 (row 0 is the back wall row — furniture there would
// hang on the wallpaper). The numbers painted on the floorboards start at 8.
const FLOOR_MIN = renderer.ROOM_CFG.n + 1; // 8
const FLOOR_MAX = renderer.ROOM_CFG.n * renderer.ROOM_CFG.n; // 49

// slot pick order when the player doesn't specify one: spiral out from center
function slotPickOrder(n) {
    const cx = (n - 1) / 2, cy = (n - 1) / 2;
    const all = [];
    for (let r = 1; r < n; r++) for (let c = 0; c < n; c++) all.push({ r, c, d: Math.hypot(r - cx, c - cy) });
    all.sort((a, b) => a.d - b.d);
    return all.map((s) => s.r * n + s.c + 1);
}
const PICK_ORDER = slotPickOrder(renderer.ROOM_CFG.n);

// ─── helpers ──────────────────────────────────────────────────────────────────
function displayName(userId) {
    try {
        const u = economy.getUser(userId) || {};
        return (
            u.profile?.whatsappName ||
            (u.nickname && u.nickname !== 'Adventurer' && u.nickname) ||
            null
        );
    } catch (e) { return null; }
}

async function sendImage(sock, chatId, buffer, caption) {
    if (buffer && buffer.length > 100) {
        try {
            await sock.sendMessage(chatId, { image: buffer, caption });
            return;
        } catch (e) {
            try { console.error('[baseBuilder] image send failed, falling back to text:', e.message); } catch (_) {}
        }
    }
    await sock.sendMessage(chatId, { text: caption });
}

function zoneFromArg(arg) {
    const s = String(arg || '').trim().toLowerCase();
    if (!s) return null;
    const asNum = parseInt(s, 10);
    if (String(asNum) === s && asNum >= 1 && asNum <= renderer.zoneCount) return asNum - 1;
    // fuzzy name match (partial, case-insensitive)
    let best = null;
    for (let i = 0; i < renderer.zoneCount; i++) {
        const name = renderer.ZONE_DEFS[i].name.toLowerCase();
        if (name === s) return i;
        if (name.includes(s)) {
            if (best !== null) return null; // ambiguous
            best = i;
        }
    }
    return best;
}

function catalogText() {
    const lines = Object.entries(renderer.FURNITURE).map(
        ([id, f]) => `• *${f.label}* — \`${P()} base place ${f.label.toLowerCase()}\``
    );
    return ['*HOMESTEAD FURNITURE*', '', ...lines, '', '_More pieces arrive when the carpenter wakes up._'].join('\n');
}

const HELP_TEXT = [
    '*THE HOMESTEAD*',
    '',
    `Your own corner of the world. Claim it, walk it, furnish it.`,
    '',
    `*${P()} base* — open the Homestead Chart (10 environments)`,
    `*${P()} base goto <1-10|name>* — travel to a land`,
    `*${P()} base enter* — step inside your house (Willow Creek)`,
    `*${P()} base place <item> [slot]* — set furniture (slot = number on the floor)`,
    `*${P()} base remove <slot|item|all>* — clear furniture`,
    `*${P()} base items* — the furniture catalogue`,
    `*${P()} base exit* — back outside`,
    `*${P()} base view* — look again`,
    '',
    '_The homestead is young. More lands, bigger rooms and a carpenter with prices come later._',
].join('\n');

// per-user soft cooldown so group spam can't stack renders — applies to the
// IMAGE-rendering subcommands only (text replies like help/items are free),
// and mods bypass it entirely.
const RENDER_CMDS = new Set(['', 'map', 'chart', 'goto', 'go', 'travel', 'visit', 'enter', 'inside', 'house', 'exit', 'leave', 'place', 'put', 'add', 'remove', 'take', 'clear', 'view', 'look', 'show', 'reset', 'wipe']);
const _lastRun = new Map();
function tooFast(userId) {
    const now = Date.now();
    const last = _lastRun.get(userId) || 0;
    if (now - last < 900) return true;
    _lastRun.set(userId, now);
    if (_lastRun.size > 500) {
        const cutoff = now - 60000;
        for (const [k, v] of _lastRun) if (v < cutoff) _lastRun.delete(k);
    }
    return false;
}

// ─── command entry ────────────────────────────────────────────────────────────
async function showBase(sock, chatId, userId, subArg, helpers = {}) {
    if (!economy.isRegistered(userId)) {
        return sock.sendMessage(chatId, {
            text: `❌ You need to register first!\n\nType: \`${P()} register <nickname>\``,
        });
    }

    const doc = await BaseBuild.getFor(userId);
    const args = String(subArg || '').trim();
    const [rawCmd, ...rest] = args.split(/\s+/);
    const cmd = (rawCmd || '').toLowerCase();
    const restStr = rest.join(' ').trim();

    if (RENDER_CMDS.has(cmd) && tooFast(userId) && !helpers?.isMod?.(userId)) {
        return sock.sendMessage(chatId, { text: '🕰️ The homestead is still settling — one moment.' });
    }

    // ── .j base (chart) ──
    if (!cmd || cmd === 'map' || cmd === 'chart' || cmd === 'start') {
        const buf = await renderer.worldMapBuffer(doc.view === 'zone' || doc.view === 'room' ? doc.zone : null);
        const zoneLine =
            doc.zone !== null && doc.zone !== undefined && doc.view !== 'map'
                ? `You are currently at *${renderer.ZONE_DEFS[doc.zone].name}*${doc.view === 'room' ? ', indoors.' : '.'}`
                : 'You stand at the crossroads. Where to?';
        const caption = [
            '*🗺️ THE HOMESTEAD CHART*',
            '',
            zoneLine,
            '',
            `Travel: \`${P()} base goto <number|name>\``,
            `Inside your house: \`${P()} base enter\` (Willow Creek)`,
            `Full guide: \`${P()} base help\``,
        ].join('\n');
        return sendImage(sock, chatId, buf, caption);
    }

    // ── .j base goto <n|name> ──
    if (cmd === 'goto' || cmd === 'go' || cmd === 'travel' || cmd === 'visit') {
        const z = zoneFromArg(restStr);
        if (z === null || z === undefined) {
            return sock.sendMessage(chatId, {
                text: [
                    '*TRAVEL*',
                    '',
                    `Where to? Pick a number from the chart:`,
                    '',
                    ...renderer.ZONE_DEFS.map((d, i) => `*${i + 1}.* ${d.name}`),
                    '',
                    `Usage: \`${P()} base goto 1\` or \`${P()} base goto pinewood\``,
                ].join('\n'),
            });
        }
        doc.view = 'zone';
        doc.zone = z;
        await BaseBuild.safeSave(doc);
        const buf = await renderer.zoneBuffer(z);
        const caption = [
            `*${renderer.ZONE_DEFS[z].name.toUpperCase()}*`,
            '',
            z === renderer.HOUSE.zone
                ? 'Your cottage stands at the heart of Willow Creek, smoke curling from the chimney.'
                : 'You arrive and take in the land.',
            '',
            z === renderer.HOUSE.zone ? `Step inside: \`${P()} base enter\`` : `Keep wandering: \`${P()} base goto <n>\``,
            `Back to the chart: \`${P()} base map\``,
        ].join('\n');
        return sendImage(sock, chatId, buf, caption);
    }

    // ── .j base enter ──
    if (cmd === 'enter' || cmd === 'inside' || cmd === 'house') {
        const arg = restStr.toLowerCase();
        if (arg && !['house', 'home', 'cottage'].includes(arg)) {
            return sock.sendMessage(chatId, {
                text: `Only your own cottage door opens for now. \`${P()} base enter\` — once you are standing in Willow Creek.`,
            });
        }
        if (doc.view !== 'zone' || doc.zone !== renderer.HOUSE.zone) {
            return sock.sendMessage(chatId, {
                text: [
                    '*🚪 THE DOOR IS FAR AWAY*',
                    '',
                    'You are not standing outside your cottage. Travel home first:',
                    '',
                    `\`${P()} base goto willow\` — then \`${P()} base enter\``,
                ].join('\n'),
            });
        }
        doc.view = 'room';
        await BaseBuild.safeSave(doc);
        const buf = await renderer.roomBuffer(doc.placements, displayName(userId));
        const n = doc.placements.length;
        const caption = [
            '*🏠 YOUR HOMESTEAD INTERIOR*',
            '',
            n === 0
                ? 'The room is bare. Floorboards, hearth-dust, possibility.'
                : `Your things: *${n}* piece${n === 1 ? '' : 's'} placed.`,
            '',
            `Place furniture: \`${P()} base place bed\` — or with a floor number: \`${P()} base place bed 24\``,
            `Remove: \`${P()} base remove <slot|item>\` · Catalogue: \`${P()} base items\``,
            `Step out: \`${P()} base exit\``,
        ].join('\n');
        return sendImage(sock, chatId, buf, caption);
    }

    // ── .j base exit ──
    if (cmd === 'exit' || cmd === 'leave' || cmd === 'out') {
        if (doc.view !== 'room') {
            return sock.sendMessage(chatId, { text: 'You are already outdoors. The chart: `' + P() + ' base`' });
        }
        doc.view = 'zone';
        doc.zone = renderer.HOUSE.zone;
        await BaseBuild.safeSave(doc);
        const buf = await renderer.zoneBuffer(renderer.HOUSE.zone);
        return sendImage(sock, chatId, buf, [
            '*WILLOW CREEK*',
            '',
            'You step out and pull the door shut behind you.',
            '',
            `Re-enter: \`${P()} base enter\` · Chart: \`${P()} base map\``,
        ].join('\n'));
    }

    // ── .j base items ──
    if (cmd === 'items' || cmd === 'catalogue' || cmd === 'catalog' || cmd === 'furniture') {
        return sock.sendMessage(chatId, { text: catalogText() });
    }

    // ── .j base place <item> [slot] ──
    if (cmd === 'place' || cmd === 'put' || cmd === 'add') {
        if (doc.view !== 'room') {
            return sock.sendMessage(chatId, {
                text: [
                    '*🪑 FURNISHING*',
                    '',
                    'You can only furnish the inside of your house.',
                    '',
                    `\`${P()} base goto willow\` → \`${P()} base enter\` → \`${P()} base place bed\``,
                ].join('\n'),
            });
        }
        const itemKey = (rest[0] || '').toLowerCase();
        const item = ITEM_ALIASES[itemKey] || (renderer.FURNITURE[itemKey] ? itemKey : null) ||
            // allow ".j base place book shelf"-style two-word handles
            (ITEM_ALIASES[restStr.toLowerCase()] ?? null);
        if (!item) {
            return sock.sendMessage(chatId, {
                text: [
                    '*🪑 PLACE WHAT?*',
                    '',
                    `Usage: \`${P()} base place <item> [slot]\``,
                    '',
                    'Known pieces: ' + Object.values(renderer.FURNITURE).map((f) => f.label.toLowerCase()).join(', '),
                ].join('\n'),
            });
        }
        const n = renderer.ROOM_CFG.n;
        let slot = null;
        const slotArg = rest[1] ? parseInt(rest[1], 10) : NaN;
        if (Number.isFinite(slotArg)) {
            if (slotArg < FLOOR_MIN || slotArg > FLOOR_MAX) {
                return sock.sendMessage(chatId, { text: `Floors run *${FLOOR_MIN}* to *${FLOOR_MAX}* — the numbers are painted on the floorboards (the back wall row is not floor).` });
            }
            slot = slotArg;
        } else {
            slot = PICK_ORDER.find((s) => !doc.placements.some((p) => p.slot === s));
            if (!slot) {
                return sock.sendMessage(chatId, { text: 'The room is full to the rafters. Remove something first: `' + P() + ' base remove <slot>`' });
            }
        }
        const occupant = doc.placements.find((p) => p.slot === slot);
        if (occupant) {
            const label = renderer.FURNITURE[occupant.item]?.label || occupant.item;
            return sock.sendMessage(chatId, {
                text: `Floor *${slot}* already holds the *${label}*. Move it: \`${P()} base remove ${slot}\` first.`,
            });
        }
        doc.placements.push({ slot, item });
        await BaseBuild.safeSave(doc);
        const buf = await renderer.roomBuffer(doc.placements, displayName(userId));
        const label = renderer.FURNITURE[item].label;
        return sendImage(sock, chatId, buf, [
            '*🪑 PLACED*',
            '',
            `The *${label}* now sits on floor *${slot}*.`,
            '',
            `More: \`${P()} base place <item> [slot]\` · Undo: \`${P()} base remove ${slot}\``,
        ].join('\n'));
    }

    // ── .j base remove <slot|item|all> ──
    if (cmd === 'remove' || cmd === 'take' || cmd === 'clear') {
        if (doc.view !== 'room') {
            return sock.sendMessage(chatId, { text: `You are not indoors. \`${P()} base enter\` from Willow Creek first.` });
        }
        const argStr = restStr.toLowerCase();
        if (!argStr) {
            return sock.sendMessage(chatId, { text: `Remove what? \`${P()} base remove <slot|item|all>\` — slots are the numbers on the floor.` });
        }
        if (argStr === 'all' || argStr === 'everything') {
            const count = doc.placements.length;
            if (!count) return sock.sendMessage(chatId, { text: 'The room is already bare.' });
            doc.placements = [];
            await BaseBuild.safeSave(doc);
            const buf = await renderer.roomBuffer(doc.placements, displayName(userId));
            return sendImage(sock, chatId, buf, [
                '*🧹 SWEPT CLEAN*',
                '',
                `You carried out *${count}* piece${count === 1 ? '' : 's'}. The floorboards sigh with relief.`,
            ].join('\n'));
        }
        const asNum = parseInt(argStr, 10);
        let removed = null;
        if (String(asNum) === argStr) {
            const idx = doc.placements.findIndex((p) => p.slot === asNum);
            if (idx === -1) return sock.sendMessage(chatId, { text: `Floor *${asNum}* is empty.` });
            removed = doc.placements.splice(idx, 1)[0];
        } else {
            const item = ITEM_ALIASES[argStr] || argStr;
            const idx = doc.placements.findIndex((p) => p.item === item);
            if (idx === -1) return sock.sendMessage(chatId, { text: `No *${argStr}* in the room.` });
            removed = doc.placements.splice(idx, 1)[0];
        }
        await BaseBuild.safeSave(doc);
        const buf = await renderer.roomBuffer(doc.placements, displayName(userId));
        const label = renderer.FURNITURE[removed.item]?.label || removed.item;
        return sendImage(sock, chatId, buf, [
            '*🧹 REMOVED*',
            '',
            `The *${label}* left floor *${removed.slot}*.`,
        ].join('\n'));
    }

    // ── .j base view ──
    if (cmd === 'view' || cmd === 'look' || cmd === 'show') {
        if (doc.view === 'room') {
            const buf = await renderer.roomBuffer(doc.placements, displayName(userId));
            return sendImage(sock, chatId, buf, '*🏠 YOUR HOMESTEAD INTERIOR*\n\n`' + P() + ' base place <item> [slot]` to furnish.');
        }
        if (doc.view === 'zone' && doc.zone !== null) {
            const buf = await renderer.zoneBuffer(doc.zone);
            return sendImage(sock, chatId, buf, `*${renderer.ZONE_DEFS[doc.zone].name.toUpperCase()}*\n\nChart: \`${P()} base map\``);
        }
        const buf = await renderer.worldMapBuffer(null);
        return sendImage(sock, chatId, buf, '*🗺️ THE HOMESTEAD CHART*\n\nTravel: `' + P() + ' base goto <number|name>`');
    }

    // ── .j base reset ──
    if (cmd === 'reset' || cmd === 'wipe') {
        doc.placements = [];
        doc.view = 'map';
        doc.zone = null;
        await BaseBuild.safeSave(doc);
        const buf = await renderer.worldMapBuffer(null);
        return sendImage(sock, chatId, buf, '*🔄 HOMESTEAD RESET*\n\nThe room is bare and you stand at the crossroads again.');
    }

    // unknown subcommand
    return sock.sendMessage(chatId, { text: HELP_TEXT });
}

module.exports = { showBase, HELP_TEXT };
