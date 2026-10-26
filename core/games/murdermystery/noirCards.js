'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  NOIR CARDS — static, high-resolution (960x720) image cards for the moments
//  that happen IN THE GROUP: a room encounter, a guest being pressed, evidence
//  laid on the table, a public accusation. Owner 2026-10-25: "almost every
//  actively engaging message had an image card, it makes the game alive" and
//  "the clips look blurry" → events are crisp stills; motion is reserved for the
//  intro, a murder and the verdict.
//  Every renderer returns a PNG Buffer or null (callers fall back to text).
// ═══════════════════════════════════════════════════════════════════════════
const cards = require('./cards');

const W = 640, H = 480, Q = 1.5;
const C = cards.C;

async function card(draw) {
    try {
        cards.registerFonts();
        const { createCanvas } = cards.cv();
        const canvas = createCanvas(W * Q, H * Q), ctx = canvas.getContext('2d');
        ctx.setTransform(Q, 0, 0, Q, 0, 0);
        await draw(ctx);
        return canvas.toBuffer('image/png');
    } catch (e) { console.error('[NoirCards] render failed:', e.message); return null; }
}
const bgOf = async (id) => { try { return await cards.loadBg(id); } catch (e) { return null; } };
const spr = async (id) => { try { return await cards.loadSprite(id); } catch (e) { return null; } };

function cover(ctx, img, zoom = 1.08) {
    if (!img) { ctx.fillStyle = '#0d0b10'; ctx.fillRect(0, 0, W, H); return; }
    const s = Math.max(W / img.width, H / img.height) * zoom;
    ctx.drawImage(img, W / 2 - img.width * s / 2, H / 2 - img.height * s / 2, img.width * s, img.height * s);
}
function wrap(ctx, text, maxW) {
    const out = []; for (const para of String(text).split('\n')) { let line = ''; for (const w of para.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); } return out;
}
function outlined(ctx, text, x, y, fill, lw = 6) { ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(0,0,0,0.92)'; ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y); }
function plate(ctx, x, y, w, h, stroke = C.amber, fill = 'rgba(8,6,12,0.8)') { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); }
function shade(ctx, a = 0.55) { ctx.fillStyle = `rgba(4,3,8,${a})`; ctx.fillRect(0, 0, W, H); const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
function drawSprite(ctx, img, cx, bottom, h, o = {}) {
    if (!img) return; const s = h / img.height, w = img.width * s;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6; if (o.flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); } ctx.drawImage(img, cx - w / 2, bottom - h, w, h); ctx.restore();
}
function header(ctx, kick, title, color = C.amberHi) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '20px Type'; outlined(ctx, kick.toUpperCase(), W / 2, 40, color, 5);
    ctx.font = '40px PF-Black'; outlined(ctx, title.toUpperCase(), W / 2, 84, '#fff7e0', 8);
}
function banner(ctx, text, y = 416) {
    plate(ctx, 30, y, W - 60, 56); ctx.fillStyle = C.ivory; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '20px EB-Semi'; const lines = wrap(ctx, text, W - 100).slice(0, 2); const lh = 23, top = y + 28 - (lines.length * lh) / 2;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh + 2));
}

/** two or more guests meet in a room while searching */
async function roomSceneCard({ roomId, roomName, who, line, round }) {
    const bg = await bgOf(roomId); const imgs = await Promise.all(who.map((w) => spr(w.charId)));
    return card(async (ctx) => {
        cover(ctx, bg); shade(ctx, 0.5);
        header(ctx, `Round ${round} · they crossed paths`, roomName.replace(/^the /i, 'The '));
        const n = who.length, slot = Math.min(170, (W - 80) / n), x0 = W / 2 - (slot * (n - 1)) / 2;
        who.forEach((w, i) => {
            const x = x0 + i * slot; drawSprite(ctx, imgs[i], x, 372, Math.min(250, slot * 1.9), { flip: i % 2 === 1 });
            ctx.font = '22px PF-Bold'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; outlined(ctx, String(w.name).split(' ').slice(-1)[0], x, 392, C.ivory, 5);
        });
        banner(ctx, line);
    });
}

