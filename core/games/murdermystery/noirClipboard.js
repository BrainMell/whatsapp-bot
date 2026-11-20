'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  NOIR CLIPBOARD — the detective's case board as ONE big portrait card
//  (1080x1350, 4:5 — fills a large chunk of a phone screen in WhatsApp).
//
//    • top row    : PINNED GUEST cards (portrait, title, what they swore to)
//    • columns    : 9 PM → 10 PM → 11 PM, one clipped clue card per find
//    • red string : links clues to the guest they point at, and runs a guest's
//                   finds in time order (numbered, arrowed). Amber string: same
//                   room, different hour. Dotted: the trace's initial.
//
//  Modes
//    popup   a clue was just found — the NEW clue is highlighted + "how to view"
//    shared  the public table board (clues someone SHARED + pinned guests)
//    private your own board: shared clues + your private finds (dashed)
//
//  Returns a PNG Buffer, or null on any failure (callers fall back to text).
// ═══════════════════════════════════════════════════════════════════════════
const cards = require('./cards');

const W = 1080, H = 1350;
const C = cards.C;
const SLOTS = ['9 PM', '10 PM', '11 PM'];
const slotIdx = (s) => { const i = SLOTS.indexOf(s); return i < 0 ? SLOTS.length - 1 : i; };

const spriteStem = (p) => String((p && (p.sprite || p.charId)) || '').replace(/\.png$/i, '');
const shortName = (n) => String(n || '').split(' ').slice(-1)[0];
const initialOf = (n) => String(n || 'X').trim().charAt(0).toUpperCase();

function hash(s) { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const out = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  if (out.length > maxLines) {
    const cut = out.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    cut[maxLines - 1] = last.replace(/[\s,.;:]+$/, '') + '…';
    return cut;
  }
  return out;
}

// ---------- palette (2026-11-20 remake: leather clipboard, green felt, brass) ----------
const K = {
  felt: '#1c2a24', feltHi: '#26382f', gold: '#c9a13b', goldHi: '#e8cf8a', cream: '#f4ecd6', paper: '#fffaf0', ink: '#1a1512',
  inkSoft: '#5a4a38', string: '#d4202f', stringDeep: '#8f1020', amber: '#e3a22a', mark: '#f2c230',
};
let _seed = 1; const rnd = () => { _seed = (_seed * 16807) % 2147483647; return _seed / 2147483647; };

// ---------- scenery ----------
function drawDesk(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#21160f'); g.addColorStop(1, '#0b0705');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.07;
  for (let x = 0; x < W; x += 8 + (x % 6)) { ctx.fillStyle = (x % 2) ? '#000' : '#7a5230'; ctx.fillRect(x, 0, 2, H); }
  ctx.globalAlpha = 1;
  const lamp = ctx.createRadialGradient(240, 80, 40, 240, 80, 900);
  lamp.addColorStop(0, 'rgba(255,200,120,0.20)'); lamp.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = lamp; ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.88);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

function brassGrad(ctx, y0, y1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#f1dc9a'); g.addColorStop(0.45, '#b98f3a'); g.addColorStop(1, '#6b4f1c'); return g;
}

