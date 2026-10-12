// ============================================
// 🎓 NEW PLAYER TUTORIAL — Phase C MILESTONE TRACKS (2026-10-11, owner directive)
//
// PHASE B (2026-10-04): interactive onboarding - the player PERFORMS every
// mechanic as it is introduced. One action per step, the tutorial waits for
// the real action before moving on. State machine, crash-safe loadouts.
//
// PHASE C (owner brief summon_tutorial_marketplace_overhaul.md):
//   1. REGISTRATION TUTORIAL STRIPPED to the absolute basics (Boot Camp):
//      solo + multiplayer quests, how to open the shop, `.j char`,
//      `.j solo`, `.j quest`. Everything else moved OUT.
//   2. MILESTONE TRACKS: reaching a level milestone delivers an IMAGE CARD
//      announcing an unlocked tutorial for one game system. Tracks run on
//      the SAME state machine (`tutorial <track>`), one at a time.
//      Level map targets the game's real hard gates (Abyss L20 owner-
//      confirmed, evolve L15, ascend L50, Sight L40).
//   3. `tutorial list` shows every track + status. `skip` works per track.
//
// Flow - Boot Camp (registration, stripped):
//   .j char → controlled SOLO quest (Garden Slime) →
//   GROUP demo (player + 3 fake guild-mates) →
//   .j shop → .j buy minor_potion → graduation (summary card).
//
// Milestone tracks (unlock level → what they teach):
//   L3  combat     Arms & Combat (loaner dagger, dummy lessons, hospital)
//   L5  power      Powering Up (skill tree, stat points, rank, daily, sell)
//   L8  equipment  Forge & Maintenance (durability, repair, enhance, crafting)
//   L10 summons    Summoning (eggs, fragments, hatch, deck, training)
//   L12 runes      Runes (types, socketing, removal scrolls)
//   L15 classes    Class Evolution (paths, evolve gate, trials)
//   L18 guild      Guilds & Rivals (guilds, duels, bounties)
//   L20 abyss      The Abyss (gates, extraction loop, wild summons, Floor 21+ runes)
//   L25 endgame    Raids & the Deep End (Avatar raid, summon duels, resonance, investments)
//   L40 sight      The Sight (Soul Reader - hard gate L40)
//   L50 ascend     Ascension (hard gate L50 requirements)
//
// Guild War / The Ruins remain deliberately untaught as a mandatory lesson
// (owner directive) - they get a pointer inside the guild track.
//
// Dynamic prefix: every command is rendered through P() = the bot's real
// configured prefix (.jk for Jake, .j for Joker/Subaru). Never hard-coded.
//
// Crash-safe: every granted key is recorded on user.tutorialLoadout and
// cleanup runs at finish/skip AND at the start of any new session, so a
// mid-tutorial restart can never strand the loadout.
// ============================================

const economy = require('./economy');
const inventorySystem = require('./inventorySystem');

// per-bot in-memory step pointer (jid -> step id). The persistent truth
// (user.tutorial = 'active'|'done') survives restarts; a stale 'active'
// with no session is scrubbed on the next `tutorial start`.
const sessions = new Map();

const PREFIX = '🧭';

// 💡 Dynamic prefix - resolved per call from the bot config so the tutorial
// always shows the command the player can actually execute.
function P(explicit) {
    if (explicit && typeof explicit === 'string') return explicit;
    try { return require('../botConfig').getPrefix() || '.'; } catch (e) { return '.'; }
}

// ═══════════════════════════════════════════════════════════
// 💡 PHASE C: MILESTONE TRACK REGISTRY
// Each track = ordered steps + advance rules. Steps marked `next:true` can
// be skipped with `next`. Basics/combat are ACTION-GATED (the player must
// perform), reading tracks always accept `next` (no soft-locks).
// ═══════════════════════════════════════════════════════════
const TRACKS = {
    basics:    { title: 'BOOT CAMP',            icon: '🧭', unlockLevel: 1,  blurb: 'the essentials: your sheet, quests, the shop' },
    combat:    { title: 'ARMS & COMBAT',        icon: '⚔️', unlockLevel: 3,  blurb: 'fight well: weapons, defense, skills, items, healing' },
    power:     { title: 'POWERING UP',          icon: '📈', unlockLevel: 5,  blurb: 'skill trees, stat points, rank, the daily' },
    equipment: { title: 'FORGE & MAINTENANCE',  icon: '🔨', unlockLevel: 8,  blurb: 'durability, repair, enhancement, crafting' },
    summons:   { title: 'SUMMONING',            icon: '🐉', unlockLevel: 10, blurb: 'eggs, fragments, hatching, your deck' },
    runes:     { title: 'RUNES',                icon: '💎', unlockLevel: 12, blurb: 'skill augments, socketing, removal scrolls' },
    classes:   { title: 'CLASS EVOLUTION',      icon: '🧬', unlockLevel: 15, blurb: 'evolution paths, the L15 gate, trials' },
    guild:     { title: 'GUILDS & RIVALS',      icon: '🏰', unlockLevel: 18, blurb: 'guilds, duels, bounties' },
    abyss:     { title: 'THE ABYSS',            icon: '🕳️', unlockLevel: 20, blurb: 'the endgame dungeon: descend, loot, extract' },
    endgame:   { title: 'RAIDS & THE DEEP END', icon: '🌋', unlockLevel: 25, blurb: 'Avatar raid, summon duels, resonance, investments' },
    sight:     { title: 'THE SIGHT',            icon: '👁️', unlockLevel: 40, blurb: 'Soul Reader ritual (hard gate: level 40)' },
    ascend:    { title: 'ASCENSION',            icon: '👑', unlockLevel: 50, blurb: 'the final class gate (hard gate: level 50)' },
};

// step flow per track: ordered steps + advance rules + entry step
const FLOWS = {
    basics: {
        entry: 'stats',
        steps: ['stats', 'solo_quest', 'solo_fight', 'group_quest', 'shop', 'shop_buy', 'complete_summary'],
        on: {
            stats:     { cmds: ['char', 'character', 'stats'] },
            shop:      { cmds: ['shop'] },
            shop_buy:  { cmds: ['buy'] },
        },
        nextable: [], // action-gated (owner spec)
    },
    combat: {
        entry: 'cb_intro',
        steps: ['cb_intro', 'cb_bag', 'cb_ready', 'combat_atk', 'combat_def', 'combat_skill', 'combat_item', 'combat_rest', 'combat_finish', 'victory', 'complete_summary'],
        on: {
            cb_intro: { cmds: ['equip'] },
            cb_bag:   { cmds: ['inventory', 'bag', 'inv'] },
            victory:  { cmds: ['hospital', 'heal', 'clinic'] },
        },
        nextable: [], // action-gated
        loadout: true,     // dagger at begin; skills+potions at dummy start
        combatTrack: true, // dummy lessons + combat interception
    },
    power: {
        entry: 'pw_skilltree',
        steps: ['pw_skilltree', 'pw_allocate', 'pw_progression', 'pw_daily', 'pw_sell', 'complete_summary'],
        on: {
            pw_skilltree:  { cmds: ['st', 'skilltree', 'skills'] },
            pw_allocate:   { cmds: ['allocate', 'alloc'], grant: 'statpoint' },
            pw_progression: { cmds: ['profile', 'me', 'rank', 'adventurer'] },
            pw_daily:      { cmds: ['daily'] },
        },
        nextable: ['pw_allocate', 'pw_progression', 'pw_daily', 'pw_sell'],
    },
    equipment: {
        entry: 'eq_blacksmith',
        steps: ['eq_blacksmith', 'eq_repair', 'eq_enhance', 'eq_craft', 'complete_summary'],
        on: {
            eq_blacksmith: { cmds: ['blacksmith', 'repair'] },
            eq_enhance:    { cmds: ['enhance', 'upgrade', 'inspect'] },
            eq_craft:      { cmds: ['recipes', 'craft'] },
        },
        nextable: ['eq_repair', 'eq_enhance', 'eq_craft'],
    },
    summons: {
        entry: 'sm_intro',
        steps: ['sm_intro', 'sm_hatch', 'sm_deck', 'sm_train', 'complete_summary'],
        on: {
            sm_hatch: { cmds: ['summon', 'summons'], subs: ['hatch', 'eggcraft'] },
            sm_deck:  { cmds: ['summon', 'summons'], subs: ['list', 'ls', 'backlog', 'storage', 'swap'] },
            sm_train: { cmds: ['summon', 'summons'], subs: ['train', 'deploy', 'equip', 'allocate'] },
        },
        nextable: ['sm_intro', 'sm_hatch', 'sm_deck', 'sm_train'],
    },
    runes: {
        entry: 'rn_intro',
        steps: ['rn_intro', 'rn_inv', 'rn_socket', 'complete_summary'],
        on: {
            rn_intro:  { cmds: ['rune'], subs: ['list'] },
            rn_inv:    { cmds: ['rune'], subs: ['inv', 'inventory'] },
            rn_socket: { cmds: ['rune'], subs: ['socket', 'slots', 'remove'] },
        },
        nextable: ['rn_intro', 'rn_inv', 'rn_socket'],
    },
    classes: {
        entry: 'cl_classes',
        steps: ['cl_classes', 'cl_evolve', 'cl_trial', 'complete_summary'],
        on: {
            cl_classes: { cmds: ['classes'] },
            cl_evolve:  { cmds: ['evolve'] },
            cl_trial:   { cmds: ['trial'] },
        },
        nextable: ['cl_classes', 'cl_evolve', 'cl_trial'],
    },
    guild: {
        entry: 'gl_guild',
        steps: ['gl_guild', 'gl_duel', 'gl_bounty', 'complete_summary'],
        on: {
            gl_guild:  { cmds: ['guild'] },
            gl_duel:   { cmds: ['duel', 'challenge', 'pvp'] },
            gl_bounty: { cmds: ['bounty'] },
        },
        nextable: ['gl_guild', 'gl_duel', 'gl_bounty'],
    },
    abyss: {
        entry: 'ab_gates',
        steps: ['ab_gates', 'ab_loop', 'ab_wilds', 'abyss', 'complete_summary'],
        on: {
            ab_gates: { cmds: ['abyss', 'world'], subs: ['status'] },
            abyss:    { cmds: ['abyss'] },
        },
        nextable: ['ab_gates', 'ab_loop', 'ab_wilds', 'abyss'],
    },
    endgame: {
        entry: 'eg_raid',
        steps: ['eg_raid', 'eg_duel', 'eg_invest', 'complete_summary'],
        on: {
            eg_raid:   { cmds: ['raid'] },
            eg_duel:   { cmds: ['summon', 'summons'], subs: ['duel', 'resonance'] },
            eg_invest: { cmds: ['invest', 'investment'] },
        },
        nextable: ['eg_raid', 'eg_duel', 'eg_invest'],
    },
    sight: {
        entry: 'si_intro',
        steps: ['si_intro', 'complete_summary'],
        on: {},
        nextable: ['si_intro'],
    },
    ascend: {
        entry: 'as_intro',
        steps: ['as_intro', 'complete_summary'],
        on: {},
        nextable: ['as_intro'],
    },
};

