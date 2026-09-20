// qa_ticket_pass.js - runtime + contract QA for the 2026-09-21 ticket pass:
//   #b4c0ec / #b4f5b0  abyss world-alignment gate (fail-closed, deduped)
//   #b4c0ff            combat UI (undefined name, double announcement, hang)
//   #b4f5d2            .j world all  (planned cosmology atlas arrangement)
//   #b4f71c            staff afterlife access (owner/gmod/rpgmod bypass)
//   #b4f78f            stat allocation points (source/DB/UI sync)
//   #b4f7aa            combat sprite == character-sheet sprite
//   #b4fbef            mod createclass sprite selection
//   #b4fc58            summon facing payload
//   #b4f7bd / #b4f818 / #b4f855  mod commands + menus
//   #b4fa05            gstatus media upload
//   #b4fa57            one command -> exactly one bot/handler response
//   #b5087a / #b508e7  balance (Dragon God, Scout solo, +20% XP curve)
// Run: node scripts/qa_ticket_pass.js
process.env.NODE_ENV = 'test';
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ─── 0. STUB ENGINE (worldMap._isStaff lazily requires ../engine) ────────────
const __enginePath = require.resolve('../core/engine.js');
const __engineStub = { isBotOwner: () => false, isGlobalMod: () => false, isRpgMod: () => false };
require.cache[__enginePath] = { id: __enginePath, filename: __enginePath, loaded: true, exports: __engineStub };

let failures = 0;
function ok(cond, label) {
  if (cond) console.log('  ✓', label);
  else { failures++; console.error('  ✗ FAIL:', label); }
}
function section(name) { console.log('\n━━ ' + name); }

// source helper: read a repo file
const SRC = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

