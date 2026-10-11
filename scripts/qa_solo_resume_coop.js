// QA: solo resume + abyss co-op + distraction charm + smoke bomb gate (2026-10-11)
// Run: node scripts/qa_solo_resume_coop.js
const path = require('path');
process.chdir(path.join(__dirname, '..'));

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

console.log('— module load (no DB) —');
let guildAdventure, abyssSystem;

(async () => {
  guildAdventure = require('../core/rpg/guildAdventure');
  abyssSystem = require('../core/rpg/abyssSystem');

  console.log('— exports —');
  ok(typeof guildAdventure.saveSoloSnapshot === 'function', 'guildAdventure.saveSoloSnapshot exported');
  ok(typeof guildAdventure.resumeSoloCombat === 'function', 'guildAdventure.resumeSoloCombat exported');
  ok(typeof guildAdventure.clearSoloSnapshot === 'function', 'guildAdventure.clearSoloSnapshot exported');
  ok(typeof guildAdventure.startAbyssCoopCombat === 'function', 'guildAdventure.startAbyssCoopCombat exported');
  ok(typeof abyssSystem.startCoopRun === 'function', 'abyssSystem.startCoopRun exported');
  ok(typeof abyssSystem.joinCoopRun === 'function', 'abyssSystem.joinCoopRun exported');
  ok(typeof abyssSystem.leaveCoopRun === 'function', 'abyssSystem.leaveCoopRun exported');
  ok(typeof abyssSystem.processCoopDeath === 'function', 'abyssSystem.processCoopDeath exported');

  console.log('— items —');
  const gaSrc = require('fs').readFileSync('core/rpg/guildAdventure.js', 'utf8');
  ok(gaSrc.includes('distraction_charm'), 'distraction_charm defined in CONSUMABLES');
  ok(gaSrc.includes('"distraction_charm"'), 'distraction_charm in SHOP_LIST');
  ok(gaSrc.includes('50% chance to escape ANY fight'), 'charm desc mentions 50% escape');
  ok(gaSrc.includes("snuffs it instantly"), 'high-tier smoke bomb gate message present');
  ok(gaSrc.includes('_fleeHighTier'), 'flee case checks high tier');
  ok(gaSrc.includes('leaveCoopRun(_fleer.jid)'), 'co-op member flee leaves party only');
  ok(gaSrc.includes("processCoopDeath(state.abyssRun"), 'co-op party wipe uses processCoopDeath');

  console.log('— engine wiring —');
  const engSrc = require('fs').readFileSync('core/engine.js', 'utf8');
  ok(engSrc.includes('cmdArgs[1] === "resume" || cmdArgs[1] === "continue"'), '.j solo resume wired');
  ok(engSrc.includes("abyssSub === 'coop' || abyssSub === 'party'"), '.j abyss coop wired');
  ok(engSrc.includes("abyssSub === 'join'"), '.j abyss join wired');
  ok(engSrc.includes('s: 240000'), 'timeout override for .j s');
  ok(engSrc.includes('tovid: 180000'), 'timeout override for tovid');
  ok(engSrc.includes('maxContentLength: 10 * 1024 * 1024'), 'sticker download size cap');
  const idxSrc = require('fs').readFileSync('index.js', 'utf8');
  ok(idxSrc.includes("app.post('/notify-deploy'"), 'index.js serves POST /notify-deploy');
  ok(idxSrc.includes('gw_rpg_gcs_'), 'notify targets RPG-marked GCs');
  const depSrc = require('fs').readFileSync('scripts/deploy_on_box.sh', 'utf8');
  ok(depSrc.includes('notify-deploy'), 'deploy script curls notify-deploy pre-restart');

  console.log('— registry/menu sync —');
  const reg = require('../core/utils/commandRegistry');
  const flat = JSON.stringify(reg);
  ok(flat.includes('abyss coop'), 'registry has abyss coop');
  ok(flat.includes('solo resume'), 'registry mentions solo resume');

  console.log('— solo snapshot model —');
  const SoloCombatSnapshot = require('../core/models/SoloCombatSnapshot');
  ok(!!SoloCombatSnapshot, 'SoloCombatSnapshot model loads');
  const doc = new SoloCombatSnapshot({ userId: 'qa@s.whatsapp.net', chatId: 'c@g.us', sessionKey: 'c@s.us_qa@s.whatsapp.net', enemies: [{ name: 'x' }] });
  ok(doc.userId === 'qa@s.whatsapp.net', 'model instantiates');
  ok(Array.isArray(doc.enemies) && doc.enemies.length === 1, 'enemies array field works');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('QA CRASH:', e); process.exit(1); });
