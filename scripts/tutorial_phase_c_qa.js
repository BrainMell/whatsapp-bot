// Phase C tutorial QA - full state-machine test with mocked modules.
// Covers: track state init (fresh + veteran), milestone unlocks + card delivery,
// stripped basics flow, combat track flow, reading track flow, locking, list.
const assert = require('assert');
const path = require('path');

const CORE = path.join(__dirname, '..', 'core');
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

// ---- mock economy ----
const mockUsers = new Map();
function mkUser(jid, over = {}) {
  return Object.assign({
    userId: jid, nickname: 'Tester', level: 1, tutorial: null,
    tutorialTracks: null, tutorialPending: null, tutorialLoadout: null,
    skills: {}, skillPoints: 0,
  }, over);
}
const saves = [];
const mockEconomy = {
  getUser: (jid) => mockUsers.get(jid) || null,
  saveUser: (jid) => { saves.push(jid); },
  getDisplayName: (jid) => (mockUsers.get(jid) || {}).nickname || jid,
};
const invCalls = [];
const mockInv = {
  addItem: async (jid, id, qty) => { invCalls.push(['add', jid, id, qty]); return { success: true }; },
  removeItem: (jid, id, qty) => { invCalls.push(['rm', jid, id, qty]); return { success: true }; },
  unequipItem: (jid, slot) => { invCalls.push(['unequip', jid, slot]); return { success: true }; },
  getEquipment: (jid) => (mockUsers.get(jid) || {}).equipment || {},
};
const gaCalls = [];
const mockGA = {
  startTutorialQuest: async (sock, chatId, jid, opts) => { gaCalls.push(['solo']); return { success: true }; },
  startTutorialGroupQuest: async (sock, chatId, jid, opts) => { gaCalls.push(['group']); return { success: true }; },
  startTutorialCombat: async (sock, chatId, jid, opts) => { gaCalls.push(['dummy']); return { success: true }; },
};
const mockProgression = {
  getUser: (jid) => ({ statPoints: 2 }),
};
const mockSkillTree = { SKILL_TREES: { FIGHTER: { trees: { t1: { skills: { jab: {} } } } } } };
const mockNotice = {
  renderNotice: async (text, opts) => Buffer.from(`CARD:${opts.title}`),
  renderAlignmentCard: async () => Buffer.from('x'),
};
// inject into require.cache
function inject(absPath, exportsObj) {
  const resolved = require.resolve(absPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}
inject(path.join(CORE, 'rpg', 'economy'), mockEconomy);
inject(path.join(CORE, 'rpg', 'inventorySystem'), mockInv);
inject(path.join(CORE, 'rpg', 'guildAdventure'), mockGA);
inject(path.join(CORE, 'rpg', 'progression'), mockProgression);
inject(path.join(CORE, 'rpg', 'skillTree'), mockSkillTree);
inject(path.join(CORE, 'rpg', 'guildWar', 'noticeCard'), mockNotice);
// botConfig mock (lives at repo root, not core/)
const mockBotConfig = { getPrefix: () => '.j' };
inject(path.join(__dirname, '..', 'botConfig'), mockBotConfig);

const tutorial = require(path.join(CORE, 'rpg', 'tutorial'));

// fake sock (stores full text or caption for assertions)
function mkSock() {
  const sends = [];
  return { sends, sendMessage: async (c, m) => sends.push(m.text || m.caption || (m.image ? 'IMAGE' : '?')) };
}

(async () => {
  console.log('- T1: veteran migration (silent unlocks, no pending) -');
  {
    mockUsers.set('vet@x', mkUser('vet@x', { level: 55, tutorial: 'done' }));
    const u = mockEconomy.getUser('vet@x');
    tutorial.TRACKS && ok(true, 'TRACKS exported');
 // ensureTrackState is private; trigger via recordLevelUps with empty, or begin list
    const sock = mkSock();
    const res = await tutorial.handleDM(sock, 'vet@x', 'c', 'tutorial list', '', {});
    ok(res && res.text && res.text.includes('ADVENTURER ACADEMY'), 'list renders');
    ok(res.text.includes('✅') && res.text.includes('BOOT CAMP'), 'veteran basics = done');
    const vet = mockEconomy.getUser('vet@x');
    ok(vet.tutorialTracks.abyss === 'unlocked', 'veteran abyss unlocked (L55 >= 20)');
    ok((vet.tutorialPending || []).length === 0, 'no pending cards for veterans');
    ok(vet.tutorialTracks.ascend === 'unlocked', 'veteran ascend unlocked (L55 >= 50)');
  }

  console.log('- T2: recordLevelUps crossing L5 + L12 -');
  {
    mockUsers.set('p1@x', mkUser('p1@x', { level: 1 }));
    tutorial.recordLevelUps('p1@x', [2, 3, 4, 5]); // real 1→5 jump shape
    let u = mockEconomy.getUser('p1@x');
    ok(u.tutorialTracks.power === 'unlocked', 'power unlocked at L5');
    ok(u.tutorialTracks.combat === 'unlocked', 'combat unlocked crossing L3');
    ok(u.tutorialTracks.equipment === 'locked', 'equipment still locked (L8)');
    ok(u.tutorialPending.includes('power') && u.tutorialPending.includes('combat'), 'pending cards queued');
    tutorial.recordLevelUps('p1@x', [12]);
    u = mockEconomy.getUser('p1@x');
    ok(u.tutorialTracks.runes === 'unlocked' && u.tutorialPending.includes('runes'), 'runes unlocked at L12');
    ok(!u.tutorialPending.includes('basics'), 'basics never queued');
 // 4→5 single-crossing: combat(3) silent, power(5) announced
    mockUsers.set('p1b@x', mkUser('p1b@x', { level: 4 }));
    tutorial.recordLevelUps('p1b@x', [5]);
    const u1b = mockEconomy.getUser('p1b@x');
    ok(u1b.tutorialTracks.combat === 'unlocked' && !u1b.tutorialPending.includes('combat'), 'mid-deploy player: combat silent-unlocked');
    ok(u1b.tutorialPending.includes('power'), 'mid-deploy player: power card queued');
  }

  console.log('- T3: deliverPendingUnlocks (max 2 per call) -');
  {
    const sock = mkSock();
    await tutorial.deliverPendingUnlocks('p1@x', sock, 'dm');
    ok(sock.sends.length === 2, `2 cards sent (got ${sock.sends.length})`);
    let u = mockEconomy.getUser('p1@x');
    const before = u.tutorialPending.length;
    await tutorial.deliverPendingUnlocks('p1@x', sock, 'dm');
    u = mockEconomy.getUser('p1@x');
    ok(u.tutorialPending.length === before - Math.min(before, 2), 'batch drains by 2');
  }

  console.log('- T4: stripped BASICS flow (char → solo → group → shop → buy → grad) -');
  {
    mockUsers.set('p2@x', mkUser('p2@x', { level: 1 }));
    const sock = mkSock();
    await tutorial.begin(sock, 'dm', 'p2@x', '.j');
    let u = mockEconomy.getUser('p2@x');
    ok(u.tutorial === 'active', 'legacy flag active');
    ok(sock.sends[0].includes('TRAINING HALL'), 'welcome sent');
 // char success event
    await tutorial.notify('p2@x', 'char', { sock, chatId: 'dm', prefix: '.j' });
    u = mockEconomy.getUser('p2@x');
    const s1 = tutorial.handleDM; // (no direct step accessor; assert via behavior)
    await new Promise(r => setTimeout(r, 2200)); // auto quest timer
    ok(gaCalls.some(c => c[0] === 'solo'), 'solo quest auto-opened after char');
    ok(sock.sends.some(t => t.includes('slime wobbles')), 'solo_fight text sent');
 // quest victory → group demo
    await tutorial.notifyCombatEnd({ mode: 'TUTORIAL_QUEST', players: [{ jid: 'p2@x' }], enemies: [{ stats: { hp: 0 } }], chatId: 'dm' }, sock);
    await new Promise(r => setTimeout(r, 3700));
    ok(gaCalls.some(c => c[0] === 'group'), 'group demo auto-opened after solo victory');
 // group victory → shop
    await tutorial.notifyCombatEnd({ mode: 'TUTORIAL_GROUP', players: [{ jid: 'p2@x' }], enemies: [{ stats: { hp: 0 } }], chatId: 'dm' }, sock);
    await new Promise(r => setTimeout(r, 3700));
    ok(sock.sends.some(t => t.includes('Last step - the shop')), 'basics shop step (stripped flow)');
 // shop view → buy → graduate
    await tutorial.notify('p2@x', 'shop', { sock, chatId: 'dm', prefix: '.j' });
    await tutorial.notify('p2@x', 'buy', { sock, chatId: 'dm', prefix: '.j' });
    u = mockEconomy.getUser('p2@x');
    ok(u.tutorial === 'done' && u.tutorialTracks.basics === 'done', 'basics graduated');
    ok(sock.sends.some(t => t.includes('BOOT CAMP COMPLETE')), 'stripped graduation text');
  }

  console.log('- T5: COMBAT track flow -');
  {
    mockUsers.set('p3@x', mkUser('p3@x', { level: 5, tutorial: 'done' }));
    const sock = mkSock();
    await tutorial.begin(sock, 'dm', 'p3@x', '.j', 'combat');
    ok(invCalls.some(c => c[0] === 'add' && c[2] === 'rusty_dagger'), 'loaner dagger granted');
    ok(sock.sends[0].includes('ARMS & COMBAT'), 'combat intro sent');
    await tutorial.notify('p3@x', 'equip', { sock, chatId: 'dm', prefix: '.j' });
    await tutorial.notify('p3@x', 'inventory', { sock, chatId: 'dm', prefix: '.j' });
    const r = await tutorial.handleDM(sock, 'p3@x', 'dm', 'ready', '', { prefix: '.j' });
    ok(gaCalls.some(c => c[0] === 'dummy'), 'dummy fight started on ready');
 // lessons advance on accepted-action events
    await tutorial.notify('p3@x', 'combat_attack', { sock, chatId: 'dm', prefix: '.j' });
    await new Promise(r => setTimeout(r, 2600));
    await tutorial.notify('p3@x', 'combat_rest', { sock, chatId: 'dm', prefix: '.j' });
    await new Promise(r => setTimeout(r, 2600));
    await tutorial.notifyCombatEnd({ mode: 'TUTORIAL', players: [{ jid: 'p3@x' }], enemies: [{ stats: { hp: 0 } }], chatId: 'dm' }, sock);
    await new Promise(r => setTimeout(r, 4200));
    if (!sock.sends.some(t => t.includes('hospital'))) {
      console.log('    [T5 DEBUG] sends:', JSON.stringify(sock.sends.map(s => s.slice(0, 60))));
    }
    ok(sock.sends.some(t => t.includes('hospital')), 'hospital lesson offered');
    await tutorial.notify('p3@x', 'hospital', { sock, chatId: 'dm', prefix: '.j' });
    const u = mockEconomy.getUser('p3@x');
    ok(u.tutorialTracks.combat === 'done', 'combat graduated');
  }

  console.log('- T6: READING track (runes) + `next` + locked refusal -');
  {
    mockUsers.set('p4@x', mkUser('p4@x', { level: 1 })); // L1: runes locked
    const sock = mkSock();
    await tutorial.begin(sock, 'dm', 'p4@x', '.j', 'runes');
    ok(sock.sends[0].includes('unlocks at level'), 'locked track refused');
    mockUsers.set('p4@x', mkUser('p4@x', { level: 15, tutorial: 'done' }));
    await tutorial.begin(sock, 'dm', 'p4@x', '.j', 'runes');
    ok(sock.sends.some(t => t.includes('*RUNES*')), 'runes intro sent');
    await tutorial.handleDM(sock, 'p4@x', 'dm', 'next', '', { prefix: '.j' });
    ok(sock.sends.some(t => t.includes('your runes')), 'next → rn_inv');
    await tutorial.handleDM(sock, 'p4@x', 'dm', 'next', '', { prefix: '.j' });
    ok(sock.sends.some(t => t.includes('socketing')), 'next → rn_socket');
    await tutorial.handleDM(sock, 'p4@x', 'dm', 'next', '', { prefix: '.j' });
    const u = mockEconomy.getUser('p4@x');
    ok(u.tutorialTracks.runes === 'done', 'runes graduated via next chain');
  }

  console.log('- T7: reading track event advance (power: allocate grant) -');
  {
    mockUsers.set('p5@x', mkUser('p5@x', { level: 6, tutorial: 'done' }));
    const sock = mkSock();
    await tutorial.begin(sock, 'dm', 'p5@x', '.j', 'power');
    await tutorial.notifyAction('p5@x', 'st', { sock, chatId: 'dm', prefix: '.j', sub: '' });
    ok(sock.sends.some(t => t.includes('stat points')), 'st advances to allocate step');
 // allocate is SUCCESS_HOOKED in basics but in reading tracks notifyAction advances directly
    await tutorial.notifyAction('p5@x', 'allocate', { sock, chatId: 'dm', prefix: '.j', sub: 'atk' });
    ok(sock.sends.some(t => t.includes('XP, levels and rank')), 'allocate advances to progression');
  }

  console.log('- T8: one-session guard + skip semantics -');
  {
    mockUsers.set('p6@x', mkUser('p6@x', { level: 30, tutorial: 'done' }));
    const sock = mkSock();
    await tutorial.begin(sock, 'dm', 'p6@x', '.j', 'abyss');
    await tutorial.handleDM(sock, 'p6@x', 'dm', 'tutorial combat', '', { prefix: '.j' });
    ok(sock.sends.some(t => t.includes('already in')), 'second track refused while active');
    const r3 = await tutorial.handleDM(sock, 'p6@x', 'dm', 'skip', '', { prefix: '.j' });
    ok(r3 && r3.text && r3.text.includes('THE ABYSS'), 'skip names the track');
    const u = mockEconomy.getUser('p6@x');
    ok(u.tutorialTracks.abyss === 'unlocked', 'skip = unlocked (restartable, not done)');
  }

  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
