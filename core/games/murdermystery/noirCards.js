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
const characters = require('./characters');
// resolve the character id to its real sprite file (ids and file stems differ for some cast members)
const spr = async (id) => {
    try { const ch = characters.getCharacter(id); const stem = String((ch && ch.id === id && ch.sprite) || id).replace(/\.png$/i, ''); return await cards.loadSprite(stem); }
    catch (e) { return null; }
};

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

// ── shared noir kit (2026-11-20 polish pass) ─────────────────────────────────
const lastName = (n) => String(n).split(' ').slice(-1)[0];
const titleOf = (id) => { try { const c = characters.getCharacter(id); return c && c.id === id ? c.title : ''; } catch (e) { return ''; } };

/** hanging lamp cone: light falls from (x, 0) onto a pool at (x, y) */
function lamp(ctx, x, y, poolR, alpha = 0.34, tint = '255,226,160') {
    ctx.save();
    const cone = ctx.createLinearGradient(0, 0, 0, y);
    cone.addColorStop(0, `rgba(${tint},${alpha})`); cone.addColorStop(1, `rgba(${tint},${alpha * 0.18})`);
    ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(x - 14, 0); ctx.lineTo(x + 14, 0); ctx.lineTo(x + poolR, y); ctx.lineTo(x - poolR, y); ctx.closePath(); ctx.fill();
    const pool = ctx.createRadialGradient(x, y, 4, x, y, poolR * 1.15);
    pool.addColorStop(0, `rgba(${tint},${alpha * 0.9})`); pool.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = pool; ctx.beginPath(); ctx.ellipse(x, y, poolR * 1.15, poolR * 0.34, 0, 0, 7); ctx.fill();
    ctx.restore();
}
/** darken everything except a lit area so the speaker pops */
function dim(ctx, a = 0.5) { ctx.fillStyle = `rgba(3,2,6,${a})`; ctx.fillRect(0, 0, W, H); }
function film(ctx) { // letterbox bars + faint scanlines for a noir-still feel
    ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0, 0, W, 10); ctx.fillRect(0, H - 10, W, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.025)'; for (let y = 12; y < H - 10; y += 4) ctx.fillRect(0, y, W, 1);
}
/** typewritten paper sheet with tape; returns inner box */
function paper(ctx, x, y, w, h, rot = 0, tint = '#eee5cc') {
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot);
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8; ctx.fillStyle = tint; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(120,96,50,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12);
    ctx.fillStyle = 'rgba(214,190,120,0.55)'; ctx.fillRect(-w / 2 - 6, -h / 2 + 8, 34, 14); ctx.fillRect(w / 2 - 28, -h / 2 - 5, 34, 14);
    ctx.restore();
}
/** rubber stamp, rotated, with double border */
function stampMark(ctx, text, cx, cy, color = '#b5182c', rot = -0.14, size = 26) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.font = `${size}px Type`; const tw = ctx.measureText(text).width + 26, th = size + 18;
    ctx.globalAlpha = 0.88; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3; ctx.strokeRect(-tw / 2, -th / 2, tw, th); ctx.lineWidth = 1; ctx.strokeRect(-tw / 2 + 4, -th / 2 + 4, tw - 8, th - 8);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 2); ctx.restore();
}
/** brass nameplate under a character */
function nameplate(ctx, name, title, cx, y, lit = true, maxW = 999) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const n = lastName(name); let fs = 20; ctx.font = fs + 'px PF-Bold'; while (fs > 11 && ctx.measureText(n).width > maxW - 16) { fs -= 1; ctx.font = fs + 'px PF-Bold'; }
    const w = Math.min(Math.max(ctx.measureText(n).width, 120) + 30, maxW);
    ctx.fillStyle = lit ? 'rgba(201,161,59,0.95)' : 'rgba(110,96,70,0.9)'; ctx.fillRect(cx - w / 2, y - 20, w, 44);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2; ctx.strokeRect(cx - w / 2 + 3, y - 17, w - 6, 38);
    ctx.fillStyle = '#17110a'; ctx.fillText(n, cx, y - 6);
    if (title) { ctx.font = '13px Type'; ctx.fillStyle = 'rgba(23,17,10,0.8)'; ctx.fillText(title.replace(/^the /i, '').toUpperCase(), cx, y + 12); }
    ctx.restore();
}
function ribbon(ctx, text, y = 424, color = C.amber) {
    ctx.save(); ctx.fillStyle = 'rgba(6,4,10,0.86)'; ctx.fillRect(0, y, W, 44); ctx.fillStyle = color; ctx.fillRect(0, y, W, 2); ctx.fillRect(0, y + 42, W, 2);
    ctx.fillStyle = C.ivory; ctx.font = '20px EB-Semi'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = wrap(ctx, text, W - 60).slice(0, 2); const lh = 21, top = y + 22 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + i * lh)); ctx.restore();
}
function heading(ctx, kick, title, color = C.amberHi, size = 36) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '17px Type'; outlined(ctx, kick.toUpperCase(), W / 2, 34, color, 5);
    ctx.font = `${size}px PF-Black`; outlined(ctx, title.toUpperCase(), W / 2, 72, '#fff7e0', 8);
}
/** sprite, optionally kept in shadow (not the one talking) */
function actor(ctx, img, cx, bottom, h, o = {}) {
    if (!img) return; drawSprite(ctx, img, cx, bottom, h, o);
    if (o.shadowed) { ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.restore(); ctx.fillStyle = 'rgba(4,3,8,0.42)'; const s = h / img.height, w = img.width * s; ctx.save(); ctx.beginPath(); ctx.rect(cx - w / 2, bottom - h, w, h); ctx.clip(); ctx.globalAlpha = 0.42; ctx.fillRect(cx - w / 2, bottom - h, w, h); ctx.restore(); }
}

