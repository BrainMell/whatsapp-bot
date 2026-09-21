// ═══════════════════════════════════════════════════════════════════════════
//  WORLD MAP COMMAND LOGIC — `.j world` + three gated sub-maps
// ═══════════════════════════════════════════════════════════════════════════
//
//  IMPLEMENTATION of implementation/world_map.md (pass 3):
//
//  | command              | sheet         | unlock                              |
//  | `.j world`           | First World   | none (available from the beginning) |
//  | `.j world beyond`    | World Beyond  | adventurer rank S                   |
//  | `.j world afterlife` | Afterlife     | the dead-soul reading feature       |
//  | `.j world abyss`     | Abyss         | ABYSS_MAP_UNLOCK (CONFIRMED lvl 20) |
//
//  LOCKED-BEHAVIOUR HARD CONTRACT (§1): a locked map request must NOT render
//  the map at all - the bot replies with the requirement and nothing else.
//  No partial previews, no fogged teaser renders.
//
//  Every render path keeps a TEXT answer (house rule: cards never dead-end).
//  Orbital state comes from cosmology.js (in-memory, pure functions of wall
//  time) - the four clocks stay four separate systems.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const cosmology = require('./cosmology');
const renderer = require('./worldMapRenderer');
const botConfig = require('../../botConfig');

const P = () => botConfig.getPrefix();

// ─── GATE CONSTANTS ──────────────────────────────────────────────────────────
// CONFIRMED by owner (2026-09-19): `.j world abyss` unlocks at level 20.
// Single configurable constant so the owner can still retune it without
// touching logic (world_map.md §1 / additional_ideas/ideas.md #15).
const ABYSS_MAP_UNLOCK = 20;

// Dead-soul reading feature: the Fortune Teller went live (soulReader.js -
// `.j kills`, the three doors, the reader's fee stored in System KV). The
// documented contract (this file's original comment + world_map.md §1) was
// "flip this when the feature exists, then check it here": the reading is
// now the player-side key to the afterlife chart. A player who opened their
// sight (all doors) - or who has settled the reader's fee - holds the key.
// Fail-closed to false on any error (a locked map is never rendered).
async function _hasDeadSoulFeature(userId) {
    try {
        const soulReader = require('./soulReader');
        const sight = await soulReader.getSight(userId);
        return !!(sight.open || (sight.state && sight.state.paid));
    } catch (e) {
        return false;
    }
}

// 💡 TICKET #b4f71c (2026-09-21): STAFF AFTERLIFE ACCESS. Owners, global
// moderators and RPG moderators can consult the afterlife chart without the
// (still unimplemented) dead-soul feature. Normal players are unaffected -
// the locked = no-render hard contract still holds for them. The engine is
// lazily required INSIDE the call (mirrors abyssSystem.js:241) to avoid the
// circular-import trap; on any failure this fail-closes to `false`.
function _isStaff(userId) {
    try {
        const engine = require('../engine');
        return !!(engine.isBotOwner?.(userId) || engine.isGlobalMod?.(userId) || engine.isRpgMod?.(userId));
    } catch (e) {
        try { console.error('[worldMap] staff check failed, fail-closed:', e.message); } catch (_) {}
        return false;
    }
}

const RANK_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
function _rankAtLeast(rank, min) {
    const i = RANK_ORDER.indexOf(String(rank || 'F').toUpperCase());
    const j = RANK_ORDER.indexOf(min);
    return i >= j;
}

// ─── PER-REALM INFO CARDS (fixed text — no randomized lore baked in) ─────────
// Owner ruling (2026-09-20): captions are SHORT and subtle. One or two lines
// that say what the chart is - nothing more. Mechanics and secrets are
// discovered by playing; the lore drops reveal the rest. No guides, no
// command lists, no lore dumps.
const INFO = {
    first_world: [
        'four quadrants, worlds without number. the Presence holds the center.',
    ],
    world_beyond: [
        'the space the First World does not occupy. the chart will not name it.',
    ],
    afterlife: [
        'it rides its own circuit, sharing nothing with the First World\'s path.',
    ],
    abyss: [
        'rings upon rings, shrinking as they descend, without end.',
    ],
    all: [
        'the whole of it, gathered on one page. what each map keeps quiet,',
        'the world itself will tell you - in its own time.',
    ],
};

// ─── TEXT FALLBACKS (§5 - every render path keeps a text answer) ─────────────