function flowOf(track) { return FLOWS[track] || FLOWS.basics; }

// ── step texts (short on purpose - the player ACTS, we do not lecture) ──
// 💡 Phase C: track param selects per-track variants (combat lessons live in
// the combat track now, not basics). Reused step ids keep their old text.
function stepMessage(id, prefix, track) {
    const p = P(prefix);
    const t = track || 'basics';
    switch (id) {
        case 'welcome':
            return `${PREFIX} *WELCOME TO THE TRAINING HALL*\n\n` +
                `I'll teach you the ropes by making you actually play. One step, one action - do it and we move on. You can bail anytime with \`skip\`.\n\n` +
                `*Step 1 - know yourself.* Send me \`${p} char\` to open your character sheet: HP, energy, class, level, wallet.`;
        case 'gear':
            return `📖 *That card is your dashboard.* ❤️ HP is your life (0 = you crawl home), ⚡ energy fuels actions, and it regenerates slowly on its own.\n\n` +
                `*Step 2 - arm yourself.* I've placed a loaner *Rusty Dagger* in your bag. Equip it with its exact name:\n\`${p} equip rusty_dagger\``;
        case 'bag':
            return `⚔️ *Equipped.* Weapons add ATK, armor adds DEF - your sheet shows the totals.\n\n` +
                `*Step 3 - your bag.* Everything you own lives here: gear, potions, materials. Open it: \`${p} inventory\``;
        case 'solo_quest':
            if (t === 'basics') {
                return `🎒 *Character sheet mastered.* Now the real thing - quests. Quests are the core loop: fight, win, get paid.\n\n` +
                    `Real quests start with \`${p} solo f\` (solo) or \`${p} quest f\` (a group) - but I'm opening a *training quest* for you now: one docile Garden Slime, no boss, no surprises. Defeat it like a real quest and the loot is yours.`;
            }
            return `🎒 *That's your inventory.* Equipped gear shows ⚔️, consumables stack with ×N.\n\n` +
                `*Step 4 - your first quest.* Real quests start with \`${p} solo f\` (solo) or \`${p} quest f\` (a group) - but I'm opening a *training quest* for you now: one docile Garden Slime, no boss, no surprises. Defeat it like a real quest and the loot is yours.`;
        case 'solo_fight':
            return `🌱 *The slime wobbles menacingly.* This is the quest loop: the encounter opens, you act each turn, victory pays XP, Zeni and loot.\n\nAttack it: \`${p} combat atk\``;
        case 'group_quest':
            return `🎉 *Quest complete!* Loot went straight to your bag - that's the solo loop.\n\n` +
                `*Group content.* Dungeons get deadlier with rank, and parties share the fight. I've opened a *demo raid*: three guild-mates (Rin, Boro and Pia) will fight alongside you. They act on their own - you just attack: \`${p} combat atk\``;
        case 'shop':
            if (t === 'basics') {
                return `🤝 *That's a raid, sort of.* More HP bars on your side, split aggro, shared victory - real group quests (\`${p} quest f\`) work the same way with real people.\n\n` +
                    `*Last step - the shop.* Gear, potions and tools are sold here. Open it: \`${p} shop\``;
            }
            return `🏆 *That's your progression loop.* Rank gates which dungeons you may enter - higher rank, deeper dungeons.\n\n` +
                `*Step 10 - the shop.* Gear, potions and tools are sold here. Browse: \`${p} shop\``;
        case 'combat_atk':
            return `🎯 *The dummy awaits.* Each turn you pick ONE action: attack, defend, skill, item or rest.\n\n` +
                `*Lesson 1 - the basic attack.* Strike: \`${p} combat atk\``;
        case 'combat_def':
            return `⚔️ *Basic attacks* are your bread and butter - free, reliable, always available.\n\n` +
                `*Lesson 2 - defense.* Guarding braces you against the next hit (the dummy can't hit, but real enemies will). Try: \`${p} combat def\``;
        case 'combat_skill':
            return `🛡️ *Defense* reduces incoming damage until your next turn - use it when a big hit is coming.\n\n` +
                `*Lesson 3 - skills.* Skills cost ⚡ energy and hit much harder. I've unlocked your class's first two. Use one: \`${p} combat skill 1\``;
        case 'combat_item':
            return `✨ *Skills* scale with your class tree - more unlock as you level.\n\n` +
                `*Lesson 4 - items mid-fight.* I gave you 2 Minor Potions. Potions heal in battle - never hoard them. Use one: \`${p} combat item 1\``;
        case 'combat_rest':
            return `🧪 *Healed mid-fight.* Items win fights.\n\n` +
                `*Lesson 5 - energy.* Actions drain ⚡; \`rest\` recovers some in place. Try: \`${p} combat rest\``;
        case 'combat_finish':
            return `💤 *Rested.* Energy also refills slowly between fights.\n\n` +
                `Finish the dummy off - any attack will do: \`${p} combat atk\``;
        case 'ask_hospital':
            return `🏥 *When the fighting stops, heal.* Send me \`${p} hospital\` - a free full heal on a cooldown. Out in the world, HP also regenerates slowly on its own.`;
        case 'skilltree':
            return `✅ *HP restored.* Now let's spend what you've earned.\n\n` +
                `*Step 7 - your skill tree.* Every class has its own tree; leveling grants Skill Points. Inspect yours: \`${p} st\``;
        case 'allocate':
            return `🌳 *That's your skill tree.* Class-specific skills unlock at levels; Skill Points buy their ranks (\`${p} skill up <skill>\`).\n\n` +
                `*Step 8 - stat points.* Levels also grant stat points. I've added *1 free point* to your sheet so you can practice safely. Spend it on ATK:\n\`${p} allocate atk 1\``;
        case 'progression':
            return `📈 *Allocated!* Every point in ATK adds real damage - HP, DEF, MAG, SPD, LUCK and CRIT work the same way (\`${p} allocate\` alone shows the sheet).\n\n` +
                `*Step 9 - XP, levels and rank.* Quests and fights pay XP; XP levels you; levels grant points; fame raises your Adventurer Rank (F → E → D...). Check both: \`${p} profile\` and \`${p} rank\``;
        case 'shop':
            return `🏆 *That's your progression loop.* Rank gates which dungeons you may enter - higher rank, deeper dungeons.\n\n` +
                `*Step 10 - the shop.* Gear, potions and tools are sold here. Browse: \`${p} shop\``;
        case 'shop_buy':
            return `🏪 *That's the shop.* Each listing shows price and effect.\n\n` +
                `*Buying.* Get a Minor Potion (you'll want a spare): \`${p} buy minor_potion\``;
        case 'dummy_prep':
            return `🤝 *That's a raid, sort of.* More HP bars on your side, split aggro, shared victory - real group quests (\`${p} quest f\`) work the same way with real people.\n\n` +
                `*Now the practice yard:* ONE Training Dummy. It can't hit back, and when it dies the fight is over - nothing else can ever spawn.\n\nSend \`ready\` when you're in.`;
        case 'money':
            return `🧾 *Purchased!* Bought items land in your inventory (\`${p} inventory\`).\n\n` +
                `*Step 12 - making Zeni.* The loop: *do activities → earn Zeni → buy gear → tackle harder content.* Beginner income: quest rewards, fight loot, the daily payout, and selling junk drops (\`${p} sell <item>\`).\n\nSend \`next\` when ready.`;
        case 'daily':
            return `*Step 13 - the daily.* Free Zeni and items, once every day. Claim: \`${p} daily\``;
        case 'sell':
            return `💰 *Claimed!* The daily is reliable rent - don't skip days.\n\n` +
                `*Step 14 - selling.* Junk drops still have value. Sell your spare potion: \`${p} sell minor_potion\`\n\n_(Already used it? Send \`next\` to move on.)_`;
        case 'repair':
            return `✅ *Sold.* Gear takes durability damage in fights - broken gear does nothing.\n\n` +
                `*Step 15 - maintenance.* The blacksmith repairs and inspects gear: \`${p} blacksmith\` to view prices, \`${p} repair <item>\` to fix. Enhancement (\`${p} enhance <item>\`) upgrades gear with materials. Send \`next\` to continue.`;
        case 'abyss':
            return `${PREFIX} *THE ABYSS*\n\n` +
                `An endless dungeon for veterans: descend floor by floor, stack loot as you go, extract with \`${p} abyss retreat\` to keep it. Die inside and you lose most of it. Entry is gated by a world-alignment window plus a 12h cooldown after each run - and it scales cruelly. It's the endgame; you'll know when you're ready.\n\nPeek at it safely: \`${p} abyss status\` · Send \`next\` to finish.`;
        case 'complete_summary':
            return null; // rendered by graduate()

        // ══ TRACK: combat (L3) — Arms & Combat ══
        case 'cb_intro':
            return `${PREFIX} *ARMS & COMBAT*\n\n` +
                `You've swung a sword in a training quest - now learn to fight *well*. Five lessons in the practice yard, a loaner weapon, and healing when it's over.\n\n` +
                `*Lesson 0 - gear up.* I've placed a loaner *Rusty Dagger* in your bag. Equip it: \`${p} equip rusty_dagger\``;
        case 'cb_bag':
            return `⚔️ *Armed.* Weapons add ATK, armor adds DEF - your sheet shows the totals. Check your whole bag: \`${p} inventory\``;
        case 'cb_ready':
            return `🎒 *That's your inventory.* Now the practice yard: ONE Training Dummy. It can't hit back, and when it dies the fight is over - nothing else can ever spawn.\n\nSend \`ready\` when you're in.`;
        case 'victory':
            return `🏥 *When the fighting stops, heal.* Send me \`${p} hospital\` - a free full heal on a cooldown. Out in the world, HP also regenerates slowly on its own.`;

        // ══ TRACK: power (L5) — Powering Up ══
        case 'pw_skilltree':
            return `${PREFIX} *POWERING UP*\n\n` +
                `Quests pay XP; XP levels you; levels grant points. Time to spend them.\n\n` +
                `*Step 1 - your skill tree.* Every class has its own tree; leveling grants Skill Points. Inspect yours: \`${p} st\``;
        case 'pw_allocate':
            return `🌳 *That's your skill tree.* Class-specific skills unlock at levels; Skill Points buy their ranks (\`${p} skill up <skill>\`).\n\n` +
                `*Step 2 - stat points.* Levels also grant stat points. I've added *1 free point* to your sheet so you can practice safely. Spend it on ATK:\n\`${p} allocate atk 1\``;
        case 'pw_progression':
            return `📈 *Allocated!* Every point in ATK adds real damage - HP, DEF, MAG, SPD, LUCK and CRIT work the same way (\`${p} allocate\` alone shows the sheet).\n\n` +
                `*Step 3 - XP, levels and rank.* Fame raises your Adventurer Rank (F → E → D...), and rank gates which dungeons you may enter. Check both: \`${p} profile\` and \`${p} rank\``;
        case 'pw_daily':
            return `🏆 *That's your progression loop.* Now the money that fuels it.\n\n` +
                `*Step 4 - the daily.* Free Zeni and items, once every day. Claim: \`${p} daily\``;
        case 'pw_sell':
            return `💰 *Claimed!* The daily is reliable rent - don't skip days.\n\n` +
                `*Step 5 - selling.* Junk drops still have value. Sell your spare potion: \`${p} sell minor_potion\`\n\n_(Already used it? Send \`next\` to move on.)_`;

        // ══ TRACK: equipment (L8) — Forge & Maintenance ══
        case 'eq_blacksmith':
            return `${PREFIX} *FORGE & MAINTENANCE*\n\n` +
                `Gear takes durability damage in fights - broken gear does *nothing*. The blacksmith keeps your kit alive.\n\n` +
                `*Step 1 - the blacksmith.* View repair prices and your gear's condition: \`${p} blacksmith\``;
        case 'eq_repair':
            return `⚙️ *That's the condition board.* Repair anything damaged with \`${p} repair <item>\` - a snap at low levels, deadly to forget at high ones.\n\nSend \`next\` to continue.`;
        case 'eq_enhance':
            return `🔨 *Step 2 - enhancement.* \`${p} enhance <item>\` feeds materials into gear to push its stats past their base. Rare gear takes more materials, and enhancement can't be undone - commit to pieces you'll keep.\n\nSend \`next\` to continue.`;
        case 'eq_craft':
            return `🛠️ *Step 3 - crafting.* Materials from quests and dungeons become gear and potions you can't buy. Browse what's craftable: \`${p} recipes\` (and \`${p} craft <id>\` to make one).\n\nSend \`next\` to graduate.`;

        // ══ TRACK: summons (L10) — Summoning ══
        case 'sm_intro':
            return `${PREFIX} *SUMMONING*\n\n` +
                `Summons are permanent battle companions: they fight beside you in dungeons, PvP and the Abyss, level up, and gain their own skills.\n\n` +
                `*How you get them:* buy a *Basic Summon Egg* from the shop (5K Zeni, hatches 1 of 4 starters), or defeat Wild Summons in dungeons and the Abyss - they drop *Summon Fragments* (10 craft into a higher-tier egg).\n\nSend \`next\` to continue.`;
        case 'sm_hatch':
            return `🥚 *Step 1 - hatch.* If you own an egg: \`${p} summon hatch <egg_id>\` (a bought Basic Egg is \`${p} summon hatch basic_summon_egg\`). No egg yet? No problem - send \`next\`.\n\n_Fragments route: \`${p} summon eggcraft <tier>\` turns 10 fragments into an egg._`;
        case 'sm_deck':
            return `🐉 *Step 2 - your roster.* Summons live on a Main Deck (3 slots, deployable) plus a Backlog. View it: \`${p} summons\` (or \`${p} summon list\`)\n\n_Move summons between Deck and Backlog with \`${p} summon swap <backlog#> <deckSlot>\`._`;
        case 'sm_train':
            return `📊 *Step 3 - grow them.* \`${p} summon train <#>\` grants daily XP; levels raise stats and unlock abilities. Deploy one with \`${p} summon <#> deploy\` so it fights beside you.\n\n_Optional extras: stat points, gear, forging, trials - \`${p} summon help\` shows it all. Trade on the player market: \`${p} market sell summon <#> <price>\`._\n\nSend \`next\` to graduate.`;

        // ══ TRACK: runes (L12) — Runes ══
        case 'rn_intro':
            return `${PREFIX} *RUNES*\n\n` +
                `Runes are socketable augments that rewrite how your skills behave: more damage, cheaper energy, burns that freeze, chain bounces, lifesteal. They come from the Abyss (Floor 21+) and rare drops.\n\n` +
                `*Step 1 - the catalog.* Every rune type and tier: \`${p} rune list\``;
        case 'rn_inv':
            return `💎 *Step 2 - your runes.* See what you're holding: \`${p} rune inv\`\n\n_No runes yet? They start dropping from deep Abyss runs - and other players sell them on the player market (\`${p} market runes\`)._`;
        case 'rn_socket':
            return `🔩 *Step 3 - socketing.* Bind a rune to a skill: \`${p} rune socket <runeId> <skillId>\`. Slots are limited per skill (\`${p} rune slots <skillId>\`).\n\n⚠️ *Removing a socketed rune needs a Rune Removal Scroll* (cash shop / rare raid drop) - without one you can only destroy the rune.\n\nSend \`next\` to graduate.`;

        // ══ TRACK: classes (L15) — Class Evolution ══
        case 'cl_classes':
            return `${PREFIX} *CLASS EVOLUTION*\n\n` +
                `Your class isn't permanent - it evolves. Each of the base classes branches into stronger forms with their own kits.\n\n` +
                `*Step 1 - the family tree.* See every path: \`${p} classes\``;
        case 'cl_evolve':
            return `🧬 *Step 2 - the gate.* Evolution asks for *Level 15*, *15 completed quests*, and a *trial boss kill*. Check your eligibility: \`${p} evolve\`\n\n_At Level 50 with 100 quests, 100 victories and 100K Zeni you can go further - Ascension._`;
        case 'cl_trial':
            return `⚔️ *Step 3 - the trials.* Trial bosses are the gatekeepers. View and start them: \`${p} trial\` (start when you're geared - they're real fights).\n\nSend \`next\` to graduate.`;

        // ══ TRACK: guild (L18) — Guilds & Rivals ══
        case 'gl_guild':
            return `${PREFIX} *GUILDS & RIVALS*\n\n` +
                `Guilds are the social backbone: shared perks (+XP, +Zeni, member capacity), a treasury, and a war front.\n\n` +
                `*Step 1 - find a banner.* Create or join: \`${p} guild\``;
        case 'gl_duel':
            return `⚔️ *Step 2 - duels.* Challenge another adventurer: \`${p} duel @user [stake]\`. HP is equalized for fairness by default - bragging rights (or Zeni) on the line, no real death.\n\nSend \`next\` to continue.`;
        case 'gl_bounty':
            return `🏴‍☠️ *Step 3 - bounties.* Wealthy players become targets: anyone can place a Zeni bounty (\`${p} bounty\`), hunters collect by winning PvP against the target. Level 20+ targets only. Hoard responsibly.\n\nSend \`next\` to graduate.`;

        // ══ TRACK: abyss (L20) — The Abyss ══
        case 'ab_gates':
            return `${PREFIX} *THE ABYSS*\n\n` +
                `You've reached level 20 - the Abyss is open to you. It's the endgame dungeon: an endless descent where the loot stacks but so does the risk.\n\n` +
                `*The gates:* level 20+, a world-alignment window, and a 12h cooldown after each run. Check today's window: \`${p} abyss status\``;
        case 'ab_loop':
            return `🕳️ *The loop:* every floor spawns a fight. Win and you choose - descend deeper for better loot, or extract with \`${p} abyss retreat\` and keep everything. **Die inside and you lose most of it.** Greed is the real boss.\n\nSend \`next\` to continue.`;
        case 'ab_wilds':
            return `🐉 *What's down there:* Wild Summons (drop Summon Fragments - 10 craft an egg), runes from Floor 21+, and scale-topping gear. Bring potions. Bring a summon. Bring humility.\n\nSend \`next\` to finish.`;

        // ══ TRACK: endgame (L25) — Raids & the Deep End ══
        case 'eg_raid':
            return `${PREFIX} *RAIDS & THE DEEP END*\n\n` +
                `*The Sunday Avatar Raid.* Every Sunday 00:00 UTC a server-wide boss spawns - everyone who joins is merged into one colossal Avatar (class of the majority, stats of the crowd). \`${p} raid\` shows the rotation and how to join.`;
        case 'eg_duel':
            return `🐉 *Summon duels.* Your summons can fight each other: \`${p} summon duel @user\`. Loyalty, traits and AI modes matter here.\n\n_Own diverse species for Resonance Web bonuses: \`${p} summon resonance\`._\n\nSend \`next\` to continue.`;
        case 'eg_invest':
            return `🏦 *Money that works.* Fixed investment plans pay out over time: \`${p} invest\`. Safer than carrying everything into the Abyss.\n\nSend \`next\` to graduate.`;

        // ══ TRACK: sight (L40) — The Sight ══
        case 'si_intro':
            return `${PREFIX} *THE SIGHT*\n\n` +
                `Level 40 - your soul is loud enough to read now. The Soul Reader opens the Sight: three doors, three fates. It also demands you've faced the deep Abyss floors.\n\nIt's a one-way ritual, not a toy - read its requirements carefully before you step through.\n\nSend \`next\` to finish.`;

        // ══ TRACK: ascend (L50) — Ascension ══
        case 'as_intro':
            return `${PREFIX} *ASCENSION*\n\n` +
                `Level 50. The final gate: *100 completed quests, 100 victories, 100K Zeni and one last trial boss*. Meet it and your class transcends into its ascended form.\n\nCheck the requirements: \`${p} evolve\` · Trials: \`${p} trial\`\n\nSend \`next\` to finish.`;

        default:
            return null;
    }
}

