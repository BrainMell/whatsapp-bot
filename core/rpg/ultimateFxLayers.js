'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  ULTIMATE FX LAYERS — procedural, pixel-styled effect layers that sit between
//  the free CC0 sprite sets (core/rpgasset/vfx, see CREDITS.md) in the timeline:
//  bone hands dragging the enemy underground, rune circles, beams, light
//  pillars, meteors / arrow / coin rain, crescent slashes, caster dashes,
//  ground cracks, vines, clocks, gears, black holes, shockwaves, emitters.
//
//  Every layer: (ctx, tr, env) where tr = the recipe track, env = {
//    A (anchors C/T/F), time, W, H, base, self, spr(name), seed, sets }.
//  Layers are pure functions of `time` (deterministic → re-renders identically).
// ═══════════════════════════════════════════════════════════════════════════
const PX = 4;

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeIn = (t) => Math.pow(clamp01(t), 2);
const bell = (u) => Math.sin(Math.PI * clamp01(u));
function hashS(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function pt(env, spec, tr) {
    // 💡 AoE FAN (owner: "fix up the vfx for individual and multiple
    // opponents"): fanned track replicas carry an explicit _pt target (video
    // space feet point per enemy anchor) that overrides pos entirely.
    if (tr && tr._pt) return Array.isArray(tr._pt) ? tr._pt.slice() : [tr._pt[0], tr._pt[1]];
    let p;
    if (Array.isArray(spec)) p = [spec[0] * env.W, spec[1] * env.H];
    else p = (env.A[spec || 'T'] || env.A.T).slice();
    if (tr && tr.off) { p[0] += tr.off[0]; p[1] += tr.off[1]; }
    return p;
}
function local(env, tr) { const t = env.time - tr.at; return { t, u: tr.dur ? t / tr.dur : 0 }; }
function active(env, tr, pad = 0) { const t = env.time - tr.at; return t >= 0 && t <= (tr.dur || 1) + pad; }

function glowDot(ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
}
function sprite(ctx, img, x, y, w, rot, alpha, add) {
    if (!img) return;
    const h = w * (img.height / img.width);
    ctx.save(); ctx.globalAlpha = alpha; if (add) ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore();
}
/** paint over a region with a piece of empty background (centre column of the battle card) → "hides" a sprite */
function hideRegion(ctx, env, cx, cy, w, h) {
    const b = env.base; if (!b) return;
    const k = b.width / env.W;
    ctx.save(); ctx.beginPath(); ctx.rect(cx - w / 2, cy - h / 2, w, h); ctx.clip();
    ctx.drawImage(b, (env.W * 0.5 - w / 2) * k, (cy - h / 2) * (b.height / env.H), w * k, h * (b.height / env.H), cx - w / 2, cy - h / 2, w, h);
    ctx.fillStyle = 'rgba(5,6,15,0.30)'; ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
}

// ── bone hand (pixel blocks) ────────────────────────────────────────────────
function boneHand(ctx, x, gy, rise, curl, s, flip, glow) {
    const P = PX * s, top = gy - rise;
    const bone = '#e4dec8', shade = '#9a9482', line = '#150f24';
    const snap = (v) => Math.round(v / P) * P;
    x = snap(x);
    ctx.save();
    // arm (outline then bone), sways slightly
    for (let y = gy, i = 0; y > top + P * 4; y -= P, i++) {
        const sw = Math.round(Math.sin(i * 0.5 + rise * 0.04) * 0.6) * P;
        ctx.fillStyle = line; ctx.fillRect(x - 2 * P + sw, y - P, 4 * P, P);
        ctx.fillStyle = (i % 5 === 4) ? shade : bone; ctx.fillRect(x - P + sw, y - P, 2 * P + (i % 5 === 4 ? 0 : 0), P);
        ctx.fillStyle = shade; ctx.fillRect(x + sw, y - P, P, P);
    }
    // palm
    ctx.fillStyle = line; ctx.fillRect(x - 4 * P, top, 8 * P, 5 * P + P);
    ctx.fillStyle = bone; ctx.fillRect(x - 3 * P, top + P, 6 * P, 4 * P);
    ctx.fillStyle = shade; ctx.fillRect(x - 3 * P, top + 4 * P, 6 * P, P);
    // fingers (2 phalanges each) curl toward the centre when grabbing
    for (let i = 0; i < 4; i++) {
        const fx = x + (-2.25 + i * 1.5) * P, side = (i - 1.5);
        const open = (1 - curl) * side * 0.30;
        const inward = -Math.sign(side) * curl * 0.85;
        let ang = open, px = fx, py = top + P;
        const len = [2.6, 2.4, 1.9][0];
        for (let seg = 0; seg < 3; seg++) {
            const l = [3.2, 2.6, 2.0][seg] * P;
            ang += seg === 0 ? 0 : inward * 0.9 + (seg === 2 ? -side * curl * 0.15 : 0);
            ctx.save(); ctx.translate(px, py); ctx.rotate(ang + Math.PI * 0); // pointing up (−y)
            ctx.fillStyle = line; ctx.fillRect(-0.95 * P, -l - 0.3 * P, 1.9 * P, l + 0.6 * P);
            ctx.fillStyle = seg === 2 ? shade : bone; ctx.fillRect(-0.55 * P, -l, 1.1 * P, l);
            ctx.restore();
            px += Math.sin(ang) * l; py -= Math.cos(ang) * l;
        }
    }
    // thumb
    ctx.save(); ctx.translate(x + flip * 3.3 * P, top + 3 * P); ctx.rotate(flip * (0.9 - curl * 0.7));
    ctx.fillStyle = line; ctx.fillRect(-P, -3.2 * P, 2 * P, 3.4 * P); ctx.fillStyle = bone; ctx.fillRect(-0.55 * P, -3 * P, 1.1 * P, 3 * P); ctx.restore();
    ctx.restore();
    if (glow) glowDot(ctx, x, top + 2 * P, 38 * s, glow, 0.5);
}

// ── layers ──────────────────────────────────────────────────────────────────
const LAYERS = {};

/** ground rift (dark pit + glowing lip) that opens, holds and closes. */
LAYERS.rift = (ctx, tr, env) => {
    const { t } = local(env, tr), dur = tr.dur || 1.6;
    if (t < 0 || t > dur + 0.25) return;
    const [x, y] = pt(env, tr.pos || 'T', tr);
    const open = easeOut(t / 0.25) * (1 - easeIn((t - dur + 0.3) / 0.55));
    if (open <= 0.01) return;
    const rx = (tr.rx || 70) * open, ry = rx * 0.34;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(2,0,8,0.92)'; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(0, 0, ry * 0.2, 0, 0, rx);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.8, tr.color || 'rgba(150,60,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, rx * 1.18, ry * 1.3, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = tr.lip || '#b78bff'; ctx.globalAlpha = 0.65 + 0.25 * Math.sin(t * 22); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.stroke();
    ctx.restore();
};

/** skeletal hands burst out of the ground around T, grab, and drag the enemy down.
 * 💡 VFX LAYERS (2026-10-26, owner: "the hole the hands come out of should be
 * under but the heads themselves should be over ... weird translucent rectangle
 * where the monster was"): with a layered base the ISOLATED focus monster is
 * drawn BY this layer for the whole video (the Go renderer excluded it from the
 * combatants overlay), so the rift opens UNDER it (under pass) and the hands
 * grab OVER it. The sink is now a real clipped descent into the pit - the old
 * hideRegion center-column patch that painted a translucent rectangle over the
 * monster is gone. */
LAYERS.hands = (ctx, tr, env) => {
    const { t } = local(env, tr), dur = tr.dur || 1.7;
    const grab = tr.grab || 0.75, sinkEnd = tr.sinkEnd || 1.3;
    const [cx, gy0] = pt(env, tr.pos || 'T', tr);
    if (env.focImg) {
        // the isolated target: natural position until the grab, then a clipped
        // straight-down descent - visible only ABOVE the ground line, so it
        // truly vanishes INTO the opened pit
        const groundY = (env.focRect ? env.focRect[1] : env.A.T[1]) + 4;
        if (tr.sink && !env.self && t > grab) {
            const u = clamp01((t - grab) / (sinkEnd - grab));
            const depth = (tr.depth || 150) * easeIn(u);
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, env.W, groundY); ctx.clip();
            // 5-arg form: the WHOLE full-canvas focus overlay, shifted down
            ctx.drawImage(env.focImg, Math.sin(t * 60) * 2 * (1 - u), depth, env.W, env.H);
            ctx.restore();
            // pit mouth over the feet so the enemy vanishes INTO the ground
            ctx.fillStyle = 'rgba(2,0,8,0.9)'; ctx.beginPath(); ctx.ellipse(cx, groundY, 58 + 20 * Math.sin(t * 9), 17, 0, 0, 7); ctx.fill();
        } else {
            ctx.drawImage(env.focImg, 0, 0, env.W, env.H);
        }
    }
    if (t < 0 || t > dur) return;
    const n = tr.n || 5;
    // LEGACY single-image sink (no layered base available): the old patch
    // behavior, kept only for non-layered callers.
    if (!env.focImg && tr.sink && !env.self && t > grab) {
        const u = easeIn((t - grab) / (sinkEnd - grab));
        const gline = gy0 + (tr.ground || 62);
        const depth = (tr.depth || 150) * clamp01(u);
        const ex = tr.ew || 190, eh = tr.eh || 230;
        hideRegion(ctx, env, cx, gline - eh / 2, ex, eh);
        if (env.base && u < 1) {
            const b = env.base, kx = b.width / env.W, ky = b.height / env.H;
            ctx.save(); ctx.beginPath(); ctx.rect(cx - ex / 2, gline - eh, ex, eh); ctx.clip();
            ctx.drawImage(b, (cx - ex / 2) * kx, (gline - eh) * ky, ex * kx, eh * ky, cx - ex / 2 + Math.sin(t * 60) * 2 * (1 - u), gline - eh + depth, ex, eh);
            ctx.restore();
        }
        // pit mouth over the feet so the enemy vanishes INTO the ground
        ctx.fillStyle = 'rgba(2,0,8,0.9)'; ctx.beginPath(); ctx.ellipse(cx, gline, 58 + 20 * Math.sin(t * 9), 17, 0, 0, 7); ctx.fill();
    }
    for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + 0.4;
        const hx = cx + Math.cos(ang) * (tr.spread || 70) * (i % 2 ? 0.9 : 1.15), hy = gy0 + (tr.ground || 62) + Math.sin(ang) * 22;
        const born = 0.08 * i, lt = t - born; if (lt < 0) continue;
        const rise = 95 * easeOut(lt / 0.32) * (1 - easeIn((t - sinkEnd) / (dur - sinkEnd)));
        if (rise < 4) continue;
        const curl = easeOut((t - grab) / 0.18);
        const pull = t > grab ? Math.min(1, (t - grab) / (sinkEnd - grab)) : 0;
        const lowered = rise - pull * 38;
        // hands lean toward the centre as they grab
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(-Math.sign(Math.cos(ang)) * 0.28 * (1 - 0.4 * curl)); ctx.translate(-hx, -hy);
        boneHand(ctx, hx, hy, Math.max(6, lowered), curl, 1 + (i % 2) * 0.15, Math.cos(ang) > 0 ? 1 : -1, tr.glow || 'rgba(160,90,255,0.9)');
        ctx.restore();
    }
};

