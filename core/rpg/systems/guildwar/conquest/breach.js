'use strict';
// 🧱 WALL BREACH — the interactive siege encounter. Pure logic over a plain JSON object (so it persists in
// the war doc and is trivially testable). Phases: 'wall' (break four wall sections; towers carry the turrets)
// -> 'golems' (the garrison steps out) -> 'won' | 'lost'.  Every round an ENVIRONMENT CARD is drawn.
const { CFG } = require('./config');
const env = require('./envCards');
const { mulberry32, hashStr } = require('./mapgen');

const WALL_ACTIONS = ['ram', 'ladder', 'sapper', 'fire', 'rune', 'shield', 'scout'];
const GOLEM_ACTIONS = ['strike', 'guard', 'shatter', 'lure', 'rally'];
const SECTIONS = ['gate', 'towerL', 'towerR', 'curtain'];
const SHARE = { gate: 0.4, towerL: 0.2, towerR: 0.2, curtain: 0.2 };
const ACTION_HELP = {
    ram: 'smash the gate (wood ×1.3, runed ×0.7)', ladder: 'scale towers/curtain, exposed to fire',
    sapper: 'tunnel under a section, blows in 2 rounds (×3)', fire: 'burn a section 3 rounds (great vs wood, weak vs stone)',
    rune: 'arcane breaking: ignores wall type, strips wards', shield: 'cover the party: turret/hazard damage ×0.4', scout: 'mark a weak point: +40% dmg there next round',
    strike: 'hit a golem', guard: 'brace: golem damage on you ×0.4', shatter: 'crack the core: ×1.6 vs clay/stone, ×0.5 vs rune', lure: 'draw the golems\' attacks onto you (they hit ×0.7)', rally: 'heal the party 6% max HP',
};
const baseDmg = (p) => 12 + 6 * Math.sqrt(Math.max(0, p));
const maxHpFor = (p) => Math.round(100 + 18 * Math.sqrt(Math.max(0, p)));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** tile: {kind, defence:{wall:{type,hp,max}, golems:[], turrets:[], buffs:{atk,hp}}, biome}; party: [{jid,name,power}] */
function create({ id, tileId, biome, tileName, attacker, defender, party, defence, now = Date.now() }) {
    const wall = defence.wall;
    const sections = {};
    if (wall && wall.hp > 0) for (const s of SECTIONS) { const mx = Math.max(1, Math.round(wall.max * SHARE[s])); sections[s] = { hp: Math.min(mx, Math.round(wall.hp * SHARE[s])), max: mx }; }
    const buffs = defence.buffs || {};
    const b = {
        id, tileId, biome, tileName, attacker, defender: defender || null, phase: wall ? 'wall' : 'golems', round: 0, startedAt: now, roundEndsAt: 0,
        wallType: wall ? wall.type : null, sections, weak: null, burning: {}, mines: [], status: { slow: 0, golemSurge: 0, ward: 0 },
        party: {}, env: null, envHistory: [], turrets: (defence.turrets || []).map((t, i) => ({ id: 't' + i, kind: t.kind, lvl: t.lvl || 1, mount: ['towerL', 'towerR', 'gate'][i % 3] })),
        golems: (defence.golems || []).map((g, i) => { const base = CFG.GOLEM_BASE[g.kind] || CFG.GOLEM_BASE.clay; const lv = 1 + 0.3 * ((g.lvl || 1) - 1); const hp = Math.round(base.hp * lv * (1 + (buffs.hp || 0))); return { id: 'g' + i, kind: g.kind, lvl: g.lvl || 1, hp, max: hp, atk: Math.round(base.atk * lv * (1 + (buffs.atk || 0))) }; }),
        outcome: null, entry: null, climbed: false, log: [],
    };
    for (const p of party) { const mx = maxHpFor(p.power); b.party[p.jid] = { jid: p.jid, name: p.name || p.jid.split('@')[0], power: p.power, hp: mx, max: mx, action: null, target: null, lastAction: null }; }
    if (b.phase === 'golems' && !b.golems.length) { b.phase = 'won'; b.outcome = 'won'; }
    return b;
}

const alive = (b) => Object.values(b.party).filter((m) => m.hp > 0);
const rngFor = (b) => mulberry32(hashStr(`${b.id}:${b.round}`));
function liveSections(b) { return SECTIONS.filter((s) => b.sections[s] && b.sections[s].hp > 0); }
const activeTurrets = (b) => b.turrets.filter((t) => !b.sections[t.mount] || b.sections[t.mount].hp > 0);