function cleanupLoadout(jid) {
    const user = economy.getUser(jid);
    if (!user) return;
    const lo = user.tutorialLoadout;
    if (lo && typeof lo === 'object') {
        try {
            // skills we ADDED (never pre-existing ones)
            for (const sid of lo.skills || []) {
                if (user.skills && Object.prototype.hasOwnProperty.call(user.skills, sid)) delete user.skills[sid];
            }
            // items: remove the granted quantities
            for (const it of lo.items || []) {
                try { inventorySystem.removeItem(jid, it.id, it.qty); } catch (e) { /* already gone */ }
            }
            // equipment: unequip first so the slot doesn't hold a ghost.
            // 💡 Phase B fix: unequip needs a free bag slot (it returns the
            // item to the bag) - a full bag made the revoke silently fail and
            // left the loaner gear equipped forever. If unequip can't run,
            // force-clear the slot when it still holds the granted item.
            if (lo.equipment) {
                try { inventorySystem.unequipItem(jid, lo.equipment.slot); } catch (e) { /* not equipped */ }
                try {
                    const eq = inventorySystem.getEquipment(jid);
                    if (eq && eq[lo.equipment.slot] && eq[lo.equipment.slot].id === lo.equipment.id) {
                        eq[lo.equipment.slot] = null;
                    }
                } catch (e) { /* best effort */ }
                try { inventorySystem.removeItem(jid, lo.equipment.id, 1); } catch (e) { /* gone */ }
            }
        } catch (e) {
            console.error('[Tutorial] loadout cleanup error (continuing):', e?.message);
        }
    }
    user.tutorialLoadout = null;
    user.tutorial = 'done';
    economy.saveUser(jid);
}