/** rune circle on the ground (or a clock face when hands:true). */
LAYERS.circle = (ctx, tr, env) => {
    const { t, u } = local(env, tr), dur = tr.dur || 1.2;
    if (t < 0 || t > dur + 0.2) return;
    const [x, y] = pt(env, tr.pos || 'T', tr);
    const grow = easeOut(t / 0.3) * (1 - easeIn((t - dur + 0.25) / 0.3));
    if (grow <= 0.01) return;
    const R = (tr.r || 90) * grow, ratio = tr.ratio || 0.38;
    const col = tr.color || '#b78bff', spin = (tr.spin || 1.4) * t;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ratio); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85; ctx.strokeStyle = col; ctx.lineWidth = 3 / Math.max(0.4, ratio * 1.6);
    ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
    ctx.lineWidth = 1.5 / ratio * 0.5; ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, 7); ctx.stroke();
    // glyph ticks
    const nt = tr.ticks || 16;
    for (let i = 0; i < nt; i++) {
        const a = spin + (i / nt) * Math.PI * 2, r0 = R * 0.84, r1 = R * (i % 2 ? 0.95 : 0.99);
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
    }
    // star polygon (hexagram or pentagram)
    const pts = tr.points || 6, step = pts === 5 ? 2 : 2;
    ctx.lineWidth = 2 / ratio * 0.5; ctx.rotate(-spin * 0.6);
    if (pts === 6) {
        for (const off of [0, Math.PI]) { ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = off + (k / 3) * Math.PI * 2 - Math.PI / 2; const px = Math.cos(a) * R * 0.78, py = Math.sin(a) * R * 0.78; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.stroke(); }
    } else {
        ctx.beginPath(); for (let k = 0; k <= pts; k++) { const a = ((k * step) % pts / pts) * Math.PI * 2 - Math.PI / 2; const px = Math.cos(a) * R * 0.78, py = Math.sin(a) * R * 0.78; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke();
    }
    if (tr.clock) {
        ctx.rotate(spin * 0.6);
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6); ctx.lineTo(Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72); ctx.stroke(); }
        ctx.lineWidth = 3 / ratio * 0.5;
        const hm = t * 9, hh = t * 0.75;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hm) * R * 0.55, Math.sin(hm) * R * 0.55); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hh) * R * 0.33, Math.sin(hh) * R * 0.33); ctx.stroke();
    }
    ctx.restore();
    glowDot(ctx, x, y, R * 0.9, col, 0.22 * grow);
};

