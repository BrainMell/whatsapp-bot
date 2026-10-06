// ============================================
// 🧰 CHEST SPRITE REBUILD (owner 2026-10-06: "the chest not actually opening,
// like you literally removed the lid and turned it upside down??? fix that
// with 2 chest Sprites one open and one closed")
//
// What was wrong:
//  1. cache_chest_open.png had the lid DETACHED + VERTICALLY FLIPPED, floating
//     above the box — absurd.
//  2. BOTH sprites carry a baked-in translucent glow halo → contentBox anchors
//     the halo bottom at the ground line → the visible chest FLOATS above its
//     shadow, and the halo washes the contact shadow out (the "encounter item
//     shadows" complaint).
//
// Fix:
//  - closed  = original art with the border-connected halo stripped (BFS from
//    the canvas edge through low-alpha pixels) — same look, real feet.
//  - open    = composed fresh: box with a carved cavity (coins + inner glow)
//    and the lid hinged BACK — raised, foreshortened, dark underside strip —
//    in the same gold/wood palette. No halo anywhere.
// ============================================
const path = require('path');
const { createCanvas, loadImage } = require(path.join('/home/z/my-project/repo/node_modules/canvas'));
const fs = require('fs');
const PROP = '/home/z/my-project/repo/core/rpgasset/guildwar/ruins/props';

// BFS from all border pixels through alpha < THRESH, clearing as we go —
// kills the outer halo ring, keeps enclosed soft shading untouched.
function stripHalo(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width: W, height: H } = canvas;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const THRESH = 180;
    const seen = new Uint8Array(W * H);
    const stack = [];
    const push = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const i = y * W + x;
        if (seen[i]) return;
        seen[i] = 1;
        if (d[i * 4 + 3] >= THRESH) return;   // solid art — wall
        stack.push(i);
    };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
    while (stack.length) {
        const i = stack.pop();
        d[i * 4 + 3] = 0;                    // clear halo pixel
        const x = i % W, y = (i / W) | 0;
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

function findSeamRow(canvas) {
    // the widest gold band across rows 60-130 = the lid's bottom rim
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width: W } = canvas;
    let best = 92, bestCount = -1;
    for (let y = 60; y <= 130; y++) {
        const row = ctx.getImageData(0, y, W, 1).data;
        let c = 0;
        for (let x = 0; x < W; x++) {
            const r = row[x * 4], g = row[x * 4 + 1], b = row[x * 4 + 2], a = row[x * 4 + 3];
            if (a > 200 && r > 150 && g > 110 && b < 100) c++;
        }
        if (c > bestCount) { bestCount = c; best = y; }
    }
    return best;
}

(async () => {
    const src = await loadImage(path.join(PROP, 'cache_chest.png'));
    const base = createCanvas(src.width, src.height);
    base.getContext('2d').drawImage(src, 0, 0);
    stripHalo(base);
    const seam = findSeamRow(base) + 3; // seam = just below the lid's gold rim band
    console.log('seam row:', seam);

    // ── CLOSED: cleaned original, tight to the art ──
    fs.writeFileSync(path.join(PROP, 'cache_chest.png'), base.toBuffer('image/png'));

    // ── OPEN: box + carved cavity + hinged-back lid ──
    const W = src.width, H = src.height;
    const out = createCanvas(W, H);
    const ctx = out.getContext('2d');

    // body (below the seam) stays at its original position
    ctx.drawImage(base, 0, seam, W, H - seam, 0, seam, W, H - seam);

    // carve the cavity INTO the body top: dark opening + warm inner light.
    // 🔄 refined: inset from the rim posts, NO loud gold lip all round — just
    // a top-edge highlight (the open rim behind), coins tucked INSIDE so the
    // opening reads as a hole with treasure glinting, never a tray on top.
    const cavX = 38, cavW = W - 76, cavY = seam - 6, cavH = 28;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cavX, cavY, cavW, cavH, 7);
    ctx.clip();
    ctx.fillStyle = '#120a03';
    ctx.fillRect(cavX, cavY, cavW, cavH);
    const glow = ctx.createRadialGradient(W / 2, cavY + cavH * 0.6, 4, W / 2, cavY + cavH * 0.6, cavW * 0.5);
    glow.addColorStop(0, 'rgba(255,214,90,0.38)');
    glow.addColorStop(0.55, 'rgba(214,160,40,0.16)');
    glow.addColorStop(1, 'rgba(120,80,10,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cavX, cavY, cavW, cavH);
    // coin pile catching the light — bottoms clipped by the cavity edge
    const coins = [[84, cavY + 22, 12, 5], [110, cavY + 25, 14, 6], [138, cavY + 23, 12, 5], [97, cavY + 18, 10, 4], [124, cavY + 17, 10, 4]];
    for (const [cx2, cy2, rx2, ry2] of coins) {
        ctx.fillStyle = '#e8b830';
        ctx.beginPath(); ctx.ellipse(cx2, cy2, rx2, ry2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f8dc78';
        ctx.beginPath(); ctx.ellipse(cx2 - rx2 * 0.25, cy2 - ry2 * 0.35, rx2 * 0.5, ry2 * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#fff0a0';
    for (const [sx, sy, sr] of [[92, cavY + 10, 1.7], [118, cavY + 7, 2.1], [146, cavY + 12, 1.5]]) {
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // single top-edge highlight — the open rim, not a frame
    ctx.strokeStyle = 'rgba(248,220,120,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cavX + 5, cavY + 1);
    ctx.lineTo(cavX + cavW - 5, cavY + 1);
    ctx.stroke();

    // lid: raised, foreshortened (swung back on its hinge), underside shaded
    const lidH = seam;
    const lidScaleY = 0.86, lidScaleX = 0.92;
    const lidBottom = cavY + 3;            // hinge lands just over the cavity's back edge
    ctx.save();
    ctx.translate(W / 2, lidBottom);
    ctx.scale(lidScaleX, lidScaleY);
    ctx.drawImage(base, 0, 0, W, lidH, -W / 2, -lidH, W, lidH);
    ctx.restore();
    // underside strip at the hinge — the lid's inner face peeking
    ctx.fillStyle = 'rgba(24,14,5,0.55)';
    ctx.fillRect(W * 0.06, lidBottom - 7, W * 0.88, 6);

    fs.writeFileSync(path.join(PROP, 'cache_chest_open.png'), out.toBuffer('image/png'));
    console.log('chest sprites rebuilt: closed (halo-stripped) + open (hinged lid, cavity, coins)');

    // audit: content boxes after rebuild
    for (const f of ['cache_chest.png', 'cache_chest_open.png']) {
        const img = await loadImage(path.join(PROP, f));
        const c = createCanvas(img.width, img.height);
        const cx2 = c.getContext('2d', { willReadFrequently: true });
        cx2.drawImage(img, 0, 0);
        const d = cx2.getImageData(0, 0, img.width, img.height).data;
        let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
        for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
            if (d[(y * img.width + x) * 4 + 3] > 16) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
        }
        console.log(f, 'content:', { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
