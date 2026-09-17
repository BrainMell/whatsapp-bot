// ============================================
// 💞 SHIP / MATCH METER — image card + scoring engine
// ============================================
// v2 (2026-09-17) - owner rework:
//   * Ship output is now a rendered IMAGE CARD (standalone file, nothing to
//     do with the RPG card system: no lore, no medieval fonts, no factions).
//   * Determination is a transparent multi-factor engine (no more single
//     naive hash), deterministic per pair:
//       1. Name chemistry     (w30) - classic letter algorithms blended
//       2. Interaction history(w35) - real relationship scores from
//                                     socialSystem (null when no data)
//       3. Shared interests   (w20) - likes/hobbies/dislikes overlap
//                                     (null when no profile data)
//       4. Today's spark      (w15) - stable per pair per UTC day
//     Weights renormalise over the factors that actually have data.
//   * Tier labels are plain fun ("SOULMATES", "DISASTER") - zero RPG lore.
// Names come from economy.getDisplayName (never the 'Adventurer'
// placeholder) - the engine handler resolves them before calling us.

const path = require('path');
const fs = require('fs');

let _canvas = null;
function getCanvas() { if (!_canvas) _canvas = require('canvas'); return _canvas; }

// ── Fonts: clean modern system Roboto (deliberately NOT the RPG set) ──
let _fontsRegistered = false;
const ROBOTO_DIR = '/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF';
function ensureFonts() {
  if (_fontsRegistered) return;
  _fontsRegistered = true;
  try {
    const { registerFont } = getCanvas();
    const regs = [
      ['Roboto-Regular.ttf', 'RobotoR'],
      ['Roboto-Medium.ttf', 'RobotoM'],
      ['Roboto-Bold.ttf', 'RobotoB'],
      ['Roboto-Black.ttf', 'RobotoBlk'],
      ['Roboto-Light.ttf', 'RobotoL'],
      ['Roboto-Italic.ttf', 'RobotoI'],
    ];
    for (const [file, fam] of regs) {
      const p = path.join(ROBOTO_DIR, file);
      if (fs.existsSync(p)) { try { registerFont(p, { family: fam }); } catch (e) {} }
    }
  } catch (e) {}
}

const W = 800, H = 1080;

// ── Palette (modern romance, no RPG gold/parchment) ──
const C = {
  bgTop: '#12131A',
  bgBot: '#1B1018',
  glow: 'rgba(255, 94, 122, 0.14)',
  text: '#F4F5F9',
  muted: '#A7AAB8',
  dim: '#6E7180',
  line: 'rgba(255,255,255,0.09)',
  track: 'rgba(255,255,255,0.08)',
  rose: '#FF5E7A',
  roseSoft: '#FF8FA8',
  violet: '#8B7CFF',
  violetSoft: '#B3A6FF',
  amber: '#FFB35C',
};

// ════════════════════════════════════════════
//  SCORING ENGINE
// ════════════════════════════════════════════

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const letters = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

// Factor 1: name chemistry - three classic letter algorithms blended.
// canon = order-independent pair key so "A + B" always equals "B + A".
function nameChemistry(a, b, canon) {
  const la = letters(a), lb = letters(b);
  if (!la && !lb) return 50;
  const combined = la + lb;

  // (a) classic L-O-V-E-S letter density
  const loves = (combined.match(/[loves]/g) || []).length;
  const lovePct = combined.length
    ? Math.min(100, Math.round((loves / combined.length) / 0.30 * 100))
    : 50;

  // (b) shared letter set (Jaccard), floored so pure math isn't brutal
  const setA = new Set(la), setB = new Set(lb);
  const all = new Set([...setA, ...setB]);
  let inter = 0;
  for (const ch of all) if (setA.has(ch) && setB.has(ch)) inter++;
  const jaccard = all.size ? inter / all.size : 0;
  const sharedPct = Math.round(20 + jaccard * 80);

  // (c) vowel-rhythm harmony
  const vr = (t) => {
    if (!t) return 0.5;
    const v = (t.match(/[aeiou]/g) || []).length / t.length;
    return v;
  };
  const harmPct = Math.round((1 - Math.min(1, Math.abs(vr(la) - vr(lb)) * 2.2)) * 100);

  let val = lovePct * 0.42 + sharedPct * 0.34 + harmPct * 0.24;

  // stable per-pair seasoning so similar-looking names still differ
  const seasoning = hash32(canon || `${la}~${lb}`) % 100;
  val = val * 0.85 + seasoning * 0.15;

  return Math.max(4, Math.min(97, Math.round(val)));
}