/** sustained beam C→T (wobbling edges, white core). */
LAYERS.beam = (ctx, tr, env) => {
    const { t } = local(env, tr), dur = tr.dur || 0.7;
    if (t < 0 || t > dur + 0.1) return;
    const [x0, y0] = pt(env, tr.from || 'C', { off: tr.offFrom }), [x1, y1] = pt(env, tr.to || 'T', { off: tr.offTo });
    const grow = easeOut(t / 0.12) * (1 - easeIn((t - dur) / 0.1));
    const w = (tr.w || 34) * grow;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const mk = (ww, jag) => { const N = 18, a = [], b = []; for (let i = 0; i <= N; i++) { const k = i / N, j = Math.sin(k * 21 - t * 40) * jag + Math.sin(k * 7 + t * 23) * jag * 0.6; const px = x0 + dx * k + nx * j, py = y0 + dy * k + ny * j; const wv = ww * (0.7 + 0.3 * Math.sin(k * 9 - t * 30)); a.push([px + nx * wv, py + ny * wv]); b.push([px - nx * wv, py - ny * wv]); } return a.concat(b.reverse()); };
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [ww, jag, col, al] of [[w, 6, tr.color || '#6de9ff', 0.45], [w * 0.55, 3, tr.mid || tr.color || '#6de9ff', 0.8], [w * 0.22, 1.5, '#ffffff', 1]]) {
        ctx.fillStyle = col; ctx.globalAlpha = al * grow; const poly = mk(ww, jag);
        ctx.beginPath(); poly.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    glowDot(ctx, x0, y0, w * 1.8, tr.color || '#6de9ff', 0.8 * grow); glowDot(ctx, x1, y1, w * 2.6, tr.color || '#6de9ff', 0.9 * grow);
};