/** a guest is pressed in public; their account is read out */
async function pressCard({ asker, target, quote, round }) {
    const bg = await bgOf('library'); const [a, t] = await Promise.all([spr(asker.charId), spr(target.charId)]);
    return card(async (ctx) => {
        cover(ctx, bg); shade(ctx, 0.62);
        header(ctx, `Round ${round} · pressed in public`, 'Where were you?', '#ff9d9d');
        drawSprite(ctx, a, 130, 380, 250); drawSprite(ctx, t, 510, 380, 250, { flip: true });
        ctx.font = '22px PF-Bold'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        outlined(ctx, String(asker.name).split(' ').slice(-1)[0], 130, 396, C.ivory, 5); outlined(ctx, String(target.name).split(' ').slice(-1)[0], 510, 396, C.ivory, 5);
        // speech plate
        plate(ctx, 205, 138, 230, 132, '#d8c27a', 'rgba(236,226,200,0.94)');
        ctx.fillStyle = '#1b1620'; ctx.font = '18px EB-Semi'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const lines = wrap(ctx, `“${quote}”`, 200); lines.slice(0, 7).forEach((l, i) => ctx.fillText(l, 320, 154 + i * 24));
        banner(ctx, `${asker.name} presses ${target.name}. Does it hold up?`, 416);
    });
}

/** evidence laid on the table */
async function evidenceCard({ art, roomName, line, by, trace }) {
    const bg = await bgOf('study') .then((b) => b || bgOf('library')); const clue = art ? await cards.loadClue(art).catch(() => null) : null; const s = by ? await spr(by.charId) : null;
    return card(async (ctx) => {
        cover(ctx, bg); shade(ctx, 0.72);
        header(ctx, trace ? 'The trace — this changes everything' : 'Evidence laid on the table', roomName.replace(/^the /i, 'Found in the '), trace ? '#ff9d9d' : C.amberHi);
        ctx.save(); ctx.translate(210, 262); ctx.rotate(-0.07); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 18; ctx.fillStyle = '#efe7d0'; ctx.fillRect(-130, -112, 260, 224); ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#1d1824'; ctx.fillRect(-118, -100, 236, 170); if (clue) ctx.drawImage(clue, -118, -100, 236, 170);
        ctx.fillStyle = '#18121c'; ctx.font = '17px Type'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(trace ? 'EXHIBIT A' : 'EXHIBIT', 0, 90); ctx.fillStyle = '#c0182f'; ctx.beginPath(); ctx.arc(0, -110, 6, 0, 7); ctx.fill(); ctx.restore();
        if (s) drawSprite(ctx, s, 540, 408, 150);
        plate(ctx, 350, 150, 250, 104); ctx.fillStyle = C.ivory; ctx.font = '20px EB-Semi'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        wrap(ctx, line, 218).slice(0, 3).forEach((l, i) => ctx.fillText(l, 366, 164 + i * 26));
        banner(ctx, by ? `${by.name} lays it on the table.` : 'Laid on the table.', 416);
    });
}

/** a public accusation (with tally) */
async function accuseCard({ accuser, target, count, need }) {
    const bg = await bgOf('greatroom'); const [a, t] = await Promise.all([spr(accuser.charId), spr(target.charId)]);
    return card(async (ctx) => {
        cover(ctx, bg); shade(ctx, 0.7);
        const hot = count >= need;
        header(ctx, hot ? 'The room has decided' : 'An accusation', `${String(target.name).split(' ').slice(-1)[0]}!`, '#ff7a7a');
        drawSprite(ctx, a, 120, 392, 230); drawSprite(ctx, t, 520, 392, 260, { flip: true });
        // finger line
        ctx.strokeStyle = 'rgba(255,90,90,0.75)'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(190, 250); ctx.lineTo(440, 250); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,90,90,0.9)'; ctx.beginPath(); ctx.moveTo(452, 250); ctx.lineTo(432, 238); ctx.lineTo(432, 262); ctx.fill();
        ctx.font = '64px PF-Black'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; outlined(ctx, `${count}/${need}`, 320, 190, hot ? '#ff5a5a' : '#fff7e0', 10);
        banner(ctx, `${accuser.name} accuses ${target.name}.${hot ? ' The majority agrees.' : ' ' + (need - count) + ' more to convict now.'}`, 416);
    });
}

module.exports = { roomSceneCard, pressCard, evidenceCard, accuseCard };