function startRound(b, now = Date.now()) {
    if (b.outcome) return b;
    b.round += 1; const rng = rngFor(b);
    const card = env.draw(b.biome, rng, b.envHistory);
    b.env = card.id; b.envHistory.push(card.id); b.roundEndsAt = now + CFG.BREACH_ROUND_SEC * 1000;
    for (const m of Object.values(b.party)) { m.action = null; m.target = null; }
    if (card.flags && card.flags.includes('revealWeak') && b.phase === 'wall') { const ls = liveSections(b); if (ls.length) b.weak = ls[Math.floor(rng() * ls.length)]; }
    if (card.flags && card.flags.includes('golemSurge')) b.status.golemSurge = 2;
    return b;
}

function submit(b, jid, action, target) {
    const m = b.party[jid]; if (!m) return { ok: false, msg: 'You are not in this assault.' };
    if (m.hp <= 0) return { ok: false, msg: 'You are down — wait for the assault to end.' };
    if (b.outcome) return { ok: false, msg: 'The assault is over.' };
    action = String(action || '').toLowerCase();
    const valid = b.phase === 'wall' ? WALL_ACTIONS : GOLEM_ACTIONS;
    if (!valid.includes(action)) return { ok: false, msg: `Options now: ${valid.join(', ')}.` };
    let tgt = target ? String(target).toLowerCase() : null;
    if (b.phase === 'wall') {
        if (['ram', 'ladder', 'sapper', 'fire', 'rune', 'scout'].includes(action)) {
            const alias = { l: 'towerL', left: 'towerL', tl: 'towerL', r: 'towerR', right: 'towerR', tr: 'towerR', g: 'gate', c: 'curtain', wall: 'curtain', towerl: 'towerL', towerr: 'towerR' };
            if (tgt) tgt = alias[tgt] || tgt;
            if (tgt && !SECTIONS.includes(tgt)) return { ok: false, msg: 'Target: gate, left, right or curtain.' };
            if (tgt && (!b.sections[tgt] || b.sections[tgt].hp <= 0)) return { ok: false, msg: `The ${tgt} is already down.` };
            if (!tgt) tgt = action === 'ram' ? 'gate' : (liveSections(b).find((s) => s !== 'gate') || 'gate');
            if (action === 'ladder' && tgt === 'gate') return { ok: false, msg: 'Ladders need a wall to climb: left, right or curtain.' };
        } else tgt = null;
    } else if (['strike', 'shatter'].includes(action)) {
        const gs = b.golems.filter((g) => g.hp > 0);
        const idx = tgt && /^g?\d+$/.test(tgt) ? parseInt(tgt.replace('g', ''), 10) - 1 : -1;
        tgt = gs[idx] ? gs[idx].id : (gs[0] && gs[0].id);
    } else tgt = null;
    m.action = action; m.target = tgt; return { ok: true, action, target: tgt };
}
const allSubmitted = (b) => alive(b).length > 0 && alive(b).every((m) => m.action);
const due = (b, now = Date.now()) => !b.outcome && b.roundEndsAt && now >= b.roundEndsAt;

function wallMult(b, section, action, card) {
    let m = 1; const t = b.wallType;
    if (action === 'ram') m *= t === 'wood' ? 1.3 : t === 'runed' ? 0.7 : 1; if (action === 'ram' && section !== 'gate') m *= 0.55;
    if (action === 'fire') m *= t === 'wood' ? 1.4 : t === 'runed' ? 0.3 : 0.5;
    if (action === 'rune' && t === 'runed') m *= 1.2;
    if (action === 'ladder') m *= 0.7;
    if (card.flags && card.flags.includes('woodVuln') && t === 'wood') m *= 1.3;
    if (card.flags && card.flags.includes('crackWall') && ['ram', 'sapper'].includes(action)) m *= 1.1;
    if (b.status.ward > 0 && ['ram', 'fire', 'ladder', 'sapper'].includes(action)) m *= 0.75;
    if (b.status.slow > 0 && ['ram', 'ladder'].includes(action)) m *= 0.85;
    if (b.weak === section) m *= 1.4;
    return m * (card.mods[action] || 1);
}

function hitSection(b, s, dmg, lines, tag) {
    const sec = b.sections[s]; if (!sec || sec.hp <= 0 || dmg <= 0) return;
    dmg = Math.round(dmg); sec.hp = Math.max(0, sec.hp - dmg);
    lines.push(`${tag} ${labelOf(s)} -${dmg}${sec.hp === 0 ? ' 💥 DOWN' : ''}`);
}
const labelOf = (s) => ({ gate: 'Gate', towerL: 'Left tower', towerR: 'Right tower', curtain: 'Curtain wall' }[s] || s);