/** vertical column of light/dark from the sky to a point. */
LAYERS.pillar = (ctx, tr, env) => {
    const { t } = local(env, tr), dur = tr.dur || 0.7;
    if (t < 0 || t > dur + 0.1) return;
    const [x, y] = pt(env, tr.pos || 'T', tr);
    const grow = easeOut(t / 0.1) * (1 - easeIn((t - dur + 0.15) / 0.25));
    const w = (tr.w || 90) * (0.4 + 0.6 * grow) * (1 + 0.05 * Math.sin(t * 40));
    const top = -20, bot = y + (tr.ground || 55);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [ww, col, al] of [[w, tr.color || '#ffe27a', 0.35], [w * 0.6, tr.mid || '#fff2b0', 0.55], [w * 0.28, '#ffffff', 0.95]]) {
        const g = ctx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, col); g.addColorStop(1, col);
        ctx.globalAlpha = al * grow; ctx.fillStyle = g; ctx.fillRect(x - ww / 2, top, ww, bot - top);
    }
    ctx.restore();
    glowDot(ctx, x, bot, w * 1.5, tr.color || '#ffe27a', 0.85 * grow);
};

/** expanding shockwave rings. */
LAYERS.rings = (ctx, tr, env) => {
    const [x, y] = pt(env, tr.pos || 'T', tr), n = tr.n || 3;
    for (let i = 0; i < n; i++) {
        const t = env.time - tr.at - i * (tr.gap || 0.1), life = tr.dur || 0.55;
        if (t < 0 || t > life) continue;
        const u = t / life, r = (tr.r || 190) * easeOut(u), ratio = tr.ratio === undefined ? 0.38 : tr.ratio;
        ctx.save(); ctx.translate(x, y); ctx.scale(1, ratio); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - u) * 0.9; ctx.strokeStyle = tr.color || '#ffffff'; ctx.lineWidth = (tr.lw || 9) * (1 - u) / Math.max(0.5, ratio);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); ctx.restore();
    }
};

