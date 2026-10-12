// ============================================
// 🖋️ QUOTE CARD RENDERER - .j quote <text>
// ============================================
// Turns text into an elegant quote card (1080x1350 PNG) over a photo
// background. Used by the `.j quote <text>` command in engine.js.
//
// Design notes (2026-10-12, owner: "Make a .j qoute that takes the text
// that follows and turns it into text over an appropriate image"):
// - Background photo comes from the engine (Pinterest keyword search on
//   the quote's own words). This module stays NETWORK-FREE so QA can run
//   offline: engine downloads the photo and passes the raw buffer in.
// - No photo / broken photo → procedural gradient fallback seeded by a
//   hash of the text (deterministic, never network-dependent).
// - Fonts are bot-owned (core/rpgasset/fonts) with magic-byte guards —
//   the worldMapRenderer pattern that survives LFS stubs.
// - Emoji are stripped before measuring/wrapping: canvas system fonts
//   render them as tofu boxes, which wreck the layout.
// - Long quotes auto-shrink (72px → 36px) with word-wrap; hard newlines
//   in the original message are preserved as line breaks.

const fs = require("fs");
const path = require("path");

const W = 1080;
const H = 1350;
const MAX_TEXT = 300;

const MARGIN_X = 100;
const BOX_TOP = 260;
const BOX_BOTTOM_AUTHOR = 1020; // leave room for the author line
const BOX_BOTTOM_NOAUTHOR = 1140;

// ─── FONT REGISTRATION (lazy; bot-owned fonts only) ─────────────────────────
// Same guard pattern as worldMapRenderer: per-file TTF/OTF magic checks so an
// LFS pointer stub can never poison the canvas font table.
let _fontsReady = false;
let _hasSerif = false; // IM Fell English (quote body)
let _hasCinzel = false; // Cinzel (author line)
let _hasDeco = false; // Cinzel Decorative Black (big “ mark)

function _ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require("canvas");
        const registerFont =
            canvas.registerFont ||
            (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) throw new Error("no font registration API in canvas build");
        const F = path.join(__dirname, "..", "rpgasset", "fonts");
        const isRealFont = (p) => {
            try {
                if (!fs.existsSync(p)) return false;
                const head = fs.readFileSync(p).slice(0, 4);
                return head.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) // TTF
                    || head.toString("latin1") === "OTTO" // OTF
                    || head.toString("latin1") === "true";
            } catch (e) {
                return false;
            }
        };
        const regs = [
            ["IMFellEnglish-Regular.ttf", { family: "QuoteSerif" }],
            ["IMFellEnglish-Italic.ttf", { family: "QuoteSerifItalic" }],
            ["Cinzel-Variable.ttf", { family: "QuoteAuthor" }],
            ["CinzelDecorative-Black.ttf", { family: "QuoteMark" }],
        ];
        for (const [file, opts] of regs) {
            const p = path.join(F, file);
            if (!isRealFont(p)) continue;
            try {
                registerFont(p, opts);
                if (file.startsWith("IMFell")) _hasSerif = true;
                if (file.startsWith("Cinzel-")) _hasCinzel = true;
                if (file.startsWith("CinzelDecorative")) _hasDeco = true;
            } catch (e) {
                /* skip broken file */
            }
        }
        _fontsReady = true;
        return true;
    } catch (e) {
        try {
            console.error("[quoteCard] font registration failed:", e.message);
        } catch (_) {}
        _fontsReady = true; // don't retry every message; fall back to system serif
        return false;
    }
}

const SERIF_FAMILY = () => (_hasSerif ? "QuoteSerif" : "DejaVu Sans");
const AUTHOR_FAMILY = () => (_hasCinzel ? "QuoteAuthor" : "DejaVu Sans");
const MARK_FAMILY = () => (_hasDeco ? "QuoteMark" : "QuoteSerif");

// ─── TEXT UTILITIES (exported for QA) ───────────────────────────────────────

// Strip emoji / variation selectors / ZWJ that canvas fonts render as tofu.
// Keeps arrows, math symbols, accents — DejaVu covers those.
function stripEmoji(text) {
    return String(text || "")
        .replace(/[\u{1F000}-\u{1FAFF}]/gu, "") // emoji plane
        .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "") // regional indicator flags
        .replace(/[\u{FE00}-\u{FE0F}]/gu, "") // variation selectors
        .replace(/\u{200D}/gu, "") // ZWJ
        .replace(/\u{20E3}/gu, ""); // combining enclosing keycap
}

// Optional author attribution: `--by Name`, `—by Name`, `–by Name`.
// Multiple separators: first one wins. Empty author → flag ignored.
function parseQuoteInput(raw) {
    let text = String(raw || "").trim();
    let author = "";
    const m = text.match(/\s+(?:--|\u2014|\u2013)by\s+(.+)$/i);
    if (m) {
        const candidate = m[1].trim();
        if (candidate) {
            author = candidate;
            text = text.slice(0, m.index).trim();
        }
    }
    return { text, author };
}

// Keyword extraction for the background photo search: drop stopwords,
// keep up to 4 significant words, cap at 60 chars. Falls back to the
// raw words (short quotes like "be water") then to a generic aesthetic.
const STOPWORDS = new Set(
    ("a an the and or but if of to in on for with is are was were be been being " +
        "it its this that these those i you he she we they me him her us them my " +
        "your his their our mine yours theirs ours not no nor do does did done have " +
        "has had will would can could should shall may might must just so than then " +
        "too very as at by from into about like through after over between out " +
        "against during without before under around among what which who whom when " +
        "where why how all any both each few more most other some such only own same " +
        "now also there here get got go going went come came don won ain isn aren " +
        "wasn weren hasn haven didn couldn shouldn wouldn").split(" ")
);