function drawBoard(ctx) {
  // leather clipboard body
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 44; ctx.shadowOffsetY = 16;
  const g = ctx.createLinearGradient(0, 60, 0, 1310);
  g.addColorStop(0, '#34231a'); g.addColorStop(1, '#1b110c');
  ctx.fillStyle = g; rr(ctx, 40, 60, 1000, 1250, 30); ctx.fill();
  ctx.restore();
  // leather grain
  ctx.save(); rr(ctx, 40, 60, 1000, 1250, 30); ctx.clip(); _seed = 7;
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,220,170,0.035)' : 'rgba(0,0,0,0.10)'; ctx.fillRect(40 + rnd() * 1000, 60 + rnd() * 1250, 2 + rnd() * 3, 2 + rnd() * 3); }
  ctx.restore();
  // stitching
  ctx.save(); ctx.setLineDash([9, 7]); ctx.strokeStyle = 'rgba(214,176,98,0.55)'; ctx.lineWidth = 2.5; rr(ctx, 56, 76, 968, 1218, 22); ctx.stroke(); ctx.restore();
  // felt panel
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 5;
  ctx.fillStyle = K.felt; ctx.fillRect(78, 150, 924, 1120);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(78, 150, 924, 1120); ctx.clip(); _seed = 31;
  for (let i = 0; i < 5200; i++) { ctx.fillStyle = rnd() > 0.5 ? 'rgba(180,230,200,0.045)' : 'rgba(0,0,0,0.12)'; ctx.fillRect(78 + rnd() * 924, 150 + rnd() * 1120, 1 + rnd() * 2, 1 + rnd() * 2); }
  const fv = ctx.createRadialGradient(W / 2, 600, 200, W / 2, 700, 760);
  fv.addColorStop(0, 'rgba(60,90,74,0.30)'); fv.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = fv; ctx.fillRect(78, 150, 924, 1120);
  ctx.restore();
  ctx.strokeStyle = 'rgba(201,161,59,0.7)'; ctx.lineWidth = 2; ctx.strokeRect(92, 164, 896, 1092);
  ctx.strokeStyle = 'rgba(201,161,59,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(97, 169, 886, 1082);
  // brass clip
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
  ctx.fillStyle = brassGrad(ctx, 100, 170); rr(ctx, 350, 112, 380, 52, 10); ctx.fill();               // arm
  ctx.fillStyle = brassGrad(ctx, 30, 150); rr(ctx, 400, 30, 280, 112, 18); ctx.fill();               // body
  ctx.restore();
  ctx.fillStyle = '#17120a'; rr(ctx, 470, 56, 140, 20, 10); ctx.fill();                              // slot
  ctx.strokeStyle = 'rgba(255,245,205,0.55)'; ctx.lineWidth = 2; rr(ctx, 405, 35, 270, 102, 15); ctx.stroke();
  for (const rx of [430, 650]) { const rg = ctx.createRadialGradient(rx - 2, 100, 1, rx, 102, 11); rg.addColorStop(0, '#fff2c0'); rg.addColorStop(1, '#6b4f1c'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(rx, 102, 10, 0, 7); ctx.fill(); }
}

function paperclip(ctx, x, y, rot = 0.2) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
  ctx.strokeStyle = '#c9ced2'; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-6, 22); ctx.lineTo(-6, -14); ctx.arc(0, -14, 6, Math.PI, 0); ctx.lineTo(6, 18); ctx.arc(0, 18, 6, 0, Math.PI); ctx.lineTo(-12, -10); ctx.arc(-3, -10, 9, Math.PI, 0); ctx.stroke();
  ctx.restore();
}
function tack(ctx, x, y, color = K.string) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 11);
  g.addColorStop(0, '#ffb0a8'); g.addColorStop(0.45, color); g.addColorStop(1, '#4a0612');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
/** crime-scene style numbered evidence marker */
function evidenceMarker(ctx, x, y, n) {
  ctx.save(); ctx.translate(x, y);
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  ctx.fillStyle = K.mark; ctx.beginPath(); ctx.moveTo(-20, -18); ctx.lineTo(20, -18); ctx.lineTo(26, 16); ctx.lineTo(-26, 16); ctx.closePath(); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#1a1200'; ctx.font = '26px PF-Black'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), 0, 1);
  ctx.restore();
}
function clockBadge(ctx, cx, cy, hour) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  ctx.fillStyle = brassGrad(ctx, cy - 28, cy + 28); ctx.beginPath(); ctx.arc(cx, cy, 28, 0, 7); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.fillStyle = K.cream; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 7); ctx.fill();
  ctx.strokeStyle = K.ink; ctx.lineCap = 'round';
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 17); ctx.stroke();                              // minute hand @12
  const ha = ((hour % 12) / 12) * Math.PI * 2 - Math.PI / 2;
  ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ha) * 12, cy + Math.sin(ha) * 12); ctx.stroke();
  ctx.restore();
}

