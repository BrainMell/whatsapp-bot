'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  BASE BUILDER — outdoor base hub (owner spec §6/7/8/9, 2026-10-15)
//  `.j base` / `.j home` open the OUTDOOR base map (never straight into the
//  house). `.j base house <#id>` / `.j house <#id>` opens a house interior.
//  Fixed designated zones: House (free, Structure 1), Mines, Pond, Hunting
//  Grounds (fenced, gated). Purchasable structures land on expansion plots.
//  Everything upgradable to L3 with distinct sprites; all writes atomic.
// ═══════════════════════════════════════════════════════════════════════════

const Base = require('../models/Base');
const renderer = require('./homesteadBaseRenderer');
const economy = require('./economy');

const LAYOUT = renderer.LAYOUT;
const structDef = renderer.structDef;

let _uidCounter = 0;
function uid() { return `b${Date.now().toString(36)}${(_uidCounter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`; }

// per-user mutation locks + purchase idempotency (same contract as homestead)
const opLocks = new Set();
const seenMsgIds = new Map();
setInterval(() => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [k, ts] of seenMsgIds) if (ts < cutoff) seenMsgIds.delete(k);
}, 60 * 1000).unref();

function normalizeJid(j) { return String(j || '').split(':')[0].split('?')[0]; }

/** Layout-derived fixed structures for a fresh base. House = Structure 1. */
function fixedSeed() {
    return [
        { uid: uid(), type: 'house', level: 1, x: LAYOUT.house.x, y: LAYOUT.house.y },
        { uid: uid(), type: 'mines', level: 1, x: LAYOUT.mines.x, y: LAYOUT.mines.y },
        { uid: uid(), type: 'pond', level: 1, x: LAYOUT.pond.x, y: LAYOUT.pond.y },
        { uid: uid(), type: 'hunting', level: 1, x: LAYOUT.hunting.x, y: LAYOUT.hunting.y },
        { uid: uid(), type: 'shop', level: 1, x: LAYOUT.shop.x, y: LAYOUT.shop.y },
        { uid: uid(), type: 'barracks', level: 1, x: LAYOUT.barracks.x, y: LAYOUT.barracks.y },
    ];
}

async function loadBase(userId) {
    let rec = await Base.findOne({ userId }).lean();
    if (!rec) {
        rec = await Base.findOneAndUpdate(
            { userId },
            { $setOnInsert: { userId, structures: fixedSeed(), updatedAt: Date.now() } },
            { upsert: true, returnDocument: 'after' },
        ).lean();
    }
    // guarantee the four fixed structures exist exactly once — ALWAYS (older
    // bases predating a layout change must still get their missing zones;
    // owner 2026-10-16: "the pond and mines and everything else? Doesn't exist")
    const have = new Set((rec.structures || []).map((s) => s.type));
    const missing = fixedSeed().filter((f) => !have.has(f.type));
    // layout v2/v3/v4 migration: the fixed anchors moved (v2 house 6,6→6,7;
    // v3 house 6,7→10,6 MAIN STREET VILLAGE; v4 hunting gatehouse 3,8→7,14
    // — THE GATEHOUSE NOW GUARDS THE SOUTH GATE, owner "orientation still
    // weird") — relocate the FIXED structures so every base matches the new
    // village plan. Safe: nothing else can legally occupy these cells.
    const ANCHORS = { house: LAYOUT.house, hunting: LAYOUT.hunting, shop: LAYOUT.shop, barracks: LAYOUT.barracks };
    // layout v3/v4 plot re-anchoring: built structures bought on the OLD plot
    // anchors re-seat onto the new ones (else a v2 blacksmith at 11,6 would
    // end up buried under the relocated house). Map chases every historical
    // anchor straight to its v4 home in ONE pass. Only EXACT anchors move —
    // admin-relocated structures keep their custom spot.
    const OLD_PLOT_ANCHORS = {
        '11,6': [8, 1], '13,5': [8, 1],      // → #1 north terrace (fronts miners'/pond lane)
        '11,10': [13, 7], '12,10': [13, 7], // → #2 SE terrace (fronts extended south lane)
        '6,11': [5, 11], '5,11': [4, 5],     // → #3 west plaza frontage — v3's (5,11) sat
                                             //   directly BEHIND the relocated gatehouse
                                             //   on screen (same street diagonal), a built
                                             //   structure there rendered ~90% hidden
    };
    let dirty = missing.length > 0;
    for (const st of rec.structures || []) {
        const tgt = ANCHORS[st.type];
        if (tgt && (st.x !== tgt.x || st.y !== tgt.y)) { st.x = tgt.x; st.y = tgt.y; dirty = true; continue; }
        const old = OLD_PLOT_ANCHORS[`${st.x},${st.y}`];
        if (old && (st.x !== old[0] || st.y !== old[1])) { st.x = old[0]; st.y = old[1]; dirty = true; }
    }
    if (missing.length) rec.structures = [...(rec.structures || []), ...missing];
    if (dirty) {
        await Base.updateOne(
            { userId },
            { $set: { structures: rec.structures, updatedAt: Date.now() } },
        );
    }
    if (!rec) throw new Error('base record could not be created — try again');
    rec.structures = (rec.structures || []).filter((s) => structDef(s.type));
    return rec;
}

