// ============================================
// 🧩 PUZZLE GENERATORS — Guild War Overhaul 2026-10-03
// Seeded templates → server-side answers stored in room payload. Cheap to
// generate, answerable via WhatsApp DMs (short text). Wrong answers cost,
// never hard-lock. The solution NEVER leaves the server.
// ⚔️ POOL OVERHAUL (owner 2026-10-06: "expand all the pools DRASTICALLY… the
// same each time" complaint): the old banks were tiny (10 runes / 5 shapes /
// 5 riddles / 6 cipher words) so every chamber felt identical. Now: 52 runes,
// 30 shapes, 40 riddles, 60 cipher words, wider levers — and symbol puzzles
// carry a `symbols` array so the router can send the copy-paste line the
// owner asked for (standalone, right after the prompt).
// ============================================

const mapEngine = require('./mapEngine');

// ── 52-rune pool (Elder Futhark + Anglo-Saxon/Viking additions, all in
// U+16A0–U+16E1, visually distinct, text-presentation everywhere) ──
const GLYPHS = [
    'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚩ', 'ᚱ', 'ᚲ', 'ᚳ', 'ᚴ', 'ᚷ',
    'ᚸ', 'ᚹ', 'ᚺ', 'ᚻ', 'ᚼ', 'ᚽ', 'ᚾ', 'ᛀ', 'ᛁ', 'ᛃ',
    'ᛄ', 'ᛅ', 'ᛆ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛋ', 'ᛏ', 'ᛐ',
    'ᛑ', 'ᛒ', 'ᛓ', 'ᛖ', 'ᛗ', 'ᛘ', 'ᛚ', 'ᛜ', 'ᛝ', 'ᛞ',
    'ᛟ', 'ᛠ', 'ᛡ', 'ᛣ', 'ᛤ', 'ᛥ', 'ᛦ', 'ᛧ', 'ᛨ', 'ᛩ',
    'ᛪ', 'ᛯ',
];
// regex classes built FROM the pools — never hand-synced again
const GLYPH_CLASS = GLYPHS.join('');
const GLYPH_STRIP_RE = new RegExp(`[^${GLYPH_CLASS}]`, 'g');

// ── 30-shape pool for the memory mosaic (geometric/star/bloom, all
// text-presentation — the old five ◆●▲■✦ made every mosaic feel identical) ──
const SHAPES = [
    '◆', '◇', '●', '○', '▲', '△', '▼', '▽', '■', '□',
    '✦', '✧', '✱', '✲', '✳', '✴', '✶', '✷', '✸', '✹',
    '✺', '✻', '✼', '✽', '✾', '✿', '❀', '❁', '❂', '❊',
];
const SHAPE_CLASS = SHAPES.join('');
const SHAPE_STRIP_RE = new RegExp(`[^${SHAPE_CLASS}]`, 'g');

// 1. rune sequence lock — enter glyphs in the hinted order
// 🔄 2026-10-06: 52-glyph pool (was 10) + ring-scaled length 4-6 + the raw
// sequence rides `symbols` so the router can send the copy-paste line.
function genSequence(rng, room) {
    const n = Math.min(6, 4 + Math.floor((room.ring || 0) * 2));
    const seq = Array.from({ length: n }, () => rng.pick(GLYPHS));
    const shown = seq.join(' ');
    const hintIdx = rng.int(0, n - 1);
    return {
        kind: 'sequence',
        prompt: `Ancient glyphs flicker as you approach the lock: *${shown}*\n` +
            `An inscription reads: "The ${ordinal(hintIdx + 1)} glyph was carved first - follow its lead, then onward in the order of shadows."\n` +
            `Reply with the ${n} glyphs in the correct order (e.g. \`${seq[hintIdx]} ${seq.filter((_, i) => i !== hintIdx)[0]}\`).`,
        answer: seq[hintIdx] + ' ' + seq.filter((_, i) => i !== hintIdx).join(' '),
        altAnswer: seq[hintIdx] + seq.filter((_, i) => i !== hintIdx).join(''),
        normalize: (s) => String(s).replace(GLYPH_STRIP_RE, ''),
        maxAttempts: 3,
        symbols: seq,
    };
}