/** crescent slash that sweeps in, then fades (with trailing afterimage). */
LAYERS.crescent = (ctx, tr, env) => {
    const n = tr.n || 1;
    for (let i = 0; i < n; i++) {
        const t = env.time - tr.at - i * (tr.gap || 0.1), life = tr.dur || 0.38;
        if (t < 0 || t > life) continue;
        const [x, y] = pt(env, tr.pos || 'T', { off: tr.off });
        const rr = mulberry(hashS('cr' + i + tr.at));
        const jx = (rr() - 0.5) * (tr.jit ? tr.jit[0] : 0), jy = (rr() - 0.5) * (tr.jit ? tr.jit[1] : 0);
        const rot = Array.isArray(tr.rot) ? tr.rot[i % tr.rot.length] : (tr.rot || -0.6);
        const prog = easeOut(t / (life * 0.35)), fade = 1 - easeIn((t - life * 0.35) / (life * 0.65));
        const R = tr.r || 150, span = tr.span || 2.1, W = tr.w || 34;
        const a0 = -span / 2, a1 = a0 + span * prog, a_tail = a0 + span * clamp01(prog - 0.55 * (1 - fade) - 0.05) * 0.5 + (1 - fade) * span * 0.45;
        const steps = 26;
        ctx.save(); ctx.translate(x + jx, y + jy); ctx.rotate(rot); ctx.globalCompositeOperation = 'lighter';
        const col = tr.color || '#ffffff';
        for (const [sc, c, al] of [[1.0, col, 0.55], [0.55, tr.mid || '#ffffff', 0.9], [0.22, '#ffffff', 1]]) {
            ctx.fillStyle = c; ctx.globalAlpha = al * Math.max(0, fade);
            ctx.beginPath();
            const s0 = Math.min(a_tail, a1 - 0.05);
            for (let k = 0; k <= steps; k++) { const a = s0 + (a1 - s0) * (k / steps), th = Math.sin((k / steps) * Math.PI * 0.5 + 0.2) * W * sc; const px = Math.cos(a) * (R + th * 0.15), py = Math.sin(a) * (R * 0.55 + th * 0.1) - th * 0.05; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
            for (let k = steps; k >= 0; k--) { const a = s0 + (a1 - s0) * (k / steps), th = Math.sin((k / steps) * Math.PI * 0.5 + 0.2) * W * sc; const px = Math.cos(a) * (R - th), py = Math.sin(a) * (R * 0.55 - th * 0.55); ctx.lineTo(px, py); }
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
};

/** caster dashes through to the target, leaving afterimages.
 * 💡 VFX LAYERS (2026-10-26): with a layered base the afterimages are copies
 * of the caster's REAL sprite region taken from the transparent combatants
 * overlay (exact per-sprite anchor rect) - the hideRegion rectangular patch
 * that sampled the image center is gone. The caster also stays standing (the
 * ghosts read as the dash afterimages, no vanishing caster). */
LAYERS.dash = (ctx, tr, env) => {
    const { t } = local(env, tr), dur = tr.dur || 0.38;
    if (t < 0 || t > dur + 0.25 || !env.base) return;
    const [x0, y0] = pt(env, 'C'), [x1, y1] = pt(env, tr.to || 'T');
    const u = easeIn(clamp01(t / dur));
    const w = 130, h = 190;
    if (env.layers && env.sprImg) {
        const caster = env.casterRect || [x0, y0 + h, w, h];
        const gw = Math.max(24, caster[2]), gh = Math.max(30, caster[3]);
        const cx0 = caster[0], cyFeet = caster[1];
        const kx = env.sprImg.width / env.W, ky = env.sprImg.height / env.H;
        for (let g = 5; g >= 1; g--) {
            const uu = clamp01(u - g * 0.08); if (uu <= 0) continue;
            const px = x0 + (x1 - x0) * uu, py = y0 + (y1 - y0) * uu;
            ctx.save();
            ctx.globalAlpha = (1 - g / 6) * 0.7 * (t < dur ? 1 : 1 - (t - dur) / 0.25);
            ctx.drawImage(env.sprImg, (cx0 - gw / 2) * kx, (cyFeet - gh) * ky, gw * kx, gh * ky, px - gw / 2, py - gh, gw, gh);
            ctx.restore();
        }
    } else {
        if (t < dur + 0.2) hideRegion(ctx, env, x0, y0 - 30, w, h);
        const ox = tr.off ? tr.off[0] : -50;
        for (let g = 5; g >= 0; g--) {
            const uu = clamp01(u - g * 0.08); const px = x0 + (x1 + ox - x0) * uu, py = y0 + (y1 - y0) * uu;
            const aa = (1 - g / 6) * 0.8 * (t < dur ? 1 : 1 - (t - dur) / 0.25);
            ctx.save(); ctx.globalAlpha = aa; if (g > 0) ctx.filter = 'none';
            ctx.drawImage(env.base, (x0 - w / 2) * (env.base.width / env.W), (y0 - 30 - h / 2) * (env.base.height / env.H), w * (env.base.width / env.W), h * (env.base.height / env.H), px - w / 2, py - 30 - h / 2, w, h);
            if (g > 0) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = tr.color || 'rgba(120,90,255,0.5)'; ctx.globalAlpha = 0.35; ctx.fillRect(px - w / 2, py - 30 - h / 2, w, h); }
            ctx.restore();
        }
    }
    // speed lines
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = tr.color || '#c7b8ff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.6 * (1 - clamp01((t - dur) / 0.25));
    for (let i = 0; i < 7; i++) { const yy = y0 - 60 + i * 18 + (y1 - y0) * u, xx = x0 + (x1 + (tr.off ? tr.off[0] : -50) - x0) * u; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - 80 - i * 6, yy + (y0 - y1) * 0.1); ctx.stroke(); }
    ctx.restore();
};

/** things that fall from the sky onto T: meteor | arrow | shard | coin. */
LAYERS.fall = (ctx, tr, env) => {
    const n = tr.n || 6, kind = tr.kind || 'meteor', fallT = tr.fall || 0.34;
    const [tx, ty] = pt(env, tr.pos || 'T', tr);
    for (let i = 0; i < n; i++) {
        const rr = mulberry(hashS(kind + i + tr.at));
        const born = tr.at + i * (tr.gap || 0.08) + rr() * 0.04;
        const t = env.time - born; if (t < 0) continue;
        const lx = tx + (rr() - 0.5) * (tr.spreadX || 190), ly = ty + (rr() - 0.35) * (tr.spreadY || 70);
        const sx = lx + (tr.slant !== undefined ? tr.slant : -140) * 1, sy = -50;
        const u = t / fallT;
        if (u < 1) {
            const e = easeIn(u), x = sx + (lx - sx) * e, y = sy + (ly - sy) * e;
            const ang = Math.atan2(ly - sy, lx - sx);
            if (kind === 'meteor') {
                for (let k = 7; k >= 0; k--) { const e2 = easeIn(clamp01(u - k * 0.035)); const px = sx + (lx - sx) * e2, py = sy + (ly - sy) * e2; glowDot(ctx, px, py, 26 - k * 2, k < 2 ? '#fff2b0' : (tr.color || '#ff7a1a'), 0.55 * (1 - k / 9)); }
                sprite(ctx, env.spr('p_flame_03'), x, y, 74, ang + Math.PI / 2 + Math.PI, 0.95, true);
                glowDot(ctx, x, y, 34, '#fff7d0', 0.9);
            } else if (kind === 'arrow') {
                ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = '#e8e3d0'; ctx.fillRect(-26, -1.5, 30, 3); ctx.fillStyle = tr.color || '#ffd77a'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-2, -5); ctx.lineTo(-2, 5); ctx.fill(); ctx.fillStyle = '#9a4b3a'; ctx.fillRect(-30, -3, 6, 6); ctx.restore();
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,240,200,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * 70, y - Math.sin(ang) * 70); ctx.lineTo(x - Math.cos(ang) * 30, y - Math.sin(ang) * 30); ctx.stroke(); ctx.restore();
            } else if (kind === 'shard') {
                ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2); ctx.fillStyle = tr.color || '#bff3ff'; ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(8, -4); ctx.lineTo(0, -22); ctx.lineTo(-8, -4); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -14, 2, 30); ctx.restore();
                glowDot(ctx, x, y, 24, tr.color || '#59c8ff', 0.5);
            } else if (kind === 'coin') {
                const sq = Math.abs(Math.cos(t * 14 + i)); ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#ffcf3a'; ctx.strokeStyle = '#9a6a00'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 11 * Math.max(0.15, sq), 11, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
                glowDot(ctx, x, y, 22, '#ffe27a', 0.5);
            }
        } else if (tr.land && env.sets[tr.land] && env.sets[tr.land].length) {
            const fr = env.sets[tr.land], lt = t - fallT, fps = tr.landFps || 22, fi = Math.floor(lt * fps);
            if (fi < fr.length) sprite(ctx, fr[fi], lx, ly, tr.landW || 130, 0, 1, !!tr.landAdd);
            if (lt < 0.12) glowDot(ctx, lx, ly, 70, tr.color || '#ffb050', 0.8 * (1 - lt / 0.12));
        }
    }
};