function _asciiAll(t) {
    const lines = [
        '*THE COSMOLOGY - ALL CHARTS*',
        '```',
        '  WORLD BEYOND ( the boundary is not named )',
        '     .---------------------------.',
        '    /      _______________       \\',
        '   |  II  /    FIRST WORLD \\   I  |',
        '   |    |   + ORDER +      |     |',
        '   |  III \\_______________/  IV  |',
        '    \\___________  ______________/',
        '                \\/  ( bottom link )',
        '  AFTERLIFE ~ ~ o ~ ~ ~ ~ o ~ ~ its own circuit',
        '  ABYSS   ( ( ( ring ) ) )  beneath, not around',
        '```',
    ];
    for (const l of cosmology.statusLines(t)) lines.push(l);
    return lines.join('\n');
}

function _asciiFirstWorld(t) {
    const lines = [
        '*THE FIRST WORLD*',
        '```',
        '        WORLD BEYOND (beyond this line)',
        '     .-----------------------------.',
        '    /        _________________     \\',
        '   |   IV   /      I          \\     |',
        '   |      /   + ORDER +       \\     |',
        '   |  III \\    (center)      /  II  |',
        '    \\     \\_________________/     /',
        '     \\___________  _____________/',
        '                 \\/',
        '          bottom link (to abyss)',
        '```',
    ];
    for (const l of cosmology.statusLines(t)) lines.push(l);
    lines.push('_known, corrupted and dungeon worlds scatter across all four quadrants._');
    lines.push('_no two expeditions report the same dungeon-world._');
    return lines.join('\n');
}

function _asciiWorldBeyond(t) {
    const lines = [
        '*THE WORLD BEYOND*',
        '```',
        '  +-------------------------------+',
        '  |                               |',
        '  |    ( the First World rides    |',
        '  |      inside - see .j world )  |',
        '  |                               |',
        '  |   THE REST IS NOT NAMED       |',
        '  |                               |',
        '  +-------------------------------+',
        '```',
        '_god-rank realm, above ordinary dimensionality. the chart will not name it._',
    ];
    for (const l of cosmology.statusLines(t)) lines.push(l);
    return lines.join('\n');
}

function _asciiAfterlife(t) {
    const lines = [
        '*THE AFTERLIFE*',
        '```',
        '   ( its own circuit - not the First World\'s path )',
        '        o ~ ~ ~ ~ o ~ ~ ~ ~ o ~ ~ ~ ~ o',
        '        |    the shore lies along   |',
        '        o ~ ~ ~ ~ o ~ ~ ~ ~ o ~ ~ ~ ~ o',
        '                 this circuit',
        '```',
    ];
    for (const l of cosmology.statusLines(t)) lines.push(l);
    return lines.join('\n');
}

function _asciiAbyss(t) {
    const win = cosmology.abyssWindow(t);
    const lines = [
        '*THE ABYSS*',
        '```',
        '   I    ( ( ( ring ) ) )',
        '    II    ( ( ring ) )',
        '      III   ( ring )',
        '        ...    continues',
        '          infinity',
        '```',
        `_entry gate: ${win.label}_`,
        '_it does not orbit. it lies beneath the circles, and it does not end._',
    ];
    return lines.join('\n');
}

// ─── GATE REFUSALS (requirement text ONLY — never render) ────────────────────

function _refuseBeyond(rank) {
    return [
        '*THE WORLD BEYOND IS NOT CHARTED FOR YOU YET.*',
        '',
        `What you need: adventurer rank *S* or above.`,
        `Your rank: *${String(rank || 'F').toUpperCase()}*`,
        '',
        `_a locked map is never rendered. earn the rank, ask again._`,
    ].join('\n');
}

function _refuseAfterlife() {
    return [
        '*THE SHORE IS NOT DRAWN FOR YOU YET.*',
        '',
        'What you need: the *reading of dead souls*.',
        'The guild does not yet teach it.',
        '',
        '_a locked map is never rendered._',
    ].join('\n');
}


function _refuseAbyss(level) {
    return [
        '*THE ABYSS IS NOT CHARTED FOR YOU YET.*',
        '',
        `What you need: level *${ABYSS_MAP_UNLOCK}* or above.`,
        `Your level: *${Math.max(0, Math.floor(level || 0))}*`,
        '',
        `_a locked map is never rendered._`,
    ].join('\n');
}

// ─── SHEET DELIVERY (image-first, text fallback) ─────────────────────────────