function resolveRound(b) {
    if (b.outcome) return { lines: [], outcome: b.outcome };
    const rng = rngFor(b); const rng2 = mulberry32(hashStr(`${b.id}:${b.round}:x`));
    const card = env.BY_ID[b.env] || env.BY_ID.clear; const lines = [`${card.icon} *${card.name}* — ${card.text}`];
    const party = alive(b);
    for (const m of party) if (!m.action) { m.action = b.phase === 'wall' ? 'ram' : 'strike'; m.target = null; if (b.phase === 'wall') m.target = 'gate'; else { const g = b.golems.find((x) => x.hp > 0); m.target = g && g.id; } m.auto = true; }
    const shielded = new Set(party.filter((m) => m.action === (b.phase === 'wall' ? 'shield' : 'guard')).map((m) => m.jid));
    const coverCount = b.phase === 'wall' ? party.filter((m) => m.action === 'shield').length : 0;
    const dmgToParty = (m, raw, tag) => { const f = (shielded.has(m.jid) ? 0.4 : coverCount ? 0.8 : 1); const d = Math.max(0, Math.round(raw * f)); m.hp = Math.max(0, m.hp - d); if (d) lines.push(`${tag} ${m.name} -${d}${m.hp === 0 ? ' ☠️ down' : ''}`); };

    // hazard
    if (card.hazard) for (const m of party) dmgToParty(m, m.max * card.hazard * (0.7 + rng() * 0.6), '⚠️');

    if (b.phase === 'wall') {
        // scouts
        const scouts = party.filter((m) => m.action === 'scout');
        if (scouts.length) { const ls = liveSections(b); const pick = scouts.find((s) => s.target && b.sections[s.target] && b.sections[s.target].hp > 0); const tgt = (pick && pick.target) || ls[Math.floor(rng() * ls.length)]; if (tgt && rng() < clamp(0.55 + 0.1 * scouts.length + ((card.mods.scout || 1) - 1) * 0.25, 0.1, 0.95)) { b.weak = tgt; lines.push(`🔍 Scouts mark a weak point: *${labelOf(tgt)}* (+40% next round)`); } else lines.push('🔍 Scouts lose the trail — no weak point found.'); } else if (!(card.flags && card.flags.includes('revealWeak'))) b.weak = b.weak;
        // damage
        const hits = {}; const kindled = {};
        for (const m of party) if (['ram', 'ladder', 'fire', 'rune'].includes(m.action)) { hits[m.target] = (hits[m.target] || 0) + 1; if (m.action === 'fire') kindled[m.target] = true; }
        const weakNow = b.weak;
        for (const m of party) {
            const a = m.action; if (!['ram', 'ladder', 'sapper', 'fire', 'rune'].includes(a)) continue;
            const s = m.target; if (!b.sections[s] || b.sections[s].hp <= 0) continue;
            const base = baseDmg(m.power) * (0.85 + rng() * 0.3);
            if (a === 'sapper') { b.mines.push({ s, power: m.power, det: b.round + 2, by: m.jid }); lines.push(`⛏️ ${m.name} tunnels beneath the ${labelOf(s)} (blows round ${b.round + 2})`); if (card.flags && card.flags.includes('sapperRisk') && rng2() < 0.3) { b.mines.pop(); m.hp = Math.max(0, m.hp - Math.round(m.max * 0.15)); lines.push(`🕳️ The tunnel collapses on ${m.name}! (-15%)`); } continue; }
            let d = base * wallMult(b, s, a, card);
            if (hits[s] >= 3) d *= 1.15;
            if (a === 'ram' && kindled[s] && b.wallType === 'wood') d *= 1.25;
            if (a === 'fire') { b.burning[s] = { left: 3, power: m.power }; d *= 0.6; }
            if (a === 'rune' && b.status.ward > 0) { b.status.ward = 0; lines.push(`🔮 ${m.name} shreds the ward!`); }
            if (a === 'ladder') b.climbed = true;
            hitSection(b, s, d, lines, `${ICON[a]} ${m.name}`);
        }
        // fire spread on oil/tar cards
        if (card.flags && card.flags.includes('flammableOil') && Object.keys(kindled).length) { for (const m of party) if (!shielded.has(m.jid) && rng2() < 0.35) dmgToParty(m, m.max * 0.1, '🔥 oil ignites near'); }
        // burning ticks (not on the round it was applied)
        for (const s of Object.keys(b.burning)) { const bn = b.burning[s]; if (bn.left <= 0) { delete b.burning[s]; continue; } if (!kindled[s] || bn.left < 3) { const tick = baseDmg(bn.power) * 0.45 * (b.wallType === 'wood' ? 1.4 : b.wallType === 'runed' ? 0.3 : 0.5) * (card.mods.fire || 1); hitSection(b, s, tick, lines, '🔥 burning'); } bn.left -= 1; if (bn.left <= 0) delete b.burning[s]; }
        // mines
        b.mines = b.mines.filter((mn) => { if (b.round < mn.det) return true; const d = baseDmg(mn.power) * 3.2 * (card.mods.sapper || 1) * (b.weak === mn.s ? 1.4 : 1); hitSection(b, mn.s, d, lines, '💣 mine'); return false; });
        // mender
        if (card.repair) for (const s of liveSections(b)) { const sec = b.sections[s]; const r = Math.round(sec.max * card.repair); sec.hp = Math.min(sec.max, sec.hp + r); } if (card.repair) lines.push('🧱 Menders patch the wall (+8% each section).');
        if (card.flags && card.flags.includes('wardUp')) b.status.ward = 1; else if (b.status.ward > 0 && !(card.flags || []).includes('wardUp')) b.status.ward = Math.max(0, b.status.ward - 1);
        if (b.weak && weakNow === b.weak && !scouts.length) b.weak = null; // weak point is only good for one round
        if (b.weak && b.sections[b.weak] && b.sections[b.weak].hp <= 0) b.weak = null;
        // towers fall => turrets on them are silenced (reported once)
        for (const s of ['towerL', 'towerR']) if (b.sections[s] && b.sections[s].hp <= 0) { const n = b.turrets.filter((t) => t.mount === s && !t._silenced).length; if (n) { b.turrets.filter((t) => t.mount === s).forEach((t) => { t._silenced = true; }); lines.push(`🏹 The ${labelOf(s)} falls — ${n} turret(s) silenced.`); } }
        // breach check
        if (b.sections.gate && b.sections.gate.hp <= 0) { b.phase = 'golems'; b.entry = 'gate'; lines.push('🚪 *THE GATE FALLS!* The garrison steps out…'); }
        else if (b.sections.curtain && b.sections.curtain.hp <= 0 && b.climbed) { b.phase = 'golems'; b.entry = 'escalade'; for (const m of alive(b)) m.hp = Math.round(m.hp * 0.9); lines.push('🪜 *ESCALADE!* You pour over the broken curtain wall (-10% HP) — the golems turn to meet you.'); }
        if (b.phase === 'golems' && !b.golems.some((g) => g.hp > 0)) { b.phase = 'won'; b.outcome = 'won'; }
    } else if (b.phase === 'golems') {
        const live = b.golems.filter((g) => g.hp > 0);
        for (const m of party) {
            const gidx = (id) => b.golems.find((g) => g.id === id && g.hp > 0) || b.golems.find((g) => g.hp > 0);
            if (m.action === 'strike' || m.action === 'shatter') {
                const g = gidx(m.target); if (!g) continue; let d = baseDmg(m.power) * (0.85 + rng() * 0.3);
                if (m.action === 'shatter') d *= g.kind === 'rune' ? 0.5 : (g.kind === 'clay' || g.kind === 'stone') ? 1.6 : 1.1 * (card.mods.rune || 1);
                else d *= g.kind === 'iron' ? 0.8 : 1;
                d = Math.round(d); g.hp = Math.max(0, g.hp - d); lines.push(`${m.action === 'shatter' ? '🔨' : '⚔️'} ${m.name} → ${g.kind} golem -${d}${g.hp === 0 ? ' 🗿 SHATTERED' : ''}`);
            } else if (m.action === 'rally') { const h = Math.round(m.max * 0.06 * 1); for (const o of alive(b)) o.hp = Math.min(o.max, o.hp + h); lines.push(`💚 ${m.name} rallies the party (+${h} each)`); }
        }
        const lurers = alive(b).filter((m) => m.action === 'lure');
        const surge = (card.golem || 1) * (b.status.golemSurge > 0 ? 1.35 : 1);
        for (const g of b.golems.filter((x) => x.hp > 0)) {
            const pool = lurers.length ? lurers : alive(b); if (!pool.length) break; const m = pool[Math.floor(rng2() * pool.length)];
            dmgToParty(m, g.atk * 3 * surge * (lurers.length ? 0.7 : 1) * (0.9 + rng2() * 0.2), `🗿 ${g.kind} golem hits`);
        }
        if (!b.golems.some((g) => g.hp > 0)) { b.phase = 'won'; b.outcome = 'won'; lines.push('🏆 *The last golem crumbles.*'); }
    }
    // turrets (not on the round the wall phase just ended into golem phase? they still fire)
    if (!b.outcome) {
        const ts = activeTurrets(b).filter((t) => !t._silenced);
        const mult = card.turret != null ? card.turret : 1;
        for (const t of ts) {
            const base = CFG.TURRET_BASE[t.kind] || CFG.TURRET_BASE.ballista; const al = alive(b); if (!al.length) break;
            const buff = 1 + 0.25 * (t.lvl - 1); const d = base.dmg * 5 * buff * mult * (0.9 + rng2() * 0.2);
            const targets = t.kind === 'arc' ? [al[Math.floor(rng2() * al.length)], al[Math.floor(rng2() * al.length)]] : [al[Math.floor(rng2() * al.length)]];
            // flame turrets love ladder climbers; ballistas love lone figures
            targets.forEach((m) => dmgToParty(m, d * (t.kind === 'flame' && m.action === 'ladder' ? 1.4 : 1), `🏹 ${t.kind} turret hits`));
            if (t.kind === 'frost') { b.status.slow = 1; }
        }
        if (b.status.slow > 0 && !ts.some((t) => t.kind === 'frost')) b.status.slow = Math.max(0, b.status.slow - 1);
        if (b.status.golemSurge > 0) b.status.golemSurge -= 1;
    }
    for (const m of Object.values(b.party)) { m.lastAction = m.action; }
    if (!b.outcome && !alive(b).length) { b.outcome = 'lost'; b.phase = 'lost'; lines.push('💀 The assault is broken — no one is left standing.'); }
    else if (!b.outcome && b.round >= CFG.BREACH_MAX_ROUNDS) { b.outcome = 'lost'; b.phase = 'lost'; lines.push('⏳ Out of time — the siege is called off.'); }
    b.log = lines.slice(0, 40);
    return { lines, outcome: b.outcome };
}
const ICON = { ram: '🪵', ladder: '🪜', fire: '🔥', rune: '🔮', sapper: '⛏️' };