// 2. guardian riddle (offline bank; LLM variant optional later)
// ⚔️ collision guard: answers must never match DM command verbs — the old
// first riddle bank had exactly that trap ('map'), and a riddle whose answer
// normalizes to move/look/flee/accept/talk/dig/take/fight/return/etc. would
// be forever unreachable. Every answer below is verb-checked.
const RIDDLES = [
    { q: 'I have keys but no locks. I have space but no room. You can enter, but you can\u2019t go outside. What am I?', a: ['keyboard'] },
    { q: 'I am always coming but never arrive. What am I?', a: ['tomorrow'] },
    { q: 'The more you take, the more you leave behind. What am I?', a: ['footsteps', 'footprints', 'steps'] },
    { q: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?', a: ['echo'] },
    { q: 'What can fill a room but takes up no space?', a: ['light'] },
    { q: 'What gets wetter the more it dries?', a: ['towel'] },
    { q: 'What has hands but cannot clap?', a: ['clock'] },
    { q: 'What has a neck but no head, two arms but no hands?', a: ['bottle'] },
    { q: 'What has an eye but cannot see?', a: ['needle'] },
    { q: 'What has four legs but never walks?', a: ['table', 'chair'] },
    { q: 'What has teeth but cannot bite?', a: ['comb'] },
    { q: 'What has a tongue but cannot talk, and a sole but no soul?', a: ['shoe'] },
    { q: 'What runs but never walks, murmurs but never talks, has a bed but never sleeps?', a: ['river'] },
    { q: 'What can travel around the world while staying in one corner?', a: ['stamp'] },
    { q: 'What goes up but never comes down?', a: ['age'] },
    { q: 'What breaks when you say its name?', a: ['silence'] },
    { q: 'What is full of holes but still holds water?', a: ['sponge'] },
    { q: 'What belongs to you, but other people use it more than you?', a: ['name'] },
    { q: 'The more of me there is, the less you see. What am I?', a: ['darkness', 'dark'] },
    { q: 'I follow you all day in the sun, yet vanish when night comes. What am I?', a: ['shadow'] },
    { q: 'What has a head and a tail but no body?', a: ['coin'] },
    { q: 'I am tall when I am young, and short when I am old. What am I?', a: ['candle'] },
    { q: 'What room has no doors and no windows?', a: ['mushroom'] },
    { q: 'What five-letter word becomes shorter when you add two letters to it?', a: ['short'] },
    { q: 'What gets bigger the more you take away from it?', a: ['hole', 'pit'] },
    { q: 'What can you catch but never throw?', a: ['cold'] },
    { q: 'What goes through towns and hills but never moves?', a: ['road'] },
    { q: 'What is always in front of you but can\u2019t be seen?', a: ['future'] },
    { q: 'What can you keep after giving it to someone?', a: ['word', 'promise'] },
    { q: 'Where does today come before yesterday?', a: ['dictionary'] },
    { q: 'What invention lets you look right through a wall?', a: ['window'] },
    { q: 'What has a bark but no bite?', a: ['tree'] },
    { q: 'What starts with T, ends with T, and has tea inside it?', a: ['teapot'] },
    { q: 'What begins with E, ends with E, and usually contains one letter?', a: ['envelope'] },
    { q: 'What is black when you buy it, red when you use it, and grey when you throw it away?', a: ['charcoal'] },
    { q: 'What is white when it is dirty and black when it is clean?', a: ['chalkboard', 'blackboard'] },
    { q: 'What lives in winter, dies in summer, and grows with its roots upward?', a: ['icicle'] },
    { q: 'What is lighter than a feather, yet the strongest person cannot hold it for long?', a: ['breath'] },
    { q: 'Feed me and I live. Give me drink and I die. What am I?', a: ['fire'] },
    { q: 'Thirty white horses on a red hill: first they champ, then they stamp, then they stand still. What are they?', a: ['teeth'] },
    { q: 'A box without hinges, key, or lid, yet golden treasure inside is hid. What is it?', a: ['egg'] },
    { q: 'What building has the most stories?', a: ['library'] },
    { q: 'I shave several times a day, yet my beard stays the same length. Who am I?', a: ['barber'] },
    { q: 'What has roots that nobody sees, is taller than trees, up, up it goes — and yet never grows?', a: ['mountain'] },
    { q: 'Voiceless it cries, wingless it flutters, toothless it bites, mouthless it mutters. What is it?', a: ['wind'] },
];
function genRiddle(rng, room) {
    const r = rng.pick(RIDDLES);
    return {
        kind: 'riddle',
        prompt: `A guardian of the old world stirs: *"${r.q}"*`,
        answer: r.a[0],
        altAnswers: r.a,
        normalize: (s) => String(s).toLowerCase().replace(/[^a-z]/g, ''),
        maxAttempts: 3,
    };
}

// 3. cipher — key found in Discovery rooms (encounters place it there)
// 🔄 2026-10-06: 60-word bank (was 6 — "CORE" every third vault).
const CIPHER_WORDS = [
    'RUIN', 'CORE', 'ECHO', 'ASH', 'VEIL', 'OMEN', 'RELIC', 'GUARD', 'SILENT', 'DUST',
    'BONE', 'EMBER', 'FROST', 'STORM', 'THORN', 'CROWN', 'BLADE', 'ARROW', 'SHIELD', 'TEMPLE',
    'TOMB', 'GATE', 'VAULT', 'CRYPT', 'SHRINE', 'IDOL', 'TOTEM', 'SACRED', 'ANCIENT', 'SECRET',
    'SHADOW', 'LANTERN', 'CANDLE', 'MIRROR', 'RIVER', 'STONE', 'IRON', 'GOLD', 'SILVER', 'COPPER',
    'AMBER', 'IVORY', 'SPIRIT', 'PHANTOM', 'WRAITH', 'HOLLOW', 'BARROW', 'CAIRN', 'RUNE', 'GLYPH',
    'SIGIL', 'PORTAL', 'CHASM', 'BEACON', 'GARDEN', 'FALCON', 'WOLVES', 'DAGGER', 'CHALICE', 'SUNDIAL',
];
function genCipher(rng, room, map) {
    const word = rng.pick(CIPHER_WORDS);
    const shift = rng.int(1, 5);
    const enc = word.split('').map((ch) => String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65)).join('');
    return {
        kind: 'cipher',
        prompt: `A weathered plaque bears a shifted alphabet: *${enc}* - "Caesar walked this hall ${shift} step${shift > 1 ? 's' : ''} back."\nDecode the word.`,
        answer: word,
        normalize: (s) => String(s).toUpperCase().replace(/[^A-Z]/g, ''),
        maxAttempts: 3,
        meta: { cipherShift: shift },
    };
}

