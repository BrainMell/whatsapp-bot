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

// Dead-soul reading feature: NOT yet implemented in the bot (the soul-sight
// feature is a proposed design). Until the feature ships, its map gate can
// never open - by contract the sheet is never rendered. Flip this when the
// feature exists (store the unlock on the user, then check it here).
function _hasDeadSoulFeature(_userId) {
    return false;
}

const RANK_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
function _rankAtLeast(rank, min) {
    const i = RANK_ORDER.indexOf(String(rank || 'F').toUpperCase());
    const j = RANK_ORDER.indexOf(min);
    return i >= j;
}

// ─── PER-REALM INFO CARDS (fixed text — no randomized lore baked in) ─────────
// Owner ruling (2026-09-19, subtlety pass): captions are lean exploration
// guides. They point, they don't explain. Mechanics and secrets are learned
// by playing; the lore drops reveal them. No equations, no spawn tables.
const INFO = {
    first_world: [
        'four quadrants, worlds without number. the Presence holds the center.',
        '',
        'where to explore: dungeon hunts start at the guild (.j adventure, .j solo,',
        '.j raid). corrupted worlds scatter all four quadrants.',
        '',
        'where to find things: the blacksmith (.j repair), brewing and cooking',
        '(.j brew, .j cook), runes (.j rune), wares (.j shop), mending flesh (.j hospital).',
    ],
    world_beyond: [
        'the space the First World does not occupy. the chart will not name it.',
        '',
        'the First World rides inside. everything else here stays unnamed.',
        'unnamed things are not found. they find you.',
    ],
    afterlife: [
        'it rides its own circuit, sharing nothing with the First World\'s path.',
        '',
        'the shore runs along this circuit, where the dead arrive',
        'and some of them wait.',
    ],
    abyss: [
        'rings upon rings, shrinking as they descend, without end.',
        '',
        'where to explore: .j abyss enter. the gate opens for a while, then shuts.',
        '',
        'what finds you: past the thirtieth floor, some things wear faces.',
        'deeper still, they wear banners. past the ninetieth, one of them walks like you.',
        '',
        'deep finds: void essence and rarer spoils, enough for the deep brews (.j brew).',
    ],
};

// ─── TEXT FALLBACKS (§5 - every render path keeps a text answer) ─────────────

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
 * `.j world [beyond|afterlife|abyss]`
 * @param {object} sock
 * @param {string} chatId
 * @param {string} userId   sender jid
 * @param {string} subArg   '' | 'beyond' | 'afterlife' | 'abyss' (aliases ok)
 * @param {object} [helpers] { getLevel(userId), getRank(userId) } injected by
 *                          the engine to avoid a heavy require cycle
 */
async function showWorld(sock, chatId, userId, subArg, helpers = {}) {
    const t = Date.now();
    const sub = String(subArg || '').toLowerCase().trim();

    // aliases
    const norm = sub === '' || sub === 'first' || sub === 'firstworld' || sub === 'first world'
        ? 'first_world'
        : (sub === 'beyond' || sub === 'worldbeyond' || sub === 'world beyond' ? 'world_beyond'
            : (sub === 'afterlife' ? 'afterlife'
                : (sub === 'abyss' ? 'abyss' : null)));

    if (norm === null) {
        return sock.sendMessage(chatId, {
            text: [
                '*WORLD CHARTS*',
                '',
                `Usage: \`${P()} world\` - the First World`,
                `\`${P()} world beyond\` - the outer boundary (rank S)`,
                `\`${P()} world afterlife\` - the shore of the dead`,
                `\`${P()} world abyss\` - the descent beneath`,
            ].join('\n'),
        });
    }

    // ── GATES (hard contract: locked = requirement text ONLY, no render) ──
    if (norm === 'world_beyond') {
        const rank = typeof helpers.getRank === 'function' ? helpers.getRank(userId) : 'F';
        if (!_rankAtLeast(rank, 'S')) {
            return sock.sendMessage(chatId, { text: _refuseBeyond(rank) });
        }
        const buf = await renderer.renderWorldBeyondSheet(t);
        return _sendSheet(sock, chatId, buf, INFO.world_beyond, _asciiWorldBeyond, t);
    }

    if (norm === 'afterlife') {
        if (!_hasDeadSoulFeature(userId)) {
            return sock.sendMessage(chatId, { text: _refuseAfterlife() });
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
        if (level < ABYSS_MAP_UNLOCK) {
            return sock.sendMessage(chatId, { text: _refuseAbyss(level) });
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
    _rankAtLeast,
    _refuseBeyond,
    _refuseAfterlife,
    _refuseAbyss,
};