// Factor 2: real interaction history - tags/mentions/replies (tracked by
// interactionTracker, stored on user.profile.interactions) DOMINATE, with
// socialSystem relationship points as a complement. A real pair that never
// interacted scores LOW (owner: silent pairs must not coast to 60%).
const escKey = (jid) => String(jid || '').replace(/\./g, '_');
const relsOf = (p) => (p && ((p.profile && p.profile.relationships) || p.relationships)) || null;
const memOf = (p) => (p && (p.memories || (p.profile && p.profile.memories))) || {};

function getRelScore(p, otherJid) {
  const rels = relsOf(p);
  if (!rels || !otherJid) return 0;
  const grab = (k) => {
    try {
      if (typeof rels.get === 'function') return rels.get(k) || 0;
      return rels[k] || 0;
    } catch (e) { return 0; }
  };
  return grab(escKey(otherJid)) || grab(otherJid) || 0;
}

// RELATIVE interaction factor (owner v2 directive 2026-09-17): the bond
// reflects "percentage of interaction with this person compared to
// interaction with everyone else", not raw volume. Dominant term = mutual
// relative focus (min of the two users' shares - both sides must actually
// focus on each other, which also kills one-sided stalking); a small
// absolute-volume term and a tiny-sample dampener keep it honest.
function interactionFactor(p1, p2, jid1, jid2) {
  const interOf = (p) => (p && ((p.profile && p.profile.interactions) || p.interactions)) || null;
  const grab = (p, other) => {
    const map = interOf(p);
    if (!map || !other) return null;
    const rec = typeof map.get === 'function' ? map.get(escKey(other)) : map[escKey(other)];
    return rec && rec.c > 0 ? rec : null;
  };
  const mapTotal = (map) => {
    if (!map) return 0;
    let sum = 0;
    const entries = typeof map.entries === 'function' ? [...map.entries()] : Object.entries(map);
    for (const [, v] of entries) sum += (v && v.c) || 0;
    return sum;
  };
  const a = grab(p1, jid2), b = grab(p2, jid1);
  if (!a && !b) return null;
  const n = ((a && a.c) || 0) + ((b && b.c) || 0);
  const last = Math.max((a && a.t) || 0, (b && b.t) || 0);
  const days = last ? (Date.now() - last) / 86400000 : 999;
  const rec = days <= 3 ? 1.0 : days <= 7 ? 0.8 : days <= 14 ? 0.65 : days <= 30 ? 0.45 : 0.3;
  // relative focus: share of each user's whole interaction life on this partner
  const totA = mapTotal(interOf(p1));
  const totB = mapTotal(interOf(p2));
  const shareA = totA > 0 ? ((a && a.c) || 0) / totA : 0;
  const shareB = totB > 0 ? ((b && b.c) || 0) / totB : 0;
  const mutualShare = Math.min(shareA, shareB);          // 0..1
  const relScore = 100 * Math.sqrt(mutualShare);         // 100% -> 100, 50% -> 71, 10% -> 32
  const volume = Math.min(100, 28 * Math.log(1 + n));    // absolute floor
  const damp = Math.min(1, n / 10);                      // tiny samples can't max out
  const base = relScore * damp * 0.7 + volume * 0.3;
  return Math.max(2, Math.min(100, Math.round(base * rec)));
}

function bondFactor(p1, p2, jid1, jid2) {
  if (!p1 || !p2 || !jid1 || !jid2 || jid1 === jid2) return null;
  const rel1 = getRelScore(p1, jid2);
  const rel2 = getRelScore(p2, jid1);
  const inter = interactionFactor(p1, p2, jid1, jid2);
  const hasRel = !!(rel1 || rel2);
  if (inter !== null) {
    // tags/mentions/replies are the signal - relationship points complement
    const avgRel = hasRel ? (rel1 + rel2) / 2 : 0;
    const v = inter * 0.65 + (54 + avgRel * 0.44) * 0.35;
    return Math.max(3, Math.min(98, Math.round(v)));
  }
  if (hasRel) {
    const avg = (rel1 + rel2) / 2;   // -100..100
    return Math.max(3, Math.min(98, Math.round(54 + avg * 0.44)));
  }
  // Real pair (mentions path) with zero recorded interaction history:
  // strangers score LOW on this factor - per owner directive.
  return 15;
}