function pickBackgroundQuery(text) {
    const words = String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, " ")
        .split(/\s+/)
        .filter(Boolean);
    if (!words.length) return "aesthetic landscape";
    const sig = words.filter((w) => w.length > 2 && !STOPWORDS.has(w));
    const q = (sig.length ? sig : words).slice(0, 4).join(" ").trim();
    return (q || "aesthetic landscape").slice(0, 60).trim();
}

// ─── RENDERER ───────────────────────────────────────────────────────────────

function _djb2Hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
}

// Cover-fit draw: scale to fill W×H, center-crop the overflow.
function _drawCover(ctx, img) {
    const scale = Math.max(W / img.width, H / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function _paintGradientBg(ctx, seedStr) {
    const h = _djb2Hash(seedStr || "quote");
    const hue1 = h % 360;
    const hue2 = (hue1 + 35 + (h % 30)) % 360;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `hsl(${hue1}, 32%, 13%)`);
    g.addColorStop(0.55, `hsl(${hue2}, 30%, 19%)`);
    g.addColorStop(1, `hsl(${hue2}, 34%, 9%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

// Greedy word-wrap per hard line (\n preserved from the original message).
function _wrapLines(ctx, text, maxWidth) {
    const lines = [];
    for (const hard of text.split("\n")) {
        const words = hard.split(/\s+/).filter(Boolean);
        if (!words.length) {
            lines.push(""); // preserve intentional blank lines
            continue;
        }
        let cur = words[0];
        for (let i = 1; i < words.length; i++) {
            const test = `${cur} ${words[i]}`;
            if (ctx.measureText(test).width <= maxWidth) {
                cur = test;
            } else {
                lines.push(cur);
                cur = words[i];
            }
        }
        lines.push(cur);
    }
    return lines;
}

async function renderQuoteCard({ text, author, bgBuffer } = {}) {
    const canvas = require("canvas");
    _ensureFonts();

    const clean = stripEmoji(text || "").trim();
    if (!clean) throw new Error("quote text is empty after cleanup");
    if (clean.length > MAX_TEXT) {
        throw new Error(`quote too long (${clean.length} > ${MAX_TEXT} chars)`);
    }

    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext("2d");

    // 1. Background: photo when we have one, seeded gradient otherwise.
    let usedPhoto = false;
    if (bgBuffer && bgBuffer.length > 1000) {
        try {
            const img = await canvas.loadImage(bgBuffer);
            _drawCover(ctx, img);
            usedPhoto = true;
        } catch (e) {
            console.log("[quoteCard] bg image unreadable, gradient fallback:", e.message);
        }
    }
    if (!usedPhoto) _paintGradientBg(ctx, clean);

    // 2. Legibility scrim (works over both photo and gradient).
    const scrim = ctx.createLinearGradient(0, 0, 0, H);
    scrim.addColorStop(0, "rgba(0,0,0,0.28)");
    scrim.addColorStop(0.45, "rgba(0,0,0,0.42)");
    scrim.addColorStop(1, "rgba(0,0,0,0.78)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);

    // 3. Big decorative opening mark.
    const hasAuthor = Boolean(author && author.trim());
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    try {
        ctx.font = `150px "${MARK_FAMILY()}"`;
        ctx.fillStyle = "rgba(216, 178, 110, 0.95)";
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 8;
        ctx.fillText("\u201C", MARGIN_X - 8, BOX_TOP - 40);
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
    } catch (e) {
        /* decorative mark is optional */
    }

    // 4. Quote text: adaptive size, wrapped, centered.
    const maxWidth = W - MARGIN_X * 2;
    const boxBottom = hasAuthor ? BOX_BOTTOM_AUTHOR : BOX_BOTTOM_NOAUTHOR;
    const boxHeight = boxBottom - BOX_TOP;
    const family = SERIF_FAMILY();

    let size = 72;
    const MIN = 36;
    let lines = null;
    let lineHeight = 0;
    for (; size >= MIN; size -= 2) {
        ctx.font = `${size}px "${family}", serif`;
        lineHeight = Math.round(size * 1.38);
        lines = _wrapLines(ctx, clean, maxWidth);
        const total = lines.length * lineHeight;
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
        if (total <= boxHeight && widest <= maxWidth) break;
    }
    if (!lines) lines = [clean]; // unreachable, defensive

    ctx.font = `${size}px "${family}", serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#F7F3EA";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;

    const totalH = lines.length * lineHeight;
    let y = BOX_TOP + (boxHeight - totalH) / 2 + size; // first baseline
    for (const line of lines) {
        if (line) ctx.fillText(line, W / 2, y);
        y += lineHeight;
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowColor = "transparent";

    // 5. Author line: right-aligned, gold, small rule above it.
    if (hasAuthor) {
        const aY = Math.min(y + 44, H - 150);
        ctx.font = `34px "${AUTHOR_FAMILY()}", serif`;
        ctx.textAlign = "right";
        ctx.fillStyle = "#D8B26E";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 6;
        ctx.fillText(`\u2014  ${author.trim()}`, W - MARGIN_X, aY);
        // thin gold underline accent
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        const ruleW = 110;
        ctx.strokeStyle = "rgba(216,178,110,0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(W - MARGIN_X - ruleW, aY + 18);
        ctx.lineTo(W - MARGIN_X, aY + 18);
        ctx.stroke();
    }

    return c.toBuffer("image/png");
}

module.exports = {
    renderQuoteCard,
    parseQuoteInput,
    pickBackgroundQuery,
    stripEmoji,
    MAX_TEXT,
};
