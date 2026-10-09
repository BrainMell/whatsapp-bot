// bug_pill_qa.js — live-test economy.poisonPillAttack (.j bug @victim)
// Run on Box2:  node scripts/bug_pill_qa.js
// Real Mongo + real economy, mock nothing (function-level; the engine
// dispatch block is thin glue mirroring rob, verified by syntax + restart).
const economy = require('/home/ubuntu/whatsapp-bot/core/rpg/economy');
const User = require('/home/ubuntu/whatsapp-bot/core/models/User');
const connectDB = require('/home/ubuntu/whatsapp-bot/db');

const ATTACKER = '1999999999910@s.whatsapp.net';
const VICTIM   = '1999999999911@s.whatsapp.net';
const GHOST    = '1999999999912@s.whatsapp.net'; // never registered

const JIDS = [ATTACKER, VICTIM, GHOST];

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  await connectDB();
  // purge leftovers BEFORE loadEconomy so the in-memory cache starts clean
  await User.deleteMany({ userId: { $in: JIDS } });
  await economy.loadEconomy();

  // ── setup: fresh users ──
  economy.registerUser(ATTACKER, 'BugAttacker');
  economy.registerUser(VICTIM, 'BugVictim');
  const atk = economy.getUser(ATTACKER);
  const vic = economy.getUser(VICTIM);
  check('setup: both registered', !!atk && !!vic);

  // fund attacker; give victim a known mid HP
  atk.wallet = 5000;
  vic.wallet = 3000;
  // victim class for maxHP (registerUser picked a random starter)
  const progression = require('/home/ubuntu/whatsapp-bot/core/rpg/progression');
  const cid = vic.class?.id || vic.class?.name?.toUpperCase() || 'FIGHTER';
  const maxHP = Math.max(1, Math.floor(progression.getBaseStats(VICTIM, cid)?.hp || 100));

  console.log('\n== T1: happy path — pill lands, drains, wallet charged ==');
  const beforeHP = economy.getPersistentHP(VICTIM, maxHP);
  const r = economy.poisonPillAttack(ATTACKER, VICTIM);
  check('success true', r.success === true);
  const expDrain = Math.max(10, Math.floor(maxHP * 0.4));
  const expAfter = Math.max(1, beforeHP - expDrain);
  check(`drain = max(10, 40% of ${maxHP}) = ${expDrain}`, r.drained === expDrain, `got ${r.drained}`);
  check(`victim HP ${beforeHP} → ${expAfter}`, r.hpNow === expAfter && economy.getPersistentHP(VICTIM, maxHP) === expAfter);
  check('attacker wallet 5000 → 4500', economy.getUser(ATTACKER).wallet === 4500, `got ${economy.getUser(ATTACKER).wallet}`);
  check('toxin ≈ 30 min', r.toxinMins >= 29 && r.toxinMins <= 30, `got ${r.toxinMins}`);
  check('dmText names attacker + cure', /BugAttacker/.test(r.dmText || '') && /hospital/.test(r.dmText || ''));
  check('chat message names victim', /BugVictim/.test(r.message || ''));
  console.log('  DM preview:', (r.dmText || '').split('\n').slice(0, 3).join(' | '));

  console.log('\n== T2: toxin effect registered on victim ==');
  check("hasActiveEffect('poison_pill')", economy.hasActiveEffect(VICTIM, 'poison_pill') === true);

  console.log('\n== T3: attacker cooldown blocks the second pill ==');
  const r2 = economy.poisonPillAttack(ATTACKER, VICTIM);
  check('blocked', r2.success === false);
  check('HANDS STILL WET message', /HANDS STILL WET/.test(r2.message || ''));
  check('wallet untouched on block', economy.getUser(ATTACKER).wallet === 4500);

  console.log('\n== T4: toxin suppresses out-of-combat regen ==');
  // Backdate the regen clock 1h. Without poison: regen = floor(max/24). With poison: zero.
  vic.stats.hpTs = Date.now() - 3600000;
  const suppressed = economy.getPersistentHP(VICTIM, maxHP);
  check('no regen while poisoned', suppressed === r.hpNow, `expected ${r.hpNow}, got ${suppressed}`);
  // control: after cure the same backdating MUST regen (verified again in T6)

  console.log('\n== T5: hospital cures the toxin (healToFull purge) ==');
  const heal = economy.healToFull(VICTIM, maxHP);
  check('healed to full', heal.onCooldown === false && heal.healed === maxHP - r.hpNow, JSON.stringify(heal));
  check("poison_pill purged", economy.hasActiveEffect(VICTIM, 'poison_pill') === false);

  console.log('\n== T6: regen resumes after cure ==');
  economy.setPersistentHP(VICTIM, 50, maxHP);
  vic.stats.hpTs = Date.now() - 3600000;
  const regenHP = economy.getPersistentHP(VICTIM, maxHP);
  const expRegen = Math.min(maxHP, 50 + Math.floor((3600000 / (24 * 3600000)) * maxHP));
  check(`regen resumes (${regenHP} = 50 + floor(max/24))`, regenHP === expRegen, `expected ${expRegen}, got ${regenHP}`);

  console.log('\n== T7: unregistered target rejected ==');
  const r7 = economy.poisonPillAttack(ATTACKER, GHOST);
  check('blocked', r7.success === false);
  check('both-registered message', /registered/.test(r7.message || ''));

  console.log('\n== T8: broke attacker rejected (cooldown force-cleared for test) ==');
  economy.getUser(ATTACKER).activeEffects = {}; // clear bug_cd
  economy.getUser(ATTACKER).wallet = 100;
  const r8 = economy.poisonPillAttack(ATTACKER, VICTIM);
  check('blocked', r8.success === false);
  check("can't-afford message", /can't afford|poison pill costs/.test(r8.message || ''));

  console.log('\n== T9: jailed attacker rejected ==');
  economy.getUser(ATTACKER).wallet = 5000;
  economy.getUser(ATTACKER).jailUntil = Date.now() + 10 * 60000;
  const r9 = economy.poisonPillAttack(ATTACKER, VICTIM);
  check('blocked', r9.success === false);
  check('JAIL BAN message', /JAIL BAN/.test(r9.message || ''));
  economy.getUser(ATTACKER).jailUntil = 0;

  console.log(`\n==== RESULT: ${pass} pass / ${fail} fail ====`);
  await cleanup();
  process.exit(fail ? 1 : 0);
}

async function cleanup() {
  try {
    await User.deleteMany({ userId: { $in: JIDS } });
    console.log('cleanup: test users removed');
  } catch (e) {
    console.log('cleanup error:', e.message);
  }
}

main().catch((e) => { console.error('QA crashed:', e); cleanup().then(() => process.exit(1)); });