async function _sendSheet(sock, chatId, buffer, infoLines, asciiFn, t) {
    const info = infoLines.join('\n');
    const status = cosmology.statusLines(t).map(l => `_${l}_`).join('\n');
    if (buffer && buffer.length > 100) {
        const caption = `${info}\n\n${status}`;
        try {
            await sock.sendMessage(chatId, { image: buffer, caption });
            return;
        } catch (e) {
            try { console.error('[worldMap] image send failed, falling back to text:', e.message); } catch (_) {}
        }
    }
    // text fallback: sketch + fixed info + live status
    await sock.sendMessage(chatId, { text: `${asciiFn(t)}\n\n${info}` });
}

// ─── COMMAND ENTRY ───────────────────────────────────────────────────────────

/**
 * `.j world [all|beyond|afterlife|abyss]`
 * @param {object} sock
 * @param {string} chatId
 * @param {string} userId   sender jid
 * @param {string} subArg   '' | 'all' | 'beyond' | 'afterlife' | 'abyss' (aliases ok)
 * @param {object} [helpers] { getLevel(userId), getRank(userId), isMod(userId) }
 *                          injected by the engine to avoid a heavy require cycle
 */
async function showWorld(sock, chatId, userId, subArg, helpers = {}) {
    const t = Date.now();
    const sub = String(subArg || '').toLowerCase().trim();

    // aliases
    const norm = sub === '' || sub === 'first' || sub === 'firstworld' || sub === 'first world'
        ? 'first_world'
        : (sub === 'beyond' || sub === 'worldbeyond' || sub === 'world beyond' ? 'world_beyond'
            : (sub === 'afterlife' ? 'afterlife'
                : (sub === 'abyss' ? 'abyss'
                    : (sub === 'all' || sub === 'atlas' || sub === 'cosmology' || sub === 'everything' ? 'all' : null))));

    if (norm === null) {
        return sock.sendMessage(chatId, {
            text: [
                '*WORLD CHARTS*',
                '',
                `Usage: \`${P()} world\` - the First World`,
                `\`${P()} world beyond\` - the outer boundary (rank S)`,
                `\`${P()} world afterlife\` - the shore of the dead`,
                `\`${P()} world abyss\` - the descent beneath`,
                `\`${P()} world all\` - every chart gathered on one page`,
            ].join('\n'),
        });
    }

    // ── ALL: the gathered chart. Owner ruling (2026-09-20): mods see it
    // regardless of progress; regular players earn it by unlocking every
    // map they CAN unlock (First World is open from the start, Beyond needs
    // rank S, Abyss needs level 20). The Afterlife joins the requirement
    // automatically once the dead-soul reading exists - until then it is
    // not holdable against the player, or the command would be dead content.
    if (norm === 'all') {
        // 💡 TICKET #b4f5d2 (2026-09-21): staff bypass extended to ALL staff
        // tiers (owner / global mod / RPG mod) via the same _isStaff resolver
        // the afterlife sheet uses, in addition to the injected isMod helper.
        const isMod = (typeof helpers.isMod === 'function' ? !!helpers.isMod(userId) : false) || _isStaff(userId);
        if (!isMod) {
            const rank = typeof helpers.getRank === 'function' ? helpers.getRank(userId) : 'F';
            let level = 1;
            try {
                level = typeof helpers.getLevel === 'function'
                    ? helpers.getLevel(userId)
                    : (require('./progression').getLevel(userId) || 1);
            } catch (e) {}
            const missing = [];
            if (!_rankAtLeast(rank, 'S')) missing.push(`rank *S* (yours: *${String(rank || 'F').toUpperCase()}*)`);
            if (level < ABYSS_MAP_UNLOCK) missing.push(`level *${ABYSS_MAP_UNLOCK}* (yours: *${Math.max(0, Math.floor(level))}*)`);
            // 💡 OWNER RULING (pinned by qa_ticket_pass): the afterlife is NOT
            // held against atlas seekers. The gathered chart lists only the
            // gates a player can see and earn on their own sheets; the
            // reading's own road (`.j kills`) introduces itself in play.
            if (missing.length > 0) {
                return sock.sendMessage(chatId, {
                    text: [
                        '*THE GATHERED CHART IS NOT YOURS YET.*',
                        '',
                        'What you still need:',
                        ...missing.map((m) => `- ${m}`),
                        '',
                        '_each map is shown on its own page as you earn it._',
                    ].join('\n'),
                });
            }
        }
        const buf = await renderer.renderCosmologyAtlasSheet(t);
        return _sendSheet(sock, chatId, buf, INFO.all, _asciiAll, t);
    }

    // ── GATES (hard contract: locked = requirement ONLY, the map never renders) ──
    // 2026-09-21 owner ruling: the World Beyond is locked for EVERYONE except
    // the owner until the required conditions are met (rank S). The owner (and
    // staff) walk in regardless; everyone below S rank now receives the locked
    // IMAGE CARD (the boundary as an empty gold circle, the rank road dying
    // mid air) with the text requirement as caption + render-failure fallback.
    if (norm === 'world_beyond') {
        const rank = typeof helpers.getRank === 'function' ? helpers.getRank(userId) : 'F';
        if (!_rankAtLeast(rank, 'S') && !_isStaff(userId)) {
            const txt = _refuseBeyond(rank);
            try {
                const card = await renderer.renderWorldBeyondLockedCard();
                if (card && card.length > 100) {
                    return sock.sendMessage(chatId, { image: card, caption: txt });
                }
            } catch (e) {
                try { console.error('[worldMap] world beyond locked card failed:', e.message); } catch (_) {}
            }
            return sock.sendMessage(chatId, { text: txt });
        }
        const buf = await renderer.renderWorldBeyondSheet(t);
        return _sendSheet(sock, chatId, buf, INFO.world_beyond, _asciiWorldBeyond, t);
    }

    if (norm === 'afterlife') {
        // 💡 TICKET #b4f71c + 2026-09-21 owner report: STAFF (owner / global
        // mod / RPG mod) and the OWNER may consult the afterlife chart without
        // the dead-soul feature or any other requirement. Players who HAVE
        // opened the reading (soulReader) now hold the designed key. Everyone
        // else still gets the locked refusal - the map itself is never
        // rendered.
        // 💡 2026-09-21 owner: the locked refusal now also renders an IMAGE
        // CARD that carries the refusal visually (the shore on its own
        // circuit, the road missing its crossing, a LOCKED seal). The chart
        // stays unrendered - the card is a refusal, not a preview. The text
        // requirement stays as the caption and as the render-failure fallback
        // (house rule: cards never dead-end).
        const reading = await _hasDeadSoulFeature(userId);
        if (!reading && !_isStaff(userId)) {
            const txt = _refuseAfterlife();
            try {
                const card = await renderer.renderAfterlifeLockedCard();
                if (card && card.length > 100) {
                    return sock.sendMessage(chatId, { image: card, caption: txt });
                }
            } catch (e) {
                try { console.error('[worldMap] afterlife locked card failed:', e.message); } catch (_) {}
            }
            return sock.sendMessage(chatId, { text: txt });
        }
        const buf = await renderer.renderAfterlifeSheet(t);
        return _sendSheet(sock, chatId, buf, INFO.afterlife, _asciiAfterlife, t);
    }

    if (norm === 'abyss') {
        let level = 1;
        try {
            level = typeof helpers.getLevel === 'function'
                ? helpers.getLevel(userId)
                : (require('./progression').getLevel(userId) || 1);
        } catch (e) {}
        // 2026-09-21 owner ruling: a locked abyss request renders the IMAGE
        // CARD that explains the worlds are not aligned (with the tier named
        // in its plates), never a bare text answer. The text stays as the
        // caption and as the render-failure fallback (cards never dead-end).
        if (level < ABYSS_MAP_UNLOCK) {
            const txt = _refuseAbyss(level);
            try {
                const card = await renderer.renderAbyssMisalignedCard({
                    mode: 'level',
                    level,
                    unlock: ABYSS_MAP_UNLOCK,
                });
                if (card && card.length > 100) {
                    return sock.sendMessage(chatId, { image: card, caption: txt });
                }
            } catch (e) {
                try { console.error('[worldMap] abyss locked card failed:', e.message); } catch (_) {}
            }
            return sock.sendMessage(chatId, { text: txt });
        }
        const buf = await renderer.renderAbyssSheet(t);
        return _sendSheet(sock, chatId, buf, INFO.abyss, _asciiAbyss, t);
    }

    // ── FIRST WORLD: no gate (documented; owner may add one later) ──
    const buf = await renderer.renderFirstWorldSheet(t);
    return _sendSheet(sock, chatId, buf, INFO.first_world, _asciiFirstWorld, t);
}

module.exports = {
    showWorld,
    ABYSS_MAP_UNLOCK,          // CONFIRMED level 20 (owner, 2026-09-19; configurable)
    INFO,                      // 💡 exported for QA caption checks
    _rankAtLeast,
    _refuseBeyond,
    _refuseAfterlife,
    _refuseAbyss,
};