async function send(sock, chatId, text) {
    if (!sock || !chatId || !text) return;
    try { await sock.sendMessage(chatId, { text }); } catch (e) { /* best-effort */ }
}

function stepOf(jid) {
    return sessions.get(jid) || null;
}

function setStep(jid, step) {
    const s = sessions.get(jid);
    if (s) {
        s.step = step;
        s.nudgedAt = 0; // fresh step = fresh nudge budget
        s.locked = false; // 💡 release the one-action lock (was documented but missing)
    }
}

// one-action-per-turn guard: an action is only "consumed" once per step
function consume(jid, step) {
    const s = sessions.get(jid);
    if (!s || s.step !== step || s.locked) return false;
    s.locked = true; // released by setStep() on advance
    return true;
}

// Grant the practice loadout: loaner weapon, potions, first two class skills
async function grantLoadout(jid, { withSkills, potions }) {
    const user = economy.getUser(jid);
    if (!user) return;
    const lo = user.tutorialLoadout || { skills: [], items: [], equipment: null };
    try {
        if (potions > 0) {
            await inventorySystem.addItem(jid, 'minor_potion', potions);
            lo.items.push({ id: 'minor_potion', qty: potions });
        }
        if (withSkills) {
            const classId = String(user.class || 'FIGHTER').toUpperCase();
            const skillTree = require('./skillTree');
            const tree = (skillTree.SKILL_TREES || skillTree)[classId];
            const granted = [];
            if (tree && tree.trees) {
                outer:
                for (const [, treeData] of Object.entries(tree.trees)) {
                    if (!treeData.skills) continue;
                    for (const [skillId] of Object.entries(treeData.skills)) {
                        if (granted.length >= 2) break outer;
                        if (!user.skills[skillId]) {
                            user.skills[skillId] = 1;
                            lo.skills.push(skillId);
                            granted.push(skillId);
                        }
                    }
                }
            }
        }
        user.tutorialLoadout = lo;
        economy.saveUser(jid);
    } catch (e) {
        console.error('[Tutorial] loadout grant failed (continuing):', e?.message);
    }
}

