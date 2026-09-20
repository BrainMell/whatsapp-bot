// ═══════════════════════════════════════════════════════════════════════════
//  SOUL READER — the Fortune Teller behind `.j kills`
// ═══════════════════════════════════════════════════════════════════════════
//  Restores the owner-designed Fortune Teller system from the lore update
//  (design package: lore_drops/fortune_teller.md + image_cards/fortune_teller/).
//  The kill count is not a ledger line - it is a READING:
//
//    · THE SIGHT (3 doors): reach level 40 · face the deep floors (abyss
//      floor 31+, where the deep bands begin) · pay the reader's fee
//      ("three coins" - 3,000 Zeni, once, forever).
//    · Unmet doors → the LOCKED card (THE VEILWARD READING) with the live
//      checklist. A locked reading is never rendered as a ledger.
//    · All doors open → the LEDGER card (SOULS BEYOND THE VEIL), the count
//      rendered as souls. The FIRST unlocked reading plays the soul-sight
//      ceremony line (pool B) before the card; every reading after shows
//      one of the teller's everyday lines (pool A/C) in the card.
//    · `.j kills pay` → hand over the three coins.
//
//  Fee/ceremony state lives in the System KV collection (key
//  veil_reading_<userId>) - ZERO Mongoose schema changes.
//  Lore lines are verbatim from the approved pool; PROPOSED lines excluded
//  (same discipline as loreDrops.js). Format contract: `╒ *line* ╛`.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const economy = require('./economy');
const botConfig = require('../../botConfig');
const renderer = require('./soulReaderRenderer');

// ─── THE SIGHT — gate constants (from the designed card) ────────────────────
const SIGHT_LEVEL = 40;        // "REACH LEVEL 40"
const SIGHT_DEEP_FLOOR = 31;   // "FACE THE DEEP FLOORS" - deep bands begin at 31
const READER_FEE = 3000;       // "PAY THE READER'S FEE" - three coins

const P = () => botConfig.getPrefix();

// ─── THE TELLER'S VOICE (verbatim pools from the approved spec) ─────────────
const POOL_A = [
    'Cross my palm— no. Not that one. The other. That hand has thrown dice at fate too recently.',
    'Your cards came up the Tower, the Road, and the Mirror. Relax. Half my decks are just furniture.',
    'I see a tall dark stranger. …No, I see a short rude one. The cards are arguing. Come back Tuesday.',
    'The stars say you\'ll live. The stars haven\'t been wrong. They\'ve been VAGUE.',
    'Luck isn\'t a wheel, it\'s a stray cat. Feed it and it stays a while. You\'ve been feeding it, hmm.',
    'You want to know WHEN. Everyone wants to know when. The cards only know whether the door is locked.',
    'Aurora in your cup, storm at the rim. You drink too fast, and the world agrees with you. That\'s your whole future.',
    'For three coins I\'ll tell your fortune. For seven I\'ll tell it honestly. Your choice, adventurer.',
    'The cards like a warm fire, and so do I. Sit. The dead don\'t mind waiting, but the living should learn to.',
    'I read the room by its echoes. Yours are… tidy. Suspiciously tidy. Who have you been fighting?',
    'The veil parts for no one\'s schedule, dear. But for three coins it\'ll peek.',
];
const POOL_B = [
    'You\'re finally strong enough to see them. Sit down first. Everyone thinks they won\'t need to.',
    'Are you certain you want to know how many you\'ve sent beyond the veil? …Very well. Hold my hand. Count with me.',
    'The spell is old and it doesn\'t soften. What you see cannot be unseen. Breathe at the THIRD bell, not the first.',
    'Weak minds shatter looking backward at what they\'ve done. Yours held. That says more than the number does.',
    'Every adventurer asks me to lie about the count. I refuse, and then I offer tea. You\'ll want the tea.',
    'Don\'t flinch when they look back. They always look back. They\'re not angry. They\'re just… surprised it was you.',
    'The first time is loud. The hundredth time is quiet. I\'m sorry for both, in that order.',
];
const POOL_C = [
    'You\'ve sent quite a few souls my way lately. Business is good. I\'d rather it weren\'t.',
    'Some souls don\'t stay where they\'re supposed to. If you meet a wanderer who feels like a place more than a person — be polite. And keep walking.',
    'I\'ve seen warriors arrive here from worlds you\'ve never heard of. They tell the same stories with different names. Every time.',
    'It\'s becoming rather crowded beyond the veil. Whatever is stirring down deep in the Abyss — it isn\'t only your world doing the sending.',
    'Souls keep their favorite year, you know. Most pick something small. A kitchen. A rain. Nobody picks the treasure.',
    'The newly dead always ask the same three questions: did it matter, who won, and who\'s watching my dog. In that order, always.',
    'I can tell a monster\'s soul from a person\'s by the weight. You\'d be surprised how often the monster\'s is lighter.',
    'Gods arrive like weather. Don\'t gawk. Offer tea. They\'re mostly embarrassed.',
    'Do not bargain with whatever answers when you knock on the veil. I answer FOR it. That\'s the whole arrangement. Three coins.',
];
const CEREMONY_LINE = POOL_B[1]; // "…Hold my hand. Count with me." - the first reading

