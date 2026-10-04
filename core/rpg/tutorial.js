// ============================================
// 🎓 NEW PLAYER TUTORIAL — Phase B overhaul (2026-10-04, owner directive)
// An interactive onboarding experience. The player PERFORMS every mechanic
// as it is introduced - no information dumps, one action per step, the
// tutorial waits for the real action before moving on.
//
// Flow (state machine, every arrow = the player's real action):
//   .j char → .j equip rusty_dagger → .j inventory →
//   controlled SOLO quest (Garden Slime - safe params, real loop) →
//   GROUP demo (player + 3 fake guild-mates vs one slime) →
//   dedicated TUTORIAL battle (ONE Training Dummy, 0 ATK, ends COMPLETELY
//   when it dies - nothing else can ever spawn) teaching one action at a
//   time: .j combat atk → def → skill 1 → item 1 → rest → finish →
//   .j hospital → .j st (skill tree) → .j allocate (a safe granted point) →
//   .j profile (XP/level/rank) → .j shop → .j buy minor_potion →
//   money lessons → .j daily → .j sell → maintenance (repair/blacksmith/
//   enhance) → .j abyss status (view only, never an encounter) →
//   graduation (loadout revoked, summary card).
//
// Guild War / The Ruins are deliberately NOT taught (owner directive).
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