// ---------- strings ----------
function qpoint(a, c, b, t) {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}
function qtangent(a, c, b, t) {
  return { x: 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x), y: 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y) };
}
function stringCtrl(a, b, sag) { return { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + (sag == null ? 34 : sag) }; }
function drawString(ctx, a, b, o = {}) {
  const c = stringCtrl(a, b, o.sag);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 4;
  ctx.strokeStyle = o.color || K.string; ctx.lineWidth = o.width || 4.5;
  if (o.dash) ctx.setLineDash(o.dash);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, b.x, b.y); ctx.stroke();
  ctx.setLineDash([]); ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.2; if (o.dash) ctx.setLineDash(o.dash);
  ctx.beginPath(); ctx.moveTo(a.x, a.y - 1); ctx.quadraticCurveTo(c.x, c.y - 1, b.x, b.y - 1); ctx.stroke(); ctx.setLineDash([]);
  if (o.arrow) {
    const t = 0.88, p = qpoint(a, c, b, t), d = qtangent(a, c, b, t), L = Math.hypot(d.x, d.y) || 1, ux = d.x / L, uy = d.y / L;
    ctx.fillStyle = o.color || K.string;
    ctx.beginPath(); ctx.moveTo(p.x + ux * 14, p.y + uy * 14); ctx.lineTo(p.x - ux * 6 - uy * 10, p.y - uy * 6 + ux * 10); ctx.lineTo(p.x - ux * 6 + uy * 10, p.y - uy * 6 - ux * 10); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  return { a, b, c };
}
function tag(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = '15px Type';
  const w = ctx.measureText(text).width + 20, h = 26;
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#f7eed2'; rr(ctx, x - w / 2, y - h / 2, w, h, 5); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = color; ctx.lineWidth = 2; rr(ctx, x - w / 2, y - h / 2, w, h, 5); ctx.stroke();
  ctx.fillStyle = '#2a1a14'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
  ctx.restore();
  return w;
}

// ---------- pinned suspect card (mugshot style) ----------
async function drawGuest(ctx, g, x, y, w, h) {
  const rot = ((hash(g.charId) % 7) - 3) * 0.006;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 7;
  ctx.fillStyle = K.paper; ctx.fillRect(0, 0, w, h);
  ctx.shadowColor = 'transparent';
  // header strip
  ctx.fillStyle = '#2a1d16'; ctx.fillRect(0, 0, w, 24);
  ctx.fillStyle = K.goldHi; ctx.font = '13px Type'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g.alive === false ? 'DECEASED' : 'PERSON OF INTEREST', w / 2 + 12, 13);
  // portrait window with height chart
  const px = 12, py = 34, pw = w - 24, ph = 108;
  ctx.fillStyle = '#d8d0b8'; ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = 'rgba(40,30,20,0.35)'; ctx.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) { const yy = py + 8 + i * ((ph - 16) / 8); ctx.beginPath(); ctx.moveTo(px, yy); ctx.lineTo(px + (i % 2 ? 14 : 24), yy); ctx.stroke(); ctx.beginPath(); ctx.moveTo(px + pw, yy); ctx.lineTo(px + pw - (i % 2 ? 14 : 24), yy); ctx.stroke(); }
  try {
    const img = await cards.loadSprite(spriteStem(g));
    const srcH = img.height * 0.30, srcW = Math.min(img.width, srcH * (pw / ph));
    ctx.save(); ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
    ctx.drawImage(img, (img.width - srcW) / 2, 0, srcW, srcH, px, py, pw, ph); ctx.restore();
  } catch (e) { /* blank window */ }
  if (g.alive === false) {
    ctx.fillStyle = 'rgba(13,11,16,0.55)'; ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#d4202f'; ctx.lineWidth = 7; ctx.beginPath();
    ctx.moveTo(px + 20, py + 14); ctx.lineTo(px + pw - 20, py + ph - 14); ctx.moveTo(px + pw - 20, py + 14); ctx.lineTo(px + 20, py + ph - 14); ctx.stroke();
  }
  ctx.strokeStyle = '#2a1d16'; ctx.lineWidth = 2; ctx.strokeRect(px, py, pw, ph);
  ctx.fillStyle = K.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '19px PF-Bold'; ctx.fillText(g.name, w / 2, 148, w - 14);
  ctx.font = '14px EB-Semi'; ctx.fillStyle = K.inkSoft; ctx.fillText(g.title || '', w / 2, 170, w - 14);
  ctx.font = '12.5px Type'; ctx.fillStyle = '#2a1a14';
  const lines = [];
  if (g.claims && (g.claims['10 PM'] || g.claims['11 PM'])) {
    if (g.claims['10 PM']) lines.push('10 PM: ' + String(g.claims['10 PM']).replace(/^the /i, ''));
    if (g.claims['11 PM']) lines.push('11 PM: ' + String(g.claims['11 PM']).replace(/^the /i, ''));
  } else lines.push('no statement yet');
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, w / 2, 188 + i * 15, w - 14));
  ctx.restore();
}

