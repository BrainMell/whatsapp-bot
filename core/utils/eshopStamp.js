'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  eShop grid decorator (owner 2026-10-29):
//   * SOLD cards (one purchase per token-event card) keep their slot but get a red
//     SOLD stamp over a darkened cell.
//   * WebM cards (Sylphiette / Kurisu...) come back from the Go renderer as "No Image"
//     because it can't decode WebM - we paint the first frame (ffmpeg poster) in
//     ourselves, then redraw the slot badge + price pill.
//  The Go service lays the grid out as 4 columns; geometry below was measured from
//  its 1050px-wide output (header 68px, cell 252x352, steps 260x390). If the image
//  doesn't match that layout we leave it untouched rather than paint in the wrong place.
// ═══════════════════════════════════════════════════════════════════════════
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const animatedMedia = require('./animatedMedia');

const BASE_W = 1050, LEFT = 9, TOP = 68, CELL_W = 252, CELL_H = 352, COL_STEP = 260, ROW_STEP = 390, FOOTER = 42;
const isWebmUrl = (u) => /\.webm(\?|#|$)/i.test(String(u || ''));

function rrect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}

async function posterFor(url) {
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const png = await animatedMedia.webmPoster(Buffer.from(res.data));
        return png ? await loadImage(png) : null;
    } catch (e) { console.error('[eShop] poster fetch failed:', e.message); return null; }
}

/**
 * @param {Buffer} png   grid PNG from the Go service
 * @param {Array}  cards the payload cards in render order: {slot, price, imageUrl, sold}
 * @returns {Promise<Buffer>} decorated PNG (or the original on any problem)
 */
async function decorate(png, cards) {
    try {
        if (!Buffer.isBuffer(png) || !cards || !cards.some((c) => c.sold || isWebmUrl(c.imageUrl))) return png;
        const img = await loadImage(png);
        const k = img.width / BASE_W, rows = Math.ceil(cards.length / 4);
        const expectH = (TOP + rows * ROW_STEP + FOOTER) * k;
        if (Math.abs(img.height - expectH) > 24 * k) { console.warn('[eShop] grid layout not recognised, skipping stamps'); return png; }
        const cv = createCanvas(img.width, img.height), c = cv.getContext('2d');
        c.drawImage(img, 0, 0);
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const x = (LEFT + (i % 4) * COL_STEP) * k, y = (TOP + Math.floor(i / 4) * ROW_STEP) * k, w = CELL_W * k, h = CELL_H * k;
            if (isWebmUrl(card.imageUrl)) {
                const poster = await posterFor(card.imageUrl);
                if (poster) {
                    c.save(); rrect(c, x + 5 * k, y + 5 * k, w - 10 * k, h - 10 * k, 14 * k); c.clip();
                    const sc = Math.max((w - 10 * k) / poster.width, (h - 10 * k) / poster.height);
                    c.drawImage(poster, x + (w - poster.width * sc) / 2, y + (h - poster.height * sc) / 2, poster.width * sc, poster.height * sc); c.restore();
                    // slot badge + price pill were painted over by the poster: put them back
                    c.fillStyle = '#000'; c.beginPath(); c.arc(x + 20 * k, y + 20 * k, 14 * k, 0, Math.PI * 2); c.fill();
                    c.fillStyle = '#fff'; c.font = `bold ${17 * k}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(card.slot), x + 20 * k, y + 21 * k);
                    c.fillStyle = 'rgba(0,0,0,0.78)'; rrect(c, x + w - 76 * k, y + h - 32 * k, 70 * k, 26 * k, 6 * k); c.fill();
                    c.fillStyle = '#ffd24a'; c.font = `bold ${19 * k}px sans-serif`; c.textAlign = 'center'; c.fillText(String(card.price), x + w - 41 * k, y + h - 18 * k);
                }
            }
            if (card.sold) {
                c.save(); rrect(c, x, y, w, h, 14 * k); c.clip(); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x, y, w, h); c.restore();
                c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(-0.32);
                const sw = w * 0.88, sh = 86 * k;
                c.strokeStyle = '#e03131'; c.fillStyle = 'rgba(224,49,49,0.16)'; c.lineWidth = 7 * k; rrect(c, -sw / 2, -sh / 2, sw, sh, 10 * k); c.fill(); c.stroke();
                c.lineWidth = 2 * k; rrect(c, -sw / 2 + 9 * k, -sh / 2 + 9 * k, sw - 18 * k, sh - 18 * k, 6 * k); c.stroke();
                c.fillStyle = '#e03131'; c.font = `bold ${60 * k}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SOLD', 0, 4 * k);
                c.restore();
            }
        }
        return cv.toBuffer('image/png');
    } catch (e) { console.error('[eShop] decorate failed:', e.message); return png; }
}

module.exports = { decorate, isWebmUrl };