/** two or more guests meet in a room while searching */
async function roomSceneCard({ roomId, roomName, who, line, round }) {
    const bg = await bgOf(roomId); const imgs = await Promise.all(who.map((w) => spr(w.charId)));
    return card(async (ctx) => {
        cover(ctx, bg, 1.12); dim(ctx, 0.46);
        // window light shaft
        const sh = ctx.createLinearGradient(W * 0.1, 0, W * 0.55, H); sh.addColorStop(0, 'rgba(255,226,160,0.16)'); sh.addColorStop(1, 'rgba(255,226,160,0)');
        ctx.fillStyle = sh; ctx.beginPath(); ctx.moveTo(W * 0.05, 0); ctx.lineTo(W * 0.3, 0); ctx.lineTo(W * 0.7, H); ctx.lineTo(W * 0.3, H); ctx.closePath(); ctx.fill();
        const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.65)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        heading(ctx, `Round ${round} · they crossed paths`, roomName.replace(/^the /i, ''), C.amberHi, 38);
        const n = who.length, span = Math.min(W - 120, 150 * n), x0 = W / 2 - span / 2 + span / (2 * n), step = span / n;
        // back row slightly smaller for depth when 4+ people
        const order = who.map((w, i) => i).sort((a, b) => (n > 3 ? (a % 2) - (b % 2) : 0));
        order.forEach((i) => {
            const back = n > 3 && i % 2 === 1, x = x0 + i * step, h = Math.min(back ? 200 : 240, step * 2.0), bottom = back ? 352 : 372;
            ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(x, bottom + 2, h * 0.24, 7, 0, 0, 7); ctx.fill(); ctx.restore();
            actor(ctx, imgs[i], x, bottom, h, { flip: i >= n / 2 });
        });
        who.forEach((w, i) => { const back = n > 3 && i % 2 === 1; nameplate(ctx, w.name, n <= 3 ? titleOf(w.charId) : '', x0 + i * step, (back ? 352 : 372) + 20, !back, step - 6); });
        ribbon(ctx, line, 424); film(ctx);
    });
}

/** a guest is pressed in public; their account is read out */
async function pressCard({ asker, target, quote, round }) {
    const bg = await bgOf('library'); const [a, t] = await Promise.all([spr(asker.charId), spr(target.charId)]);
    return card(async (ctx) => {
        cover(ctx, bg, 1.1); dim(ctx, 0.66);
        lamp(ctx, 470, 372, 150, 0.36);
        heading(ctx, `Round ${round} · pressed in public`, 'Where were you?', '#ff9d9d', 38);
        actor(ctx, a, 105, 372, 225, { shadowed: true });
        actor(ctx, t, 505, 372, 255, { flip: true });
        nameplate(ctx, asker.name, titleOf(asker.charId), 105, 392, false); nameplate(ctx, target.name, titleOf(target.charId), 505, 392, true);
        // the statement on file
        paper(ctx, 188, 118, 232, 196, -0.035);
        ctx.save(); ctx.translate(188 + 116, 118 + 98); ctx.rotate(-0.035);
        ctx.fillStyle = '#6a5a38'; ctx.font = '13px Type'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`STATEMENT OF ${lastName(target.name).toUpperCase()}`, 0, -92);
        ctx.fillStyle = '#c0182f'; ctx.fillRect(-84, -74, 168, 2);
        ctx.fillStyle = '#1b1620'; ctx.font = '19px EB-Semi'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        wrap(ctx, `“${quote}”`, 192).slice(0, 7).forEach((l, i) => ctx.fillText(l, 0, -62 + i * 24));
        ctx.restore();
        stampMark(ctx, 'ON THE RECORD', 322, 322, '#b5182c', -0.12, 18);
        ribbon(ctx, `${asker.name} presses ${target.name}. Does it hold up?`, 424, '#c8324a'); film(ctx);
    });
}

