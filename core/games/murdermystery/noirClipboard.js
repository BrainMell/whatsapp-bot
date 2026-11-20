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

// ---------- scenery ----------
function drawDesk(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b130f'); g.addColorStop(1, '#0e0a08');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.08;
  for (let x = 0; x < W; x += 9 + (x % 7)) { ctx.fillStyle = (x % 2) ? '#000' : '#6b4a2c'; ctx.fillRect(x, 0, 2, H); }
  ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}

function drawBoard(ctx) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
  const g = ctx.createLinearGradient(0, 70, 0, 1310);
  g.addColorStop(0, '#6a4528'); g.addColorStop(1, '#4a2e1a');
  ctx.fillStyle = g; rr(ctx, 40, 70, 1000, 1240, 26); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4; rr(ctx, 44, 74, 992, 1232, 24); ctx.stroke();
  // paper
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#efe6cf'; ctx.fillRect(75, 140, 930, 1140);
  ctx.restore();
  ctx.strokeStyle = 'rgba(70,50,30,0.10)'; ctx.lineWidth = 1;
  for (let y = 170; y < 1280; y += 30) { ctx.beginPath(); ctx.moveTo(75, y); ctx.lineTo(1005, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(190,60,60,0.25)'; ctx.beginPath(); ctx.moveTo(110, 140); ctx.lineTo(110, 1280); ctx.stroke();
  // metal clip
  const cg = ctx.createLinearGradient(0, 40, 0, 140);
  cg.addColorStop(0, '#d9dde0'); cg.addColorStop(0.5, '#8f959a'); cg.addColorStop(1, '#5d6368');
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
  ctx.fillStyle = cg; rr(ctx, 410, 38, 260, 98, 14); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#2a2d30'; rr(ctx, 480, 60, 120, 18, 9); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; rr(ctx, 414, 42, 252, 90, 12); ctx.stroke();
}

function pushPin(ctx, x, y, color = '#c0182f') {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 11);
  g.addColorStop(0, '#ff8d8d'); g.addColorStop(0.45, color); g.addColorStop(1, '#5e0a16');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
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
function drawString(ctx, a, b, o = {}) {
  const sag = o.sag == null ? 34 : o.sag;
  const c = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + sag };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
  ctx.strokeStyle = o.color || '#b3122a'; ctx.lineWidth = o.width || 4;
  if (o.dash) ctx.setLineDash(o.dash);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, b.x, b.y); ctx.stroke();
  ctx.setLineDash([]); ctx.shadowColor = 'transparent';
  if (o.arrow) {
    const t = 0.86, p = qpoint(a, c, b, t), d = qtangent(a, c, b, t), L = Math.hypot(d.x, d.y) || 1, ux = d.x / L, uy = d.y / L;
    ctx.fillStyle = o.color || '#b3122a';
    ctx.beginPath(); ctx.moveTo(p.x + ux * 14, p.y + uy * 14); ctx.lineTo(p.x - ux * 6 - uy * 10, p.y - uy * 6 + ux * 10); ctx.lineTo(p.x - ux * 6 + uy * 10, p.y - uy * 6 - ux * 10); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  return qpoint(a, c, b, o.labelAt || 0.5);
}
function tag(ctx, text, x, y, color) {
  ctx.save();
  ctx.font = '15px Type';
  const w = ctx.measureText(text).width + 18, h = 24;
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#fbf4de'; rr(ctx, x - w / 2, y - h / 2, w, h, 6); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = color; ctx.lineWidth = 2; rr(ctx, x - w / 2, y - h / 2, w, h, 6); ctx.stroke();
  ctx.fillStyle = '#2a1a14'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
  ctx.restore();
}

// ---------- pinned guest card ----------
async function drawGuest(ctx, g, x, y, w, h) {
  const rot = ((hash(g.charId) % 7) - 3) * 0.006;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, w, h);
  ctx.shadowColor = 'transparent';
  // portrait window
  const pw = w - 24, ph = 112;
  ctx.fillStyle = '#1b1620'; ctx.fillRect(12, 12, pw, ph);
  try {
    const img = await cards.loadSprite(spriteStem(g));
    const srcH = img.height * 0.30, srcW = Math.min(img.width, srcH * (pw / ph));
    ctx.drawImage(img, (img.width - srcW) / 2, 0, srcW, srcH, 12, 12, pw, ph);
  } catch (e) { /* blank window */ }
  if (g.alive === false) {
    ctx.fillStyle = 'rgba(13,11,16,0.55)'; ctx.fillRect(12, 12, pw, ph);
    ctx.strokeStyle = '#c8324a'; ctx.lineWidth = 7; ctx.beginPath();
    ctx.moveTo(30, 28); ctx.lineTo(w - 30, ph - 4); ctx.moveTo(w - 30, 28); ctx.lineTo(30, ph - 4); ctx.stroke();
  }
  ctx.fillStyle = '#1a1512'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = '19px PF-Bold'; ctx.fillText(shortName(g.name) === g.name ? g.name : g.name, w / 2, 130, w - 14);
  ctx.font = '15px EB-Semi'; ctx.fillStyle = '#5a4a38'; ctx.fillText(g.title || '', w / 2, 153, w - 14);
  ctx.font = '13px Type'; ctx.fillStyle = '#2a1a14';
  const lines = [];
  if (g.claims && (g.claims['10 PM'] || g.claims['11 PM'])) {
    if (g.claims['10 PM']) lines.push('10 PM: ' + String(g.claims['10 PM']).replace(/^the /i, ''));
    if (g.claims['11 PM']) lines.push('11 PM: ' + String(g.claims['11 PM']).replace(/^the /i, ''));
  } else lines.push('no statement yet');
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, w / 2, 176 + i * 16, w - 14));
  ctx.restore();
}