const framed = (line) => `╒ *${line}* ╛`;

/** One stable line per user per day - a reading, not noise. */
function todayLine(userId) {
    const d = new Date();
    const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    let h = 0;
    const s = `${userId}|${dayKey}`;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const all = POOL_A.concat(POOL_C);
    return all[h % all.length];
}

// ─── STATE (System KV - zero schema changes) ────────────────────────────────
const stateKey = (userId) => `veil_reading_${userId}`;

async function getReadingState(userId) {
    try {
        const System = require('../models/System');
        const doc = await System.findOne({ key: stateKey(userId) }).lean();
        return doc?.value || { paid: false, ceremonyDone: false };
    } catch (e) {
        return { paid: false, ceremonyDone: false };
    }
}

async function setReadingState(userId, value) {
    const System = require('../models/System');
    await System.findOneAndUpdate(
        { key: stateKey(userId) },
        { $set: { value } },
        { upsert: true },
    );
}

// ─── PRIVILEGE (2026-09-21 owner report: ".j kills keeps returning the
//  requirement message") ──────────────────────────────────────────────────
//  The OWNER reads the ledger without the three doors. Same lazy-require
//  pattern as worldMap._isStaff (avoids the circular import trap, fail
//  closed on any error). Global mods and RPG mods do NOT get this - the
//  Fortune Teller's doors are a player journey, the owner stands outside it.
function _isOwner(userId) {
    try {
        const engine = require('../engine');
        return !!(engine.isBotOwner && engine.isBotOwner(userId));
    } catch (e) {
        try { console.error('[soulReader] owner check failed, fail-closed:', e.message); } catch (_) {}
        return false;
    }
}

// ─── GATES ──────────────────────────────────────────────────────────────────

function getLevel(userId) {
    try { return require('./progression').getLevel(userId) || 1; } catch (e) { return 1; }
}

async function getBestFloor(userId) {
    try {
        const best = await require('./abyssSystem').getPlayerBest(userId);
        return best?.deepestFloor || 0;
    } catch (e) { return 0; }
}

async function getSight(userId) {
    const [state, bestFloor] = await Promise.all([getReadingState(userId), getBestFloor(userId)]);
    const level = getLevel(userId);
    const levelOk = level >= SIGHT_LEVEL;
    const floorOk = bestFloor >= SIGHT_DEEP_FLOOR;
    const feeOk = !!state.paid;
    return { state, level, levelOk, bestFloor, floorOk, feeOk, open: levelOk && floorOk && feeOk };
}

// ─── LEDGER ROWS (real tracked stats only - nothing fabricated) ─────────────

