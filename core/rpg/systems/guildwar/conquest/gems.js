'use strict';
// 💎 AETHER GEMS — veins, mining speed, carry risk, banking. State-side only; the caller credits user.gems.
const { CFG } = require('./config');
const E = require('./engine');
const { mulberry32, hashStr } = require('./mapgen');

/** Mines building level (the live mining progression) -> swing time and yield. Lv1: ~13s / 2 gems; Lv10: 5s / 5 gems. */
function rate(level) { level = Math.max(1, Number(level) || 1); return { sec: Math.max(CFG.GEM_MINE_MIN_SEC, +(CFG.GEM_MINE_BASE_SEC - level * 0.9).toFixed(1)), yield: CFG.GEM_BASE_YIELD + Math.floor(level / 3) }; }
const xpFor = (amt) => 6 + amt * 3;

function mine(state, { jid, level, now = Date.now() }) {
    const p = state.players[jid]; if (!p) return { ok: false, msg: 'You are not in this war.' };
    if (E.locked(state, jid)) return { ok: false, msg: 'You cannot mine while marching or fighting.' };
    const v = E.view(state, p.at); if (!v || !v.vein) return { ok: false, msg: 'There is no Aether vein here. Gem veins glow ◆ on the war map.' };
    if (v.owner && v.owner !== p.guild) return { ok: false, msg: 'An enemy guild holds this vein — take it first.' };
    if (v.veinLeft <= 0) return { ok: false, msg: 'This vein is exhausted.' };
    if ((p.mineReadyAt || 0) > now) return { ok: false, msg: `Your pick is still swinging (${Math.ceil((p.mineReadyAt - now) / 1000)}s).` };
    if ((p.carried || 0) >= CFG.GEM_CARRY_CAP) return { ok: false, msg: `You are carrying the maximum (${CFG.GEM_CARRY_CAP}). Haul it home and \`bank\` it.` };
    const r = rate(level); const rng = mulberry32(hashStr(jid + ':' + now));
    let amt = Math.round(r.yield * (0.8 + rng() * 0.5)); amt = Math.max(1, Math.min(amt, v.veinLeft, CFG.GEM_CARRY_CAP - (p.carried || 0)));
    E.ov(state, v.id).veinLeft = v.veinLeft - amt; p.carried = (p.carried || 0) + amt; p.mineReadyAt = now + r.sec * 1000;
    return { ok: true, amount: amt, xp: xpFor(amt), msg: `⛏️ +${amt} ${CFG.GEM_NAME} (carrying ${p.carried}) — vein ${v.veinLeft - amt} left. Next swing in ${r.sec}s.`, veinLeft: v.veinLeft - amt };
}
/** banking requires standing on a tile your guild holds that is a Keep or Ley Gate; 15% tithe to the guild treasury */
function bank(state, { jid }) {
    const p = state.players[jid]; if (!p) return { ok: false, msg: 'You are not in this war.' }; if (E.locked(state, jid)) return { ok: false, msg: 'Not while marching or fighting.' };
    const v = E.view(state, p.at); if (!v || v.owner !== p.guild || !['keep', 'ley_gate'].includes(v.kind)) return { ok: false, msg: 'Bank at a Keep or Ley Gate your guild holds.' };
    if (!(p.carried > 0)) return { ok: false, msg: 'You carry no ore.' };
    const room = Math.max(0, CFG.GEM_PER_WAR_CAP - (p.banked || 0)); const take = Math.min(p.carried, Math.ceil(room / 0.85)); if (take <= 0) return { ok: false, msg: `War cap reached (${CFG.GEM_PER_WAR_CAP}).` };
    const tithe = Math.floor(take * 0.15); const credit = Math.min(room, take - tithe);
    p.carried -= take; p.banked = (p.banked || 0) + credit; state.guilds[p.guild].treasury += tithe;
    return { ok: true, credit, tithe, msg: `💎 Banked ${credit} ${CFG.GEM_NAME} (+${tithe} to the guild treasury).` };
}
/** peacetime: a hidden seam can turn up on any mine command — rare, deeper Mines help a little */
function rollSeam(level, rnd = Math.random) { const ch = CFG.GEM_SEAM_PEACE_CHANCE * (1 + Math.min(level, 20) / 20); if (rnd() >= ch) return 0; return 3 + Math.floor(rnd() * 6); }
/** apply a bank credit to a user doc (persistent currency) */
function credit(user, amount, warKey) { if (!user || !(amount > 0)) return 0; user.gems = (user.gems || 0) + amount; return user.gems; }
module.exports = { rate, mine, bank, rollSeam, credit, xpFor };