// ── step texts (short on purpose - the player ACTS, we do not lecture) ──
function stepMessage(id, prefix) {
    const p = P(prefix);
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
            return `🎒 *That's your inventory.* Equipped gear shows ⚔️, consumables stack with ×N.\n\n` +
                `*Step 4 - your first quest.* Real quests start with \`${p} solo f\` (solo) or \`${p} quest f\` (a group) - but I'm opening a *training quest* for you now: one docile Garden Slime, no boss, no surprises. Defeat it like a real quest and the loot is yours.`;
        case 'solo_fight':
            return `🌱 *The slime wobbles menacingly.* This is the quest loop: the encounter opens, you act each turn, victory pays XP, Zeni and loot.\n\nAttack it: \`${p} combat atk\``;
        case 'group_quest':
            return `🎉 *Quest complete!* Loot went straight to your bag - that's the solo loop.\n\n` +
                `*Step 5 - group content.* Dungeons get deadlier with rank, and parties share the fight. I've opened a *demo raid*: three guild-mates (Rin, Boro and Pia) will fight alongside you. They act on their own - you just attack: \`${p} combat atk\``;
        case 'dummy_prep':
            return `🤝 *That's a raid, sort of.* More HP bars on your side, split aggro, shared victory - real group quests (\`${p} quest f\`) work the same way with real people.\n\n` +
                `*Step 6 - combat practice.* Opening the practice yard: ONE Training Dummy. It can't hit back, and when it dies the fight is over. Send \`ready\` when you're in.`;
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
                `*Step 11 - buying.* Get a Minor Potion (you'll want a spare): \`${p} buy minor_potion\``;
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
        setStep(jid, 'dummy_prep');
        await send(sock, chatId, stepMessage('dummy_prep', prefix));
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

async function begin(sock, chatId, jid, prefix) {
    const user = economy.getUser(jid);
    if (!user) {
        await send(sock, chatId, `${PREFIX} Register first, then DM me \`tutorial start\`.`);
        return {};
    }

    // crash-safe: scrub any stranded loadout from a previous attempt
    cleanupLoadout(jid);
    user.tutorial = 'active';
    user.tutorialLoadout = { skills: [], items: [], equipment: null };
    economy.saveUser(jid);
    sessions.set(jid, { step: 'stats', chatId, startedAt: Date.now(), nudgedAt: 0, locked: false });

    // grant the practice weapon
    try {
        await inventorySystem.addItem(jid, 'rusty_dagger', 1);
        user.tutorialLoadout.equipment = { id: 'rusty_dagger', slot: 'main_hand' };
        economy.saveUser(jid);
    } catch (e) { /* non-fatal */ }

    await send(sock, chatId, stepMessage('welcome', prefix));
    return {}; // handled
}

// ── DM entry: handles tutorial verbs; returns null to fall through ──
async function handleDM(sock, senderJid, chatId, txt, BOT_MARKER, opts = {}) {
    const prefix = P(opts.prefix);
    const raw = String(txt || '').trim().toLowerCase();
    if (!raw) return null;
    const norm = raw.startsWith(prefix.toLowerCase()) ? raw.slice(prefix.length).trim() : raw;
    const user = economy.getUser(senderJid);

    // starting (or restarting) the tutorial
    if (/^(tutorial( start)?|start tutorial)$/.test(norm)) {
        await begin(sock, chatId, senderJid, prefix);
        return {};
    }
    if (norm === 'retry') {
        const s = sessions.get(senderJid);
        if (!s || !['retry_fight', 'retry_solo', 'retry_group'].includes(s.step)) return null;
        if (s.step === 'retry_fight') {
            s.step = 'battle_prep';
            await startPracticeFight(sock, senderJid, prefix);
        } else if (s.step === 'retry_solo') {
            s.step = 'solo_quest';
            await notify(senderJid, 'inventory', { sock, chatId, prefix });
        } else {
            setStep(senderJid, 'group_quest');
            await startGroupDemo(sock, senderJid, prefix);
        }
        return {};
    }
    if (/^(tutorial (skip|stop|leave|end)|skip tutorial|leave tutorial|skip)$/.test(norm)) {
        if (!user || user.tutorial !== 'active') return null;
        cleanupLoadout(senderJid);
        sessions.delete(senderJid);
        return { text: `${PREFIX} Tutorial ended. Everything I lent you is back in my locker - your real progress was untouched. Say \`tutorial start\` anytime to run it again.` };
    }

    const s = sessions.get(senderJid);
    if (!s || !user || user.tutorial !== 'active') return null;

    // bare navigation inside the tutorial
    if (norm === 'next') {
        // optional-action steps that can be passed with `next`
        if (s.step === 'sell') {
            setStep(senderJid, 'repair');
            await send(sock, chatId, stepMessage('repair', prefix));
            return {};
        }
        if (s.step === 'repair') {
            setStep(senderJid, 'abyss');
            await send(sock, chatId, stepMessage('abyss', prefix));
            return {};
        }
        if (s.step === 'abyss') {
            return graduate(sock, chatId, senderJid, prefix);
        }
        if (s.step === 'money') {
            setStep(senderJid, 'daily');
            await send(sock, chatId, stepMessage('daily', prefix));
            return {};
        }
        return { text: `${PREFIX} Do the action above first - I'll move us forward when you do.` };
    }
    if (norm === 'ready') {
        if (s.step === 'dummy_prep') {
            await startPracticeFight(sock, senderJid, prefix);
            return {};
        }
        return { text: `${PREFIX} We're not there yet - do the step above first.` };
    }
    if (/^(finish|done|graduate)$/.test(norm)) {
        if (!['abyss', 'complete_summary', 'victory'].includes(s.step)) {
            return { text: `${PREFIX} We're mid-lesson - finish the current step (or \`skip\` to bail).` };
        }
        return graduate(sock, chatId, senderJid, prefix);
    }

    return null; // not tutorial traffic
}

async function graduate(sock, chatId, jid, prefix) {
    const p = P(prefix);
    cleanupLoadout(jid);
    sessions.delete(jid);
    const summary = `${PREFIX} *TRAINING COMPLETE*\n\n` +
        `You now know: your sheet (\`${p} char\`), gear (\`${p} equip <item>\`, \`${p} blacksmith\`), the bag (\`${p} inventory\`), quests (\`${p} solo f\`, \`${p} quest f\`), combat (\`${p} combat atk/def/skill/item/rest\`), healing (\`${p} hospital\`), skills (\`${p} st\`), points (\`${p} allocate\`), the shop (\`${p} shop\` / \`${p} buy\` / \`${p} sell\`), the daily (\`${p} daily\`) and the Abyss.\n\n` +
        `Your loaner gear is returned - your progress is yours. First real quest: \`${p} solo f\`. Good hunting.`;
    const noticeCard = require('./guildWar/noticeCard');
    let gradBuf = null;
    try {
        gradBuf = await noticeCard.renderNotice(
            `${economy.getDisplayName(jid)} has completed the Guild Association's hands-on training. The dungeons await, hero.`,
            { title: 'TRAINING COMPLETE', kicker: 'GUILD ASSOCIATION - TRAINING YARD' },
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
    // combat subcommands are coached per-lesson
    if (c === 'combat') {
        const sub = String(ctx.sub || '').toLowerCase();
        const lessonFor = { atk: 'combat_atk', attack: 'combat_atk', def: 'combat_def', defend: 'combat_def', skill: 'combat_skill', ability: 'combat_skill', item: 'combat_item', use: 'combat_item', rest: 'combat_rest' };
        const target = lessonFor[sub];
        if (target && s.step !== target && !['combat_finish', 'retry_fight', 'dummy_prep'].includes(s.step)) {
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
    if (!user || user.tutorial !== 'active') { sessions.delete(jid); return; }

    // Combat lessons: the event arrives when the action was ACCEPTED.
    // Delay briefly so the action result (combat image/log) lands before
    // the next instruction - never coach mid-resolution.
    const combatLessons = {
        combat_attack: { from: ['combat_atk'], to: 'combat_def', msg: 'combat_def' },
        combat_defend: { from: ['combat_def'], to: 'combat_skill', msg: 'combat_skill' },
        combat_ability: { from: ['combat_skill'], to: 'combat_item', msg: 'combat_item' },
        combat_item: { from: ['combat_item'], to: 'combat_rest', msg: 'combat_rest' },
        combat_rest: { from: ['combat_rest'], to: 'combat_finish', msg: 'combat_finish' },
    };
    if (combatLessons[event]) {
        const lesson = combatLessons[event];
        if (!lesson.from.includes(s.step)) return; // wrong lesson (incl. duplicates)
        if (!consume(jid, s.step)) return; // already consumed this step
        setTimeout(async () => {
            try {
                setStep(jid, lesson.to);
                await send(sock, chatId, stepMessage(lesson.msg, prefix));
            } catch (e) { /* non-fatal */ }
        }, 2500);
        return;
    }

    switch (event) {
        case 'char':
            if (s.step === 'stats') {
                setStep(jid, 'gear');
                await send(sock, chatId, stepMessage('gear', prefix));
            }
            break;
        case 'equip':
            if (s.step === 'gear') {
                setStep(jid, 'bag');
                await send(sock, chatId, stepMessage('bag', prefix));
            }
            break;
        case 'inventory':
            if (s.step === 'bag') {
                setStep(jid, 'solo_quest');
                await send(sock, chatId, stepMessage('solo_quest', prefix));
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
                        await send(sock, chatId, stepMessage('solo_fight', prefix));
                    } catch (e) {
                        console.error('[Tutorial] solo quest start failed:', e?.message);
                    }
                }, 2000);
            }
            break;
        case 'hospital':
            if (s.step === 'victory') {
                setStep(jid, 'skilltree');
                await send(sock, chatId, stepMessage('skilltree', prefix));
            }
            break;
        case 'st':
            if (s.step === 'skilltree') {
                setStep(jid, 'allocate');
                // grant one safe practice stat point (progression wallet)
                try {
                    const progression = require('./progression');
                    const prog = progression.getUser(jid);
                    if (prog && prog.statPoints !== undefined) {
                        prog.statPoints += 1;
                        economy.saveUser(jid);
                        console.log(`[Tutorial] granted 1 practice stat point to ${jid}`);
                    }
                } catch (e) { console.error('[Tutorial] stat point grant failed:', e?.message); }
                await send(sock, chatId, stepMessage('allocate', prefix));
            }
            break;
        case 'allocate':
            if (s.step === 'allocate') {
                setStep(jid, 'progression');
                await send(sock, chatId, stepMessage('progression', prefix));
            }
            break;
        case 'profile':
            if (s.step === 'progression') {
                setStep(jid, 'shop');
                await send(sock, chatId, stepMessage('shop', prefix));
            }
            break;
        case 'rank':
            if (s.step === 'progression') {
                // rank view also satisfies the progression step
                setStep(jid, 'shop');
                await send(sock, chatId, stepMessage('shop', prefix));
            }
            break;
        case 'shop':
            if (s.step === 'shop') {
                setStep(jid, 'shop_buy');
                await send(sock, chatId, stepMessage('shop_buy', prefix));
            }
            break;
        case 'buy':
            if (s.step === 'shop_buy') {
                setStep(jid, 'money');
                await send(sock, chatId, stepMessage('money', prefix));
            }
            break;
        case 'daily':
            if (s.step === 'daily') {
                setStep(jid, 'sell');
                await send(sock, chatId, stepMessage('sell', prefix));
            }
            break;
        case 'sell':
            if (s.step === 'sell') {
                setStep(jid, 'repair');
                await send(sock, chatId, stepMessage('repair', prefix));
            }
            break;
        case 'repair':
        case 'blacksmith':
        case 'enhance':
            if (s.step === 'repair') {
                setStep(jid, 'abyss');
                await send(sock, chatId, stepMessage('abyss', prefix));
            }
            break;
        case 'abyss':
            if (s.step === 'abyss') {
                // viewing abyss status satisfies the step; graduation on next
                await send(sock, chatId, `${PREFIX} That's the Abyss console - \`enter\` is your call, when you're ready. Send \`next\` to graduate.`);
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

    if (state.mode === 'TUTORIAL_QUEST') {
        if (s.step !== 'solo_fight') return;
        if (victory) {
            setStep(jid, 'group_quest');
            // let the quest-complete card land first
            setTimeout(async () => {
                try {
                    await send(sock, s.chatId, stepMessage('group_quest', prefix));
                    await startGroupDemo(sock, jid, prefix);
                } catch (e) {
                    console.error('[Tutorial] group demo start failed:', e?.message);
                }
            }, 3500);
        }
        return;
    }

    if (state.mode === 'TUTORIAL_GROUP') {
        if (s.step !== 'dummy_prep') return;
        if (victory) {
            // group demo done - the player still needs to send `ready`
            setStep(jid, 'dummy_prep');
        }
        return;
    }

    // TUTORIAL (practice dummy): the fight ends COMPLETELY on death - the
    // engine guarantees no further encounters (maxEncounters=1, tutorial
    // mode). We only teach the hospital step and revoke at graduation.
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
                await send(sock, state.chatId, stepMessage('ask_hospital', prefix));
            } catch (e) { /* non-fatal */ }
        }, 4000);
    }
}

// Text appended to the registration welcome - the invitation.
function offerLine(prefix) {
    return `\n\n${PREFIX} *New here?* DM me \`tutorial start\` and I'll walk you through quests, combat, skills, gear, the shop and more with live practice - about five minutes, no risk to your progress.`;
}

module.exports = { handleDM, notify, notifyAction, notifyCombatEnd, begin, cleanupLoadout, offerLine };