/** Expansion plots (3x3 each) — free = no structure overlapping its cells. */
function plotsFor(rec) {
    const occupied = new Set();
    for (const st of rec.structures) {
        const d = structDef(st.type);
        if (!d) continue;
        for (let ix = 0; ix < d.fw; ix++)
            for (let iy = 0; iy < d.fh; iy++) occupied.add(`${st.x + ix},${st.y + iy}`);
    }
    // LAYOUT v4 expansion plots (3x3 each) — re-anchored to the FRONTABLE
    // sides of the lanes (owner: "leaving room for plots of land" + "the
    // orientation still weird"): an iso building can only front a street
    // from the street's north/west side, so every plot sits where a built
    // structure's baked facade greets the street: #1 north terrace above
    // the miners'/pond lane, #2 SE terrace above the extended south lane,
    // #3 west plaza frontage — faces the village green across the ring (a
    // building there mirrors its facade onto the square); v3's (5,11) spot
    // is a visual trap now: it sits directly BEHIND the relocated gatehouse
    // on the same screen diagonal, so a built structure rendered ~90% hidden
    const PLOTS = [
        { id: 1, x: 8, y: 1 },
        { id: 2, x: 13, y: 7 },
        { id: 3, x: 4, y: 5 },
        { id: 4, x: 2, y: 13 },
    ];
    return PLOTS.map((p) => {
        const cells = [];
        for (let ix = 0; ix < 3; ix++) for (let iy = 0; iy < 3; iy++) cells.push(`${p.x + ix},${p.y + iy}`);
        const free = !cells.some((c) => occupied.has(c));
        const built = rec.structures.find((st) => st.x === p.x && st.y === p.y) || null;
        return { ...p, fw: 3, fh: 3, free, built };
    });
}