/** remaining wall hp after the fight, to persist on the tile */
function wallRemaining(b) { return Object.values(b.sections).reduce((s, x) => s + x.hp, 0); }
function statusText(b) {
    const card = env.BY_ID[b.env];
    const L = [`🧱 *${b.tileName}* — round ${b.round}/${CFG.BREACH_MAX_ROUNDS}${card ? `  ${card.icon} ${card.name}` : ''}`];
    if (b.phase === 'wall') { for (const s of SECTIONS) { const x = b.sections[s]; if (!x) continue; const pct = Math.round((x.hp / x.max) * 100); L.push(`${b.weak === s ? '🎯' : '▫️'} ${labelOf(s)} ${bar(pct)} ${x.hp}/${x.max}${b.burning[s] ? ' 🔥' : ''}${b.mines.some((m) => m.s === s) ? ' ⛏️' : ''}`); }
        const ts = activeTurrets(b).filter((t) => !t._silenced); if (b.turrets.length) L.push(`🏹 Turrets: ${ts.length}/${b.turrets.length} firing (${b.turrets.map((t) => t.kind + (t._silenced ? '✖' : '')).join(', ')})`); }
    else { for (const [i, g] of b.golems.entries()) L.push(`🗿 [${i + 1}] ${g.kind} golem ${bar(Math.round((g.hp / g.max) * 100))} ${g.hp}/${g.max}`); }
    L.push('👥 ' + Object.values(b.party).map((m) => `${m.name} ${m.hp > 0 ? Math.round((m.hp / m.max) * 100) + '%' : '☠️'}${m.action ? '✔' : ''}`).join(' · '));
    return L.join('\n');
}
const bar = (p) => '▓'.repeat(Math.round(p / 10)) + '░'.repeat(10 - Math.round(p / 10));
module.exports = { create, startRound, submit, resolveRound, allSubmitted, due, alive, wallRemaining, statusText, WALL_ACTIONS, GOLEM_ACTIONS, SECTIONS, ACTION_HELP, baseDmg, maxHpFor };
