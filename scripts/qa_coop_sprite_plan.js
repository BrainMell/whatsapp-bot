// Local QA: does planCombatLayout place the co-op friend on the party side?
process.chdir('/home/z/my-project/whatsapp-bot');
(async () => {
  const scene = require('/home/z/my-project/whatsapp-bot/core/rpg/abyssScene');
  const mk = (jid, name, cls) => ({
    jid, name, class: { id: cls, name: cls, icon: 'X' }, isDead: false, spriteIndex: 0,
    stats: { hp: 500, maxHp: 500, energy: 100, maxEnergy: 100, atk: 30, def: 20, mag: 25, spd: 15 },
  });
  const enemies = [{ id: 'e', name: 'Gloom Brute', isEnemy: true, isBoss: false, stats: { hp: 800, maxHp: 800, atk: 30, def: 15, spd: 10, mag: 10 } }];

  const coopState = {
    sessionKey: 'QA|coop', isAbyss: true, abyssFloor: 5, mode: 'ABYSS',
    players: [mk('h@lid', 'Mellow', 'PALADIN'), mk('f@lid', 'Tinty', 'ROGUE')],
    enemies, summons: [],
    abyssRun: { isCoop: true, currentEncounterType: 'COMBAT' },
  };
  const plan = await scene.planCombatLayout(coopState, {});
  console.log('COOP side plan: allies=%d player=%s', plan.allies.length, plan.player ? 'yes' : 'no');
  for (const a of plan.allies) {
    console.log('  ally:', JSON.stringify({ isCoop: !!a.isCoop, name: a.name, hasArt: !!a.art, file: a.file || (a.art && a.art.file) || null, cx: a.cx, gy: a.gy, h: a.h }));
  }
  console.log('  player:', JSON.stringify({ file: plan.player && plan.player.file, cx: plan.player && plan.player.cx }));

  const soloState = { ...coopState, players: [coopState.players[0]] };
  const soloPlan = await scene.planCombatLayout(soloState, {});
  console.log('SOLO side plan: allies=%d (expect 0)', soloPlan.allies.length);

 // boss path
  const bossState = { ...coopState, sessionKey: 'QA|coopboss', abyssFloor: 15,
    enemies: [{ ...enemies[0], isBoss: true, name: 'Abyssal Detonator' }] };
  const bossPlan = await scene.planCombatLayout(bossState, {});
  console.log('BOSS plan: allies=%d', bossPlan.allies.length);
  for (const a of bossPlan.allies) console.log('  ally:', JSON.stringify({ isCoop: !!a.isCoop, name: a.name, hasArt: !!a.art }));
  process.exit(0);
})().catch(e => { console.error('QA_ERR', e.message, e.stack && e.stack.split('\n')[1]); process.exit(1); });
