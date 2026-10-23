/**
 * QUOTE STICKER RENDERER - `.j s` on a text message
 * (2026-10-13, owner request: "turn a message into a sticker like the
 * WhatsApp quote-sticker style - username + pfp")
 *
 * Renders a replied-to TEXT message as a fake chat bubble sticker:
 *
 *     ┌──────────────────────────────┐
 *  (o)│ Mister E                     │   (o) = round pfp (or initial avatar)
 *     │ I like guys                  │   bubble = WhatsApp light/dark theme
 *     └──────────────────────────────┘
 *
 * on a transparent 512×512 canvas → PNG buffer → wa-sticker-formatter.
 *
 * Design decisions (constrained by the boxes, NOT generic):
 *  - node-canvas, NOT playwright/chromium: bots run under pm2 memory caps
 *    (joker cap-killed at 399MB twice on 2026-10-11). A chromium launch per
 *    sticker is a memory bomb; canvas adds ~0.
 *  - Fonts are BUNDLED (core/assets/fonts/DejaVuSans*.ttf) + registerFont().
 *    Boxes have fontconfig + DejaVu today, but bundling makes rendering
 *    deterministic even on a font-less base image.
 *  - node-canvas 3.2.3 CANNOT rasterize color emoji (verified 2026-10-13:
 *    Noto Color Emoji present, 0 colored pixels drawn - no CBDT support).
 *    So emoji are overlaid as twemoji PNGs from jsDelivr with a two-tier
 *    disk+memory cache and a graceful "skip the glyph" fallback if the CDN
 *    is unreachable. No font on any box can change this outcome.
 *  - The PFP is decorative: fetchPfp() (3s cap) + 6s image download, then
 *    we fall back to the initial-letter avatar. A dead CDN never blocks a
 *    sticker for more than ~9s once; fetchPfp negative-caches for 60s.
 *
 * Exports:
 *   renderQuoteSticker(opts) -> Promise<Buffer> PNG 512×512
 *   parseEmojiRuns(text)     -> tokens (exported for QA)
 *   wrapTokens(lines, maxW, measure) -> wrapped lines (exported for QA)
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const canvasMod = require("canvas"); // resolved from the bot's node_modules
const { createCanvas, registerFont, loadImage } = canvasMod;

// -- Fonts (bundled - deterministic on any box) ------------------------------
const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const FONT_FAMILY = "QuoteSans";
let _fontsRegistered = false;
function ensureFonts() {
  if (_fontsRegistered) return;
  try {
    registerFont(path.join(FONT_DIR, "DejaVuSans.ttf"), { family: FONT_FAMILY, weight: "normal" });
    registerFont(path.join(FONT_DIR, "DejaVuSans-Bold.ttf"), { family: FONT_FAMILY, weight: "bold" });
  } catch (e) {
    console.error("[quoteSticker] font registration failed:", e.message);
  }
  _fontsRegistered = true;
}
const fontStr = (px, bold) => `${bold ? "bold " : ""}${px}px "${FONT_FAMILY}", "DejaVu Sans", sans-serif`;

// -- Layout constants (512×512 sticker canvas) -------------------------------
const CANVAS = 512;
const MARGIN = 34;            // outer padding
const AVATAR_D = 88;          // profile picture diameter
const AVATAR_GAP = 14;        // gap between avatar and bubble
const BUBBLE_MAX_W = CANVAS - MARGIN - AVATAR_D - AVATAR_GAP - MARGIN; // 342
const BUBBLE_PAD_X = 22;
const BUBBLE_PAD_Y = 20;
const NAME_H = 34;            // reserved height of the name row
const NAME_GAP = 6;           // gap between name row and body text
const RADIUS = 28;            // bubble corner radius
const EMOJI_SCALE = 1.18;     // emoji square side = fontSize * EMOJI_SCALE
const EMOJI_BASELINE_DROP = 0.18; // emoji center drop relative to font size

// WhatsApp-ish member name palette (readable on white bubble)
const PALETTE_LIGHT = [
  "#e91e63", "#c2185b", "#9c27b0", "#673ab7", "#3f51b5", "#1e88e5",
  "#0288d1", "#00897b", "#2e7d32", "#558b2f", "#ef6c00", "#d84315",
  "#795548", "#5d4037", "#e53935", "#00acc1", "#7cb342", "#f57f17",
];
// Brighter variants for the dark bubble
const PALETTE_DARK = [
  "#ff8fb1", "#e39df1", "#9fa8ff", "#82b1ff", "#7fdbff", "#69e2c9",
  "#8fe3a0", "#c5e1a5", "#ffd54f", "#ffab6b", "#ff8a80", "#bcaaa4",
  "#a7ffeb", "#80d8ff", "#ea80fc", "#fff59d", "#b39ddb", "#ff9e80",
];
const BUBBLE_LIGHT = "#ffffff";
const TEXT_LIGHT = "#111b21";
const BUBBLE_DARK = "#1f2c34";
const TEXT_DARK = "#e9edef";
const AVATAR_FALLBACK_BG = ["#25d366", "#34b7f1", "#a344c8", "#e56b5d", "#e4a11b", "#6b7f99"];

function nameColor(seed, dark) {
  let h = 0;
  const s = String(seed || "x");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const pal = dark ? PALETTE_DARK : PALETTE_LIGHT;
  return pal[h % pal.length];
}
function fallbackAvatarColor(seed) {
  let h = 0;
  const s = String(seed || "x");
  for (let i = 0; i < s.length; i++) h = (h * 17 + s.charCodeAt(i)) >>> 0;
  return AVATAR_FALLBACK_BG[h % AVATAR_FALLBACK_BG.length];
}

// -- Emoji tokenizer ----------------------------------------------------------
// Pragmatic sequence matcher: flags, keycaps, ZWJ chains, skin tones, VS16.
const EMOJI_RE =
  /(?:\p{RI}\p{RI}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\uFE0E)*)/gu;

/** Split a text line into [{type:'text'|'emoji', value}] tokens. */
function parseEmojiRuns(line) {
  const tokens = [];
  let last = 0;
  for (const m of String(line).matchAll(EMOJI_RE)) {
    const idx = m.index;
    if (idx > last) tokens.push({ type: "text", value: line.slice(last, idx) });
    tokens.push({ type: "emoji", value: m[0] });
    last = idx + m[0].length;
  }
  if (last < line.length) tokens.push({ type: "text", value: line.slice(last) });
  return tokens;
}