function ledgerRows(user, bestFloor) {
    const stats = user.stats || {};
    return {
        rows: [
            { label: 'TOTAL SOULS', value: stats.kills || 0 },
            { label: 'UNDEAD KIND', value: stats.undeadKills || 0 },
            { label: 'DRAGON KIND', value: stats.dragonsKilled || 0 },
            { label: 'BOSS KINDS', value: stats.bossesDefeated || 0 },
            { label: 'DUELS WON', value: user.pvpWins || 0 },
        ],
        accent: {
            label: 'DEEPEST DESCENT',
            value: bestFloor ? `FLOOR ${bestFloor}` : '—',
        },
    };
}

// ─── TEXT FALLBACK (same ladder as the maps: image first, text under it) ────

function lockedText(s) {
    const P_ = P();
    let t = `🕯️ *THE VEILWARD READING* — the soul reader\n`;
    t += `━━━━━━━━━━━━━━━\n`;
    t += `${s.levelOk ? '✅' : '⭕'} Reach level *${SIGHT_LEVEL}* — you: *${s.level}*\n`;
    t += `${s.floorOk ? '✅' : '⭕'} Face the deep floors — deepest: *${s.bestFloor ? 'floor ' + s.bestFloor : 'none yet'}* (need floor ${SIGHT_DEEP_FLOOR})\n`;
    t += `${s.feeOk ? '✅' : '⭕'} Pay the reader's fee — *${READER_FEE.toLocaleString()} Zeni*\n`;
    t += `━━━━━━━━━━━━━━━\n`;
    if (!s.feeOk && s.levelOk && s.floorOk) {
        t += `\n💰 Only the coins remain. \`${P_} kills pay\` — the reader accepts.`;
    } else {
        t += `\n_Locked — requirements unmet. The count waits._`;
    }
    return t;
}

function ledgerText(rows, accent) {
    let t = `👁️ *SOULS BEYOND THE VEIL* — reader · the count\n`;
    t += `━━━━━━━━━━━━━━━\n`;
    for (const r of rows) t += `${r.label}: *${r.value.toLocaleString()}*\n`;
    t += `${accent.label}: *${accent.value}*\n`;
    t += `━━━━━━━━━━━━━━━\n`;
    t += `_count current as of today._`;
    return t;
}

// ─── INTERACTIONS ───────────────────────────────────────────────────────────

async function payFee(sock, chatId, userId) {
    const sight = await getSight(userId);
    if (sight.feeOk) {
        return sock.sendMessage(chatId, {
            text: framed('The three coins were already counted, dear. Keep your purse closed.') +
                `\n\nUse \`${P()} kills\` for your reading.`,
        });
    }
    const user = economy.getUser(userId);
    if (!user) {
        return sock.sendMessage(chatId, { text: `❌ Not registered! Use \`${P()} register\` first.` });
    }
    if ((user.wallet || 0) < READER_FEE) {
        return sock.sendMessage(chatId, {
            text: framed('Three coins, adventurer. You are short, and the dead are patient.') +
                `\n\n💡 The reader's fee is *${READER_FEE.toLocaleString()} Zeni*. You carry *${(user.wallet || 0).toLocaleString()}*.`,
        });
    }
    const removed = economy.removeMoney(userId, READER_FEE, "The reader's fee (three coins)");
    if (!removed) {
        return sock.sendMessage(chatId, { text: `❌ The coins could not be taken. Try again.` });
    }
    const state = sight.state;
    state.paid = true;
    try {
        await setReadingState(userId, state);
    } catch (e) {
        // 💡 ATOMIC DISCIPLINE (same as the guild-loan rework): never take
        // money without recording it. If the state write fails, the coins
        // go back - the player must never pay for a reading that won't open.
        try { economy.addMoney(userId, READER_FEE, "Reader's fee refund (recording failed)"); } catch (e2) {}
        try { console.error('[soulReader] fee state write failed, refunded:', e.message); } catch (_) {}
        return sock.sendMessage(chatId, {
            text: `❌ The reader could not record the payment. The three coins were returned to your purse - try again.`,
        });
    }

    // If this was the last door, the ceremony line answers the payment.
    if (sight.levelOk && sight.floorOk) {
        if (!state.ceremonyDone) {
            state.ceremonyDone = true;
            try { await setReadingState(userId, state); } catch (e) { /* non-monetary, tolerable */ }
        }
        await sock.sendMessage(chatId, {
            text: `🪙 Paid — three coins, counted and kept.\n\n${framed(CEREMONY_LINE)}\n\n👁️ \`${P()} kills\` — the reading waits.`,
        });
    } else {
        await sock.sendMessage(chatId, {
            text: `🪙 Paid — the reader's fee is settled. The coins stay counted.\n\n${framed('The veil parts for no one\'s schedule, dear. But for three coins it\'ll peek.')}\n\n_The sight still needs: ${!sight.levelOk ? `level ${SIGHT_LEVEL}` : ''}${!sight.levelOk && !sight.floorOk ? ' and ' : ''}${!sight.floorOk ? `abyss floor ${SIGHT_DEEP_FLOOR}` : ''}._`,
        });
    }
}