async function saveState(rec) {
    await Base.updateOne({ userId: rec.userId }, { $set: { structures: rec.structures, updatedAt: Date.now() } }, { upsert: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════════════════════════════════════
/** The shared render-state shape for every base view (map + close-ups). */
function baseState(rec) {
    const state = {
        owner: economy.getDisplayName(rec.userId),
        structures: rec.structures,
        freePlots: plotsFor(rec).filter((p) => p.free),
    };
    try {
        const guilds = require('./guilds');
        const gName = guilds.getUserGuild(rec.userId);
        if (gName) { state.guildName = gName; state.guild = guilds.getGuild(gName) || null; }
    } catch (e) { /* realm falls back to the owner-seeded default */ }
    return state;
}

function realmNameOf(state) {
    try {
        const _C = require('./continents');
        return _C.BY_BIOME[_C.baseBiome({ owner: state.owner, guildName: state.guildName, guild: state.guild })].name;
    } catch (e) { return 'the wilds'; }
}

async function viewBase(ctx, opts = {}) {
    const { sock, chatId, reply } = ctx;
    const rec = await loadBase(ctx.senderJid);
    const plots = plotsFor(rec);
    const state = baseState(rec);
    try {
        if (ctx.m?.key) await sock.sendMessage(chatId, { react: { text: '🗺️', key: ctx.m.key } });
    } catch (e) { /* best-effort */ }
    let media;
    try {
        let watchdogTimer;
        media = await Promise.race([
            renderer.renderBaseImage(state, { hint: opts.hint, static: false, celebrate: opts.celebrate }),
            new Promise((_, reject) => {
                watchdogTimer = setTimeout(() => reject(new Error('render watchdog: base render exceeded 90s')), 90000);
                if (watchdogTimer.unref) watchdogTimer.unref();
            }),
        ]);
        if (watchdogTimer) clearTimeout(watchdogTimer);
    } catch (renderErr) {
        console.error('[base] render failed/stalled:', renderErr.message);
        return reply(`🔥 The cartographer dropped his quill (render stalled). Try \`${ctx.prefix} base\` again in a minute.`);
    }
    const list = rec.structures
        .map((st, i) => {
            const d = structDef(st.type);
            const lv = d.levels.find((l) => l.level === st.level) || d.levels[0];
            return `#${i + 1} ${d.name} — *${lv.name}* (Lv.${st.level})${st.type === 'house' ? '  🏠' : ''}`;
        })
        .join('\n');
    const _C = require('./continents');
    const _realm = _C.BY_BIOME[_C.baseBiome({ owner: state.owner, guildName: state.guildName, guild: state.guild })];
    const _near = state.guildName ? ` · near *${_C.placementOf(state.guildName, state.guild || {}).marker.region}*` : '';
    const cap = `🗺️ *${state.owner}'s Base*\n🌍 ${_realm.name}${_near}\n\n${list}\n` +
        `🪧 Free plots: ${plots.filter((p) => p.free).map((p) => p.id).join(', ') || 'none'}\n\n` +
        `_${ctx.prefix} base <#id> — open a structure (zoomed)_\n` +
        `_${ctx.prefix} base house 1 — enter your house_\n` +
        `_${ctx.prefix} base build <blacksmith|medbay|alchemy|market|barracks> [plot#]_\n` +
        `_${ctx.prefix} base upgrade <type|#id> • ${ctx.prefix} base info_`;
    try {
        if (media.contentType === 'video/mp4') {
            await sock.sendMessage(chatId, { video: media.buffer, gifPlayback: true, caption: cap }, { quoted: ctx.m });
        } else {
            await sock.sendMessage(chatId, { image: media.buffer, caption: cap }, { quoted: ctx.m });
        }
    } catch (sendErr) {
        console.error('[base] media send failed:', sendErr.message);
        return reply(`🗺️ The map is drawn but WhatsApp refused delivery (${String(sendErr.message).slice(0, 60)}). Try again shortly.`);
    }
}

/** `.j base house 1` / `.j house` / `.j base 1` — open a structure. */
async function enterStructure(ctx, idArg) {
    const rec = await loadBase(ctx.senderJid);
    // number → structure #id in the listing order; 'house'/'home' → the house
    let st = null;
    const homestead = require('./homestead');
    if (!idArg || idArg === 'house' || idArg === 'my' || idArg === 'view' || idArg === 'room' || idArg === 'homestead' || idArg === 'inside') {
        st = rec.structures.find((s) => s.type === 'house');
    } else if (/^\d+$/.test(String(idArg))) {
        st = rec.structures[parseInt(idArg, 10) - 1];
    } else {
        const t = String(idArg).toLowerCase();
        st = rec.structures.find((s) => s.type === t || structDef(s.type)?.name.toLowerCase().startsWith(t));
    }
    if (!st) return ctx.reply(`❌ No such structure. \`${ctx.prefix} base info\` lists them with their #ids.`);
    const d = structDef(st.type);
    if (st.type === 'house') {
        // the house interior IS the existing isometric room (preserved 1:1)
        const hRec = await homestead.loadRec(ctx.senderJid);
        const lv = d.levels.find((l) => l.level === st.level) || d.levels[0];
        return homestead.viewRoom(ctx, hRec, { hint: `Your ${lv.name} (Structure #1, Lv.${st.level}) — ${ctx.prefix} home select <item> to rearrange.` });
    }
    return zoomIn(ctx, rec, st);
}

// ═══════════════════════════════════════════════════════════════════════════
// ZOOM CARDS — `.j base <#|name>` is a PURE VIEWER (owner spec §5, 2026-10-21):
// one clean zoomed structure card + a caption naming the command that works here.
// The viewer NEVER executes gameplay — fishing/hunting live at `.j fish` / `.j hunt`
// (runActivity below), mining at `.j mine`, healing at `.j clinic`, brewing at
// `.j brew`. Owner spec rule 1: gameplay rules/aliases stay intact otherwise.
// ═══════════════════════════════════════════════════════════════════════════
const ALIASES = { mine: 'mines', mining: 'mines', cave: 'mines', fish: 'pond', fishing: 'pond', cast: 'pond', lake: 'pond', hunt: 'hunting', hunting: 'hunting', camp: 'hunting', market: 'shop', merchant: 'shop', store: 'shop', summons: 'barracks', summon: 'barracks', barrack: 'barracks', smith: 'blacksmith', forge: 'blacksmith', clinic: 'medbay', hospital: 'medbay', heal: 'medbay', alchemist: 'alchemy', brew: 'alchemy' };
// §5: ONE command-hint map — what the player can DO at each place (prefix-aware,
// real commands only). Drives the panel's action list and the viewer caption.
const HINTS = {
    mines: (P) => [`${P} mine <spot>`, `${P} base upgrade mines`],
    pond: (P) => [`${P} fish`, `${P} base upgrade pond`],
    hunting: (P) => [`${P} hunt`, `${P} sell <pelt>`],
    shop: (P) => [`${P} shop`, `${P} buy <item|#>`, `${P} base upgrade shop`],
    barracks: (P) => [`${P} summon`, `${P} summons`, `${P} base upgrade barracks`],
    blacksmith: (P) => [`${P} blacksmith`, `${P} repair <slot|#>`, `${P} forge <item>`],
    medbay: (P) => [`${P} clinic`, `${P} base upgrade medbay`],
    alchemy: (P) => [`${P} recipes`, `${P} brew <potion>`, `${P} base upgrade alchemy`],
};
const FLAVOUR = {
    mines: 'Rich veins run deep below the hills.',
    pond: 'Still water, hungry fish. Cast a line.',
    hunting: 'Targets, tents and a trail into the deep woods.',
    shop: 'The merchants of your village hawk their wares.',
    barracks: 'Your bonded summons muster here between fights.',
    blacksmith: 'The forge never goes cold.',
    medbay: 'Bandages, tents and quiet healing.',
    alchemy: 'Bubbling flasks and strange smoke.',
};

function biomeOf(rec) {
    try {
        const guilds = require('./guilds');
        const gName = guilds.getUserGuild(rec.userId);
        return require('./continents').baseBiome({ owner: economy.getDisplayName(rec.userId), guildName: gName || undefined, guild: gName ? guilds.getGuild(gName) : undefined });
    } catch (e) { return 'isle'; }
}

function specFor(ctx, rec, st, extra = {}) {
    const d = structDef(st.type);
    const lv = d.levels.find((l) => l.level === st.level) || d.levels[0];
    const next = d.levels.find((l) => l.level === st.level + 1);
    const P = ctx.prefix || '.j';
    const idx = rec.structures.indexOf(st) + 1;
    const rows = [['Level', `${st.level} / ${d.levels.length}`], ['Next upgrade', next ? `${next.price.toLocaleString()} ZENI` : (d.noUpgrade ? '—' : 'Maxed')]];
    const acts = (HINTS[st.type] ? HINTS[st.type](P) : [`${P} base upgrade #${idx}`]);
    try {
        if (st.type === 'mines') rows.push(['Mines yield', ['×1.00', '×1.25', '×1.50'][st.level - 1] || '×1.00']);
        if (st.type === 'pond') rows.push(['Catch tier', ['Minnows', 'Trout', 'Koi'][st.level - 1] || '—']);
        if (st.type === 'hunting') { const br = (rec.structures.find((x) => x.type === 'barracks') || {}).level || 1; rows.push(['Party', `Barracks Lv ${br}`]); }
        if (st.type === 'shop') rows.push(['Wares', ['Stall', 'Shop', 'Bazaar'][st.level - 1] || '—']);
    } catch (e) { /* stats are decoration */ }
    return { title: d.name, subtitle: `${lv.name} · Lv ${st.level}`, note: FLAVOUR[st.type] || '', rows, actions: acts, footer: `${P} base ${idx} • ${P} base info`, ...extra };
}

async function renderZoom(ctx, rec, st, extra = {}) {
    const scenes = require('./structureScenes');
    return scenes.renderStructureCard({ type: st.type, level: st.level, biome: biomeOf(rec), seed: rec.userId, spec: specFor(ctx, rec, st, extra) });
}

/** §12/§16 helper — a structure's level WITHOUT creating/migrating anything.
 * Free fixed structures default to 1; purchasable ones default to 0 (not built). */
const FREE_TYPES = new Set(['house', 'mines', 'pond', 'hunting', 'shop', 'barracks']);
async function getStructureLevel(userId, type) {
    try {
        const rec = await Base.findOne({ userId }, { structures: 1 }).lean();
        const st = rec && (rec.structures || []).find((x) => x.type === type);
        if (st) return Math.max(0, Math.min(3, st.level || 1));
    } catch (e) { /* fall through to default */ }
    return FREE_TYPES.has(type) ? 1 : 0;
}

// §16 — Med Bay passive potion production (owner-approved table, 2026-10-21).
// Stock DERIVES from elapsed time since cooldowns.potion (reuses the existing
// Base.cooldowns Mixed map — no new collections); collecting advances that
// timestamp by exactly the granted amount, so partial progress is preserved.
const POTION_PLAN = {
    1: { id: 'minor_hp_potion', intervalMs: 12 * 60 * 60 * 1000, cap: 2 },
    2: { id: 'hp_potion',       intervalMs: 8 * 60 * 60 * 1000,  cap: 3 },
    3: { id: 'mega_potion',     intervalMs: 6 * 60 * 60 * 1000,  cap: 4 },
};
function potionStock(medbayLevel, lastTs, now = Date.now()) {
    const plan = POTION_PLAN[medbayLevel];
    if (!plan || !lastTs) return { qty: 0, plan };
    return { qty: Math.min(plan.cap, Math.floor((now - lastTs) / plan.intervalMs)), plan };
}
/** Collect ready Med Bay potions (runs on every .j clinic visit). Concurrency-
 * safe: an optimistic lock on cooldowns.potion means two simultaneous commands
 * can never double-grant. Item grant happens BEFORE the clock advance and is
 * rolled back if the lock is lost. Returns { qty, name }. */
async function collectMedbayPotions(userId) {
    try {
        const lvl = await getStructureLevel(userId, 'medbay');
        const plan = POTION_PLAN[lvl];
        if (!plan) return { qty: 0 };
        const rec = await Base.findOne({ userId }, { cooldowns: 1 }).lean();
        const last = rec && rec.cooldowns ? rec.cooldowns.potion : 0;
        const { qty } = potionStock(lvl, last);
        if (qty <= 0) return { qty: 0 };
        const inventorySystem = require('./inventorySystem');
        const lootSystem = require('./lootSystem');
        const added = await inventorySystem.addItem(userId, plan.id, qty);
        if (!added || added.success === false) return { qty: 0 };
        const r = await Base.updateOne(
            { userId, 'cooldowns.potion': last },
            { $set: { 'cooldowns.potion': (last || 0) + qty * plan.intervalMs, updatedAt: Date.now() } },
        );
        if (r.matchedCount === 0) {
            try { await inventorySystem.removeItem(userId, plan.id, qty); } catch (e2) { /* best effort */ }
            return { qty: 0 };
        }
        return { qty, name: (lootSystem.getItemInfo(plan.id) || {}).name || plan.id };
    } catch (e) { console.error('[base] potion collect failed:', e.message); return { qty: 0 }; }
}

/** Zoom card for another command's result (e.g. `.j mine`): never creates a base — returns null if the user has none. */
async function zoomForCommand(ctx, type, extra = {}) {
    try {
        const rec = await Base.findOne({ userId: ctx.senderJid }).lean();
        if (!rec) return null;
        const have = (rec.structures || []).filter((x) => structDef(x.type));
        let st = have.find((x) => x.type === type);
        if (!st) { const f = fixedSeed().find((x) => x.type === type); if (!f) return null; st = f; have.push(f); }
        const r = { ...rec, structures: have };
        return await renderZoom({ prefix: ctx.prefix || '.j' }, r, st, extra);
    } catch (e) { console.error('[base] zoomForCommand:', e.message); return null; }
}

async function zoomIn(ctx, rec, st) {
    const d = structDef(st.type);
    const lv = d.levels.find((l) => l.level === st.level) || d.levels[0];
    const next = d.levels.find((l) => l.level === st.level + 1);
    const idx = rec.structures.indexOf(st) + 1;
    const cap = `🏗️ *${d.name}* — ${lv.name} (Lv.${st.level}) · #${idx}\n` +
        (next ? `⬆️ Next: *${next.name}* — ${next.price.toLocaleString()} ZENI → \`${ctx.prefix} base upgrade #${idx}\`` : (d.noUpgrade ? '' : '✨ Fully upgraded.')) +
        (st.type === 'pond' ? `\n🎣 Cast a line: \`${ctx.prefix} base fish\`` : '') +
        (st.type === 'hunting' ? `\n🏹 Ride out: \`${ctx.prefix} base hunt\` (a stronger Barracks means a stronger party)` : '');
    let media = null;
    try { media = await renderZoom(ctx, rec, st); } catch (e) { console.error('[base] zoom render failed:', e.message); }
    if (media && media.buffer && media.buffer.length > 500) {
        await ctx.sock.sendMessage(ctx.chatId, { image: media.buffer, caption: cap }, { quoted: ctx.m });
    } else {
        await ctx.reply(cap);
    }
    // §5 2026-10-21: the viewer is READ-ONLY — the old followUp() that ran the
    // place's command from a mere VIEW is gone (zero gameplay side effects).
    return;
}

/** `.j base fish` / `.j base hunt` — the pond and the hunting grounds, with a zoomed result card. */
async function cmdActivity(ctx, kind) {
    const rec = await loadBase(ctx.senderJid);
    const act = require('./baseActivities');
    const type = kind === 'fish' ? 'pond' : 'hunting';
    const st = rec.structures.find((x) => x.type === type);
    if (!st) return ctx.reply('❌ That place does not exist in your base yet.');
    const tier = type === 'pond' ? st.level : Math.max(1, (rec.structures.find((x) => x.type === 'barracks') || {}).level || 1);
    if (opLocks.has(ctx.senderJid)) return ctx.reply('⏳ Your last base action is still settling — one moment.');
    opLocks.add(ctx.senderJid);
    try {
        const last = ((rec.cooldowns || {})[kind]) || 0;
        const res = await act.run(kind, ctx.senderJid, tier, last);
        if (!res.ok) return ctx.reply(res.text);
        try { await Base.updateOne({ userId: ctx.senderJid }, { $set: { [`cooldowns.${kind}`]: Date.now() } }); } catch (e) { /* cooldown best-effort */ }
        let media = null;
        // §13/§14: the scene plays the REAL result — fishing ripples the bobber,
        // hunting spotlights the animal whose loot actually dropped (top drop).
        const spot = res.drops && Object.values(res.drops).reduce((a, b) => Math.max(a, b), 0) > 0;
        try { media = await renderZoom(ctx, rec, st, { banner: res.banner, note: `Next try in ${act.fmtMs(act.RULES[kind].cooldownMs)}.`, activity: kind === 'fish' ? 'fishing' : 'hunting', spotlight: spot }); } catch (e) { console.error('[base] activity card failed:', e.message); }
        if (media && media.buffer) return ctx.sock.sendMessage(ctx.chatId, { image: media.buffer, caption: res.text }, { quoted: ctx.m });
        return ctx.reply(res.text);
    } finally { opLocks.delete(ctx.senderJid); }
}

// ═══════════════════════════════════════════════════════════════════════════
// §4/§13/§14: `.j fish` / `.j hunt` — the pond and hunting-ground actions now
// answer to their own top-level commands (engine routes them here). Same rules,
// same cooldowns, same loot as the old `.j base fish|hunt` — nothing rebalanced.
async function runActivity(ctx, kind) {
    return cmdActivity(ctx, kind === 'fish' || kind === 'cast' || kind === 'fishing' ? 'fish' : 'hunt');
}

// BUILD / UPGRADE (§7/8) — atomic purchase, identical compensation contract
// ═══════════════════════════════════════════════════════════════════════════
const BUILDABLE = ['blacksmith', 'medbay', 'alchemy'];

async function cmdBuild(ctx, rec, args) {
    const type = String(args[0] || '').toLowerCase();
    const d = structDef(type);
    if (!d || !BUILDABLE.includes(type)) {
        return ctx.reply(`❌ Build what? Purchasable structures: ${BUILDABLE.map((b) => `*${b}*`).join(', ')}.\nUsage: \`${ctx.prefix} base build blacksmith [plot#]\``);
    }
    if (rec.structures.some((s) => s.type === type)) {
        return ctx.reply(`🏗️ You already own a *${d.name}* — upgrade it instead: \`${ctx.prefix} base upgrade ${type}\``);
    }
    const plots = plotsFor(rec);
    let plot = null;
    const pArg = parseInt(args[1], 10);
    if (Number.isFinite(pArg)) {
        plot = plots.find((p) => p.id === pArg);
        if (!plot) return ctx.reply(`❌ No plot #${pArg}. Open plots: ${plots.filter((p) => p.free).map((p) => p.id).join(', ') || 'none'}.`);
        if (!plot.free) return ctx.reply(`🚧 Plot #${pArg} is occupied by your *${structDef(plot.built.type)?.name || 'structure'}*.`);
    } else {
        plot = plots.find((p) => p.free);
        if (!plot) return ctx.reply('🪧 No free plots remain — your base is at capacity.');
    }
    const lv1 = d.levels[0];
    if (opLocks.has(ctx.senderJid)) return ctx.reply('⏳ Your last base action is still settling — one moment.');
    opLocks.add(ctx.senderJid);
    try {
        const balance = economy.getBalance(ctx.senderJid);
        if (balance < lv1.price) {
            return ctx.reply(`💰 Not enough ZENI — the *${lv1.name}* costs *${lv1.price.toLocaleString()}* and you have *${balance.toLocaleString()}*.`);
        }
        if (!economy.removeMoney(ctx.senderJid, lv1.price, `Base: built ${lv1.name}`)) {
            return ctx.reply(`💰 Not enough ZENI — the *${lv1.name}* costs *${lv1.price.toLocaleString()}* and you have *${balance.toLocaleString()}*.`);
        }
        try {
            const st = { uid: uid(), type, level: 1, x: plot.x, y: plot.y };
            const r = await Base.updateOne({ userId: ctx.senderJid }, { $push: { structures: st }, $set: { updatedAt: Date.now() } }, { upsert: true });
            if (!r.acknowledged) throw new Error('write not acknowledged');
            rec.structures.push(st);
            // §16: a freshly built Med Bay starts its potion clock NOW — no
            // instant free potion (owner spec §16).
            if (type === 'medbay') { try { await Base.updateOne({ userId: ctx.senderJid }, { $set: { 'cooldowns.potion': Date.now() } }); } catch (e) { /* clock start is best-effort */ } }
        } catch (writeErr) {
            console.error('[base] build delivery failed — refunding:', writeErr.message);
            economy.addMoney(ctx.senderJid, lv1.price, `Base: refund ${lv1.name}`);
            return ctx.reply('🔥 The builders returned your ZENI (ledger write failed). Nothing was lost — try again.');
        }
        return viewBase(ctx, { celebrate: { type, x: plot.x, y: plot.y, level: 1, prev: 0 }, hint: `The *${lv1.name}* rises on plot #${plot.id}!` });
    } finally {
        opLocks.delete(ctx.senderJid);
    }
}

async function cmdUpgrade(ctx, rec, args) {
    const q = String(args[0] || '').toLowerCase();
    if (!q) return ctx.reply(`Usage: \`${ctx.prefix} base upgrade <type|#id>\` — e.g. \`${ctx.prefix} base upgrade blacksmith\``);
    let st = null;
    if (/^\d+$/.test(q)) st = rec.structures[parseInt(q, 10) - 1];
    else st = rec.structures.find((s) => s.type === q || structDef(s.type)?.name.toLowerCase().startsWith(q));
    if (!st) return ctx.reply(`❌ No such structure. \`${ctx.prefix} base info\` lists them with #ids.`);
    const d = structDef(st.type);
    if (d.noUpgrade) return ctx.reply(`🏹 The *${d.name}* stands as it is — the wilds need no walls raised higher.`);
    const next = d.levels.find((l) => l.level === st.level + 1);
    if (!next) return ctx.reply(`✨ Your *${d.name}* is already fully upgraded (*${(d.levels.at(-1)).name}*).`);
    if (opLocks.has(ctx.senderJid)) return ctx.reply('⏳ Your last base action is still settling — one moment.');
    opLocks.add(ctx.senderJid);
    try {
        const balance = economy.getBalance(ctx.senderJid);
        if (balance < next.price) {
            return ctx.reply(`💰 Not enough ZENI — *${next.name}* costs *${next.price.toLocaleString()}* and you have *${balance.toLocaleString()}*.`);
        }
        if (!economy.removeMoney(ctx.senderJid, next.price, `Base: upgraded ${d.name} L${next.level}`)) {
            return ctx.reply(`💰 Not enough ZENI — *${next.name}* costs *${next.price.toLocaleString()}* and you have *${balance.toLocaleString()}*.`);
        }
        try {
            const r = await Base.updateOne(
                { userId: ctx.senderJid, 'structures.uid': st.uid },
                { $set: { 'structures.$.level': next.level, updatedAt: Date.now() } },
            );
            if (!r.acknowledged) throw new Error('write not acknowledged');
            st.level = next.level;
        } catch (writeErr) {
            console.error('[base] upgrade write failed — refunding:', writeErr.message);
            economy.addMoney(ctx.senderJid, next.price, `Base: refund upgrade ${d.name}`);
            return ctx.reply('🔥 The ledger refused the deed — your ZENI was returned. Try again.');
        }
        return viewBase(ctx, { celebrate: { type: st.type, x: st.x, y: st.y, level: next.level, prev: next.level - 1 }, hint: `The *${d.name}* is now *${next.name}* (Lv.${next.level})!` });
    } finally {
        opLocks.delete(ctx.senderJid);
    }
}

function cmdInfo(ctx, rec) {
    const plots = plotsFor(rec);
    const list = rec.structures.map((st, i) => {
        const d = structDef(st.type);
        const lv = d.levels.find((l) => l.level === st.level) || d.levels[0];
        const next = d.levels.find((l) => l.level === st.level + 1);
        return `#${i + 1} *${d.name}* — ${lv.name} (Lv.${st.level}) @ (${st.x},${st.y})${next ? `\n    ⬆️ ${next.name}: ${next.price.toLocaleString()} ZENI → \`${ctx.prefix} base upgrade #${i + 1}\`` : ' ✨ max'}`;
    });
    const buildable = BUILDABLE.filter((b) => !rec.structures.some((s) => s.type === b));
    return ctx.reply(
        `🏗️ *BASE LEDGER*\n\n${list.join('\n')}\n\n` +
        `🪧 Plots: ${plots.map((p) => `#${p.id}${p.free ? '' : ` (${structDef(p.built?.type)?.name || 'built'})`}`).join('  ')}\n` +
        (buildable.length ? `📦 Buildable: ${buildable.map((b) => `*${b}*`).join(', ')} → \`${ctx.prefix} base build <type> [plot#]\`\n` : '') +
        `\n_${ctx.prefix} base house 1 enters your home._`,
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN (§9) — moderator-gated testing/management tools
// ═══════════════════════════════════════════════════════════════════════════
async function cmdAdmin(ctx, rec, args) {
    const [action, ...rest] = args;
    const a = String(action || '').toLowerCase();
    const target = rest[0];
    const num = (v) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    };
    switch (a) {
        case 'inspect': {
            let userId = ctx.senderJid;
            if (target && /^\d{6,20}@/.test(target)) userId = normalizeJid(target);
            else if (target) {
                const m = ctx.rawText?.match(/@?(\d{6,20})/);
                if (m) userId = `${m[1]}@s.whatsapp.net`;
            }
            const tRec = await loadBase(userId);
            return ctx.reply(`🔍 *BASE INSPECT*\nuserId: ${userId}\n` +
                tRec.structures.map((st, i) => `#${i + 1} ${st.type} L${st.level} (${st.x},${st.y}) uid=${st.uid}`).join('\n'));
        }
        case 'add': {
            const type = String(rest[0] || '').toLowerCase();
            const x = num(rest[1]), y = num(rest[2]);
            const d = structDef(type);
            if (!d || x == null || y == null) return ctx.reply(`Usage: ${ctx.prefix} baseadmin add <type> <x> <y> [level]`);
            const st = { uid: uid(), type, level: Math.min(num(rest[3]) || 1, d.levels.length), x, y };
            await Base.updateOne({ userId: ctx.senderJid }, { $push: { structures: st }, $set: { updatedAt: Date.now() } }, { upsert: true });
            return ctx.reply(`✅ Added ${type} L${st.level} at (${x},${y}).`);
        }
        case 'remove': {
            const idx = num(target);
            if (!idx) return ctx.reply(`Usage: ${ctx.prefix} baseadmin remove <#id>`);
            const st = rec.structures[idx - 1];
            if (!st) return ctx.reply('❌ No such #id.');
            if (st.type === 'house') return ctx.reply('🚫 The house (Structure 1) cannot be removed — every adventurer needs a roof.');
            await Base.updateOne({ userId: ctx.senderJid }, { $pull: { structures: { uid: st.uid } }, $set: { updatedAt: Date.now() } });
            return ctx.reply(`✅ Removed ${st.type} (uid ${st.uid}).`);
        }
        case 'level': {
            const idx = num(target), lv = num(rest[1]);
            if (!idx || !lv) return ctx.reply(`Usage: ${ctx.prefix} baseadmin level <#id> <1-3>`);
            const st = rec.structures[idx - 1];
            const d = st && structDef(st.type);
            if (!st || !d.levels.some((l) => l.level === lv)) return ctx.reply('❌ Bad #id or level.');
            await Base.updateOne({ userId: ctx.senderJid, 'structures.uid': st.uid }, { $set: { 'structures.$.level': lv, updatedAt: Date.now() } });
            return ctx.reply(`✅ ${st.type} → L${lv}.`);
        }
        case 'move': {
            const idx = num(target), x = num(rest[1]), y = num(rest[2]);
            if (!idx || x == null || y == null) return ctx.reply(`Usage: ${ctx.prefix} baseadmin move <#id> <x> <y>`);
            const st = rec.structures[idx - 1];
            if (!st) return ctx.reply('❌ No such #id.');
            if (['house', 'mines', 'pond', 'hunting'].includes(st.type)) {
                return ctx.reply(`🚫 *${structDef(st.type).name}* sits in its designated position and cannot be moved (spec §6).`);
            }
            await Base.updateOne({ userId: ctx.senderJid, 'structures.uid': st.uid }, { $set: { 'structures.$.x': x, 'structures.$.y': y, updatedAt: Date.now() } });
            return ctx.reply(`✅ ${st.type} → (${x},${y}).`);
        }
        case 'reset': {
            const seed = fixedSeed();
            await Base.updateOne({ userId: ctx.senderJid }, { $set: { structures: seed, updatedAt: Date.now() } }, { upsert: true });
            return ctx.reply('✅ Base reset to the fresh layout (fixed structures only).');
        }
        default:
            return ctx.reply(
                `🛠️ *BASE ADMIN*\n` +
                `• \`${ctx.prefix} baseadmin inspect [jid]\`\n` +
                `• \`${ctx.prefix} baseadmin add <type> <x> <y> [lv]\`\n` +
                `• \`${ctx.prefix} baseadmin remove <#id>\`\n` +
                `• \`${ctx.prefix} baseadmin level <#id> <lv>\`\n` +
                `• \`${ctx.prefix} baseadmin move <#id> <x> <y>\` (movable types only)\n` +
                `• \`${ctx.prefix} baseadmin reset\``,
            );
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY — homestead.handleCommand routes base/house views here; engine can
// also dispatch `.j base ...` straight here.
// ctx gains isMod (set by engine) for the admin gate.
// ═══════════════════════════════════════════════════════════════════════════
async function handleBaseCommand(ctx) {
    // same normalizer as homestead.handleCommand — command word extraction
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
    let sub = (tokens[0] || '').toLowerCase();
    let args = tokens.slice(1);
    // `.j baseadmin <action> ...` — the word itself carries the admin intent
    if (cmdWord === 'baseadmin') {
        args = [sub, ...args];
        sub = 'baseadmin';
    }

    if (!economy.isRegistered(ctx.senderJid)) {
        return ctx.reply(`❌ You need to register first!\n\nType: \`${ctx.prefix} register <nickname>\``);
    }
    // 🌍 A base grows from a guild's realm land (owner 2026-10-18: "if a player checks base
    // tell um they have to join a guild") — the base, its biome and its plots all charter
    // from the guild's realm, so land claims start at a guild.
    if (sub !== 'help' && sub !== 'admin' && sub !== 'baseadmin') {
        try {
            const _guilds = require('./guilds');
            if (!_guilds.getUserGuild(ctx.senderJid)) {
                return ctx.reply(
                    `🌍 *Your hands hold no charter.*\n` +
                    `Land in Aldafold is claimed through a guild — found or join one and your base, its realm and every plot grow from its charter-stone.\n\n` +
                    `• \`${ctx.prefix} guild create <name> | <type> | <realm>\` — found a guild (types: ADVENTURER, MERCHANT, RESEARCH)\n` +
                    `• \`${ctx.prefix} guild list\` — guilds recruiting members\n` +
                    `• \`${ctx.prefix} guild join <name>\` — pledge yourself to a banner\n` +
                    `• \`${ctx.prefix} realms\` — see the map of Aldafold`
                );
            }
        } catch (e) { /* fail-open: the realm lookup inside the renderer already falls back to the owner seed */ }
    }
    try {
        switch (sub) {
            case '': case 'map': case 'view':
                return viewBase(ctx, {});
            case 'house': case 'inside': {
                return enterStructure(ctx, args[0] || 'house');
            }
            // §5 2026-10-21: `.j base fish` / `.j base hunt` are VIEWERS now —
            // they fall through to the name-viewer path below (ALIASES fish/fishing/
            // cast → pond, hunt/hunting → hunting). The ACTIONS answer to the
            // top-level `.j fish` / `.j hunt` (engine → runActivity). No loot roll,
            // no counters, no writes from a view.
            case 'build': case 'construct':
                return cmdBuild(ctx, await loadBase(ctx.senderJid), args);
            case 'upgrade': case 'up':
                return cmdUpgrade(ctx, await loadBase(ctx.senderJid), args);
            case 'info': case 'structures': case 'ledger': case 'list':
                return cmdInfo(ctx, await loadBase(ctx.senderJid));
            case 'admin': case 'baseadmin':
                if (!ctx.isMod) return ctx.reply('❌ This command is for moderators and above only.');
                return cmdAdmin(ctx, await loadBase(ctx.senderJid), args);
            case 'help': default:
                if (/^\d+$/.test(sub)) return enterStructure(ctx, sub);
                if (sub && sub !== 'help' && (ALIASES[sub] || structDef(sub))) return enterStructure(ctx, ALIASES[sub] || sub);
                if (sub && sub !== 'help') {
                    // owner 2026-10-20 "wire it all up": a structure NAME is a view request —
                    // `.j base mines` ≡ `.j base <the mines' #id>`
                    try {
                        const rec2 = await loadBase(ctx.senderJid);
                        const named = rec2.structures.find((s) => s.type === sub || structDef(s.type)?.name.toLowerCase().startsWith(sub));
                        if (named) return enterStructure(ctx, String(rec2.structures.indexOf(named) + 1));
                    } catch (e) { /* fall through to the unknown-command reply */ }
                    return ctx.reply(`❌ Unknown base command \`${sub}\`.\n\nUse \`${ctx.prefix} base info\` or \`${ctx.prefix} base help\`.`);
                }
                return ctx.reply(
                    `🗺️ *THE BASE*\n` +
                    `• \`${ctx.prefix} base\` — outdoor base map\n` +
                    `• \`${ctx.prefix} base <#id | name>\` — open a structure (zoomed card)\n` +
                    `• \`${ctx.prefix} base house [#id]\` — enter a structure\n` +
                    `• \`${ctx.prefix} base <#|mines|pond|hunting|shop|barracks>\` — view a place (read-only close-up)\n` +
                    `• \`${ctx.prefix} fish\` / \`${ctx.prefix} hunt\` — work the pond / hunting grounds\n` +
                    `• \`${ctx.prefix} base build <type> [plot#]\` — construct\n` +
                    `• \`${ctx.prefix} base upgrade <type|#id>\` — upgrade\n` +
                    `• \`${ctx.prefix} base info\` — ledger + plots\n` +
                    `• \`${ctx.prefix} home ...\` — furniture inside the house`,
                );
        }
    } catch (e) {
        console.error('[base] command error:', e.message);
        return ctx.reply(`🔥 The base ledger hiccuped... try again shortly. (${e.message.slice(0, 80)})`);
    }
}

module.exports = { handleBaseCommand, viewBase, enterStructure, loadBase, plotsFor, zoomForCommand, runActivity, getStructureLevel, potionStock, POTION_PLAN, collectMedbayPotions };