/** jagged ground cracks radiating from a point. */
LAYERS.cracks = (ctx, tr, env) => {
    const { t } = local(env, tr), life = tr.dur || 1.2;
    if (t < 0 || t > life) return;
    const [x, y] = pt(env, tr.pos || 'T', tr);
    const grow = easeOut(t / 0.22), fade = 1 - easeIn((t - life * 0.6) / (life * 0.4));
    const rr = mulberry(hashS('cr' + tr.at));
    ctx.save(); ctx.translate(x, y + (tr.ground || 50)); ctx.scale(1, 0.4);
    for (let i = 0; i < (tr.n || 9); i++) {
        const a = (i / (tr.n || 9)) * Math.PI * 2 + rr() * 0.4, L = (tr.r || 170) * (0.6 + rr() * 0.5) * grow;
        const pts = []; let px = 0, py = 0; for (let k = 0; k <= 7; k++) { const kk = k / 7; px = Math.cos(a + (rr() - 0.5) * 0.5) * L * kk; py = Math.sin(a + (rr() - 0.5) * 0.5) * L * kk; pts.push([px, py]); }
        ctx.globalAlpha = Math.max(0, fade);
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = tr.color || '#ff8a2a'; ctx.lineWidth = 9; ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(0, 0)); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#120a08'; ctx.lineWidth = 4; ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(0, 0)); ctx.stroke();
    }
    ctx.restore();
};

