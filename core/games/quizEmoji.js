// ============================================
// EMOJI ANIME CARDS  ("Guess the anime from the emojis")
// ============================================
// 20 popular anime, 4 emojis each. The card image is rendered locally with sharp
// from the Twemoji SVGs bundled in data/emoji/twemoji (CC-BY 4.0, see
// data/emoji/TWEMOJI-LICENSE.txt) - no network, no system emoji font, and no
// text inside the picture, so it cannot render as tofu boxes on a bare server.
// The question wording ("Guess the anime from these emojis!") rides in the caption.
// ============================================
const fs = require("fs");
const path = require("path");

const EMOJI_DIR = path.join(__dirname, "..", "..", "data", "emoji", "twemoji");
let _sharp = null;
function sharpLib() { if (!_sharp) _sharp = require("sharp"); return _sharp; }

// answer = what the reveal shows; alts = also accepted when typed
const EMOJI_SET = [
  { id: "em-naruto", emojis: "🍥🦊🥷🍜", answer: "Naruto", alts: ["Naruto Shippuden", "Naruto Shippuuden"], difficulty: "easy" },
  { id: "em-onepiece", emojis: "👒🍖🌊☠️", answer: "One Piece", alts: ["OP"], difficulty: "easy" },
  { id: "em-aot", emojis: "🧱🗡️👹🕊️", answer: "Attack on Titan", alts: ["Shingeki no Kyojin", "AoT", "SNK"], difficulty: "easy" },
  { id: "em-deathnote", emojis: "📓✍️🍎💀", answer: "Death Note", alts: [], difficulty: "easy" },
  { id: "em-demonslayer", emojis: "🗡️👹🐗🔥", answer: "Demon Slayer", alts: ["Kimetsu no Yaiba"], difficulty: "easy" },
  { id: "em-mha", emojis: "🦸💥🥇🏫", answer: "My Hero Academia", alts: ["Boku no Hero Academia", "MHA", "BNHA"], difficulty: "medium" },
  { id: "em-jjk", emojis: "🤞👹🧿🕶️", answer: "Jujutsu Kaisen", alts: ["JJK"], difficulty: "medium" },
  { id: "em-fma", emojis: "⚗️🦾🔥👦", answer: "Fullmetal Alchemist", alts: ["Fullmetal Alchemist Brotherhood", "FMA", "FMAB"], difficulty: "medium" },
  { id: "em-pokemon", emojis: "⚡🐭🔴⚪", answer: "Pokemon", alts: ["Pokémon"], difficulty: "easy" },
  { id: "em-sailormoon", emojis: "🌙⭐👸🐱", answer: "Sailor Moon", alts: [], difficulty: "medium" },
  { id: "em-hxh", emojis: "🎣🃏🐜👁️", answer: "Hunter x Hunter", alts: ["Hunter Hunter", "HxH", "HunterXHunter"], difficulty: "hard" },
  { id: "em-bleach", emojis: "🍓🗡️👻💀", answer: "Bleach", alts: [], difficulty: "medium" },
  { id: "em-tokyoghoul", emojis: "👁️☕🎭🩸", answer: "Tokyo Ghoul", alts: [], difficulty: "medium" },
  { id: "em-spyfamily", emojis: "🕵️🥜🐶🗡️", answer: "Spy x Family", alts: ["Spy Family", "SpyXFamily"], difficulty: "medium" },
  { id: "em-opm", emojis: "👊🦸🥚💥", answer: "One Punch Man", alts: ["OPM", "One-Punch Man"], difficulty: "medium" },
  { id: "em-csm", emojis: "🪚🐕😈🩸", answer: "Chainsaw Man", alts: ["CSM"], difficulty: "medium" },
  { id: "em-dragonball", emojis: "🐉🔮⭐🟠", answer: "Dragon Ball", alts: ["Dragon Ball Z", "Dragon Ball Super", "DBZ", "DB"], difficulty: "easy" },
  { id: "em-eva", emojis: "🤖💜👾🧬", answer: "Neon Genesis Evangelion", alts: ["Evangelion", "NGE", "EVA"], difficulty: "hard" },
  { id: "em-haikyuu", emojis: "🏐🐦🔥🏫", answer: "Haikyuu", alts: ["Haikyu", "Haikyuu!!"], difficulty: "medium" },
  { id: "em-drstone", emojis: "🗿🧪🔬🌱", answer: "Dr. Stone", alts: ["Dr Stone", "Doctor Stone"], difficulty: "hard" },
];

