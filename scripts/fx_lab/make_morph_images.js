// Build PHASE 1 / PHASE 2 images for the imgmorph edit-ladder experiment.
// Run ON Box2 from /home/ubuntu/whatsapp-bot so `sharp` resolves.
// sharp+SVG instead of ffmpeg drawtext: box drawtext lacks tw/text_w,
// SVG text-anchor=middle gives exact centering.
const sharp = require("sharp");
const path = require("path");

const OUT = process.argv[2] || path.join(process.cwd(), "fx_captures", "assets");
const W = 720;

function frame(bg, accent, sub, title, note) {
    return `<svg width="${W}" height="${W}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${bg}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${W}" fill="url(#g)"/>
  <rect x="0" y="0" width="${W}" height="26" fill="${accent}"/>
  <rect x="0" y="${W - 26}" width="${W}" height="26" fill="${accent}"/>
  <circle cx="360" cy="330" r="215" fill="none" stroke="${accent}" stroke-opacity="0.25" stroke-width="10"/>
  <text x="360" y="382" font-family="DejaVu Sans" font-weight="bold" font-size="132"
        fill="${accent}" text-anchor="middle" letter-spacing="4">${title}</text>
  <text x="360" y="452" font-family="DejaVu Sans" font-size="38"
        fill="#8b949e" text-anchor="middle">${sub}</text>
  <text x="360" y="540" font-family="DejaVu Sans" font-size="30"
        fill="#566070" text-anchor="middle">${note}</text>
</svg>`;
}

(async () => {
    const a = frame("#0d1b2a", "#00e5a8", "same bubble - watch the edits", "PHASE 1", "stage 1: ordinary image + caption");
    const b = frame("#2a0a12", "#ff4d6d", "IMAGE SWAPPED - SAME MESSAGE", "PHASE 2", "stage 3: editedMessage carried a new image");
    await sharp(Buffer.from(a)).jpeg({ quality: 88 }).toFile(path.join(OUT, "morph_a.jpg"));
    await sharp(Buffer.from(b)).jpeg({ quality: 88 }).toFile(path.join(OUT, "morph_b.jpg"));
    console.log("morph images built:", OUT);
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