// ---------- evidence polaroid ----------
async function drawClue(ctx, k, x, y, w, h, o) {
  const rot = ((hash(k.cid) % 9) - 4) * 0.0055;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
  if (o.highlight) { ctx.shadowColor = 'rgba(255,214,90,0.95)'; ctx.shadowBlur = 42; }
  else { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6; }
  ctx.fillStyle = k.isTrace ? '#f8e1d8' : K.paper; ctx.fillRect(0, 0, w, h);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  const artH = Math.round(h * 0.5);
  ctx.fillStyle = '#1d1824'; ctx.fillRect(10, 16, w - 20, artH);
  let clue = k.art ? await cards.loadClue(k.art).catch(() => null) : null;
  if (!clue && k.roomId) clue = await cards.loadBg(k.roomId).catch(() => null);   // no prop (a fall, a pillow): show the room
  if (clue) {
    const s = Math.max((w - 20) / clue.width, artH / clue.height);
    ctx.save(); ctx.beginPath(); ctx.rect(10, 16, w - 20, artH); ctx.clip();
    ctx.drawImage(clue, 10 + (w - 20) / 2 - clue.width * s / 2, 16 + artH / 2 - clue.height * s / 2, clue.width * s, clue.height * s);
    ctx.restore();
  }
  // room caption strip
  ctx.fillStyle = 'rgba(8,6,12,0.68)'; ctx.fillRect(10, 16 + artH - 24, w - 20, 24);
  ctx.fillStyle = '#fff3d6'; ctx.font = '14px Type'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(String(k.roomName || '').replace(/^the /i, '').toUpperCase(), 16, 16 + artH - 11, w - 40);
  // typed line
  ctx.fillStyle = K.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '15px EB-Semi';
  const room = h - artH - 16 - 28;
  const maxLines = Math.max(2, Math.floor(room / 17));
  wrapLines(ctx, k.line, w - 24, maxLines).forEach((l, i) => ctx.fillText(l, 12, 16 + artH + 7 + i * 17));
  ctx.font = '12px Type'; ctx.fillStyle = '#7a6a58';
  ctx.fillText(k.shared === false ? 'PRIVATE — only you' : (k.by && k.by.name ? 'laid by ' + shortName(k.by.name) : ''), 12, h - 20);
  if (k.shared === false) {
    ctx.setLineDash([8, 6]); ctx.strokeStyle = '#a8742a'; ctx.lineWidth = 2.5; ctx.strokeRect(3, 3, w - 6, h - 6); ctx.setLineDash([]);
  }
  if (k.isTrace) {
    ctx.save(); ctx.translate(w - 66, h - 24); ctx.rotate(-0.15); ctx.strokeStyle = '#b3122a'; ctx.fillStyle = '#b3122a'; ctx.globalAlpha = 0.9; ctx.lineWidth = 2.5;
    ctx.font = '14px Type'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeRect(-50, -12, 100, 24); ctx.fillText('THE TRACE', 0, 1); ctx.restore();
  }
  ctx.restore();
  return rot;
}
function newBadge(ctx, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12);
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#e0bd5c'; ctx.fillRect(-4, -14, 74, 28); ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#2a1a14'; ctx.font = '19px PF-Black'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('NEW', 33, 1);
  ctx.restore();
}

// ---------- main ----------
const rectsHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

