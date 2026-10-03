// ============================================
// 🎓 NEW PLAYER TUTORIAL — 2026-10-03 (owner directive)
// Interactive, hands-on tutorial that runs in bot DMs after registration.
// The player PERFORMS every mechanic as it is introduced - no information
// dumps. A dedicated TUTORIAL combat encounter (Training Dummy, 0 ATK)
// lets them practice attacks, skills, items and rest with a TEMPORARY
// loadout (starter weapon, potions, their class's first skills) that is
// granted for the lesson and revoked at the end, so real progression is
// never affected.
//
// Flow: register → offer → `tutorial start` (DM) → staged steps:
//   .j char → equip loaner dagger → auto-started practice fight
//   (attack, skill, item, rest) → victory → .j hospital → world explainer
//   → harder enemies & boss prep → finish (loadout revoked).
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

// ── step texts (short on purpose - the player ACTS, we do not lecture) ──
function stepMessage(id, prefix) {
    const p = prefix || '.';
    switch (id) {
        case 'welcome':
            return `${PREFIX} *WELCOME TO THE TRAINING HALL*\n\n` +
                `I'll teach you the ropes by making you actually play. One step, one action - do it and we move on. You can bail anytime with \`skip\`.\n\n` +
                `*Step 1 - know yourself.* Send me \`${p} char\` to open your character sheet: HP, energy, class, level, wallet.`;
        case 'gear':
            return `📖 *That card is your dashboard.* ❤️ HP is your life (0 = you crawl home), ⚡ energy fuels actions, and it regenerates slowly on its own.\n\n` +
                `*Step 2 - arm yourself.* I've placed a loaner *Rusty Dagger* in your bag. Equip it: \`${p} equip rusty dagger\`.`;
        case 'battle_prep':
            return `⚔️ *Equipped.* Weapons add ATK, armor adds DEF - your sheet shows the totals.\n\n` +
                `*Step 3 - your first fight.* I've handed you 2 Minor Potions and unlocked your class's first skills. Opening the practice yard now - the dummy can't hit back.`;
        case 'ask_skill':
            return `🎯 *That's a basic attack.* Each turn you pick ONE action: attack, skill, item, or rest.\n\n` +
                `*Step 4 - skills.* They cost energy and hit harder. Use one: \`${p} combat skill 1\`.`;
        case 'ask_item':
            return `✨ *Skills learned.* Your class tree grows as you level - new skills unlock and skill points buy their levels.\n\n` +
                `*Step 5 - items in battle.* Potions heal mid-fight - never hoard them. Use one: \`${p} combat item 1\`.`;
        case 'ask_rest':
            return `🧪 *Healed mid-fight.* Items win fights.\n\n` +
                `*Step 6 - energy.* Actions drain ⚡; low on it, \`rest\` recovers some in place. Try: \`${p} combat rest\`.`;
        case 'ask_finish':
            return `💤 *Rested.* Energy also refills over time between fights.\n\n` +
                `Finish the dummy off - any attack will do.`;
        case 'ask_hospital':
            return `🏥 *When the fighting stops, heal.* Send me \`${p} hospital\` - a free full heal on a 12h cooldown. Out here, HP also regenerates slowly on its own.`;
        case 'world':
            return `${PREFIX} *HOW THE WORLD WORKS*\n\n` +
                `• *Quests* are dungeon runs: \`${p} quest f\` opens one for a group, \`${p} solo f\` runs it alone. A pre-raid shop opens first - buy potions there.\n` +
                `• *The Ruins* are guild war battlefields: mods raise the call, you \`look\` and \`move w/a/s/d\` through my DMs, grab relics, hand them in for guild points.\n` +
                `• *The shop* (\`${p} shop\`) sells gear; the *blacksmith* repairs it; *daily* (\`${p} daily\`) pays rent.\n\n` +
                `Send \`next\` for the last lesson: surviving harder enemies.`;
        case 'harder':
            return `${PREFIX} *SURVIVING HARDER ENEMIES & BOSSES*\n\n` +
                `1. *Rank gates you.* Dungeons far above your rank refuse entry solo - party up to reach them safely.\n` +
                `2. *Prepare:* weapon equipped, bag stocked with potions, HP full from the hospital, energy topped.\n` +
                `3. *In the fight:* lead with skills, spend potions freely - a dead hero keeps their potions.\n` +
                `4. *Bosses:* hit like rank-tuned trucks. Bring a party, bring a Phoenix Down, and \`${p} combat flee\` when it goes wrong - retreat is cheap wisdom.\n` +
                `5. *Progress:* every level grants stat and skill points. Spend them (\`${p} allocate\`, \`${p} skill up <skill>\`) - an unspent point is a dead point.\n\n` +
                `Type \`finish\` to graduate.`;
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
            // equipment: unequip first so the slot doesn't hold a ghost
            if (lo.equipment) {
                try { inventorySystem.unequipItem(jid, lo.equipment.slot); } catch (e) { /* not equipped */ }
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
    if (s) s.step = step;
}

// ── start the practice fight (guildAdventure TUTORIAL mode) ──
async function startPracticeFight(sock, jid, prefix) {
    const chatId = stepOf(jid)?.chatId;
    const user = economy.getUser(jid);
    const guildAdventure = require('./guildAdventure');

    // grant potions + the first two skills of THEIR class (recorded for cleanup)
    try {
        await inventorySystem.addItem(jid, 'minor_potion', 2);
        const lo = user.tutorialLoadout || { skills: [], items: [], equipment: null };
        lo.items.push({ id: 'minor_potion', qty: 2 });

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
        user.tutorialLoadout = lo;
        economy.saveUser(jid);
    } catch (e) {
        console.error('[Tutorial] loadout grant failed (continuing):', e?.message);
    }

    await send(sock, chatId, stepMessage('battle_prep', prefix));
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
        setStep(jid, 'attack');
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
    sessions.set(jid, { step: 'stats', chatId, startedAt: Date.now() });

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
    const prefix = String(opts.prefix || '.');
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
        if (!s || s.step !== 'retry_fight') return null;
        s.step = 'battle_prep';
        await startPracticeFight(sock, senderJid, prefix);
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
        if (s.step === 'world') {
            setStep(senderJid, 'harder');
            await send(sock, chatId, stepMessage('harder', prefix));
            return {};
        }
        return { text: `${PREFIX} Do the action above first - I'll move us forward when you do.` };
    }
    if (/^(finish|done|graduate)$/.test(norm)) {
        if (!['harder', 'world', 'victory'].includes(s.step)) {
            return { text: `${PREFIX} We're mid-lesson - finish the current step (or \`skip\` to bail).` };
        }
        cleanupLoadout(senderJid);
        sessions.delete(senderJid);
        const noticeCard = require('./guildWar/noticeCard');
        let gradBuf = null;
        try {
            gradBuf = await noticeCard.renderNotice(
                `${economy.getDisplayName(senderJid)} has completed the Guild Association's hands-on training. The Ruins await, hero.`,
                { title: 'TRAINING COMPLETE', kicker: 'GUILD ASSOCIATION - TRAINING YARD' },
            );
        } catch (e) { /* text fallback */ }
        if (gradBuf) {
            try {
                await sock.sendMessage(chatId, { image: gradBuf, caption: `${PREFIX} 🎓 *Graduated!* Your loaner gear is returned, your progress is yours. First quest: \`${prefix} quest f\`. Good hunting.` });
                return {};
            } catch (e) { /* fall through to text */ }
        }
        return { text: `${PREFIX} 🎓 *Graduated!* Your loaner gear is returned, your progress is yours. First quest: \`${prefix} quest f\`. Good hunting.` };
    }

    return null; // not tutorial traffic
}

// ── listeners wired into the game systems (all no-ops without a session) ──
async function notify(jid, event, ctx = {}) {
    const s = sessions.get(jid);
    if (!s) return;
    const sock = ctx.sock;
    const chatId = ctx.chatId || s.chatId;
    const prefix = ctx.prefix || '.';
    const user = economy.getUser(jid);
    if (!user || user.tutorial !== 'active') { sessions.delete(jid); return; }

    switch (event) {
        case 'char':
            if (s.step === 'stats') {
                setStep(jid, 'gear');
                await send(sock, chatId, stepMessage('gear', prefix));
            }
            break;
        case 'equip':
            if (s.step === 'gear') {
                setStep(jid, 'battle_prep');
                await startPracticeFight(sock, jid, prefix);
            }
            break;
        case 'combat_attack':
            if (s.step === 'attack') {
                setStep(jid, 'skills');
                await send(sock, chatId, stepMessage('ask_skill', prefix));
            }
            break;
        case 'combat_ability':
            if (s.step === 'skills') {
                setStep(jid, 'items');
                await send(sock, chatId, stepMessage('ask_item', prefix));
            }
            break;
        case 'combat_item':
            if (s.step === 'items') {
                setStep(jid, 'rest');
                await send(sock, chatId, stepMessage('ask_rest', prefix));
            }
            break;
        case 'combat_rest':
            if (s.step === 'rest') {
                setStep(jid, 'victory_wait');
                await send(sock, chatId, stepMessage('ask_finish', prefix));
            }
            break;
        case 'hospital':
            if (s.step === 'victory') {
                setStep(jid, 'world');
                await send(sock, chatId, stepMessage('world', prefix));
            }
            break;
        default:
            break;
    }
}

// combat ended during the tutorial (victory over the dummy, or fled)
async function notifyCombatEnd(state, sock) {
    if (!state || state.mode !== 'TUTORIAL') return;
    const player = (state.players || [])[0];
    if (!player) return;
    const jid = player.jid;
    const s = sessions.get(jid);
    if (!s) return;
    if (['attack', 'skills', 'items', 'rest', 'victory_wait', 'retry_fight'].includes(s.step)) {
        setStep(jid, 'victory');
        await send(sock, state.chatId, stepMessage('ask_hospital', '.'));
    }
}

// Text appended to the registration welcome - the invitation.
function offerLine(prefix) {
    return `\n\n${PREFIX} *New here?* DM me \`tutorial start\` and I'll walk you through combat, skills, gear and the hospital with live practice - about two minutes, no risk to your progress.`;
}

module.exports = { handleDM, notify, notifyCombatEnd, begin, cleanupLoadout, offerLine };