// ── start the group demo raid (player + 3 fake guild-mates) ──
async function startGroupDemo(sock, jid, prefix) {
    const s = sessions.get(jid);
    if (!s) return;
    const chatId = s.chatId;
    const guildAdventure = require('./guildAdventure');
    try {
        const res = await guildAdventure.startTutorialGroupQuest(sock, chatId, jid, {
            greeting: 'A demo raid in the training yard. Rin, Boro and Pia form up beside you.',
        });
        if (!res || res.success === false) {
            setStep(jid, 'retry_group');
            await send(sock, chatId, `${PREFIX} The demo raid is busy - send \`retry\` in a moment.`);
            return;
        }
        // 💡 Phase C: in the STRIPPED basics the group demo flows to the SHOP
        // step on completion (notifyCombatEnd TUTORIAL_GROUP) - keep the step
        // marker so that handler recognizes it. Only the combat track used the
        // dummy next (no group demo there), so 'dummy_prep' is legacy-only.
        if (s.track !== 'basics') setStep(jid, 'dummy_prep');
        else setStep(jid, 'group_quest');
    } catch (e) {
        console.error('[Tutorial] group demo start failed:', e?.message);
    }
}

// ── start the practice fight (guildAdventure TUTORIAL mode) ──
async function startPracticeFight(sock, jid, prefix) {
    const chatId = stepOf(jid)?.chatId;
    const user = economy.getUser(jid);
    const guildAdventure = require('./guildAdventure');

    await grantLoadout(jid, { withSkills: true, potions: 2 });

    try {
        const res = await guildAdventure.startTutorialCombat(sock, chatId, jid, {
            enemies: [{ type: 'TRAINING_DUMMY', level: 1 }],
            rank: 'F',
            background: 'spark_2.png',
            name: 'Training Dummy',
            greeting: 'The practice yard. The dummy waits, stuffed and harmless.',
        });
        if (!res || res.success === false) {
            await send(sock, chatId, `${PREFIX} The practice yard is busy - send \`retry\` in a moment.`);
            setStep(jid, 'retry_fight');
            return;
        }
        setStep(jid, 'combat_atk');
        await send(sock, chatId, stepMessage('combat_atk', prefix));
    } catch (e) {
        console.error('[Tutorial] practice fight failed:', e?.message);
        await send(sock, chatId, `${PREFIX} The dummy fell over on its own (render hiccup). Send \`retry\` to try again.`);
        setStep(jid, 'retry_fight');
    }
}

// 💡 Phase C: per-user track state on the user doc (persisted, restart-safe).
// user.tutorialTracks: { [trackId]: 'locked'|'unlocked'|'active'|'done' }
// user.tutorialPending: [trackIds awaiting their unlock announcement card]
// Legacy field user.tutorial ('active'|'done') stays the BASICS flag.
function ensureTrackState(user) {
    if (!user.tutorialTracks || typeof user.tutorialTracks !== 'object') user.tutorialTracks = {};
    if (!Array.isArray(user.tutorialPending)) user.tutorialPending = [];
    const lvl = Number(user.level || 1);
    const prog = (user.progression && Number(user.progression.level)) || lvl;
    const eff = Math.max(lvl, prog);
    for (const [id, cfg] of Object.entries(TRACKS)) {
        if (!user.tutorialTracks[id]) {
            if (id === 'basics') {
                user.tutorialTracks[id] = (user.tutorial === 'done') ? 'done' : 'unlocked';
            } else {
                // players who already passed the milestone get silent unlocks
                // (no announcement card spam for veterans)
                user.tutorialTracks[id] = (eff >= cfg.unlockLevel) ? 'unlocked' : 'locked';
            }
        }
    }
}

async function begin(sock, chatId, jid, prefix, trackArg) {
    const user = economy.getUser(jid);
    if (!user) {
        await send(sock, chatId, `${PREFIX} Register first, then DM me \`tutorial start\`.`);
        return {};
    }
    ensureTrackState(user);

    // resolve requested track
    const requested = String(trackArg || '').toLowerCase().trim();
    let track = 'basics';
    if (requested && requested !== 'start' && requested !== 'basics') {
        if (!TRACKS[requested]) {
            await send(sock, chatId, trackListMsg(user, prefix));
            return {};
        }
        track = requested;
    }

    // one active session at a time (any track)
    if (sessions.has(jid)) {
        const cur = sessions.get(jid);
        await send(sock, chatId, `${PREFIX} You're already in *${TRACKS[cur.track].title}*. Finish it, or send \`skip\` to bail first.`);
        return {};
    }

    const state = user.tutorialTracks[track];
    if (state === 'locked') {
        await send(sock, chatId, `${PREFIX} *${TRACKS[track].title}* unlocks at level *${TRACKS[track].unlockLevel}*. You're not there yet - \`${P(prefix)} tutorial list\` shows what's open.`);
        return {};
    }

    // crash-safe: scrub any stranded loadout from a previous attempt
    cleanupLoadout(jid);
    if (track === 'basics') user.tutorial = 'active'; // legacy flag = basics only
    user.tutorialTracks[track] = 'active';
    user.tutorialLoadout = { skills: [], items: [], equipment: null };
    economy.saveUser(jid);

    const flow = flowOf(track);
    sessions.set(jid, { track, step: flow.entry, chatId, startedAt: Date.now(), nudgedAt: 0, locked: false });

    // combat track grants the practice weapon up front
    if (flow.loadout) {
        try {
            await inventorySystem.addItem(jid, 'rusty_dagger', 1);
            user.tutorialLoadout.equipment = { id: 'rusty_dagger', slot: 'main_hand' };
            economy.saveUser(jid);
        } catch (e) { /* non-fatal */ }
    }

    const firstId = flow.steps[0];
    const welcome = (track === 'basics')
        ? stepMessage('welcome', prefix, track)
        : stepMessage(firstId, prefix, track);
    await send(sock, chatId, welcome);
    return {}; // handled
}

// `tutorial list` - every track with its status
function trackListMsg(user, prefix) {
    const p = P(prefix);
    ensureTrackState(user);
    const prog = (user.progression && Number(user.progression.level)) || Number(user.level || 1);
    let msg = `${PREFIX} *ADVENTURER ACADEMY*\n\n`;
    msg += `Interactive tutorials for every game system. DM me \`tutorial <name>\` to start one.\n\n`;
    for (const [id, cfg] of Object.entries(TRACKS)) {
        const st = user.tutorialTracks[id] || 'locked';
        const mark = st === 'done' ? '✅' : st === 'active' ? '▶️' : st === 'unlocked' ? '🟢' : '🔒';
        msg += `${mark} *${cfg.title}* \`${p} tutorial ${id}\`\n`;
        msg += `   ${cfg.blurb}${st === 'locked' ? ` · unlocks at level ${cfg.unlockLevel}` : ''}\n`;
    }
    msg += `\n_You are level ${prog}. New tutorials unlock as milestone image cards when you level up._`;
    return msg;
}

