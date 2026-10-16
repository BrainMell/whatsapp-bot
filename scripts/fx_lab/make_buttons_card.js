// Build the image-header card for `.j fx buttons img/img2` probes.
// Run ON Box2 from /home/ubuntu/whatsapp-bot so `sharp` resolves.
const sharp = require("sharp");
const path = require("path");

const OUT = path.join(process.cwd(), "fx_captures", "assets");
const W = 720, H = 540;

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a0b2e"/>
      <stop offset="1" stop-color="#2d1b4e"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <circle cx="120" cy="90" r="150" fill="#a855f7" fill-opacity="0.14"/>
  <circle cx="620" cy="470" r="180" fill="#ec4899" fill-opacity="0.12"/>
  <text x="360" y="235" font-family="DejaVu Sans" font-weight="bold" font-size="84"
        fill="#e879f9" text-anchor="middle" letter-spacing="3">IMAGE HEADER</text>
  <text x="360" y="300" font-family="DejaVu Sans" font-size="40"
        fill="#d8b4fe" text-anchor="middle">this picture rides the button card</text>
  <text x="360" y="365" font-family="DejaVu Sans" font-size="34"
        fill="#9d7bc7" text-anchor="middle">tap Me - text moves to your left</text>
  <rect x="60" y="430" width="600" height="10" rx="5" fill="#ec4899" fill-opacity="0.55"/>
</svg>`;

(async () => {
    await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(path.join(OUT, "buttons_card.jpg"));
    console.log("buttons_card.jpg built:", OUT);
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