// -- twemoji fetch + cache ----------------------------------------------------
const TWEMOJI_SOURCES = [
  (cp) => `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/${cp}.png`,
  (cp) => `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png`,
];
const _emojiMem = new Map(); // codepoint -> Image | null (null = known-missing)
const EMOJI_DISK_DIR = path.resolve(process.cwd(), "temp", "twemoji");
const NEG_TTL_MS = 30 * 60 * 1000;

function emojiCodepoints(seq) {
  const codes = Array.from(seq).map((c) => c.codePointAt(0).toString(16));
  const full = codes.join("-");
  const stripped = codes.filter((c) => c !== "fe0f").join("-");
  return [full, stripped];
}

async function fetchEmojiImage(seq) {
  const [full, stripped] = emojiCodepoints(seq);
  const memKey = full;
  const hit = _emojiMem.get(memKey);
  if (hit !== undefined) {
    if (hit === null || hit === "neg") return null;
    if (typeof hit === "object") return hit;
    if (typeof hit === "number" && Date.now() < hit) return null; // negative TTL
  }
 // disk cache (both codepoint variants)
  if (!fs.existsSync(EMOJI_DISK_DIR)) fs.mkdirSync(EMOJI_DISK_DIR, { recursive: true });
  for (const cp of [stripped, full]) {
    const p = path.join(EMOJI_DISK_DIR, `${cp}.png`);
    if (fs.existsSync(p) && fs.statSync(p).size > 100) {
      try {
        const img = await loadImage(p);
        _emojiMem.set(memKey, img);
        return img;
      } catch {}
    }
  }
 // network (jdecked 15.1.0 first, then twitter 14.0.2; fe0f-stripped variant too)
  for (const src of TWEMOJI_SOURCES) {
    for (const cp of [stripped, full]) {
      try {
        const res = await axios.get(src(cp), {
          responseType: "arraybuffer",
          timeout: 6000,
          headers: { "User-Agent": "wa-bot-quote-sticker/1.0" },
        });
        if (!res.data || res.data.length < 100) continue;
        const buf = Buffer.from(res.data);
        try { fs.writeFileSync(path.join(EMOJI_DISK_DIR, `${cp}.png`), buf); } catch {}
        const img = await loadImage(buf);
        _emojiMem.set(memKey, img);
        return img;
      } catch {}
    }
  }
 // negative-cache in memory only
  _emojiMem.set(memKey, Date.now() + NEG_TTL_MS);
  return null;
}

