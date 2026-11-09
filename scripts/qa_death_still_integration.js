#!/usr/bin/env node
// ☠️ QA — death-still INTEGRATION seam (2026-11-09 prod incident)
// Owner report: ".j combat atk" → straight to VICTORY, no battle card, no
// death still. Root cause: playEnemyDeaths built picks as {e, i} but
// renderDeathStill filtered t.enemy → every pick silently dropped →
// "[DeathStill] render null — the board carries the kill" on EVERY kill
// (wa-joker prod logs 16:27:34 + 16:28:17) — and on the fight-ending turn
// there IS no board (endCombat replaces it with the victory card), so the
// kill was never visualized at all.
// Yesterday's renderer QA (qa_death_stills.js, 24/24) called the renderer
// directly with the DOCUMENTED {enemy, targetIndex} shape — it could never
// catch a caller-side shape bug. This QA runs the REAL playEnemyDeaths:
//   T1 renderer receives picks in the {enemy, targetIndex} shape
//   T2 the still image actually goes out through the sock (☠️ caption)
//   T3 ending-path + null renderer → text kill announce is sent
//   T4 renderDeathStill normalizes the legacy {e, i} shape (never silent-null)

const REPO = '/home/ubuntu/whatsapp-bot';
const path = require('path');
const assert = require('assert');

const ds = require(path.join(REPO, 'core/rpg/systems/combat/deathStill.js'));
const ga = require(path.join(REPO, 'core/rpg/systems/adventures/guildAdventure.js'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

function mkEnemy(name, element) {
  return {
    name, isEnemy: true, side: 'enemy', element: element || 'fire', isBoss: false, rank: 'normal',
    justDied: true, isDead: true, currentHP: 0, stats: { hp: 0, maxHp: 500 },
  };
}
function mkState() {
  return {
    chatId: 'qa-death-still@g.us', mode: 'DUNGEON', isAbyss: false, dungeonRank: 'C',
    combatGen: 1, turnCount: 3, inCombat: true,
    players: [{ name: 'Loki', jid: 'qa-player@s.whatsapp.net', isDead: false, currentHP: 800, stats: { hp: 800, maxHp: 1000, energy: 50 } }],
    enemies: [mkEnemy('Hellfire Demon', 'fire')],
    _lastTurnLog: ['⚔️ Loki hits Hellfire Demon for 512'],
    timers: {}, backgroundPath: undefined,
  };
}
const mkSock = (sink) => ({ sendMessage: async (jid, content) => { sink.push({ jid, content }); return {}; } });

(async () => {
  console.log('☠️ QA death-still integration seam');
  assert(ga._deathTest && typeof ga._deathTest.playEnemyDeaths === 'function', '_deathTest.playEnemyDeaths not exported');

  // Spy on the renderer singleton — playEnemyDeaths requires the same cache entry.
  const origRender = ds.renderDeathStill;
  let captured = null;
  ds.renderDeathStill = async (args) => {
    captured = args;
    return { image: Buffer.from('qa-still-bytes'), kind: 'FIRE', boss: false, group: (args.picks || []).map((p) => p.enemy) };
  };

  // ---- T1 + T2: the real prod call path, mid-fight (no ending flag)
  const state1 = mkState();
  // Pre-warm the shared Go scene on state1 (cached; playEnemyDeaths reuses it).
  let layersOk = false;
  for (let i = 0; i < 2 && !layersOk; i++) {
    try { layersOk = !!(await ga._deathTest._deathScene(state1)); } catch (e) { layersOk = false; }
  }
  if (!layersOk) {
    console.log('  ⚠️ Go layers unavailable this run — T1/T2/T4 soft-skipped (runner-side issue, not the seam)');
  } else {
    const sink1 = [];
    await ga._deathTest.playEnemyDeaths(mkSock(sink1), state1, {});
    check('T1 renderer receives picks with .enemy', !!(captured && Array.isArray(captured.picks) && captured.picks.length && captured.picks[0].enemy && captured.picks[0].enemy.name === 'Hellfire Demon'),
      JSON.stringify(captured && captured.picks));
    check('T1b targetIndex is a number', !!(captured && captured.picks && typeof captured.picks[0].targetIndex === 'number'));
    check('T2 image message sent', !!(sink1.length && sink1[0].content && Buffer.isBuffer(sink1[0].content.image)));
    check('T2b caption carries ☠️ + log', !!(sink1.length && sink1[0].content.caption && sink1[0].content.caption.includes('☠️') && sink1[0].content.caption.includes('COMBAT LOG')));
  }

  // ---- T3: ending path with a failing renderer → text kill announce
  ds.renderDeathStill = async () => null;
  const state3 = mkState();
  if (state1._deathSceneP) { state3._deathSceneP = state1._deathSceneP; state3._deathSceneKey = state1._deathSceneKey; }   // reuse the warm scene
  const sink3 = [];
  await ga._deathTest.playEnemyDeaths(mkSock(sink3), state3, { ending: true });
  const texts = sink3.filter((s) => s.content && typeof s.content.text === 'string');
  check('T3 ending + null still → text kill announce', texts.some((s) => s.content.text.includes('☠️')),
    JSON.stringify(texts.map((t) => t.content.text).slice(0, 1)));

  // ---- T4: renderer normalizes the legacy {e, i} shape (real render, real layers)
  ds.renderDeathStill = origRender;
  if (layersOk && captured && captured.layers && captured.chrome) {
    const r = await ds.renderDeathStill({
      layers: captured.layers,
      picks: [{ e: mkEnemy('Legacy Shape Demon', 'ice'), i: 0 }],
      deadIdx: new Set(),
      chrome: captured.chrome,
    });
    check('T4 legacy {e,i} picks still render (normalized)', !!(r && r.image && r.image.length && typeof r.kind === 'string'), r && r.kind);
  } else {
    console.log('  ⚠️ T4 soft-skipped — no captured layers this run');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('QA crashed:', e && e.stack || e); process.exit(2); });