// ---------- clue card ----------
async function drawClue(ctx, k, x, y, w, h, o) {
  const rot = ((hash(k.cid) % 9) - 4) * 0.0055;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
  if (o.highlight) {
    ctx.shadowColor = 'rgba(255,214,90,0.95)'; ctx.shadowBlur = 38;
  } else { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5; }
  ctx.fillStyle = k.isTrace ? '#f6e3dc' : '#fffaf0'; ctx.fillRect(0, 0, w, h);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  const artH = Math.round(h * 0.52);
  ctx.fillStyle = '#1d1824'; ctx.fillRect(8, 14, w - 16, artH);
  let clue = k.art ? await cards.loadClue(k.art).catch(() => null) : null;
  if (!clue && k.roomId) clue = await cards.loadBg(k.roomId).catch(() => null);   // no prop (a fall, a pillow): show the room
  if (clue) {
    const s = Math.max((w - 16) / clue.width, artH / clue.height);
    ctx.save(); ctx.beginPath(); ctx.rect(8, 14, w - 16, artH); ctx.clip();
    ctx.drawImage(clue, 8 + (w - 16) / 2 - clue.width * s / 2, 14 + artH / 2 - clue.height * s / 2, clue.width * s, clue.height * s);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(8, 14 + artH - 24, w - 16, 24);
  ctx.fillStyle = '#fff3d6'; ctx.font = '15px Type'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(String(k.roomName || '').replace(/^the /i, ''), 14, 14 + artH - 11, w - 60);
  // order badge
  ctx.fillStyle = '#b3122a'; ctx.beginPath(); ctx.arc(w - 26, 40, 17, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '19px PF-Black'; ctx.textAlign = 'center'; ctx.fillText(String(o.order), w - 26, 41);
  // text
  ctx.fillStyle = '#1a1512'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '15px EB-Semi';
  const room = h - artH - 14 - 26;
  const maxLines = Math.max(2, Math.floor(room / 17));
  wrapLines(ctx, k.line, w - 20, maxLines).forEach((l, i) => ctx.fillText(l, 10, 14 + artH + 6 + i * 17));
  ctx.font = '12px Type'; ctx.fillStyle = '#7a6a58';
  const foot = k.shared === false ? 'PRIVATE' : (k.by && k.by.name ? 'laid by ' + shortName(k.by.name) : '');
  ctx.fillText(foot, 10, h - 17);
  if (k.shared === false) {
    ctx.setLineDash([7, 5]); ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 2.5; ctx.strokeRect(3, 3, w - 6, h - 6); ctx.setLineDash([]);
  }
  if (k.isTrace) {
    ctx.save(); ctx.translate(w - 62, h - 22); ctx.rotate(-0.15); ctx.strokeStyle = '#b3122a'; ctx.lineWidth = 2.5; ctx.fillStyle = '#b3122a';
    ctx.font = '14px Type'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeRect(-48, -11, 96, 22); ctx.fillText('THE TRACE', 0, 1); ctx.restore();
  }
  if (o.highlight) {
    ctx.save(); ctx.translate(18, 8); ctx.rotate(-0.12);
    ctx.fillStyle = '#e0bd5c'; ctx.fillRect(-14, -4, 78, 26); ctx.fillStyle = '#2a1a14'; ctx.font = '17px PF-Black'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('NEW', 25, 10);
    ctx.restore();
  }
  ctx.restore();
}

// ---------- main ----------
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

    // header
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1a1512'; ctx.font = '50px PF-Black';
    ctx.fillText(mode === 'private' ? 'YOUR CLIPBOARD' : 'THE CASE BOARD', W / 2, 190);
    ctx.font = '19px Type'; ctx.fillStyle = '#5a4a38';
    const sub = (opts.victimName ? opts.victimName + ' · ' : '') + 'Round ' + (opts.round || 1) + ' of ' + (opts.rounds || 3) + (mode === 'private' && opts.viewerName ? ' · ' + opts.viewerName : '');
    ctx.fillText(sub, W / 2, 232, 820);

    // pinned guests
    ctx.textAlign = 'left'; ctx.font = '16px Type'; ctx.fillStyle = '#8a1a2a';
    ctx.fillText('PINNED GUESTS', 125, 268);
    const gw = 200, gh = 214, gy = 282;
    const gnodes = {};
    if (pins.length) {
      const gap = 26, total = pins.length * gw + (pins.length - 1) * gap, gx0 = W / 2 - total / 2;
      for (let i = 0; i < pins.length; i++) {
        const gx = gx0 + i * (gw + gap);
        await drawGuest(ctx, pins[i], gx, gy, gw, gh);
        gnodes[pins[i].charId] = { x: gx + gw / 2, top: { x: gx + gw / 2, y: gy + 6 }, bottom: { x: gx + gw / 2, y: gy + gh - 4 }, g: pins[i] };
      }
    } else {
      ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(90,70,50,0.55)'; ctx.lineWidth = 2.5; ctx.strokeRect(125, gy + 20, 830, 150); ctx.setLineDash([]);
      ctx.textAlign = 'center'; ctx.fillStyle = '#6a5a48'; ctx.font = '22px EB-Semi';
      ctx.fillText('No guests pinned yet', W / 2, gy + 70);
      ctx.font = '17px Type'; ctx.fillText('Pin a guest next to the clues:  ' + prefix + ' mm pin <number>', W / 2, gy + 108);
    }

    // timeline columns
    const colX = [105, 405, 705], colW = 270, headY = 552;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    SLOTS.forEach((s, i) => {
      ctx.fillStyle = '#1a1512'; ctx.font = '30px PF-Black'; ctx.fillText(s, colX[i] + colW / 2, headY);
      ctx.strokeStyle = '#8a1a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(colX[i] + 40, headY + 22); ctx.lineTo(colX[i] + colW - 40, headY + 22); ctx.stroke();
      if (i < 2) {
        ctx.fillStyle = '#8a1a2a'; const ax = colX[i] + colW + 15; ctx.beginPath(); ctx.moveTo(ax + 12, headY); ctx.lineTo(ax - 4, headY - 9); ctx.lineTo(ax - 4, headY + 9); ctx.closePath(); ctx.fill();
      }
    });

    const cols = [[], [], []];
    for (const k of clues) cols[Math.min(2, slotIdx(k.slot))].push(k);
    const maxRows = Math.max(1, ...cols.map((c) => Math.min(3, c.length)));
    const top = 592, bottom = 1186, gapY = 14;
    const ch = Math.min(228, Math.floor((bottom - top - (maxRows - 1) * gapY) / maxRows));
    const nodes = {};
    let order = 0;
    const orderOf = {};
    for (const k of clues) orderOf[k.cid] = ++order;
    const drawn = [];
    for (let ci = 0; ci < 3; ci++) {
      const list = cols[ci];
      if (!list.length) {
        ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(90,70,50,0.5)'; ctx.font = '18px Type';
        ctx.fillText('— nothing found —', colX[ci] + colW / 2, top + 60);
        continue;
      }
      for (let ri = 0; ri < Math.min(3, list.length); ri++) {
        const k = list[ri], x = colX[ci], y = top + ri * (ch + gapY);
        await drawClue(ctx, k, x, y, colW, ch, { order: orderOf[k.cid], highlight: opts.highlight && opts.highlight === k.cid });
        nodes[k.cid] = { top: { x: x + colW / 2, y: y + 6 }, left: { x: x + 4, y: y + ch / 2 }, right: { x: x + colW - 4, y: y + ch / 2 }, k };
        drawn.push(k);
      }
      if (list.length > 3) {
        ctx.textAlign = 'center'; ctx.fillStyle = '#8a1a2a'; ctx.font = '16px Type';
        ctx.fillText('+' + (list.length - 3) + ' more on the board', colX[ci] + colW / 2, top + 3 * (ch + gapY) - 6);
      }
    }

    // ----- strings -----
    const tagQueue = [];
    // (a) per-guest chains: pinned guest -> first find -> next find ... in time order
    const byWho = {};
    for (const k of drawn) if (k.who) (byWho[k.who] = byWho[k.who] || []).push(k);
    const chainedPairs = new Set();
    for (const [who, list] of Object.entries(byWho)) {
      const gn = gnodes[who];
      if (!gn && list.length < 2) continue;
      const who0 = list[0].whoName ? shortName(list[0].whoName) : '';
      let prev = gn ? gn.bottom : null, first = true;
      for (const k of list) {
        const nd = nodes[k.cid];
        if (prev) {
          const mid = drawString(ctx, prev, nd.top, { color: '#b3122a', arrow: true, sag: gn && first ? 22 : 40, labelAt: gn && first ? 0.16 : 0.5 });
          if (first && gn) { gn.n = (gn.n || 0) + 1; tagQueue.push({ t: 'points to', x: gn.bottom.x + (gn.n - 1) * 0, y: gn.bottom.y + 18, c: '#b3122a', pin: true }); }
          else tagQueue.push({ t: 'then', x: mid.x, y: mid.y, c: '#b3122a' });
          if (!first) chainedPairs.add(list[list.indexOf(k) - 1].cid + '|' + k.cid);
        } else if (!gn) {
          // unpinned guest: label the first card of the chain with their name
          tagQueue.push({ t: who0, x: nd.top.x, y: nd.top.y - 20, c: '#b3122a' });
        }
        prev = nd.top; first = false;
      }
    }
    // (b) same room, different hour
    for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) {
      const a = drawn[i], b = drawn[j];
      if (a.roomId !== b.roomId || slotIdx(a.slot) === slotIdx(b.slot)) continue;
      if (chainedPairs.has(a.cid + '|' + b.cid) || chainedPairs.has(b.cid + '|' + a.cid)) continue;
      const na = nodes[a.cid], nb = nodes[b.cid];
      const left = slotIdx(a.slot) < slotIdx(b.slot) ? [na, nb] : [nb, na];
      const mid = drawString(ctx, left[0].right, left[1].left, { color: '#c98a1a', dash: [14, 8], width: 4, sag: 26, arrow: true });
      tagQueue.push({ t: 'same room', x: mid.x, y: mid.y, c: '#c98a1a' });
    }
    // (c) the trace's initial -> pinned guests who carry it
    for (const k of drawn) {
      if (!k.isTrace || !k.initial) continue;
      for (const gn of Object.values(gnodes)) {
        if (initialOf(gn.g.name) !== k.initial) continue;
        const mid = drawString(ctx, gn.bottom, nodes[k.cid].top, { color: '#7a1020', dash: [3, 9], width: 4, sag: 30, labelAt: 0.22 });
        gn.n = (gn.n || 0) + 1; tagQueue.push({ t: 'initial ' + k.initial, x: gn.bottom.x, y: gn.bottom.y + 18, c: '#7a1020', pin: true });
      }
    }
    // pins on every card, then tags on top
    for (const gn of Object.values(gnodes)) pushPin(ctx, gn.top.x, gn.top.y);
    for (const k of drawn) pushPin(ctx, nodes[k.cid].top.x, nodes[k.cid].top.y);
    const placed = [];
    for (const t of tagQueue) {
      let x = t.x, y = t.y, tries = 0;
      const w = t.t.length * 9 + 22;
      const hit = () => placed.some((q) => Math.abs(q.x - x) < (q.w + w) / 2 + 6 && Math.abs(q.y - y) < 28);
      while (hit() && tries < 8) { x = t.x + (tries % 2 ? -1 : 1) * (Math.floor(tries / 2) + 1) * (w / 2 + 40); tries++; }
      x = Math.max(120 + w / 2, Math.min(960 - w / 2, x));
      placed.push({ x, y, w });
      tag(ctx, t.t, x, y, t.c);
    }

    // ----- how-to footer -----
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const fy = 1198;
    ctx.fillStyle = mode === 'popup' ? '#2a1a14' : 'rgba(42,26,20,0.08)';
    rr(ctx, 105, fy, 870, 70, 10); ctx.fill();
    if (mode === 'popup') {
      ctx.fillStyle = '#fff3d6'; ctx.font = '22px PF-Black'; ctx.fillText('NEW CLUE CLIPPED TO YOUR BOARD', W / 2, fy + 22);
      ctx.font = '15px Type'; ctx.fillStyle = '#e8d9b0';
      ctx.fillText('Reply SHARE to pin it for everyone  ·  ' + prefix + ' mm clipboard = full board  ·  ' + prefix + ' mm pin <n> = pin a guest', W / 2, fy + 50, 850);
    } else {
      ctx.fillStyle = '#2a1a14'; ctx.font = '17px Type';
      ctx.fillText(prefix + ' mm clipboard — open the board    ' + prefix + ' mm pin <n> — pin a guest    ' + prefix + ' mm show — share a find', W / 2, fy + 24, 850);
      ctx.font = '14px Type'; ctx.fillStyle = '#6a5a48';
      ctx.fillText('Red string: who a clue points at, in time order  ·  Amber: same room  ·  Number: order found in the night', W / 2, fy + 49, 850);
    }
    return canvas.toBuffer('image/png');
  } catch (e) {
    console.error('[NoirClipboard] render failed:', e.stack || e.message);
    return null;
  }
}

module.exports = { renderClipboard, SLOTS };