// ── DM entry: handles tutorial verbs; returns null to fall through ──
async function handleDM(sock, senderJid, chatId, txt, BOT_MARKER, opts = {}) {
    const prefix = P(opts.prefix);
    const raw = String(txt || '').trim().toLowerCase();
    if (!raw) return null;
    const norm = raw.startsWith(prefix.toLowerCase()) ? raw.slice(prefix.length).trim() : raw;
    const user = economy.getUser(senderJid);

    // 💡 Phase C: `tutorial list` / `tutorial <track>` / `tutorial start <track>`
    if (/^(tutorial|start tutorial)(\s+.*)?$/.test(norm)) {
        const argStr = norm.replace(/^(tutorial|start tutorial)/, '').replace(/^\s*start\s+/, '').trim();
        if (/^list$/.test(argStr)) {
            if (!user) return { text: `${PREFIX} Register first - then the academy is open.` };
            return { text: trackListMsg(user, prefix) };
        }
        await begin(sock, chatId, senderJid, prefix, argStr);
        return {};
    }
    if (norm === 'retry') {
        const s = sessions.get(senderJid);
        if (!s || !['retry_fight', 'retry_solo', 'retry_group'].includes(s.step)) return null;
        if (s.step === 'retry_fight') {
            s.step = 'battle_prep';
            await startPracticeFight(sock, senderJid, prefix);
        } else if (s.step === 'retry_solo') {
            // FIX 2026-10-12: the old path fired notify('inventory') — a no-op
            // for the basics track — so a failed training-quest start left the
            // player stuck forever (retry consumed, nothing happened).
            // Re-open the quest directly, same contract as the auto-start in
            // notify('char'): success → solo_fight, busy → retry_solo again.
            s.step = 'solo_quest';
            try {
                const guildAdventure = require('./guildAdventure');
                const res = await guildAdventure.startTutorialQuest(sock, chatId, senderJid, {
                    greeting: 'A training quest behind the Guild Association. One Garden Slime blocks the path.',
                });
                if (!res || res.success === false) {
                    setStep(senderJid, 'retry_solo');
                    await send(sock, chatId, `${PREFIX} The training grounds are busy - send \`retry\` in a moment.`);
                    return {};
                }
                setStep(senderJid, 'solo_fight');
                await send(sock, chatId, stepMessage('solo_fight', prefix, 'basics'));
            } catch (e) {
                console.error('[Tutorial] solo quest retry failed:', e?.message);
                setStep(senderJid, 'retry_solo');
                await send(sock, chatId, `${PREFIX} The training grounds are busy - send \`retry\` in a moment.`);
            }
        } else {
            setStep(senderJid, 'group_quest');
            await startGroupDemo(sock, senderJid, prefix);
        }
        return {};
    }
    if (/^(tutorial (skip|stop|leave|end)|skip tutorial|leave tutorial|skip)$/.test(norm)) {
        const s = sessions.get(senderJid);
        if (!user || !s) return null;
        const wasTrack = TRACKS[s.track] ? TRACKS[s.track].title : 'Tutorial';
        cleanupLoadout(senderJid);
        user.tutorialTracks[s.track] = 'unlocked'; // bail ≠ done - can restart later
        economy.saveUser(senderJid);
        sessions.delete(senderJid);
        return { text: `${PREFIX} *${wasTrack}* ended. Everything I lent you is back in my locker - your real progress was untouched. Restart anytime with \`tutorial ${s.track}\`.` };
    }

    const s = sessions.get(senderJid);
    if (!s || !user) return null;
    const flow = flowOf(s.track);

    // bare navigation inside the tutorial
    if (norm === 'next') {
        // reading tracks: `next` always advances (no soft-locks)
        if (!['basics', 'combat'].includes(s.track)) {
            return await advanceStep(sock, senderJid, chatId, prefix);
        }
        // basics/combat: only optional-action steps can be passed with `next`
        if (s.step === 'money') {
            setStep(senderJid, 'daily');
            await send(sock, chatId, stepMessage('daily', prefix));
            return {};
        }
        return { text: `${PREFIX} Do the action above first - I'll move us forward when you do.` };
    }
    if (norm === 'ready') {
        if (s.step === 'dummy_prep' || s.step === 'cb_ready') {
            await startPracticeFight(sock, senderJid, prefix);
            return {};
        }
        return { text: `${PREFIX} We're not there yet - do the step above first.` };
    }
    if (/^(finish|done|graduate)$/.test(norm)) {
        // finishing early: allowed from any last-content step, refused mid-lesson
        if (!['abyss', 'complete_summary', 'victory'].includes(s.step) && ['basics', 'combat'].includes(s.track)) {
            return { text: `${PREFIX} We're mid-lesson - finish the current step (or \`skip\` to bail).` };
        }
        if (['basics', 'combat'].includes(s.track) && s.step === 'victory') {
            // combat: victory requires the hospital action (it's the lesson)
            return { text: `${PREFIX} We're mid-lesson - heal up first (\`${P(prefix)} hospital\`), or \`skip\` to bail.` };
        }
        return graduate(sock, chatId, senderJid, prefix);
    }

    return null; // not tutorial traffic
}

// 💡 Phase C: advance along the track's ordered steps (used by `next` in
// reading tracks and by event-driven advances). Sends the next step's text,
// fires per-step grants, graduates at the end.
async function advanceStep(sock, jid, chatId, prefix) {
    const s = sessions.get(jid);
    if (!s) return null;
    const flow = flowOf(s.track);
    const idx = flow.steps.indexOf(s.step);
    const nextStep = flow.steps[idx + 1];
    if (!nextStep) return await graduate(sock, chatId, jid, prefix);
    s.step = nextStep;
    s.nudgedAt = 0;
    s.locked = false;
    // per-step grants
    const rule = (flow.on || {})[nextStep] || {};
    if (rule.grant === 'statpoint') {
        try {
            const progression = require('./progression');
            const prog = progression.getUser(jid);
            if (prog && prog.statPoints !== undefined) {
                prog.statPoints += 1;
                economy.saveUser(jid);
            }
        } catch (e) { /* non-fatal */ }
    }
    const text = (nextStep === 'complete_summary') ? null : stepMessage(nextStep, prefix, s.track);
    if (text) await send(sock, chatId, text);
    if (nextStep === 'complete_summary') return await graduate(sock, chatId, jid, prefix);
    return {};
}

async function graduate(sock, chatId, jid, prefix) {
    const p = P(prefix);
    const s = sessions.get(jid);
    const track = s ? s.track : 'basics';
    cleanupLoadout(jid);
    sessions.delete(jid);
    const user = economy.getUser(jid);
    if (user) {
        ensureTrackState(user);
        user.tutorialTracks[track] = 'done';
        if (track === 'basics') user.tutorial = 'done'; // legacy flag
        economy.saveUser(jid);
    }
    // 💡 Phase C: per-track graduation text
    let summary;
    if (track === 'basics') {
        summary = `${PREFIX} *BOOT CAMP COMPLETE*\n\n` +
            `You now know the essentials: your sheet (\`${p} char\`), solo quests (\`${p} solo f\`), group quests (\`${p} quest f\`) and the shop (\`${p} shop\` / \`${p} buy\`).\n\n` +
            `Your real first quest: \`${p} solo f\`. The Academy has more for you - every few levels a new tutorial unlocks (combat, skills, summons, the Abyss and beyond). Check \`${p} tutorial list\` anytime. Good hunting.`;
    } else {
        const cfg = TRACKS[track] || { title: 'TUTORIAL', icon: '🧭' };
        summary = `${PREFIX} *${cfg.title} - COMPLETE*\n\n` +
            `Lesson absorbed. More tutorials unlock as you level - see \`${p} tutorial list\` for the full curriculum.`;
    }
    const noticeCard = require('./guildWar/noticeCard');
    let gradBuf = null;
    try {
        gradBuf = await noticeCard.renderNotice(
            track === 'basics'
                ? `${economy.getDisplayName(jid)} has completed the Guild Association's hands-on training. The dungeons await, hero.`
                : `${economy.getDisplayName(jid)} completed the ${TRACKS[track] ? TRACKS[track].title : 'academy'} lesson. The Academy marks it complete.`,
            { title: track === 'basics' ? 'TRAINING COMPLETE' : `${TRACKS[track] ? TRACKS[track].title : 'TUTORIAL'} COMPLETE`, kicker: 'ADVENTURER ACADEMY' },
        );
    } catch (e) { /* text fallback */ }
    if (gradBuf) {
        try {
            await sock.sendMessage(chatId, { image: gradBuf, caption: summary });
            return {};
        } catch (e) { /* fall through to text */ }
    }
    return { text: summary };
}

// ── wrong-command guidance: gentle redirect, max once per 30s per step ──
async function nudge(sock, jid, lessonHint) {
    const s = sessions.get(jid);
    if (!s) return;
    const now = Date.now();
    if (s.nudgedAt && now - s.nudgedAt < 30000) return;
    s.nudgedAt = now;
    const p = P();
    await send(sock, s.chatId, lessonHint ||
        `${PREFIX} Not quite yet - this step is teaching you something specific. Do the action above first.`);
}

// ── per-step expectation (shown when the player does the wrong thing) ──
function stepHint(step, prefix) {
    const p = P(prefix);
    const hints = {
        stats: `This step is about your character sheet.\nUse: \`${p} char\``,
        gear: `This step is arming you.\nUse: \`${p} equip rusty_dagger\``,
        bag: `This step is your inventory.\nUse: \`${p} inventory\``,
        solo_quest: `This step opens your first training quest - it's automatic. If it stalled, send \`retry\`.`,
        solo_fight: `Finish the training quest first - attack with \`${p} combat atk\``,
        group_quest: `The demo raid is starting - follow the instructions above.`,
        dummy_prep: `Send \`ready\` to enter the practice yard.`,
        combat_atk: `⚔️ Not quite yet.\nThis turn is teaching you basic attacks.\nUse: \`${p} combat atk\``,
        combat_def: `🛡️ Not yet.\nThis turn is teaching you how to defend.\nUse: \`${p} combat def\``,
        combat_skill: `✨ Not yet.\nThis turn is teaching you skills.\nUse: \`${p} combat skill 1\``,
        combat_item: `🧪 Not yet.\nThis turn is teaching you combat items.\nUse: \`${p} combat item 1\``,
        combat_rest: `💤 Not yet.\nThis turn is teaching you energy recovery.\nUse: \`${p} combat rest\``,
        combat_finish: `Finish the dummy off with \`${p} combat atk\``,
        victory: `This step is healing up.\nUse: \`${p} hospital\``,
        skilltree: `This step is your skill tree.\nUse: \`${p} st\``,
        allocate: `This step is spending stat points.\nUse: \`${p} allocate atk 1\``,
        progression: `This step is XP, levels and rank.\nUse: \`${p} profile\` and \`${p} rank\``,
        shop: `This step is browsing the shop.\nUse: \`${p} shop\``,
        shop_buy: `This step is buying.\nUse: \`${p} buy minor_potion\``,
        money: `Send \`next\` when you're ready to continue.`,
        daily: `This step is the daily reward.\nUse: \`${p} daily\``,
        sell: `This step is selling.\nUse: \`${p} sell minor_potion\` - or send \`next\` to move on.`,
        repair: `This step is gear maintenance.\nUse: \`${p} blacksmith\` - or send \`next\` to move on.`,
        abyss: `This step is a safe look at the Abyss.\nUse: \`${p} abyss status\` - or send \`next\` to graduate.`,
    };
    return hints[step] || null;
}