// Factor 3: shared interests from AI-maintained profile memories.
const normTok = (x) => String(x || '').toLowerCase().trim();

function vibeFactor(p1, p2) {
  const bag = (p) => {
    const m = memOf(p);
    const arr = [...(m.likes || []), ...(m.hobbies || []), ...(m.dislikes || [])];
    return new Set(arr.map(normTok).filter(Boolean));
  };
  const A = bag(p1), B = bag(p2);
  if (!A.size || !B.size) return null;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  const uni = new Set([...A, ...B]).size;
  const jac = uni ? shared / uni : 0;
  return Math.max(2, Math.min(98, Math.round(35 + jac * 130)));
}

// Factor 4: daily spark - same all day, changes at midnight UTC.
function sparkFactor(canon, now) {
  const d = now || new Date();
  const day = d.toISOString().slice(0, 10);
  const h = hash32(`${canon}~${day}`);
  return 12 + (h % 84);
}

// Classic name mashup ("Brangelina") - first half of A + tail of B.
function shipName(a, b) {
  const wa = (String(a || '').split(/\s+/)[0] || '').replace(/[^A-Za-z]/g, '');
  const wb = (String(b || '').split(/\s+/)[0] || '').replace(/[^A-Za-z]/g, '');
  if (!wa || !wb) return `${a} × ${b}`;
  const headA = wa.slice(0, Math.max(2, Math.ceil(wa.length * 0.5)));
  const tailB = wb.slice(Math.max(1, Math.floor(wb.length * 0.45)));
  const mash = headA + tailB;
  return mash.length >= 3 ? mash : `${a} × ${b}`;
}

// Tiers - plain, funny, NO RPG lore.
const TIERS = [
  { min: 96, label: 'MATCH MADE IN HEAVEN', emoji: '💍', color: '#FFD166',
    comment: 'Absolute power couple. Everyone else in this chat is third-wheeling now.' },
  { min: 84, label: 'SOULMATES', emoji: '🔥', color: '#FF5E7A',
    comment: 'Someone book the venue - this one is real.' },
  { min: 70, label: 'PERFECT MATCH', emoji: '💖', color: '#FF7E9D',
    comment: 'Strong match. One more shared playlist and it is a done deal.' },
  { min: 55, label: "SOMETHING'S THERE", emoji: '✨', color: '#FFA45B',
    comment: 'The spark exists. Somebody just has to text first.' },
  { min: 40, label: 'SLOW BURN', emoji: '🕯️', color: '#9B8CFF',
    comment: 'Slow burn detected. Recheck after a few movie nights.' },
  { min: 24, label: 'COMPLICATED', emoji: '🌧️', color: '#6C8CFF',
    comment: "It's complicated. 'Seen 2:34 AM, no reply' complicated." },
  { min: -1, label: 'DISASTER', emoji: '☠️', color: '#8A93A6',
    comment: 'Hard pass. Even the group poll says no.' },
];

function tierFor(score) {
  return TIERS.find((t) => score >= t.min) || TIERS[TIERS.length - 1];
}

/**
 * Multi-factor compatibility engine.
 * @returns {score, factors:[{key,label,weight,value(null=no data)}], tier, mash, hearts, comment}
 */
function computeShip({ name1, name2, jid1 = null, jid2 = null, p1 = null, p2 = null, now = null }) {
  // order-independent canonical pair key (letters only, sorted)
  const canon = [letters(name1), letters(name2)].sort().join('~');
  // Owner directive: tags/mentions/replies history is the MAJOR factor (w40).
  const defs = [
    { key: 'name',  label: 'Name chemistry',   weight: 25, value: nameChemistry(name1, name2, canon) },
    { key: 'bond',  label: 'Tags & replies',   weight: 40, value: bondFactor(p1, p2, jid1, jid2) },
    { key: 'vibe',  label: 'Shared interests', weight: 15, value: vibeFactor(p1, p2) },
    { key: 'spark', label: "Today's spark",    weight: 20, value: sparkFactor(canon, now) },
  ];
  const avail = defs.filter((f) => f.value !== null);
  const wsum = avail.reduce((s, f) => s + f.weight, 0) || 1;
  const score = Math.max(0, Math.min(100,
    Math.round(avail.reduce((s, f) => s + f.value * f.weight, 0) / wsum)));

  const tier = tierFor(score);
  return {
    score,
    factors: defs,
    tier,
    mash: shipName(name1, name2),
    hearts: Math.max(0, Math.min(10, Math.round(score / 10))),
    comment: tier.comment,
  };
}