async function renderClipboard(opts) {
  try {
    cards.registerFonts();
    const { createCanvas } = cards.cv();
    const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
    const prefix = opts.prefix || '.j';
    const mode = opts.mode || 'shared';
    const clues = (opts.clues || []).slice().sort((a, b) => slotIdx(a.slot) - slotIdx(b.slot) || (a.round || 0) - (b.round || 0) || String(a.cid).localeCompare(String(b.cid), 'en', { numeric: true }));
    const pins = (opts.pins || []).slice(0, 4);

    drawDesk(ctx); drawBoard(ctx);

    // ----- header -----
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = K.cream; ctx.font = '50px PF-Black';
    ctx.fillText(mode === 'popup' ? 'NEW CLUE FOUND' : mode === 'private' ? 'YOUR CLIPBOARD' : 'THE CASE BOARD', W / 2, 206, 800);
    ctx.font = '19px Type'; ctx.fillStyle = K.goldHi;
    const sub = (opts.victimName ? opts.victimName + ' · ' : '') + (mode === 'private' && opts.viewerName ? opts.viewerName : 'Blackvale Manor');
    ctx.fillText(sub, W / 2, 248, 800);
    // case number + round pips
    ctx.textAlign = 'left'; ctx.font = '14px Type'; ctx.fillStyle = 'rgba(232,207,138,0.75)';
    ctx.fillText('CASE Nº ' + (1000 + hash(opts.victimName || 'blackvale') % 9000), 118, 196);
    const rounds = opts.rounds || 3, rnow = opts.round || 1;
    for (let i = 0; i < rounds; i++) {
      const px = 940 - (rounds - 1 - i) * 26;
      ctx.beginPath(); ctx.arc(px, 196, 8, 0, 7); ctx.fillStyle = i < rnow ? K.gold : 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.strokeStyle = 'rgba(232,207,138,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.textAlign = 'right'; ctx.fillText('ROUND ' + rnow + ' / ' + rounds, 912 - (rounds - 1) * 26, 196); ctx.textAlign = 'left';
    ctx.strokeStyle = K.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(300, 272); ctx.lineTo(780, 272); ctx.stroke();

    // ----- layout: suspects -----
    ctx.textAlign = 'left'; ctx.font = '15px Type'; ctx.fillStyle = K.goldHi;
    ctx.fillText('SUSPECTS', 118, 292);
    const gw = 200, gh = 218, gy = 306;
    const gnodes = {}, blocks = [];
    if (pins.length) {
      const gap = 24, total = pins.length * gw + (pins.length - 1) * gap, gx0 = W / 2 - total / 2;
      pins.forEach((g, i) => {
        const gx = gx0 + i * (gw + gap);
        gnodes[g.charId] = { x: gx + gw / 2, bottom: { x: gx + gw / 2, y: gy + gh - 6 }, g, gx };
        blocks.push({ x: gx - 4, y: gy - 4, w: gw + 8, h: gh + 8 });
      });
    }

    // ----- layout: timeline -----
    const colX = [95, 405, 715], colW = 270, railY = 590;
    const cols = [[], [], []];
    for (const k of clues) cols[Math.min(2, slotIdx(k.slot))].push(k);
    const maxRows = Math.max(1, ...cols.map((c) => Math.min(3, c.length)));
    const anyMore = cols.some((c) => c.length > 3);
    const top = 634, bottom = 1172 - (anyMore ? 22 : 0), gapY = 16;
    const ch = Math.min(188, Math.floor((bottom - top - (maxRows - 1) * gapY) / maxRows));
    const nodes = {}, drawn = [], orderOf = {};
    let order = 0; for (const k of clues) orderOf[k.cid] = ++order;
    cols.forEach((list, ci) => list.slice(0, 3).forEach((k, ri) => {
      const x = colX[ci], y = top + ri * (ch + gapY);
      nodes[k.cid] = { x, y, top: { x: x + colW / 2, y: y + 12 }, left: { x: x + 6, y: y + ch / 2 }, right: { x: x + colW - 6, y: y + ch / 2 }, k };
      blocks.push({ x: x + 12, y: y - 2, w: colW - 24, h: ch + 4 }); drawn.push(k);
    }));

    blocks.push({ x: 100, y: railY - 36, w: 880, h: 72 });
    // ----- timeline rail -----
    ctx.strokeStyle = 'rgba(201,161,59,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(100, railY); ctx.lineTo(980, railY); ctx.stroke();
    SLOTS.forEach((s, i) => {
      const cx = colX[i] + colW / 2;
      clockBadge(ctx, cx - 52, railY, [9, 10, 11][i]);
      ctx.fillStyle = K.cream; ctx.font = '32px PF-Black'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s, cx - 16, railY + 1);
      if (i < 2) { const ax = colX[i] + colW + 20; ctx.fillStyle = K.gold; ctx.beginPath(); ctx.moveTo(ax + 11, railY); ctx.lineTo(ax - 5, railY - 10); ctx.lineTo(ax - 5, railY + 10); ctx.closePath(); ctx.fill(); }
      if (!cols[i].length) { ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(232,207,138,0.45)'; ctx.font = '18px Type'; ctx.fillText('— nothing found —', cx, top + 70); }
    });
    if (!pins.length) {
      ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(232,207,138,0.5)'; ctx.lineWidth = 2.5; ctx.strokeRect(118, gy + 14, 844, 150); ctx.setLineDash([]);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = K.cream; ctx.font = '23px EB-Semi'; ctx.fillText('No suspects pinned yet', W / 2, gy + 68);
      ctx.font = '17px Type'; ctx.fillStyle = K.goldHi; ctx.fillText('Pin a guest next to the clues:  ' + prefix + ' mm pin <number>', W / 2, gy + 108);
    }

    // ----- strings (drawn BEHIND the cards so they read as threads wound around the pins) -----
    const tagQueue = [], strings = [];
    const byWho = {};
    for (const k of drawn) if (k.who) (byWho[k.who] = byWho[k.who] || []).push(k);
    const chainedPairs = new Set();
    for (const [who, list] of Object.entries(byWho)) {
      const gn = gnodes[who];
      if (!gn && list.length < 2) continue;
      let prev = gn ? gn.bottom : null, first = true;
      for (let i = 0; i < list.length; i++) {
        const k = list[i], nd = nodes[k.cid];
        if (prev) {
          const s = drawString(ctx, prev, nd.top, { color: K.string, arrow: true, sag: gn && first ? 22 : 44 });
          strings.push(s);
          if (first && gn) tagQueue.push({ t: 'points to', c: K.string, home: { x: gn.bottom.x, y: gy + gh + 22 }, s, ts: [0.14, 0.22, 0.3] });
          else tagQueue.push({ t: 'then', c: K.string, s, ts: [0.5, 0.35, 0.65, 0.2, 0.8] });
          if (!first) chainedPairs.add(list[i - 1].cid + '|' + k.cid);
        } else if (!gn) {
          tagQueue.push({ t: k.whoName ? shortName(k.whoName) : '?', c: K.string, home: { x: nd.top.x, y: nd.top.y - 26 } });
        }
        prev = nd.top; first = false;
      }
    }
    for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
      const a = drawn[i], b = drawn[j];
      if (a.roomId !== b.roomId || slotIdx(a.slot) === slotIdx(b.slot)) continue;
      if (chainedPairs.has(a.cid + '|' + b.cid) || chainedPairs.has(b.cid + '|' + a.cid)) continue;
      const na = nodes[a.cid], nb = nodes[b.cid];
      const left = slotIdx(a.slot) < slotIdx(b.slot) ? [na, nb] : [nb, na];
      const s = drawString(ctx, left[0].right, left[1].left, { color: K.amber, dash: [14, 8], width: 4.5, sag: 26, arrow: true });
      strings.push(s); tagQueue.push({ t: 'same room', c: K.amber, s, ts: [0.5, 0.4, 0.6, 0.3, 0.7] });
    }
    for (const k of drawn) {
      if (!k.isTrace || !k.initial) continue;
      for (const gn of Object.values(gnodes)) {
        if (initialOf(gn.g.name) !== k.initial) continue;
        const s = drawString(ctx, gn.bottom, nodes[k.cid].top, { color: '#ff8a96', dash: [3, 9], width: 4.5, sag: 30 });
        strings.push(s); tagQueue.push({ t: 'initial ' + k.initial, c: '#ff8a96', home: { x: gn.bottom.x, y: gy + gh + 22 }, s, ts: [0.2, 0.3, 0.4] });
      }
    }

    // ----- suspects, then clue cards, then pins/clips -----
    for (const gn of Object.values(gnodes)) await drawGuest(ctx, gn.g, gn.gx, gy, gw, gh);
    for (const k of drawn) {
      const nd = nodes[k.cid];
      await drawClue(ctx, k, nd.x, nd.y, colW, ch, { highlight: opts.highlight && opts.highlight === k.cid });
      paperclip(ctx, nd.x + 30, nd.y + 6, -0.25);
      evidenceMarker(ctx, nd.x + colW - 30, nd.y + 4, orderOf[k.cid]);
      if (opts.highlight && opts.highlight === k.cid) newBadge(ctx, nd.x + 64, nd.y - 4);
    }
    for (const gn of Object.values(gnodes)) { tack(ctx, gn.bottom.x, gn.bottom.y); paperclip(ctx, gn.gx + 24, gy + 4, 0.2); }
    for (const k of drawn) tack(ctx, nodes[k.cid].top.x, nodes[k.cid].top.y);
    // "+N more" tabs sit in their own reserved strip under each column
    cols.forEach((list, ci) => {
      if (list.length > 3) tag(ctx, '+' + (list.length - 3) + ' more on the board', colX[ci] + colW / 2, bottom + 14, K.gold);
    });

    // ----- tags: pick a spot on the string that no card or other tag covers -----
    const placed = [];
    ctx.font = '15px Type';
    for (const t of tagQueue) {
      const w = ctx.measureText(t.t).width + 20, h = 26;
      const cands = [];
      if (t.home) cands.push(t.home);
      if (t.s) for (const u of t.ts) cands.push(qpoint(t.s.a, t.s.c, t.s.b, u));
      let pick = null;
      for (const p of cands) {
        const r = { x: p.x - w / 2 - 3, y: p.y - h / 2 - 3, w: w + 6, h: h + 6 };
        if (r.x < 100 || r.x + r.w > 980) continue;
        if (blocks.some((b) => rectsHit(r, b)) || placed.some((q) => rectsHit(r, q))) continue;
        pick = p; break;
      }
      if (!pick && t.home) {   // fall back: slide the home spot sideways until clear (never detach a label from its string)
        const base = t.home;
        for (let n = 0; n < 10 && !pick; n++) {
          const p = { x: base.x + (n % 2 ? -1 : 1) * (Math.floor(n / 2) + 1) * (w / 2 + 14), y: base.y };
          const r = { x: p.x - w / 2 - 3, y: p.y - h / 2 - 3, w: w + 6, h: h + 6 };
          if (r.x < 100 || r.x + r.w > 980) continue;
          if (!blocks.some((b) => rectsHit(r, b)) && !placed.some((q) => rectsHit(r, q))) pick = p;
        }
      }
      if (!pick) continue;   // nowhere clean to put it: skip the label rather than cover a clue
      placed.push({ x: pick.x - w / 2 - 3, y: pick.y - h / 2 - 3, w: w + 6, h: h + 6 });
      tag(ctx, t.t, pick.x, pick.y, t.c);
    }

    // ----- how-to plate -----
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const fy = 1190, fh = 66;
    if (mode === 'popup') {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
      ctx.fillStyle = K.gold; rr(ctx, 108, fy, 864, fh, 10); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#17110a'; ctx.font = '23px PF-Black'; ctx.fillText('CLIPPED TO YOUR BOARD — REPLY SHARE TO SHOW THE TABLE', W / 2, fy + 21, 840);
      ctx.font = '15px Type'; ctx.fillText(prefix + ' mm clipboard = full board   ·   ' + prefix + ' mm pin <n> = pin a suspect', W / 2, fy + 47, 840);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, 108, fy, 864, fh, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(201,161,59,0.6)'; ctx.lineWidth = 1.5; rr(ctx, 108, fy, 864, fh, 10); ctx.stroke();
      ctx.fillStyle = K.cream; ctx.font = '16px Type';
      ctx.fillText(prefix + ' mm clipboard — open board    ' + prefix + ' mm pin <n> — pin a suspect    ' + prefix + ' mm show — share a find', W / 2, fy + 22, 840);
      ctx.font = '13px Type'; ctx.fillStyle = 'rgba(232,207,138,0.8)';
      ctx.fillText('Red string: who a clue points at, in time order  ·  Amber: same room  ·  Yellow marker: order found', W / 2, fy + 47, 840);
    }
    return canvas.toBuffer('image/png');
  } catch (e) {
    console.error('[NoirClipboard] render failed:', e.stack || e.message);
    return null;
  }
}

module.exports = { renderClipboard, SLOTS };