/** vines/roots bursting up from the ground. */
LAYERS.vines = (ctx, tr, env) => {
    const { t } = local(env, tr), life = tr.dur || 1.3;
    if (t < 0 || t > life) return;
    const [x, y] = pt(env, tr.pos || 'T', tr), gy = y + (tr.ground || 58);
    const n = tr.n || 7, fade = 1 - easeIn((t - life * 0.7) / (life * 0.3));
    for (let i = 0; i < n; i++) {
        const rr = mulberry(hashS('vn' + i + tr.at)), bx = x + (i - (n - 1) / 2) * 26 + (rr() - 0.5) * 18, h = 110 + rr() * 90, lean = (rr() - 0.5) * 90;
        const g = easeOut((t - i * 0.05) / 0.5); if (g <= 0) continue;
        ctx.save(); ctx.globalAlpha = Math.max(0, fade); ctx.lineCap = 'round';
        for (const [lw, col] of [[11, '#1c3d1a'], [6, tr.color || '#3fbf4a'], [2, '#b6ff8a']]) {
            ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
            const N = 14; for (let k = 0; k <= N * g; k++) { const kk = k / N, px = bx + lean * kk + Math.sin(kk * 7 + t * 5 + i) * 11 * kk, py = gy - h * kk; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke();
        }
        if (g > 0.6) { const kk = g, px = bx + lean * kk, py = gy - h * kk; ctx.fillStyle = '#2f8f3a'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(px + s * 9, py + 2, 11, 5, s * 0.6, 0, 7); ctx.fill(); } }
        ctx.restore();
    }
};

/** gear pair (artificer). */
LAYERS.gears = (ctx, tr, env) => {
    const { t } = local(env, tr), life = tr.dur || 1.0;
    if (t < 0 || t > life) return;
    const [x, y] = pt(env, tr.pos || 'T', tr), a = easeOut(t / 0.2) * (1 - easeIn((t - life + 0.2) / 0.2));
    const gear = (gx, gy, r, teeth, rot, col) => { ctx.save(); ctx.translate(gx, gy); ctx.rotate(rot); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.strokeStyle = '#2a1c05'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < teeth * 2; i++) { const ang = (i / (teeth * 2)) * Math.PI * 2, rad = i % 2 ? r * 0.8 : r; const px = Math.cos(ang) * rad, py = Math.sin(ang) * rad; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(10,8,20,0.9)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, 7); ctx.fill(); ctx.restore(); };
    gear(x - 34, y - 14, 46, 10, t * 3.2, tr.color || '#d6a23a'); gear(x + 40, y + 6, 32, 8, -t * 4.5 + 0.2, tr.color2 || '#a9762a'); gear(x + 4, y - 66, 24, 7, t * 6, '#e8c566');
    glowDot(ctx, x, y, 90, tr.glow || '#ffd37a', 0.25 * a);
};

/** black hole: dark core, accretion rings, particles spiralling in. */
LAYERS.blackhole = (ctx, tr, env) => {
    const { t } = local(env, tr), life = tr.dur || 1.3;
    if (t < 0 || t > life + 0.15) return;
    const [x, y] = pt(env, tr.pos || 'T', tr), g = easeOut(t / 0.35) * (1 - easeIn((t - life + 0.1) / 0.25));
    const R = (tr.r || 74) * g;
    glowDot(ctx, x, y, R * 2.4, tr.color || '#7a4cff', 0.55 * g);
    ctx.save(); ctx.translate(x, y);
    for (let k = 0; k < 3; k++) { ctx.save(); ctx.rotate(t * (1.6 + k * 0.5) + k); ctx.scale(1, 0.34 + k * 0.1); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = k === 1 ? '#e8d8ff' : (tr.color || '#9d6bff'); ctx.globalAlpha = 0.7 * g; ctx.lineWidth = 5 - k; ctx.beginPath(); ctx.arc(0, 0, R * (1.15 + k * 0.28), 0.2, 5.4); ctx.stroke(); ctx.restore(); }
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, 7); ctx.fill();
    ctx.restore();
    for (let i = 0; i < 34; i++) {
        const rr = mulberry(hashS('bh' + i)), a0 = rr() * 6.28, r0 = 90 + rr() * 150, ph = (t * 1.5 + rr()) % 1;
        const r = r0 * (1 - ph), a = a0 + ph * 5;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = g * (0.2 + 0.7 * ph); ctx.fillStyle = i % 3 ? '#cdb8ff' : '#ffffff';
        ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.55), 4, 4); ctx.restore();
    }
};

/** full-screen colour wash that pulses (flash / darken / tint). */
LAYERS.wash = (ctx, tr, env) => {
    const { t, u } = local(env, tr); if (t < 0 || u > 1) return;
    const a = (tr.a || 0.5) * (tr.curve === 'in' ? easeIn(u) : tr.curve === 'out' ? 1 - u : bell(u));
    if (a <= 0.003) return;
    ctx.save(); if (tr.add) ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = tr.color || '#000'; ctx.fillRect(-60, -60, env.W + 120, env.H + 120); ctx.restore();
};