// ════════════════════════════════════════════
//  CARD RENDERER (800x1080 PNG)
// ════════════════════════════════════════════

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Classic 32x29.6 heart path, centred on (cx, cy), width w.
function heartPath(ctx, cx, cy, w) {
  const k = w / 32;
  ctx.save();
  ctx.translate(cx - 16 * k, cy - 14.8 * k);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(16, 29.6);
  ctx.bezierCurveTo(16, 29.6, 0, 18.4, 0, 8.8);
  ctx.bezierCurveTo(0, 3.6, 4.4, 0, 8.8, 0);
  ctx.bezierCurveTo(12, 0, 14.4, 1.6, 16, 4);
  ctx.bezierCurveTo(17.6, 1.6, 20, 0, 23.2, 0);
  ctx.bezierCurveTo(27.6, 0, 32, 3.6, 32, 8.8);
  ctx.bezierCurveTo(32, 18.4, 16, 29.6, 16, 29.6);
  ctx.closePath();
  ctx.restore(); // critical: drop the local translate/scale before callers fill
}

// Centred letter-spaced text.
function spacedText(ctx, text, cx, cy, gap) {
  const chars = [...String(text)];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0) + gap * (chars.length - 1);
  let x = cx - total / 2;
  const prevBaseline = ctx.textBaseline;
  ctx.textBaseline = 'alphabetic';
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x, cy);
    x += widths[i] + gap;
  });
  ctx.textBaseline = prevBaseline;
  return total;
}

function truncateForWidth(ctx, text, maxW) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function wrapText(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else {
      cur = test;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    if (words.join(' ').length > lines.join(' ').length) {
      while (last.length && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
  }
  return lines;
}

function avatar(ctx, cx, cy, r, name, grad) {
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, grad[0]);
  g.addColorStop(1, grad[1]);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  const initial = ([...String(name || '?').trim()][0] || '?').toUpperCase();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${Math.round(r * 0.72)}px "RobotoB"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, cx, cy + r * 0.04);
}