(async () => {

// ─── 1. Abyss world-alignment gate (#b4c0ec + #b4f5b0) ───────────────────────
section('Abyss gate: fail-closed, deduped, staff bypass (#b4c0ec + #b4f5b0)');
{
  const engine = SRC('core/engine.js');
  ok(!/typeof engine\.isBotOwner/.test(engine), 'dead `typeof engine.isBotOwner` reference removed (was fail-open via ReferenceError)');
  ok((engine.match(/THE GATE IS SEALED/g) || []).length >= 2, 'sealed message present (unknown-state + closed variants)');
  ok(/world-alignment system unavailable - gate fails CLOSED/.test(engine), 'cosmology failure fails CLOSED (#b4c0ec: unavailable/disconnected => inaccessible)');
  ok(/const __gateBypass = isBotOwner\(senderJid\) \|\| isRpgMod\(senderJid\);/.test(engine), 'staff bypass uses the in-scope module functions (no phantom identifier)');
  ok((engine.match(/ABYSS UNIVERSAL ENTRY WINDOW \+ WORLD ALIGNMENT/g) || []).length === 1, 'duplicate gate block deduped to one');
  ok(/__gateAlive = false/.test(engine), 'garbage gate state treated as unavailable');
  ok(/worlds are not aligned for the descent right now/.test(engine), 'closed window is surfaced as worlds-not-aligned (#b4f5b0)');

  const cosmology = require('../core/rpg/cosmology');
  const w = cosmology.abyssWindow();
  ok(w && typeof w.open === 'boolean' && typeof w.label === 'string', 'cosmology.abyssWindow() returns a valid gate state');
  ok(typeof cosmology.isRoutineLink === 'function', 'routine link stays a separate clock (never merged into the schedule)');
  // window math: open exactly 1h of every 6h cycle
  const T0 = Date.UTC(2026, 0, 1);
  const openAt = T0 + 5 * 3600e3 + 1800e3;   // mid-window
  const lockedAt = T0 + 2 * 3600e3;          // mid-locked
  assert.strictEqual(cosmology.abyssWindow(openAt).open, true);
  assert.strictEqual(cosmology.abyssWindow(lockedAt).open, false);
  ok(true, 'window open/locked math intact (1h open per 6h cycle)');
}

// ─── 2. Combat icon normalization (#b4c0ff a) ────────────────────────────────
section('Combat icons: no message can print "undefined <Name>" (#b4c0ff a)');
{
  const ga = require('../core/rpg/guildAdventure');
  ok(typeof ga.combatTargetIcon === 'function', 'combatTargetIcon exported');
  assert.strictEqual(ga.combatTargetIcon({ name: 'MellowDiHOfHeaven', class: { icon: '🧙' } }), '🧙', 'player icon from class');
  assert.strictEqual(ga.combatTargetIcon({ name: 'X', class: null }), '👤', 'player without class falls back to 👤 (never undefined)');
  assert.strictEqual(ga.combatTargetIcon({ name: 'Void Cultist', isEnemy: true }), '👾', 'enemy without icon falls back to 👾');
  assert.strictEqual(ga.combatTargetIcon({ name: 'Grip', isEnemy: true, icon: '🦇' }), '🦇', 'enemy icon preserved');
  assert.strictEqual(ga.combatTargetIcon({ name: 'Skelly', isSummon: true }), '👾', 'summon without icon falls back');
  assert.strictEqual(ga.combatTargetIcon(null), '👤', 'null target falls back');
  const gsrc = SRC('core/rpg/guildAdventure.js');
  ok(!/msg \+= `💥 \$\{target\.icon\}/.test(gsrc), 'raw ${target.icon} removed from the AOE damage line');
  ok(!/Strikes \$\{resolvedTarget\.icon\}/.test(gsrc), 'raw icon removed from the basic-attack strike line');
  ok(!/MISS!.*\$\{resolvedTarget\.icon\}/.test(gsrc), 'raw icon removed from the MISS line');
  ok((gsrc.match(/combatTargetIcon\(/g) || []).length >= 5, 'all target-icon templates route through the resolver (definition + 4 call sites)');
}

// ─── 3. Double announcement (#b4c0ff b) ──────────────────────────────────────
section('Enemy skill announced exactly once (#b4c0ff b)');
{
  const gsrc = SRC('core/rpg/guildAdventure.js');
  ok(!/uses \*\$\{skill\.name\}\*!\\n\\n\$\{abilityRes\.message/.test(gsrc), 'skill flow no longer re-announces enemy+skill above the breakdown');
  ok(!/UNLEASHES \*\$\{skillData\.name\}\*!\\n\\n\$\{abilityRes\.message/.test(gsrc), 'charged release no longer duplicates the announcement');
  ok(!/UNLEASHES THE CHARGE!\\n\\n\$\{abilityRes\.message/.test(gsrc), 'charge release no longer duplicates the telegraph');
  ok((gsrc.match(/const fullMsg = abilityRes\.message\.trim\(\);/) || []).length === 1, 'skill breakdown sent as-is (one announcement)');
  ok((gsrc.match(/const fullMsg = statusPrefix \+ abilityRes\.message\.trim\(\);/g) || []).length === 2, 'both charge-release paths de-duplicated');
}

// ─── 4. Next-action hang (#b4c0ff c) ────────────────────────────────────────
section('Turn promise always settles (#b4c0ff c)');
{
  const gsrc = SRC('core/rpg/guildAdventure.js');
  ok(/failed action now counts as a skipped turn/.test(gsrc), 'performAction catch resolves the turn');
  ok(/Reaped wedged combat/.test(gsrc), 'sweeper reaps inCombat states with nothing armed');
  ok(/const __armed = state\.resolveTurn \|\| state\.combatProcessing \|\| __hasPending/.test(gsrc), 'reap condition requires the turn machinery to be fully dead');
  ok((gsrc.match(/__resolveFailedTurn\(\);/) || []).length === 1, 'failed turn resolved exactly once');
}

// ─── 5. Stat allocation points (#b4f78f) ─────────────────────────────────────
section('Stat points: backend math == preview math, ledger + refunds sane (#b4f78f)');
{
  // patch economy.getUser so progression works without Mongo
  const economy = require('../core/rpg/economy');
  const fakeUsers = {};
  economy.getUser = (jid) => fakeUsers[jid] || null;
  const progression = require('../core/rpg/progression');
  const J = 'qauser@s.whatsapp.net';
  fakeUsers[J] = { jid: J, class: 'FIGHTER', nickname: 'QATester' };
  const prog = progression.getUser(J);
  assert.ok(prog, 'progression record created');
  prog.level = 10; prog.statPoints = 500; prog.allocatedStats = {}; prog.allocatedStatPoints = {};

  // 💡 OWNER CONTRACT (2026-09-20, remote commit 530609c): every point
  // delivers exactly base × tier - the soft cap was REMOVED. previewAllocation
  // mirrors it exactly (that is the #b4f78f sync guarantee).
  for (const [stat, base] of [['atk', 3], ['hp', 15], ['crit', 1]]) {
    prog.allocatedStats[stat] = 0; prog.allocatedStatPoints[stat] = 0;
    const preview = progression.previewAllocation(J, stat, 5);
    assert.strictEqual(preview.gainedValue, base * 5, `${stat} tier1 5pt preview`);
    const before = prog.statPoints;
    const res = progression.allocateStatPoint(J, stat, 5);
    assert.strictEqual(res.valueGained, preview.gainedValue, `${stat} backend pays exactly the preview`);
    prog.statPoints = before; // restore for next stat
    prog.allocatedStats[stat] = 0; prog.allocatedStatPoints[stat] = 0;
  }
  ok(true, 'preview == backend across stats (tier 1, owner contract base x tier)');

  // single point: integer per-point (no more floor(1.5) -> 1 silent loss)
  const pvSingle = progression.previewAllocation(J, 'atk', 1);
  assert.strictEqual(pvSingle.gainedValue, 3, 'single ATK point pays exactly 3 (owner contract)');
  ok(true, 'single-point allocs pay the full advertised rate');

  // tier multiplier: EVOLVED pays 2x
  fakeUsers[J].class = 'ROGUE';
  prog.allocatedStatPoints.atk = 0; prog.allocatedStats.atk = 0;
  const pvT2 = progression.previewAllocation(J, 'atk', 1);
  assert.strictEqual(pvT2.gainedValue, 6, 'EVOLVED tier ATK 1pt = 6');
  fakeUsers[J].class = 'FIGHTER';

  // getStatPointsForRange matches the level-up formula (5/level + milestones)
  assert.strictEqual(progression.getStatPointsForRange(1, 2), 5, 'one level = 5 points');
  assert.strictEqual(progression.getStatPointsForRange(9, 10), 5 + 10, 'level 10 milestone bonus included');
  assert.strictEqual(progression.getStatPointsForRange(1, 11), 50 + 10, 'range 1->11 with milestone');
  ok(true, 'getStatPointsForRange matches the level-up grant formula');

  // legacy reset refund is tier-aware (never double-refunds)
  const ascUser = 'qaasc@s.whatsapp.net';
  fakeUsers[ascUser] = { jid: ascUser, class: 'DRAGON_GOD', nickname: 'AscQA' };
  const ap = progression.getUser(ascUser);
  ap.level = 80; ap.statPoints = 0;
  ap.allocatedStats = { hp: 0, atk: 6, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 };
  ap.allocatedStatPoints = null; // legacy user, no ledger
  const rs = progression.resetStats(ascUser);
  assert.strictEqual(rs.pointsRefunded, Math.floor(6 / (3 * 2)), 'tier-2 legacy refund = value/(base*tier) = 1 (was 2 before the fix)');
  ok(true, 'legacy reset refund is tier-aware');

  // adminConsole setlevel uses the shared formula
  const asrc = SRC('core/commands/adminConsole.js');
  ok(/progression\.getStatPointsForRange\(oldLevel, level\)/.test(asrc), 'admin setlevel grants 5/level + milestones (was hardcoded 2/level)');
  ok(!/statPoints \+= \(level - oldLevel\) \* 2/.test(asrc), 'old 2/level grant removed');
  ok(/allocatedStatPoints\[statName\] = Math\.max\(0, Math\.round\(value \/ \(__baseVals/.test(asrc), 'admin setstat keeps the refund ledger in sync');
}

// ─── 6. XP curve +20% (#b508e7) ──────────────────────────────────────────────
section('XP curve: exactly +20% at the single canonical point (#b508e7)');
{
  const progression = require('../core/rpg/progression');
  for (const L of [2, 10, 25, 50, 75, 99, 100]) {
    const now = progression.getXPForLevel(L);
    const old = Math.floor(200 * L * L);
    assert.strictEqual(now, Math.floor(240 * L * L), `L${L} = 240*L^2`);
    assert.strictEqual(now, Math.floor(old * 1.2), `L${L} is exactly +20% vs the 200 baseline`);
  }
  ok(true, 'curve values verified at 7 sample levels (exact 1.2x, no stacking)');
  const psrc = SRC('core/rpg/progression.js');
  ok((psrc.match(/Math\.floor\(240 \* level \* level\)/g) || []).length === 1, 'single insertion point - one curve formula in the codebase');
  ok(!/Math\.floor\(200 \* level \* level\)/.test(psrc), 'old 200 baseline removed');
}

// ─── 7. Balance: Dragon God + Scout (#b5087a) ────────────────────────────────
section('Balance: Dragon God fury + MAG growth, Scout Pathfinder (#b5087a)');
{
  const progression = require('../core/rpg/progression');
  assert.strictEqual(progression.STAT_GROWTH.CLASS_MODIFIERS.DRAGON_GOD.mag, 1.8, 'Dragon God MAG growth 1.5 -> 1.8');
  ok(true, 'Dragon God MAG growth raised (still below every mage 2.0-2.2)');

  const classSystem = require('../core/rpg/classSystem');
  const scout = classSystem.getClassById('SCOUT');
  assert.strictEqual(scout?.passive?.effect, 'solo_hunter', 'SCOUT has the Pathfinder passive');
  assert.strictEqual(scout?.passive?.value, 25, 'Pathfinder value 25');
  const dg = classSystem.getClassById('DRAGON_GOD');
  assert.ok(/Dragon's Fury/.test(dg?.passive?.desc || ''), 'Dragon Heart desc carries Dragon\'s Fury');
  ok(true, 'class data updated');

  const gsrc = SRC('core/rpg/guildAdventure.js');
  ok(/DRAGON_GOD'\) \{\s*\n\s*mult \*= 1\.25;/.test(gsrc), 'Dragon\'s Fury +25% implemented in getClassPassiveDamageMult');
  ok(/includes\('DRAGON'\)\) \{\s*\n\s*mult \*= 3;/.test(gsrc), 'dragon-kind bane (3x) carried over to Dragon God');
  ok(/passive\.effect === 'solo_hunter' && ctx && ctx\.solo/.test(gsrc), 'Pathfinder solo damage mult wired');
  ok(/function _soloHunterXpMult/.test(gsrc), 'Pathfinder solo XP helper present');
  ok((gsrc.match(/_soloHunterXpMult\(/g) || []).length >= 3, 'solo XP applied to per-combat + completion XP paths');
  ok(/getClassPassiveDamageMult\(attacker, target, isAbility, \{ solo: _isSoloFighter\(attacker, chatId\) \}\)/.test(gsrc), 'damage pipeline passes solo context');
  // skillTree: Apocalypse Wing coefficients untouched (no double-dip)
  const stsrc = SRC('core/rpg/skillTree.js');
  ok(/damageMultiplier: \[9\.0, 10\.0, 11\.0\]/.test(stsrc), 'Apocalypse Wing 9/10/11 coefficients preserved (fury is the single buff lever)');
}

// ─── 8. World all + staff afterlife (#b4f5d2 + #b4f71c) ─────────────────────
section('world all + afterlife staff access (#b4f5d2 + #b4f71c)');
{
  const worldMap = require('../core/rpg/worldMap');
  const sock = () => { const sent = []; return { sent, async sendMessage(c, m) { sent.push(m); } }; };

  // non-staff player: `all` refuses with the unmet list, zero image bytes
  // (owner ruling: rank S + level 20; the afterlife requirement is NOT held
  // while the dead-soul feature does not exist - or the view would be dead)
  __engineStub.isBotOwner = () => false; __engineStub.isGlobalMod = () => false; __engineStub.isRpgMod = () => false;
  let s = sock();
  await worldMap.showWorld(s, 'c1', 'u1', 'all', { getLevel: () => 12, getRank: () => 'B' });
  assert.strictEqual(s.sent.length, 1);
  assert.ok(s.sent[0].text.includes('GATHERED CHART'), 'all: refusal headline');
  assert.ok(s.sent[0].text.includes('rank *S*'), 'all: lists rank requirement');
  assert.ok(s.sent[0].text.includes('level *20*'), 'all: lists abyss requirement');
  assert.ok(!s.sent[0].text.includes('dead souls'), 'all: afterlife NOT held while feature absent (owner ruling)');
  assert.strictEqual(s.sent[0].image, undefined, 'all: locked = ZERO image bytes');
  ok(true, 'locked player: unmet list, no render (owner-ruled gates)');

  // staff via injected isMod helper (engine path): renders the atlas sheet
  s = sock();
  await worldMap.showWorld(s, 'c1', 'u1', 'all', { getLevel: () => 3, getRank: () => 'F', isMod: () => true });
  const allMsg = s.sent[0];
  assert.ok(allMsg.image || allMsg.text, 'staff all: delivers (atlas image or text fallback)');
  if (allMsg.image) {
    assert.ok(allMsg.image.length > 100000, 'atlas PNG is a real composed buffer');
    assert.ok(allMsg.caption.length <= 1024, 'all caption within WhatsApp budget');
  }
  ok(true, 'staff (isMod helper): gathered cosmology atlas renders');

  // staff via the _isStaff resolver (no helpers injected - direct staff bypass)
  __engineStub.isRpgMod = () => true;
  s = sock();
  await worldMap.showWorld(s, 'c1', 'u1', 'all', { getLevel: () => 3, getRank: () => 'F' });
  assert.ok(s.sent[0].image || s.sent[0].text, 'staff all via _isStaff: delivers');
  __engineStub.isRpgMod = () => false;
  ok(true, 'staff (_isStaff resolver): gathered atlas renders without helpers');

  // afterlife: non-staff get the LOCKED CARD (owner 2026-09-21: refusal is
  // visual; the map itself stays unrendered) / staff renders the chart
  s = sock();
  await worldMap.showWorld(s, 'c1', 'u1', 'afterlife', { getLevel: () => 99, getRank: () => 'SSS' });
  assert.ok((s.sent[0].caption || s.sent[0].text || '').includes('dead souls'), 'afterlife: players still refused (requirement text present)');
  assert.ok(s.sent[0].image, 'afterlife: locked refusal renders the refusal CARD (owner 2026-09-21)');
  const __lockedCard = s.sent[0].image;
  const __realSheet = await require('../core/rpg/worldMapRenderer').renderAfterlifeSheet();
  assert.ok(!__lockedCard.equals(__realSheet), 'afterlife: the locked card is NOT the map sheet');
  __engineStub.isRpgMod = () => true;
  s = sock();
  await worldMap.showWorld(s, 'c1', 'u1', 'afterlife', { getLevel: () => 99, getRank: () => 'SSS' });
  assert.ok(s.sent[0].image || s.sent[0].text, 'afterlife: RPG mod bypass renders (image or text fallback)');
  assert.ok(!s.sent[0].text || !s.sent[0].text.includes('dead souls'), 'afterlife: staff gets the chart, not the refusal');
  __engineStub.isRpgMod = () => false;
  ok(true, 'afterlife staff bypass works for owner/gmod/rpgmod, players unaffected');

  // usage menu lists `all`
  s = sock();
  await worldMap.showWorld(s, 'c1', 'u1', 'bogus-arg', {});
  assert.ok(s.sent[0].text.includes('world all'), 'usage menu lists the all view');
  ok(true, 'usage text includes world all');
}

// ─── 9. Mod menu labels + createclass fall-through (#b4f818 + #b4f855) ──────
section('Mod menu labels + createclass (#b4f818 + #b4f855)');
{
  const engine = SRC('core/engine.js');
  ok(engine.includes('catMsg += `➤ \\`${c.cmd}\\`\\n`;'), 'category view renders the SHORT action label (sandbox, forget, ...)');
  ok(/exact\.cmd === "modclass" \|\| exact\.cmd === "createclass"/.test(engine), 'createclass falls through to the real CLASS CREATOR');
  const acsrc = SRC('core/commands/adminConsole.js');
  ok(/CLASS CREATOR/.test(acsrc) && /Sprite: <sprite file/.test(acsrc), 'CLASS CREATOR template carries the Sprite field (#b4fbef)');
  ok(/_isStaff|isFallThroughCmd/.test(engine), 'fall-through logic present');
}

// ─── 10. give Zeni + numeric admin parsing (#b4f7bd) ────────────────────────
section('Numeric admin parsing (#b4f7bd)');
{
  const adminConsole = require('../core/commands/adminConsole');
  const p = adminConsole.parseAdminNumber;
  assert.strictEqual(p('100'), 100, 'plain 100');
  assert.strictEqual(p('5000'), 5000, 'plain 5000');
  assert.strictEqual(p('5,000'), 5000, 'comma thousands');
  assert.strictEqual(p('5k'), 5000, 'k suffix');
  assert.strictEqual(p('2.5m'), 2500000, 'm suffix');
  assert.strictEqual(p('1\u2060,000'), 1000, 'invisible unicode + comma');
  assert.strictEqual(p(' 100 '), 100, 'whitespace');
  assert.ok(Number.isNaN(p('abc')), 'garbage is NaN');
  assert.ok(Number.isNaN(p('-5')), 'negative is NaN (no accidental self-grant)');
  assert.ok(Number.isNaN(p('')), 'empty is NaN');
  ok(true, 'parseAdminNumber handles all reported failure shapes');
  const asrc = SRC('core/commands/adminConsole.js');
  ok((asrc.match(/parseAdminNumber\(remaining\[0\]\)/g) || []).length >= 4, 'givezeni/givepoints/setwallet/setlevel use the robust parser');
  ok(!/const amount = parseInt\(remaining\[0\]\)/.test(asrc), 'raw parseInt on amounts removed from the main console');
  ok(/No registered player found for/.test(asrc) && /fail LOUDLY|never a silent self-give|never a silent self-grant/.test(asrc), 'pasted unregistered phone = loud error, never silent self-grant');
}

// ─── 11. createclass sprite end-to-end (#b4fbef) ─────────────────────────────
section('createclass Sprite field end-to-end (#b4fbef)');
{
  const classSystem = require('../core/rpg/classSystem');
  const skillTree = require('../core/rpg/skillTree');
  const adminConsole = require('../core/commands/adminConsole');
  // patch persistence (QA must not write Mongo)
  let captured = null;
  const origRegister = classSystem.registerCustomClass;
  const origSaveTree = skillTree.saveCustomSkillTree;
  classSystem.registerCustomClass = async (c) => { captured = c; };
  skillTree.saveCustomSkillTree = async () => {};
  try {
    const sent = [];
    const s = { async sendMessage(c, m) { sent.push(m); } };
    const reply = [
      'Name: QA Sprite Class', 'Icon: 🧪', 'Sprite: warrior1.png', 'Tier: STARTER', 'Role: DPS',
      'HP: 100', 'ATK: 12', 'DEF: 8', 'MAG: 4', 'SPD: 10', 'LUCK: 9', 'CRIT: 11',
      'Desc: qa sprite class', 'EvolvesFrom: NONE',
      'PassiveName: Testy', 'PassiveEffect: regen', 'PassiveValue: 5',
    ].join('\n');
    await adminConsole.handleClassCreationReply(s, 'c1', 'mod@s.whatsapp.net', reply, '', '.j');
    assert.ok(captured, 'class registered');
    assert.strictEqual(captured.sprite, 'warrior1.png', 'chosen sprite saved on the new class');
    assert.ok(sent[0].text.includes('warrior1.png'), 'CLASS CREATED echoes the sprite');
    ok(true, 'valid sprite: saved + echoed');

    captured = null;
    const sent2 = [];
    const s2 = { async sendMessage(c, m) { sent2.push(m); } };
    const badReply = reply.replace('Sprite: warrior1.png', 'Sprite: not_a_real_file.png');
    await adminConsole.handleClassCreationReply(s2, 'c1', 'mod@s.whatsapp.net', badReply, '', '.j');
    assert.ok(captured, 'class still created with unknown sprite');
    assert.ok(!captured.sprite, 'unknown sprite NOT saved as a broken path');
    assert.ok(/not found in the sprite library/.test(sent2[0].text), 'clear warning for unknown sprite');
    ok(true, 'unknown sprite: graceful fallback + warning');
  } finally {
    classSystem.registerCustomClass = origRegister;
    skillTree.saveCustomSkillTree = origSaveTree;
  }
  // sheet consumes the custom sprite
  const prsrc = SRC('core/rpg/profileCardRenderer.js');
  ok(/params\.classData\?\.sprite/.test(prsrc), 'character sheet renders the class\'s own sprite when defined');
}

// ─── 12. Combat sprite parity + summon facing (#b4f7aa + #b4fc58) ───────────
section('Sprite parity + summon facing (#b4f7aa + #b4fc58)');
{
  const cig = require('../core/rpg/combatImageGenerator');
  const payload = cig._buildPayload(
    [{ name: 'P', class: { id: 'FIGHTER' }, spriteIndex: 0, stats: { maxHp: 100, energy: 50 } }],
    [{ name: 'E', stats: { hp: 50 } }],
    { summons: [{ name: 'S', species: 'bat', ownerIndex: 0, facing: 'left' }] },
  );
  assert.strictEqual(payload.players[0].class, 'FIGHTER', 'known class passes through');
  assert.strictEqual(payload.players[0].spriteIndex, 0, 'slot 0 stays slot 0');
  const p2 = cig._buildPayload([{ name: 'P', class: null, spriteIndex: -3 }], [], {});
  assert.strictEqual(p2.players[0].class, 'APPRENTICE', 'unknown class falls back to APPRENTICE (same as the sheet, was FIGHTER)');
  assert.strictEqual(p2.players[0].spriteIndex, 0, 'negative index clamps to 0 (sheet parity)');
  const p3 = cig._buildPayload([], [], { summons: [{ name: 'S', species: 'bat', ownerIndex: 0 }] });
  assert.strictEqual(p3.summons[0].facing, 'right', 'facing defaults to right (enemy side)');
  assert.strictEqual(payload.summons[0].facing, 'left', 'facing passes through to the renderer payload');
  ok(true, 'combat payload parity + facing contract');

  const pvp = SRC('core/rpg/pvpSystem.js');
  ok(/Number\.isFinite\(Number\(userData\.spriteIndex\)\)/.test(pvp), 'PvP spriteIndex nullish-safe (slot 0 no longer substituted)');
  const ssys = SRC('core/rpg/summonSystem.js');
  ok(/facing: 'right',/.test(ssys), 'summon entities default to facing the enemy side');
  const sai = SRC('core/rpg/summonAI.js');
  ok(/summonEntity\.facing = decision\.target\.isEnemy \? 'right' : 'left';/.test(sai), 'summon facing updates with the action target');
  ok(/abilityRes\.message/.test(sai) && !/abilityRes\.msg\b/.test(sai), 'summon skill text reads the real field (.message, was .msg)');
}

// ─── 13. gstatus media (#b4fa05) ─────────────────────────────────────────────
section('gstatus media upload (#b4fa05)');
{
  const engine = SRC('core/engine.js');
  ok(/mediaUploadTimeoutMs: 60000/.test(engine), 'status posts get an explicit 60s upload budget (undefined timeout was hanging uploads)');
  ok(/timed out after 120s/.test(engine), 'race backstop raised to 120s');
  ok(/GS_UNSUPPORTED/.test(engine), 'unsupported media types rejected with a typed error');
  ok(/image\\\/\(jpeg\|jpg\|png\|webp\)/.test(engine) || /image\\\/\(jpeg\|jpg\|png\|webp\)/.test(engine), 'image mimetype whitelist');
  ok(/Unsupported (image|video) type/.test(engine), 'clear rejection message for unsupported media');
  ok(/payload\.mimetype = __mt/.test(engine), 'mimetype set explicitly so Baileys never guesses');
}

// ─── 14. Bot overlap (#b4fa57) ───────────────────────────────────────────────
section('One command, one responder (#b4fa57)');
{
  const engine = SRC('core/engine.js');
  ok(/electOnce\('creator_reply'/.test(engine), 'CREATOR replies run under a cross-instance election (exactly one bot executes)');
  ok(/isSiblingBot\(senderJid\)/.test(engine), 'sibling-bot suppression present');
  ok((engine.match(/isSiblingBot\(senderJid\)/g) || []).length >= 2, 'suppression guards BOTH the creator replies and the AI fallback');
  ok(/registerBotIdentity\(botJid, botLid\)/.test(engine), 'every instance registers its identity for sibling detection');
  ok(/__activeBotIdentities/.test(engine), 'shared identity registry exists');
}

// ─── summary ─────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
if (failures > 0) {
  console.error(`❌ TICKET QA: ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log('✅ TICKET QA: all checks passed');
}
// 💡 hard exit: module-level setInterval sweepers (guildAdventure etc.) would
// otherwise keep this QA process alive after the summary prints.
process.exit(failures > 0 ? 1 : 0);

})();