// Which tutorial step each game command belongs to (used to route the
// player's real actions and to redirect wrong ones).
const EVENT_STEP_ROUTES = {
    char: ['stats'], character: ['stats'], stats: ['stats'],
    equip: ['gear'],
    inventory: ['bag'], bag: ['bag'], inv: ['bag'],
    hospital: ['victory'], heal: ['victory'], clinic: ['victory'],
    st: ['skilltree'], skilltree: ['skilltree'],
    allocate: ['allocate'], alloc: ['allocate'],
    profile: ['progression'], me: ['progression'],
    rank: ['progression'], adventurer: ['progression'],
    shop: ['shop'],
    buy: ['shop_buy'],
    sell: ['sell'],
    daily: ['daily'],
    repair: ['repair'], blacksmith: ['repair'], enhance: ['repair'], upgrade: ['repair'], inspect: ['repair'],
    abyss: ['abyss'],
};

// 💡 Single engine integration point: called for every recognized game
// command while a tutorial session is active. Advances the tutorial when
// the action matches the current step; gently redirects when it doesn't.
async function notifyAction(jid, cmd, ctx = {}) {
    const s = sessions.get(jid);
    if (!s) return;
    const c = String(cmd || '').toLowerCase();
    const flow = flowOf(s.track);

    // 💡 Phase C: reading tracks (everything except basics/combat) advance on
    // their declared event rules. Wrong commands don't nag - players keep
    // playing while the lesson waits (no nudge spam).
    if (!['basics', 'combat'].includes(s.track)) {
        const rule = (flow.on || {})[s.step];
        if (rule && rule.cmds.includes(c)) {
            if (rule.subs && !rule.subs.includes(String(ctx.sub || '').toLowerCase())) return;
            try { await advanceStep(ctx.sock, jid, ctx.chatId || s.chatId, ctx.prefix); } catch (e) { /* non-fatal */ }
        }
        return;
    }

    // combat subcommands are coached per-lesson (combat track only - basics
    // solo/group fights just play)
    if (c === 'combat') {
        if (!flow.combatTrack) return;
        const sub = String(ctx.sub || '').toLowerCase();
        const lessonFor = { atk: 'combat_atk', attack: 'combat_atk', def: 'combat_def', defend: 'combat_def', skill: 'combat_skill', ability: 'combat_skill', item: 'combat_item', use: 'combat_item', rest: 'combat_rest' };
        const target = lessonFor[sub];
        if (target && s.step !== target && !['combat_finish', 'retry_fight', 'dummy_prep', 'cb_ready'].includes(s.step)) {
            const sock = ctx.sock;
            if (s.step === 'combat_finish' && target === 'combat_atk') return; // any attack works
            await nudge(sock, jid, stepHint(s.step, ctx.prefix));
        }
        return;
    }
    const steps = EVENT_STEP_ROUTES[c];
    if (!steps) return; // not tutorial traffic - normal gameplay proceeds
    if (steps.includes(s.step)) {
        // 💡 State-driven rule: these commands can FAIL (insufficient funds,
        // wrong item, cooldown) - they must only advance the tutorial on
        // REAL success, via the success hooks inside their handlers
        // (shopCommands.buyItem / rpgCommands.sellItem + equipItem /
        // progressionCommands.handleAllocateCommand / engine hospital).
        const SUCCESS_HOOKED = new Set(['equip', 'buy', 'sell', 'allocate', 'hospital', 'heal', 'clinic']);
        if (SUCCESS_HOOKED.has(c)) return;
        const eventMap = { character: 'char', stats: 'char', bag: 'inventory', inv: 'inventory', heal: 'hospital', clinic: 'hospital', skilltree: 'st', alloc: 'allocate', me: 'profile', adventurer: 'rank', blacksmith: 'repair', enhance: 'repair', upgrade: 'repair', inspect: 'repair' };
        await notify(jid, eventMap[c] || c, ctx);
        return;
    }
    // known command, wrong step → guide back (except always-allowed verbs)
    const freeVerbs = ['profile', 'me', 'rank', 'adventurer', 'char', 'character', 'stats', 'inventory', 'bag', 'inv', 'shop'];
    if (freeVerbs.includes(c)) {
        // informational commands are harmless anywhere - no nudge spam
        return;
    }
    const sock = ctx.sock;
    await nudge(sock, jid, stepHint(s.step, ctx.prefix));
}

// ── listeners wired into the game systems (all no-ops without a session) ──
// notify() fires on the player's REAL successful actions. Combat lessons
// advance only via the accepted-action hook in guildAdventure (which sends
// combat_attack / combat_defend / combat_ability / combat_item /
// combat_rest), so a message that was rejected by the combat engine can
// never advance the tutorial. Duplicate actions can't double-advance either
// - the step guard + consume() lock see to that.
async function notify(jid, event, ctx = {}) {
    const s = sessions.get(jid);
    if (!s) return;
    const sock = ctx.sock;
    const chatId = ctx.chatId || s.chatId;
    const prefix = P(ctx.prefix);
    const user = economy.getUser(jid);
    // 💡 Phase C: session existence is the activity truth (reading tracks
    // don't set the legacy user.tutorial='active' flag)
    if (!user) { sessions.delete(jid); return; }

    // Combat lessons: the event arrives when the action was ACCEPTED.
    // Delay briefly so the action result (combat image/log) lands before
    // the next instruction - never coach mid-resolution.
    // 💡 Phase C: dummy lessons live in the COMBAT track only
    const combatLessons = {
        combat_attack: { from: ['combat_atk'], to: 'combat_def', msg: 'combat_def' },
        combat_defend: { from: ['combat_def'], to: 'combat_skill', msg: 'combat_skill' },
        combat_ability: { from: ['combat_skill'], to: 'combat_item', msg: 'combat_item' },
        combat_item: { from: ['combat_item'], to: 'combat_rest', msg: 'combat_rest' },
        combat_rest: { from: ['combat_rest'], to: 'combat_finish', msg: 'combat_finish' },
    };
    if (combatLessons[event]) {
        if (s.track !== 'combat') return;
        const lesson = combatLessons[event];
        if (!lesson.from.includes(s.step)) return; // wrong lesson (incl. duplicates)
        if (!consume(jid, s.step)) return; // already consumed this step
        setTimeout(async () => {
            try {
                setStep(jid, lesson.to);
                await send(sock, chatId, stepMessage(lesson.msg, prefix, 'combat'));
            } catch (e) { /* non-fatal */ }
        }, 2500);
        return;
    }

    // 💡 Phase C: reading tracks never come through here (notifyAction
    // advances them directly) - nothing below applies to them.
    if (!['basics', 'combat'].includes(s.track)) return;

    switch (event) {
        case 'char':
            // basics: sheet → STRAIGHT to the training solo quest (stripped
            // flow - no equip/bag detour; those live in the combat track)
            if (s.track === 'basics' && s.step === 'stats') {
                setStep(jid, 'solo_quest');
                await send(sock, chatId, stepMessage('solo_quest', prefix, 'basics'));
                // open the controlled solo quest automatically
                setTimeout(async () => {
                    try {
                        const guildAdventure = require('./guildAdventure');
                        const res = await guildAdventure.startTutorialQuest(sock, chatId, jid, {
                            greeting: 'A training quest behind the Guild Association. One Garden Slime blocks the path.',
                        });
                        if (!res || res.success === false) {
                            setStep(jid, 'retry_solo');
                            await send(sock, chatId, `${PREFIX} The training grounds are busy - send \`retry\` in a moment.`);
                            return;
                        }
                        setStep(jid, 'solo_fight');
                        await send(sock, chatId, stepMessage('solo_fight', prefix, 'basics'));
                    } catch (e) {
                        console.error('[Tutorial] solo quest start failed:', e?.message);
                    }
                }, 2000);
            }
            break;
        case 'equip':
            // combat track: loaner dagger equipped
            if (s.track === 'combat' && s.step === 'cb_intro') {
                setStep(jid, 'cb_bag');
                await send(sock, chatId, stepMessage('cb_bag', prefix, 'combat'));
            }
            break;
        case 'inventory':
            // combat track: bag viewed → offer the practice yard
            if (s.track === 'combat' && s.step === 'cb_bag') {
                setStep(jid, 'cb_ready');
                await send(sock, chatId, stepMessage('cb_ready', prefix, 'combat'));
            }
            break;
        case 'hospital':
            // combat track: healed → graduate (basics has no hospital step)
            if (s.track === 'combat' && s.step === 'victory') {
                await graduate(sock, chatId, jid, prefix);
            }
            break;
        case 'shop':
            if (s.track === 'basics' && s.step === 'shop') {
                setStep(jid, 'shop_buy');
                await send(sock, chatId, stepMessage('shop_buy', prefix, 'basics'));
            }
            break;
        case 'buy':
            if (s.track === 'basics' && s.step === 'shop_buy') {
                // last basics action → graduation card
                await graduate(sock, chatId, jid, prefix);
            }
            break;
        default:
            break;
    }
}