// 4. memory pattern — flash glyphs, reproduce
// 🔄 2026-10-06: 30-shape pool (was 5) + ring-scaled length 4-6 + `symbols`.
function genMemory(rng, room) {
    const n = Math.min(6, 4 + Math.floor((room.ring || 0) * 2));
    const pat = Array.from({ length: n }, () => rng.pick(SHAPES));
    return {
        kind: 'memory',
        prompt: `The mosaic lights up in sequence:\n\n*${pat.join(' ')}*\n\n…then goes dark. Reproduce the pattern exactly.`,
        answer: pat.join(' '),
        altAnswer: pat.join(''),
        normalize: (s) => String(s).replace(SHAPE_STRIP_RE, ''),
        maxAttempts: 3,
        symbols: pat,
    };
}

// 5. levers — pick N of M to hit a target value
// 🔄 2026-10-06: 5-7 levers (A-G), pull 3-4, values 2-19 (was fixed 5 levers,
// values 2-9 — one glance and every hall solved the same way).
function genLevers(rng, room) {
    const m = 5 + ((room.ring || 0) > 0.35 ? rng.int(0, 2) : 0);
    const n = 3 + (m >= 6 ? rng.int(0, 1) : 0);
    const labels = 'ABCDEFG'.slice(0, m);
    const values = Array.from({ length: m }, () => rng.int(2, 19));
    const chosen = rng.shuffle(values.map((_, i) => i)).slice(0, n);
    const target = chosen.reduce((s, i) => s + values[i], 0);
    return {
        kind: 'levers',
        prompt: `${m} levers are marked: ${values.map((v, i) => `${labels[i]}=${v}`).join(' ')}.\nThe mechanism wants a total of *${target}*. Pull ${n} levers (e.g. \`${labels.slice(0, n).split('').join(' ')}\`).`,
        answer: chosen.map((i) => labels[i]).sort().join(''),
        normalize: (s) => String(s).toUpperCase().replace(/[^A-G]/g, '').split('').sort().join(''),
        maxAttempts: 3,
    };
}

