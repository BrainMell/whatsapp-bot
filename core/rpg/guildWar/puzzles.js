// ============================================
// 🧩 PUZZLE GENERATORS — Guild War Overhaul 2026-10-03
// Seeded templates → server-side answers stored in room payload. Cheap to
// generate, answerable via WhatsApp DMs (short text). Wrong answers cost,
// never hard-lock. The solution NEVER leaves the server.
// ============================================

const mapEngine = require('./mapEngine');

const GLYPHS = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᛗ', 'ᛟ'];

// 1. rune sequence lock — enter glyphs in the hinted order
function genSequence(rng, room) {
    const n = 3 + Math.floor(room.ring * 2); // 3-5
    const seq = Array.from({ length: n }, () => rng.pick(GLYPHS));
    const shown = seq.join(' ');
    const hintIdx = rng.int(0, n - 1);
    return {
        kind: 'sequence',
        prompt: `Ancient glyphs flicker as you approach the lock: *${shown}*\n` +
            `An inscription reads: "The ${ordinal(hintIdx + 1)} glyph was carved first - follow its lead, then onward in the order of shadows."\n` +
            `Reply with the ${n} glyphs in the correct order (e.g. \`${seq[0]} ${seq[1]}\`).`,
        answer: seq[hintIdx] + ' ' + seq.filter((_, i) => i !== hintIdx).join(' '),
        altAnswer: seq[hintIdx] + seq.filter((_, i) => i !== hintIdx).join(''),
        normalize: (s) => String(s).replace(/[^ᚠᚢᚦᚨᚱᚲᚷᚹᛗᛟ]/g, ''),
        maxAttempts: 3,
    };
}

// 2. guardian riddle (offline bank; LLM variant optional later)
// ⚔️ collision guard: answers must never match DM command verbs — the old
// first riddle answered "map", which the router intercepts as the map
// command (its solve path was unreachable, forever).
const RIDDLES = [
    { q: 'I have keys but no locks. I have space but no room. You can enter, but you can\u2019t go outside. What am I?', a: ['keyboard'] },
    { q: 'I am always coming but never arrive. What am I?', a: ['tomorrow'] },
    { q: 'The more you take, the more you leave behind. What am I?', a: ['footsteps', 'footprints', 'steps'] },
    { q: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?', a: ['echo'] },
    { q: 'What can fill a room but takes up no space?', a: ['light'] },
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
function genCipher(rng, room, map) {
    const words = ['RUIN', 'CORE', 'ECHO', 'ASH', 'VEIL', 'OMEN'];
    const word = rng.pick(words);
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
function genMemory(rng, room) {
    const n = 3 + Math.floor(room.ring * 2);
    const pat = Array.from({ length: n }, () => rng.pick(['◆', '●', '▲', '■', '✦']));
    return {
        kind: 'memory',
        prompt: `The mosaic lights up in sequence:\n\n*${pat.join(' ')}*\n\n…then goes dark. Reproduce the pattern exactly.`,
        answer: pat.join(' '),
        altAnswer: pat.join(''),
        normalize: (s) => String(s).replace(/[^◆●▲■✦]/g, ''),
        maxAttempts: 3,
    };
}

// 5. levers — pick N of M to hit a target value
function genLevers(rng, room) {
    const m = 5, n = 3;
    const values = Array.from({ length: m }, () => rng.int(2, 9));
    const chosen = rng.shuffle(values.map((_, i) => i)).slice(0, n);
    const target = chosen.reduce((s, i) => s + values[i], 0);
    return {
        kind: 'levers',
        prompt: `Five levers are marked: ${values.map((v, i) => `${'ABCDE'[i]}=${v}`).join(' ')}.\nThe mechanism wants a total of *${target}*. Pull ${n} levers (e.g. \`A B C\`).`,
        answer: chosen.map((i) => 'ABCDE'[i]).sort().join(''),
        normalize: (s) => String(s).toUpperCase().replace(/[^A-E]/g, '').split('').sort().join(''),
        maxAttempts: 3,
    };
}

// 6. map riddle — describes another room; solving reveals it (encounter layer handles)
function genMapRiddle(rng, room, map) {
    const cands = [...map.rooms.values()].filter((r) => r.type === 'discovery' || r.type === 'reward' || r.type === 'secret');
    if (!cands.length) return genRiddle(rng, room);
    const target = rng.pick(cands);
    const [tx, ty] = target.key.split(',').map(Number);
    const [ox, oy] = room.key.split(',').map(Number);
    const dx = tx - ox, dy = ty - oy;
    const dirDesc = `${Math.abs(dx)} room${Math.abs(dx) === 1 ? '' : 's'} ${dx >= 0 ? 'east' : 'west'}, ${Math.abs(dy)} room${Math.abs(dy) === 1 ? '' : 's'} ${dy >= 0 ? 'south' : 'north'}`;
    return {
        kind: 'mapriddle',
        prompt: `A carved verse: "Seek the hidden chamber - ${dirDesc} from this very hall. Speak 'open' and name what you seek: *vault*."`,
        answer: 'vault',
        normalize: (s) => String(s).toLowerCase().replace(/[^a-z]/g, ''),
        maxAttempts: 3,
        meta: { revealsRoom: target.key },
    };
}

function ordinal(n) { return n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : n === 4 ? 'fourth' : 'fifth'; }

// ── shared normalizers (must match the generators) ──
const NORMALIZERS = {
    sequence: (s) => String(s).replace(/[^ᚠᚢᚦᚨᚱᚲᚷᚹᛗᛟ]/g, ''),
    riddle: (s) => String(s).toLowerCase().replace(/[^a-z]/g, ''),
    cipher: (s) => String(s).toUpperCase().replace(/[^A-Z]/g, ''),
    memory: (s) => String(s).replace(/[^◆●▲■✦]/g, ''),
    levers: (s) => String(s).toUpperCase().replace(/[^A-E]/g, '').split('').sort().join(''),
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

module.exports = { generate, checkByKind, normalizeByKind, genSequence, genRiddle, genCipher, genMemory, genLevers, genMapRiddle };
