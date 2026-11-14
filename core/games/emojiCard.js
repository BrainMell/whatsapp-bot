// ============================================
// EMOJI DECODE - image card renderer (node canvas, bundled emoji PNGs)
// Emoji are drawn from core/assets/emoji/<codepoints>.png so the card looks the same on
// any host (no emoji-font dependency). Returns a PNG Buffer, or null if anything is missing
// so the caller can fall back to a plain text puzzle.
// ============================================
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const ASSETS = path.join(__dirname, "..", "assets");
let _fonts = false;
function ensureFonts() {
  if (_fonts) return; _fonts = true;
  try {
    const canvas = require("canvas");
    const reg = path.join(ASSETS, "fonts", "DejaVuSans.ttf"), bold = path.join(ASSETS, "fonts", "DejaVuSans-Bold.ttf");
    if (canvas.registerFont) {
      if (fs.existsSync(reg)) canvas.registerFont(reg, { family: "TTTSans" });
      if (fs.existsSync(bold)) canvas.registerFont(bold, { family: "TTTSans", weight: "bold" });
    }
  } catch (_) { /* system sans fallback */ }
}
const F = (px, bold) => `${bold ? "bold " : ""}${px}px TTTSans, "DejaVu Sans", sans-serif`;
const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
const fileFor = (cluster) => path.join(ASSETS, "emoji", [...cluster].map((c) => c.codePointAt(0).toString(16)).join("-") + ".png");

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// n = puzzle number, emojis = "🍄🔧👸", answer = primary answer (for the blanks hint), label = category line
async function renderCard({ n, emojis, answer, label = "NAME THE ANIME", seconds = 60, pts = 3, bonus = 1 }) {
  try {
    ensureFonts();
    const clusters = [...seg.segment(String(emojis))].map((s) => s.segment).filter((s) => s.trim());
    const imgs = [];
    for (const c of clusters) {
      const f = fileFor(c);
      if (!fs.existsSync(f)) return null;
      imgs.push(await loadImage(f));
    }
    if (!imgs.length) return null;
    const W = 1000, H = 640;
    const cv = createCanvas(W, H), ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#070b1c"); g.addColorStop(0.55, "#0f1736"); g.addColorStop(1, "#1a1650");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // soft glow
    const rg = ctx.createRadialGradient(W / 2, 300, 40, W / 2, 300, 420);
    rg.addColorStop(0, "rgba(154,107,255,0.28)"); rg.addColorStop(1, "rgba(154,107,255,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    // border
    ctx.strokeStyle = "rgba(255,207,74,0.55)"; ctx.lineWidth = 4; rr(ctx, 16, 16, W - 32, H - 32, 28); ctx.stroke();

    // header
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffcf4a"; ctx.font = F(46, true); ctx.fillText("EMOJI DECODE", W / 2, 84);
    ctx.fillStyle = "#7f8bb3"; ctx.font = F(26, true); ctx.fillText(`PUZZLE #${n}   •   GAME NIGHT`, W / 2, 122);

    // emoji tiles
    const count = imgs.length, gap = 28;
    const tile = Math.min(230, Math.floor((W - 120 - gap * (count - 1)) / count));
    const totalW = tile * count + gap * (count - 1);
    let x = (W - totalW) / 2; const y = 168;
    for (const im of imgs) {
      ctx.fillStyle = "rgba(255,255,255,0.08)"; rr(ctx, x, y, tile, tile, 28); ctx.fill();
      ctx.strokeStyle = "rgba(120,150,255,0.45)"; ctx.lineWidth = 3; rr(ctx, x, y, tile, tile, 28); ctx.stroke();
      const pad = Math.round(tile * 0.12);
      ctx.drawImage(im, x + pad, y + pad, tile - pad * 2, tile - pad * 2);
      x += tile + gap;
    }

    // category + letter blanks
    const by = y + tile + 56;
    ctx.fillStyle = "#58d6ff"; ctx.font = F(28, true); ctx.fillText(label, W / 2, by);
    const words = String(answer || "").split(/\s+/).filter(Boolean).map((w) => w.replace(/[^A-Za-z0-9]/g, "").length).filter(Boolean);
    if (words.length) {
      const bw = 26, bh = 8, bg = 8, wg = 30;
      const widths = words.map((l) => l * bw + (l - 1) * bg);
      const total = widths.reduce((a, b) => a + b, 0) + wg * (words.length - 1);
      let bx = (W - Math.min(total, W - 80)) / 2;
      const scale = total > W - 80 ? (W - 80) / total : 1;
      ctx.save(); ctx.translate(bx, by + 34); ctx.scale(scale, scale);
      let cx = 0;
      words.forEach((l, wi) => {
        for (let i = 0; i < l; i++) { ctx.fillStyle = "#eaf0ff"; rr(ctx, cx, 0, bw, bh, 4); ctx.fill(); cx += bw + bg; }
        cx += wg - bg;
      });
      ctx.restore();
      ctx.fillStyle = "#7f8bb3"; ctx.font = F(20, false);
      ctx.fillText(`${words.reduce((a, b) => a + b, 0)} letters • ${words.length} word${words.length > 1 ? "s" : ""}`, W / 2, by + 78);
    }

    // footer
    ctx.fillStyle = "#eaf0ff"; ctx.font = F(24, true);
    ctx.fillText(`First correct answer wins +${pts}   •   +${bonus} bonus if under 15 seconds`, W / 2, H - 70);
    ctx.fillStyle = "#7f8bb3"; ctx.font = F(20, false);
    ctx.fillText(`Type your answer in chat   •   ${seconds}s per puzzle`, W / 2, H - 38);
    return cv.toBuffer("image/png");
  } catch (e) { console.error("[EmojiCard] render failed:", e.message); return null; }
}

module.exports = { renderCard };