// split a string into emoji "clusters" (a variation selector stays with its base)
function clusters(str) {
  const out = [];
  for (const ch of Array.from(str)) {
    const cp = ch.codePointAt(0);
    if ((cp === 0xfe0f || cp === 0x200d) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}
// Twemoji file naming: lowercase hex codepoints joined by "-", FE0F dropped unless the sequence has a ZWJ
function twemojiFile(cluster) {
  let cps = Array.from(cluster).map((c) => c.codePointAt(0));
  if (!cps.includes(0x200d)) cps = cps.filter((c) => c !== 0xfe0f);
  return cps.map((c) => c.toString(16)).join("-") + ".svg";
}

const _cache = new Map();
// returns { buf, mime } (PNG 900x900) or throws if a glyph file is missing
async function renderCard(entry) {
  if (_cache.has(entry.id)) return _cache.get(entry.id);
  const sharp = sharpLib();
  const parts = clusters(entry.emojis);
  const W = 900, H = 900, tile = 300, gap = 36;
  // 2x2 grid for 4 glyphs; a single row otherwise
  const cols = parts.length === 4 ? 2 : parts.length;
  const rows = Math.ceil(parts.length / cols);
  const gridW = cols * tile + (cols - 1) * gap, gridH = rows * tile + (rows - 1) * gap;
  const x0 = Math.round((W - gridW) / 2), y0 = Math.round((H - gridH) / 2);
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1442"/><stop offset="1" stop-color="#0f3b66"/></linearGradient>
        <radialGradient id="r" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <circle cx="${W / 2}" cy="${H / 2}" r="${W * 0.62}" fill="url(#r)"/>
      <rect x="${x0 - 28}" y="${y0 - 28}" width="${gridW + 56}" height="${gridH + 56}" rx="44" fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3"/>
      <circle cx="90" cy="90" r="9" fill="#ffd166"/><circle cx="${W - 90}" cy="90" r="9" fill="#ef476f"/>
      <circle cx="90" cy="${H - 90}" r="9" fill="#06d6a0"/><circle cx="${W - 90}" cy="${H - 90}" r="9" fill="#118ab2"/>
    </svg>`);
  const layers = [];
  for (let i = 0; i < parts.length; i++) {
    const file = path.join(EMOJI_DIR, twemojiFile(parts[i]));
    if (!fs.existsSync(file)) throw new Error(`missing emoji glyph ${path.basename(file)} for ${entry.id}`);
    const glyph = await sharp(fs.readFileSync(file), { density: 600 }).resize(tile, tile, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const col = i % cols, row = Math.floor(i / cols);
    layers.push({ input: glyph, left: x0 + col * (tile + gap), top: y0 + row * (tile + gap) });
  }
  const buf = await sharp(bg).composite(layers).png({ compressionLevel: 9 }).toBuffer();
  const out = { buf, mime: "image/png" };
  _cache.set(entry.id, out);
  return out;
}

// -> live-session question object (same shape the quiz engine expects for typed image questions)
async function buildEmojiQuestion(entry) {
  const card = await renderCard(entry);
  return {
    q: "Guess the anime from these emojis!",
    options: [entry.answer],
    correct: 0,
    alts: (entry.alts || []).slice(0, 6),
    typed: true,
    hideOptions: true,
    difficulty: entry.difficulty || "medium",
    topic: "Emoji Anime",
    domain: "emoji",
    type: "image",
    assetKey: `emoji:${entry.id}`,
    asset: { kind: "image", buf: card.buf, mime: card.mime, subject: entry.answer, source: "twemoji-local" },
    loreRef: null,
    timeLimit: 30,
  };
}

module.exports = { EMOJI_SET, renderCard, buildEmojiQuestion, clusters, twemojiFile };