function factorRow(ctx, y, label, value) {
  // label
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '21px "RobotoM"';
  ctx.fillStyle = value === null ? C.dim : '#D8DAE4';
  ctx.fillText(truncateForWidth(ctx, label, 230), 90, y);

  // track
  const tx = 340, tw = 290, th = 10;
  roundRectPath(ctx, tx, y - th / 2, tw, th, th / 2);
  ctx.fillStyle = C.track;
  ctx.fill();

  if (value !== null) {
    const g = ctx.createLinearGradient(tx, y, tx + tw, y);
    g.addColorStop(0, C.rose);
    g.addColorStop(1, C.amber);
    roundRectPath(ctx, tx, y - th / 2, Math.max(th, tw * value / 100), th, th / 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // value
  ctx.textAlign = 'right';
  ctx.font = '20px "RobotoB"';
  ctx.fillStyle = value === null ? C.dim : C.text;
  ctx.fillText(value === null ? '—' : String(value), 710, y);
}

async function renderShipCard({ name1, name2, score, factors, tier, comment, mash, hearts }) {
  ensureFonts();
  const { createCanvas } = getCanvas();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── background: dark gradient + soft rose glow behind the gauge ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.bgTop);
  bg.addColorStop(1, C.bgBot);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 250, 30, W / 2, 250, 330);
  glow.addColorStop(0, C.glow);
  glow.addColorStop(1, 'rgba(255,94,122,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // hairline border
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, 14, 14, W - 28, H - 28, 26);
  ctx.stroke();

  // ── header ──
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.rose;
  ctx.font = '24px "RobotoM"';
  spacedText(ctx, 'MATCH METER', W / 2, 74, 7);
  heartPath(ctx, W / 2 - 148, 68, 20);
  ctx.fillStyle = 'rgba(255,94,122,0.85)';
  ctx.fill();
  heartPath(ctx, W / 2 + 148, 68, 20);
  ctx.fill();

  // ── avatars + ring gauge ──
  avatar(ctx, 150, 250, 64, name1, [C.rose, C.roseSoft]);
  avatar(ctx, 650, 250, 64, name2, [C.violet, C.violetSoft]);

  // connector hearts
  heartPath(ctx, 254, 250, 26);
  ctx.fillStyle = 'rgba(255,94,122,0.9)';
  ctx.fill();
  heartPath(ctx, 546, 250, 26);
  ctx.fill();

  // ring track
  const RG = 100, RGW = 16;
  ctx.beginPath();
  ctx.arc(W / 2, 250, RG, 0, Math.PI * 2);
  ctx.strokeStyle = C.track;
  ctx.lineWidth = RGW;
  ctx.stroke();

  // ring progress
  const prog = Math.max(0, Math.min(100, score)) / 100;
  if (prog > 0) {
    ctx.save();
    const rg = ctx.createLinearGradient(W / 2 - RG, 250 - RG, W / 2 + RG, 250 + RG);
    rg.addColorStop(0, C.rose);
    rg.addColorStop(1, C.amber);
    ctx.strokeStyle = rg;
    ctx.lineWidth = RGW;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255,94,122,0.55)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(W / 2, 250, RG, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
    ctx.stroke();
    ctx.restore();
  }

  // % text
  ctx.fillStyle = C.text;
  ctx.font = '58px "RobotoB"';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${score}%`, W / 2, 238);
  ctx.fillStyle = C.muted;
  ctx.font = '17px "RobotoM"';
  spacedText(ctx, 'MATCH', W / 2, 288, 4);

  // names under avatars
  ctx.font = '24px "RobotoB"';
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.fillText(truncateForWidth(ctx, name1 || '?', 220), 150, 352);
  ctx.fillText(truncateForWidth(ctx, name2 || '?', 220), 650, 352);

  // ── ship name mashup ──
  ctx.fillStyle = C.dim;
  ctx.font = '13px "RobotoM"';
  spacedText(ctx, 'SHIP NAME', W / 2, 398, 4);
  ctx.fillStyle = C.roseSoft;
  ctx.font = 'italic 30px "RobotoI"';
  ctx.fillText(truncateForWidth(ctx, `“${mash}”`, 640), W / 2, 434);

  // ── hearts row ──
  const hw = 34, hgap = 12;
  const total = 10 * hw + 9 * hgap;
  let hx = W / 2 - total / 2 + hw / 2;
  for (let i = 0; i < 10; i++) {
    if (i < hearts) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,94,122,0.45)';
      ctx.shadowBlur = 8;
      heartPath(ctx, hx, 505, hw);
      ctx.fillStyle = C.rose;
      ctx.fill();
      ctx.restore();
    } else {
      heartPath(ctx, hx, 505, hw);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    hx += hw + hgap;
  }

  // ── tier pill ──
  ctx.font = '26px "RobotoB"';
  const tierText = tier.label;
  const tw = ctx.measureText(tierText).width;
  const pw = tw + 88, ph = 56, py = 574;
  roundRectPath(ctx, W / 2 - pw / 2, py, pw, ph, ph / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.strokeStyle = tier.color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = tier.color;
  ctx.fillText(tierText, W / 2, py + ph / 2 + 2);

  // ── comment ──
  ctx.fillStyle = C.muted;
  ctx.font = 'italic 22px "RobotoI"';
  ctx.textAlign = 'center';
  const clines = wrapText(ctx, comment || '', 620, 2);
  clines.forEach((ln, i) => ctx.fillText(ln, W / 2, 672 + i * 30));

  // ── divider ──
  ctx.fillStyle = '#8A8FA3';
  ctx.font = '15px "RobotoM"';
  const dl = spacedText(ctx, 'HOW THIS WAS CALCULATED', W / 2, 748, 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 742); ctx.lineTo(W / 2 - dl / 2 - 24, 742);
  ctx.moveTo(W / 2 + dl / 2 + 24, 742); ctx.lineTo(W - 80, 742);
  ctx.stroke();

  // ── factor rows ──
  const rows = factors || [];
  rows.forEach((f, i) => factorRow(ctx, 800 + i * 52, f.label, f.value));

  // ── footer ──
  ctx.fillStyle = C.dim;
  ctx.font = '17px "RobotoR"';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Scores stay stable for this pair · the daily spark refreshes at midnight UTC',
    W / 2, 1022,
  );

  return canvas.toBuffer('image/png');
}

module.exports = { computeShip, renderShipCard, shipName, TIERS };