// ── quest/combat outcomes (fired from guildAdventure.endCombat) ──
async function notifyCombatEnd(state, sock) {
    if (!state || !['TUTORIAL', 'TUTORIAL_QUEST', 'TUTORIAL_GROUP'].includes(state.mode)) return;
    const player = (state.players || []).find((p) => !p.isTutorialAlly);
    if (!player) return;
    const jid = player.jid;
    const s = sessions.get(jid);
    if (!s) return;
    const prefix = P();
    const victory = (state.enemies || []).every((e) => (e.stats?.hp || 0) <= 0);

    // 💡 Phase C: training quest + group demo belong to the BASICS track only
    if (state.mode === 'TUTORIAL_QUEST') {
        if (s.track !== 'basics' || s.step !== 'solo_fight') return;
        if (victory) {
            setStep(jid, 'group_quest');
            // let the quest-complete card land first
            setTimeout(async () => {
                try {
                    await send(sock, s.chatId, stepMessage('group_quest', prefix, 'basics'));
                    await startGroupDemo(sock, jid, prefix);
                } catch (e) {
                    console.error('[Tutorial] group demo start failed:', e?.message);
                }
            }, 3500);
        }
        return;
    }

    if (state.mode === 'TUTORIAL_GROUP') {
        // 💡 Phase C: group demo victory now flows to the SHOP step (stripped
        // basics) instead of the practice yard (which lives in the combat track)
        if (s.track !== 'basics' || s.step !== 'group_quest') return;
        if (victory) {
            setStep(jid, 'shop');
            setTimeout(async () => {
                try {
                    await send(sock, s.chatId, stepMessage('shop', prefix, 'basics'));
                } catch (e) { /* non-fatal */ }
            }, 3500);
        }
        return;
    }

    // TUTORIAL (practice dummy) - COMBAT track only. The fight ends
    // COMPLETELY on death - the engine guarantees no further encounters
    // (maxEncounters=1, tutorial mode). We only teach the hospital step and
    // revoke at graduation.
    if (s.track !== 'combat') return;
    if (['combat_atk', 'combat_def', 'combat_skill', 'combat_item', 'combat_rest', 'combat_finish', 'retry_fight'].includes(s.step)) {
        if (!victory) {
            // fled or lost the dummy fight (impossible vs a 0-ATK dummy,
            // but flee exists) - return to the offer
            setStep(jid, 'retry_fight');
            await send(sock, state.chatId, `${PREFIX} Practice interrupted. Send \`retry\` to re-enter the yard, or \`skip\` to end the tutorial.`);
            return;
        }
        setStep(jid, 'victory');
        setTimeout(async () => {
            try {
                await send(sock, state.chatId, stepMessage('victory', prefix, 'combat'));
            } catch (e) { /* non-fatal */ }
        }, 4000);
    }
}

// Text appended to the registration welcome - the invitation.
function offerLine(prefix) {
    return `\n\n${PREFIX} *New here?* DM me \`tutorial start\` and I'll walk you through quests and the shop with live practice - about three minutes, no risk to your progress. More lessons unlock as you level.`;
}

// ═══════════════════════════════════════════════════════════
// 💡 PHASE C: MILESTONE UNLOCKS (image cards on level-up)
// ═══════════════════════════════════════════════════════════

// Called from progression.addXP + the forward-sync in progression.getUser.
// NEVER throws, never awaits network - it only mutates user doc state.
// Crossed a track's unlock level → mark unlocked + queue the announcement
// card (delivered on the player's next interaction by deliverPendingUnlocks).
function recordLevelUps(jid, levelUps) {
    try {
        if (!Array.isArray(levelUps) || levelUps.length === 0) return;
        const user = economy.getUser(jid);
        if (!user) return;
        // 💡 Crossed range = (min-1, max] — e.g. a 1→5 jump passes [2,3,4,5],
        // a 4→5 jump passes [5]. Tracks whose unlockLevel sits INSIDE the
        // crossed range get the announcement card; tracks at or below the
        // starting point are silently unlocked (veteran rule) so nobody gets
        // card-spammed for levels they passed long ago.
        const crossedMin = Math.min(...levelUps) - 1;
        const crossedMax = Math.max(...levelUps);
        // init track state with a TEMPORARY effective level of crossedMin so
        // ensureTrackState doesn't silently unlock the very tracks we're
        // about to announce
        if (!user.tutorialTracks || typeof user.tutorialTracks !== 'object') user.tutorialTracks = {};
        if (!Array.isArray(user.tutorialPending)) user.tutorialPending = [];
        for (const [id, cfg] of Object.entries(TRACKS)) {
            if (user.tutorialTracks[id]) continue;
            if (id === 'basics') {
                user.tutorialTracks[id] = (user.tutorial === 'done') ? 'done' : 'unlocked';
            } else {
                user.tutorialTracks[id] = (crossedMin >= cfg.unlockLevel) ? 'unlocked' : 'locked';
            }
        }
        let changed = false;
        for (const [id, cfg] of Object.entries(TRACKS)) {
            if (id === 'basics') continue;
            if (user.tutorialTracks[id] === 'locked' && cfg.unlockLevel > crossedMin && cfg.unlockLevel <= crossedMax) {
                user.tutorialTracks[id] = 'unlocked';
                if (!user.tutorialPending.includes(id)) user.tutorialPending.push(id);
                changed = true;
            }
        }
        if (changed) economy.saveUser(jid);
    } catch (e) {
        console.error('[Tutorial] recordLevelUps (non-fatal):', e?.message);
    }
}

// Deliver pending unlock cards. Called from the engine's awardProgression
// hook (fires on the player's next interaction) and from `.j tutorial list`.
// Sends at most 2 cards per call - the rest stay queued (anti-spam).
async function deliverPendingUnlocks(jid, sock, chatId) {
    try {
        const user = economy.getUser(jid);
        if (!user || !Array.isArray(user.tutorialPending) || user.tutorialPending.length === 0) return;
        const batch = user.tutorialPending.slice(0, 2);
        const noticeCard = require('./guildWar/noticeCard');
        for (const trackId of batch) {
            const cfg = TRACKS[trackId];
            if (!cfg) { user.tutorialPending = user.tutorialPending.filter(t => t !== trackId); continue; }
            const p = P();
            const caption = `${cfg.icon} *NEW TUTORIAL UNLOCKED - ${cfg.title}*\n\n` +
                `${cfg.blurb.charAt(0).toUpperCase() + cfg.blurb.slice(1)}.\n\n` +
                `DM me \`tutorial ${trackId}\` to start it now, or \`${p} tutorial list\` to see the full curriculum.`;
            let buf = null;
            try {
                buf = await noticeCard.renderNotice(
                    `You've reached level ${cfg.unlockLevel}, ${economy.getDisplayName(jid)}. The Adventurer Academy now offers: ${cfg.title} - ${cfg.blurb}.`,
                    { title: cfg.title, kicker: `ADVENTURER ACADEMY - UNLOCKED AT LEVEL ${cfg.unlockLevel}` },
                );
            } catch (e) { /* text fallback */ }
            if (buf) {
                try { await sock.sendMessage(chatId, { image: buf, caption }); }
                catch (e) { await sock.sendMessage(chatId, { text: caption }); }
            } else {
                await sock.sendMessage(chatId, { text: caption });
            }
            user.tutorialPending = user.tutorialPending.filter(t => t !== trackId);
        }
        economy.saveUser(jid);
    } catch (e) {
        console.error('[Tutorial] deliverPendingUnlocks (non-fatal):', e?.message);
    }
}

module.exports = { handleDM, notify, notifyAction, notifyCombatEnd, begin, cleanupLoadout, offerLine, recordLevelUps, deliverPendingUnlocks, TRACKS };