// -- measuring / wrapping -----------------------------------------------------
function makeMeasurer(ctx, fontSize, bold) {
  ctx.font = fontStr(fontSize, bold);
  const emojiW = fontSize * EMOJI_SCALE;
  return function measure(tokens) {
    let w = 0;
    for (const t of tokens) {
      if (t.type === "emoji") w += emojiW;
      else w += ctx.measureText(t.value).width;
    }
    return w;
  };
}

/**
 * Greedy wrap of pre-tokenized lines into wrapped lines.
 * Hard-splits over-long words by grapheme clusters.
 * @returns {Array<Array<token>>}
 */
function wrapTokens(rawLines, maxW, measure) {
  const out = [];
  const pushLine = (ln) => {
    while (ln.length && ln[ln.length - 1].type === "text" && /^\s+$/.test(ln[ln.length - 1].value)) ln.pop();
    if (ln.length) out.push(ln);
  };
  for (const raw of rawLines) {
    const tokens = parseEmojiRuns(raw);
 // explode tokens into word-ish atoms: text tokens split on spaces,
 // emoji stand alone.
    const atoms = [];
    for (const t of tokens) {
      if (t.type === "emoji") atoms.push(t);
      else {
 // split preserving spaces: word, space, word, space...
        const parts = t.value.split(/(\s+)/).filter((p) => p !== "");
        for (const p of parts) atoms.push({ type: "text", value: p });
      }
    }
    let line = [];
    let lineW = 0;
    for (const atom of atoms) {
      const w = measure([atom]);
      const isSpace = atom.type === "text" && /^\s+$/.test(atom.value);
      if (isSpace) {
 // keep as a joiner only when something is already on the line
        if (line.length) {
          line.push(atom);
          lineW += w;
        }
        continue;
      }
      if (line.length && lineW + w > maxW) {
        pushLine(line);
        line = [];
        lineW = 0;
      }
      if (w > maxW) {
 // single atom wider than the bubble → hard-split by graphemes
        for (const ch of Array.from(atom.value)) {
          const cw = measure([{ type: "text", value: ch }]);
          if (line.length && lineW + cw > maxW) {
            pushLine(line);
            line = [];
            lineW = 0;
          }
          line.push({ type: "text", value: ch });
          lineW += cw;
        }
      } else {
        line.push(atom);
        lineW += w;
      }
    }
    pushLine(line);
  }
  return out;
}

/** Collapse internal whitespace of a text token (WhatsApp collapses runs). */
function collapseSpaces(value) {
  return value.replace(/\s+/g, " ");
}

// -- avatar -------------------------------------------------------------------
async function loadAvatarImage(sock, jid) {
  try {
    const { fetchPfp } = require("./pfpCache");
    const url = await fetchPfp(sock, jid);
    if (!url) return null;
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 6000 });
    if (!res.data) return null;
    return await loadImage(Buffer.from(res.data));
  } catch {
    return null;
  }
}