// ─── MAIN VIEW ──────────────────────────────────────────────────────────────

async function viewKills(sock, chatId, userId, args = []) {
    const sub = String(args[0] || '').toLowerCase();
    if (sub === 'pay' || sub === 'fee') {
        return payFee(sock, chatId, userId);
    }

    const user = economy.getUser(userId);
    if (!user) {
        return sock.sendMessage(chatId, { text: `❌ Not registered! Use \`${P()} register\` first.` });
    }

    const sight = await getSight(userId);

    // ── LOCKED: never render the ledger (same discipline as locked maps) ──
    // 💡 the OWNER bypasses the three doors entirely (2026-09-21 owner
    // report): no level door, no deep-floor door, no fee door. The reading
    // opens straight to the ledger; nothing is recorded as paid.
    if (!sight.open && !_isOwner(userId)) {
        let caption = `🕯️ *THE VEILWARD READING*\n\n${lockedText(sight)}\n\n${framed(todayLine(userId))}`;
        try {
            const buf = await renderer.renderLockedCard({
                level: sight.level,
                levelOk: sight.levelOk,
                bestFloor: sight.bestFloor,
                floorOk: sight.floorOk,
                feePaid: sight.feeOk,
                feeOk: sight.feeOk,
                feeAmount: READER_FEE,
            });
            if (buf && buf.length > 100) {
                return await sock.sendMessage(chatId, { image: buf, caption });
            }
        } catch (e) {
            try { console.error('[soulReader] locked card render failed:', e.message); } catch (_) {}
        }
        return await sock.sendMessage(chatId, { text: caption });
    }

    // ── OPEN: the ledger, with the ceremony on the first reading ──
    const { rows, accent } = ledgerRows(user, sight.bestFloor);
    const firstReading = !sight.state.ceremonyDone;
    if (firstReading) {
        sight.state.ceremonyDone = true;
        try { await setReadingState(userId, sight.state); } catch (e) {}
    }
    const tellerLine = firstReading ? CEREMONY_LINE : todayLine(userId);
    const caption = firstReading
        ? `${framed(tellerLine)}\n\n${ledgerText(rows, accent)}`
        : `👁️ *SOULS BEYOND THE VEIL*\n\n${ledgerText(rows, accent)}\n\n${framed(tellerLine)}`;

    try {
        const buf = await renderer.renderLedgerCard({ rows, accent, tellerLine });
        if (buf && buf.length > 100) {
            return await sock.sendMessage(chatId, { image: buf, caption });
        }
    } catch (e) {
        try { console.error('[soulReader] ledger card render failed:', e.message); } catch (_) {}
    }
    return await sock.sendMessage(chatId, { text: caption });
}

module.exports = { viewKills, payFee, getSight, READER_FEE, SIGHT_LEVEL, SIGHT_DEEP_FLOOR };