/** per-fighter sprite affects (💡 MULTI-TARGET 2026-10-26, owner: "fix up the
 * vfx for individual and multiple opponents - instead of pulling down a cut
 * out of the sprite and the background just grab the individual or multiple
 * enemy sprites and affect them"): draws PRE-TINTED copies of the REAL
 * combatant cutouts (Go layers `cuts`) exactly over their fighters. The
 * affect is the class colour washing the fighter's own pixels - the single
 * target, the whole enemy roster for AoE casts, or the caster/party for
 * self-casts. env.affectList = [{x,y,w,h,tinted}] built once per render. */
LAYERS.affect = (ctx, tr, env) => {
    const { t } = local(env, tr);
    const dur = tr.dur || 0.55;
    if (t < 0 || t > dur) return;
    const list = env.affectList || [];
    if (!list.length) return;
    const u = clamp01(t / dur);
    const k = tr.curve === 'hold' ? Math.min(1, u * 8) * (1 - u * u) : bell(u);
    const a = (tr.a || 0.85) * k;
    if (a <= 0.004) return;
    for (const c of list) {
        if (!c.tinted) continue;
        ctx.save();
        ctx.globalAlpha = a;
        if (tr.add !== false) ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(c.tinted, c.x, c.y, c.w, c.h);
        ctx.restore();
    }
};

/** generic particle emitter: dot | glow | star | spark | coin | leaf | soul | note | rune. */
LAYERS.emit = (ctx, tr, env) => {
    const n = tr.n || 24, life = tr.life || 0.9, dur = tr.dur || 1;
    for (let i = 0; i < n; i++) {
        const rr = mulberry(hashS('em' + i + tr.at + (tr.shape || '')));
        const born = tr.at + rr() * dur, t = env.time - born; if (t < 0 || t > life) continue;
        const [px0, py0] = pt(env, tr.pos || 'T', tr);
        const bx = px0 + (rr() - 0.5) * (tr.box ? tr.box[0] : 60), by = py0 + (rr() - 0.5) * (tr.box ? tr.box[1] : 30);
        const v = tr.v || [0, -60], vr = tr.vr || [40, 40];
        const vx = v[0] + (rr() - 0.5) * vr[0] * 2, vy = v[1] + (rr() - 0.5) * vr[1] * 2, gr = tr.g || 0;
        let x = bx + vx * t, y = by + vy * t + gr * t * t * 0.5;
        if (tr.swirl) { const a = t * tr.swirl + rr() * 6; x += Math.cos(a) * 14; y += Math.sin(a) * 6; }
        const u = t / life, a = (tr.fadeIn ? Math.min(1, u * 5) : 1) * (1 - u * u), cols = tr.colors || ['#ffffff'], col = cols[Math.floor(rr() * cols.length)];
        const sz = (tr.size || 5) * (0.6 + rr() * 0.8);
        ctx.save(); ctx.globalAlpha = a;
        switch (tr.shape || 'dot') {
            case 'glow': glowDot(ctx, x, y, sz * 3, col, a); break;
            case 'star': sprite(ctx, env.spr('p_star_02'), x, y, sz * 5, t * 3 + i, a, true); break;
            case 'spark': sprite(ctx, env.spr('p_spark_03'), x, y, sz * 6, Math.atan2(vy + gr * t, vx), a, true); break;
            case 'coin': { const sq = Math.abs(Math.cos(t * 12 + i)); ctx.fillStyle = '#ffcf3a'; ctx.strokeStyle = '#9a6a00'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y, sz * 1.4 * Math.max(0.2, sq), sz * 1.4, 0, 0, 7); ctx.fill(); ctx.stroke(); break; }
            case 'leaf': ctx.translate(x, y); ctx.rotate(t * 4 + i); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, sz * 1.5, sz * 0.7, 0, 0, 7); ctx.fill(); break;
            case 'soul': glowDot(ctx, x, y, sz * 3.2, col, a * 0.8); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 3, 5, 6); ctx.globalAlpha = a * 0.5; ctx.fillRect(Math.round(x) - 1, Math.round(y) + 3, 3, 8); break;
            case 'note': ctx.translate(x, y); ctx.rotate(-0.3); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, sz * 1.2, sz * 0.9, 0, 0, 7); ctx.fill(); ctx.fillRect(sz * 0.9, -sz * 3, 2, sz * 3); ctx.fillRect(sz * 0.9, -sz * 3, sz * 1.6, 3); break;
            case 'spr': sprite(ctx, env.spr(tr.spr || 'p_magic_03'), x, y, sz * 6, t * (tr.spin || 0), a, true); break;
            default: ctx.fillStyle = col; ctx.globalAlpha = a; if (tr.add) ctx.globalCompositeOperation = 'lighter'; ctx.fillRect(Math.round(x), Math.round(y), Math.round(sz), Math.round(sz));
        }
        ctx.restore();
    }
};

module.exports = { LAYERS, boneHand };