function drawCoverCircle(ctx, img, cx, cy, d) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  const scale = Math.max(d / iw, d / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

// -- line painter (used for the name row AND body lines) ---------------------
async function paintLine(ctx, tokens, x, yBaseline, fontSize, bold, color) {
  ctx.font = fontStr(fontSize, bold);
  ctx.fillStyle = color;
  const emojiS = fontSize * EMOJI_SCALE;
  let cx = x;
  for (const t of tokens) {
    if (t.type === "emoji") {
      const img = await fetchEmojiImage(t.value);
      if (img) {
 // emoji square vertically centered on the text's visual middle
        const dy = yBaseline - fontSize * 0.92;
        ctx.drawImage(img, Math.round(cx), Math.round(dy), emojiS, emojiS);
      }
 // failed fetch → draw nothing (glyph silently skipped)
      cx += emojiS;
    } else {
      const v = collapseSpaces(t.value);
      if (v) ctx.fillText(v, cx, yBaseline);
      cx += ctx.measureText(v).width;
    }
  }
  return cx;
}

// -- main render --------------------------------------------------------------
/**
 * @param {object} opts
 * @param {string} opts.text    quoted message text (already extracted)
 * @param {string} opts.name    author display name
 * @param {string|null} opts.jid quoted author JID (name-color + pfp seed)
 * @param {object|null} opts.sock  Baileys socket (for pfp fetch; null OK)
 * @param {boolean} [opts.dark] dark bubble variant
 * @returns {Promise<Buffer>} PNG buffer 512×512 (transparent bg)
 */
async function renderQuoteSticker(opts) {
  const { text, name, jid, sock, dark = false } = opts || {};
  ensureFonts();

  const canvas = createCanvas(CANVAS, CANVAS);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";

  const bubbleBg = dark ? BUBBLE_DARK : BUBBLE_LIGHT;
  const bodyColor = dark ? TEXT_DARK : TEXT_LIGHT;
  const nColor = nameColor(jid || name, dark);

 // -- size the text: shrink until it fits the height budget ----------------
  const H_BUDGET = CANVAS - MARGIN * 2 - BUBBLE_PAD_Y * 2 - NAME_H - NAME_GAP; // body rows budget
  const STEPS = [28, 24, 21, 18];
  let fontSize = STEPS[STEPS.length - 1];
  let lines = [];
  let truncated = false;

  const rawLines = String(text || "").replace(/\r/g, "").split("\n").slice(0, 40);
  for (const size of STEPS) {
    fontSize = size;
    const lh = Math.round(size * 1.36);
    const maxLines = Math.max(1, Math.floor(H_BUDGET / lh));
    const measurer = makeMeasurer(ctx, size, false);
    const wrapped = wrapTokens(rawLines, BUBBLE_MAX_W - BUBBLE_PAD_X * 2, measurer);
    if (wrapped.length <= maxLines) {
      lines = wrapped;
      truncated = false;
      break;
    }
    lines = wrapped.slice(0, maxLines);
    truncated = true; // try a smaller size first; keep the cut as fallback
  }
 // final: if still truncated at the smallest step, mark last line with …
  const lh = Math.round(fontSize * 1.36);
  if (truncated) {
    const last = lines[lines.length - 1];
    if (last) last.push({ type: "text", value: "…" });
  }

 // name row (single line, ellipsized by width)
  const nameSize = Math.max(20, fontSize);
  const nameText = String(name || "User").trim() || "User";
  const nameTokens = parseEmojiRuns(nameText);
  ctx.font = fontStr(nameSize, true);
  const nameW = (() => {
    let w = 0;
    const ew = nameSize * EMOJI_SCALE;
    for (const t of nameTokens) w += t.type === "emoji" ? ew : ctx.measureText(collapseSpaces(t.value)).width;
    return w;
  })();
  const maxNameW = BUBBLE_MAX_W - BUBBLE_PAD_X * 2;
  let nameDisplay = nameTokens;
  if (nameW > maxNameW) {
 // char-truncate with ellipsis
    let w = 0;
    const disp = [];
    const chars = Array.from(nameText);
    for (let i = 0; i < chars.length; i++) {
      const cw = ctx.measureText(chars[i]).width;
      if (w + cw > maxNameW - ctx.measureText("…").width) {
        disp.push({ type: "text", value: "…" });
        break;
      }
      disp.push(...parseEmojiRuns(chars[i]));
      w += cw;
    }
    nameDisplay = disp;
  }
  let nameRowW = 0;
  ctx.font = fontStr(nameSize, true);
  for (const t of nameDisplay) nameRowW += t.type === "emoji" ? nameSize * EMOJI_SCALE : ctx.measureText(collapseSpaces(t.value)).width;

 // -- bubble geometry ------------------------------------------------------
  let contentW = 0;
  ctx.font = fontStr(fontSize, false);
  for (const ln of lines) {
    let w = 0;
    for (const t of ln) w += t.type === "emoji" ? fontSize * EMOJI_SCALE : ctx.measureText(collapseSpaces(t.value)).width;
    contentW = Math.max(contentW, w);
  }
  const innerW = Math.max(contentW, nameRowW, nameSize * 3);
  const bubbleW = Math.min(BUBBLE_MAX_W, Math.round(innerW + BUBBLE_PAD_X * 2));
  const bubbleH = Math.round(BUBBLE_PAD_Y * 2 + NAME_H + NAME_GAP + lines.length * lh);

  const totalH = bubbleH;
  const top = Math.max(MARGIN, Math.round((CANVAS - totalH) / 2));
  const bubbleX = MARGIN + AVATAR_D + AVATAR_GAP;
  const bubbleY = top;

 // -- avatar ---------------------------------------------------------------
  const avCx = MARGIN + AVATAR_D / 2;
  const avCy = top + 8 + AVATAR_D / 2;
  const avatarImg = jid ? await loadAvatarImage(sock, jid) : null;
  if (avatarImg) {
    drawCoverCircle(ctx, avatarImg, avCx, avCy, AVATAR_D);
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCx, avCy, AVATAR_D / 2, 0, Math.PI * 2);
    ctx.fillStyle = fallbackAvatarColor(jid || name);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = fontStr(Math.round(AVATAR_D * 0.42), true);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const initial = Array.from(nameText.trim())[0] || "?";
    ctx.fillText(initial.toUpperCase(), avCx, avCy + 2);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

 // -- bubble ---------------------------------------------------------------
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(bubbleX + RADIUS, bubbleY);
  ctx.arcTo(bubbleX + bubbleW, bubbleY, bubbleX + bubbleW, bubbleY + bubbleH, RADIUS);
  ctx.arcTo(bubbleX + bubbleW, bubbleY + bubbleH, bubbleX, bubbleY + bubbleH, RADIUS);
  ctx.arcTo(bubbleX, bubbleY + bubbleH, bubbleX, bubbleY, RADIUS);
  ctx.arcTo(bubbleX, bubbleY, bubbleX + bubbleW, bubbleY, RADIUS);
  ctx.closePath();
  ctx.fillStyle = bubbleBg;
 // subtle shadow for the light theme (WhatsApp sticker look)
  if (!dark) {
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
  }
  ctx.fill();
  ctx.restore();

 // -- name row -------------------------------------------------------------
  const nameBaseline = bubbleY + BUBBLE_PAD_Y + nameSize * 0.86;
  await paintLine(ctx, nameDisplay, bubbleX + BUBBLE_PAD_X, nameBaseline, nameSize, true, nColor);

 // -- body lines -----------------------------------------------------------
  let y = bubbleY + BUBBLE_PAD_Y + NAME_H + NAME_GAP + fontSize * 0.86;
  for (const ln of lines) {
    await paintLine(ctx, ln, bubbleX + BUBBLE_PAD_X, y, fontSize, false, bodyColor);
    y += lh;
  }

  return canvas.toBuffer("image/png");
}

module.exports = { renderQuoteSticker, parseEmojiRuns, wrapTokens, emojiCodepoints };