/** evidence laid on the table */
async function evidenceCard({ art, roomName, line, by, trace }) {
    const bg = await bgOf('study').then((b) => b || bgOf('library')); const clue = art ? await cards.loadClue(art).catch(() => null) : null; const s = by ? await spr(by.charId) : null;
    return card(async (ctx) => {
        cover(ctx, bg, 1.1); dim(ctx, 0.7); lamp(ctx, 200, 330, 190, 0.3, trace ? '255,170,170' : '255,226,160');
        heading(ctx, trace ? 'The trace — this changes everything' : 'Evidence laid on the table', roomName.replace(/^the /i, 'Found in the '), trace ? '#ff9d9d' : C.amberHi, 32);
        // polaroid
        ctx.save(); ctx.translate(200, 252); ctx.rotate(-0.07); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8; ctx.fillStyle = '#f1ead6'; ctx.fillRect(-128, -112, 256, 232); ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#1d1824'; ctx.fillRect(-114, -98, 228, 172); if (clue) { ctx.save(); ctx.beginPath(); ctx.rect(-114, -98, 228, 172); ctx.clip(); const k = Math.max(228 / clue.width, 172 / clue.height); ctx.drawImage(clue, -clue.width * k / 2, -12 - clue.height * k / 2, clue.width * k, clue.height * k); ctx.restore(); }
        ctx.fillStyle = '#18121c'; ctx.font = '16px Type'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(trace ? 'EXHIBIT A' : 'EXHIBIT', 0, 98);
        ctx.fillStyle = '#c0182f'; ctx.beginPath(); ctx.arc(0, -112, 7, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(-2, -114, 2, 0, 7); ctx.fill(); ctx.restore();
        if (s) { actor(ctx, s, 548, 372, 190, { flip: true }); nameplate(ctx, by.name, titleOf(by.charId), 548, 392, true); }
        paper(ctx, 345, 130, 190, 128, 0.03);
        ctx.fillStyle = '#1b1620'; ctx.font = '18px EB-Semi'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        wrap(ctx, line, 160).slice(0, 4).forEach((l, i) => ctx.fillText(l, 362, 148 + i * 24));
        if (trace) stampMark(ctx, 'EVIDENCE', 470, 276, '#b5182c', 0.1, 18);
        ribbon(ctx, by ? `${by.name} lays it on the table.` : 'Laid on the table.', 424, trace ? '#c8324a' : C.amber); film(ctx);
    });
}

/** a public accusation (with tally) */
async function accuseCard({ accuser, target, count, need }) {
    const bg = await bgOf('greatroom'); const [a, t] = await Promise.all([spr(accuser.charId), spr(target.charId)]);
    return card(async (ctx) => {
        const hot = count >= need;
        cover(ctx, bg, 1.1); dim(ctx, 0.68);
        if (hot) { ctx.fillStyle = 'rgba(120,10,24,0.32)'; ctx.fillRect(0, 0, W, H); }
        lamp(ctx, 505, 380, 150, 0.4, hot ? '255,150,150' : '255,226,160');
        heading(ctx, hot ? 'The room has decided' : 'An accusation', `${lastName(target.name)}!`, '#ff7a7a', 40);
        actor(ctx, a, 105, 372, 215, { shadowed: true }); actor(ctx, t, 515, 372, 258, { flip: true });
        nameplate(ctx, accuser.name, titleOf(accuser.charId), 105, 392, false); nameplate(ctx, target.name, titleOf(target.charId), 515, 392, true);
        // pointing line
        ctx.strokeStyle = 'rgba(255,90,90,0.8)'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(180, 262); ctx.lineTo(430, 262); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,90,90,0.95)'; ctx.beginPath(); ctx.moveTo(444, 262); ctx.lineTo(424, 250); ctx.lineTo(424, 274); ctx.fill();
        // vote pips
        const pw = 34, gap = 10, total = need * pw + (need - 1) * gap, px0 = 312 - total / 2;
        for (let i = 0; i < need; i++) {
            const x = px0 + i * (pw + gap) + pw / 2, y = 160, on = i < count;
            ctx.beginPath(); ctx.arc(x, y, pw / 2, 0, 7); ctx.fillStyle = on ? (hot ? '#d4202f' : '#e0bd5c') : 'rgba(12,9,16,0.85)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = on ? '#fff3d0' : 'rgba(236,226,200,0.45)'; ctx.stroke();
            if (on) { ctx.fillStyle = '#16100a'; ctx.font = '20px PF-Black'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', x, y + 1); }
        }
        ctx.font = '60px PF-Black'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; outlined(ctx, `${count}/${need}`, 312, 215, hot ? '#ff5a5a' : '#fff7e0', 10);
        stampMark(ctx, hot ? 'CONVICTED' : 'ACCUSED', 312, 318, hot ? '#e0283a' : '#d8c27a', hot ? -0.1 : 0.08, hot ? 30 : 24);
        ribbon(ctx, `${accuser.name} accuses ${target.name}.${hot ? ' The majority agrees.' : ' ' + (need - count) + ' more to convict now.'}`, 424, '#c8324a'); film(ctx);
    });
}

module.exports = { roomSceneCard, pressCard, evidenceCard, accuseCard };