// 6. map riddle — describes another room; solving reveals it (encounter layer handles)
// 🔄 2026-10-06: the sought keyword now matches the target's nature
// (cache/vault/relic) instead of always "vault".
const SEEK_WORD = { discovery: 'cache', reward: 'vault', secret: 'relic' };
function genMapRiddle(rng, room, map) {
    const cands = [...map.rooms.values()].filter((r) => r.type === 'discovery' || r.type === 'reward' || r.type === 'secret');
    if (!cands.length) return genRiddle(rng, room);
    const target = rng.pick(cands);
    const seek = SEEK_WORD[target.type] || 'vault';
    const [tx, ty] = target.key.split(',').map(Number);
    const [ox, oy] = room.key.split(',').map(Number);
    const dx = tx - ox, dy = ty - oy;
    const dirDesc = `${Math.abs(dx)} room${Math.abs(dx) === 1 ? '' : 's'} ${dx >= 0 ? 'east' : 'west'}, ${Math.abs(dy)} room${Math.abs(dy) === 1 ? '' : 's'} ${dy >= 0 ? 'south' : 'north'}`;
    return {
        kind: 'mapriddle',
        prompt: `A carved verse: "Seek the hidden chamber - ${dirDesc} from this very hall. Speak 'open' and name what you seek: *${seek}*."`,
        answer: seek,
        normalize: (s) => String(s).toLowerCase().replace(/[^a-z]/g, ''),
        maxAttempts: 3,
        meta: { revealsRoom: target.key },
    };
}

function ordinal(n) {
    const words = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
    return words[n - 1] || `${n}th`;
}

// ── shared normalizers (must match the generators) ──
const NORMALIZERS = {
    sequence: (s) => String(s).replace(GLYPH_STRIP_RE, ''),
    riddle: (s) => String(s).toLowerCase().replace(/[^a-z]/g, ''),
    cipher: (s) => String(s).toUpperCase().replace(/[^A-Z]/g, ''),
    memory: (s) => String(s).replace(SHAPE_STRIP_RE, ''),
    levers: (s) => String(s).toUpperCase().replace(/[^A-G]/g, '').split('').sort().join(''),
    mapriddle: (s) => String(s).toLowerCase().replace(/[^a-z]/g, ''),
};
function normalizeByKind(kind, input) {
    return (NORMALIZERS[kind] || ((s) => String(s).trim().toLowerCase()))(input);
}

// pick a puzzle kind by room ring; returns generator output
function generate(rng, room, map) {
    const pool = [genSequence, genRiddle, genMemory, genLevers];
    if (room.ring > 0.4) pool.push(genCipher, genMapRiddle);
    return rng.pick(pool)(rng, room, map);
}

// graded check: returns {solved, attemptsLeft} — kind-based normalization so
// the server-side stored answer (a string in Mongo) is comparable to input.
function checkByKind(kind, puzzle, input, attempt) {
    const norm = normalizeByKind(kind, input);
    const answers = [puzzle.answer, ...(puzzle.altAnswers || [])].map((a) => normalizeByKind(kind, a)).filter(Boolean);
    const correct = answers.includes(norm);
    return { solved: correct, attemptsLeft: Math.max(0, (puzzle.maxAttempts || 3) - attempt) };
}

module.exports = { generate, checkByKind, normalizeByKind, genSequence, genRiddle, genCipher, genMemory, genLevers, genMapRiddle, GLYPHS, SHAPES, RIDDLES, CIPHER_WORDS };
