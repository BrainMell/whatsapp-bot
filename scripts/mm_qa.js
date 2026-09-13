#!/usr/bin/env node
// ============================================
// MURDER MYSTERY — QA HARNESS (offline, mock sock)
// End-to-end scenario suite for Blackvale Manor.
// Run: node scripts/mm_qa.js [passes=3]
// Exits non-zero on any failed assertion.
// ============================================

const path = require('path');

// ---- engine stub: getSockSafe() must never boot the real engine inside QA ----
let QA_SOCK = null;
const enginePath = require.resolve(path.join(__dirname, '..', 'core', 'engine.js'));
require.cache[enginePath] = {
  id: enginePath, filename: enginePath, loaded: true,
  exports: {
    getSock: () => QA_SOCK,
    isGlobalMod: () => false, isRpgMod: () => false, isBotOwner: () => false,
  },
};

const mm = require(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'index.js'));
const system = require(path.join(__dirname, '..', 'core', 'utils', 'system.js'));
const characters = require(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'characters.js'));

const CHAT = '120363025000001@g.us';
const CHAT2 = '120363025000002@g.us';
const BOT_ID = 'qa-bot';
const PREFIX = '.j';
const MARKER = '🤖';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; failures.push(label); console.log(`  ❌ ${label}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (e) {}
    await sleep(250);
  }
  return !!fn();
}
async function waitFor(fn, ms = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (e) {}
    await sleep(250);
  }
  return !!fn();
}

// ---------- mock sock ----------
function makeSock() {
  const out = [];
  return {
    out,
    async sendMessage(jid, content) {
      out.push({
        jid: String(jid),
        isGroup: String(jid).endsWith('@g.us'),
        image: !!content.image,
        text: content.text || content.caption || '',
      });
      return { key: { id: `mock-${out.length}` } };
    },
  };
}

function ctxOf(sock, { chatId = CHAT, sender = '100000000000001@s.whatsapp.net', name = 'Host', group = true, sub = 'help', rest = '' } = {}) {
  return {
    sock,
    chatId,
    senderJid: sender,
    senderName: name,
    sub,
    rest,
    m: { key: { id: 'qa' } },
    botMarker: MARKER,
    isGroup: group,
    botId: BOT_ID,
    prefix: PREFIX,
    isMod: false,
  };
}

// all outgoing text (captions + texts) to a jid
function isJid(mJid, want) {
  const local = String(mJid).split('@')[0];
  const w = mm._internal.normJid(want);
  return local === w || local.endsWith(w);
}
function dmTexts(sock, jid, re) {
  return sock.out.filter((m) => !m.isGroup && isJid(m.jid, jid) && re.test(m.text)).length;
}
function textsTo(sock, jidSuffix, re) {
  return sock.out.filter((m) => m.jid.endsWith(jidSuffix) && re.test(m.text)).length;
}
function groupText(sock, re) {
  return sock.out.filter((m) => m.isGroup && re.test(m.text)).length;
}
function lastGroup(sock) {
  const g = sock.out.filter((m) => m.isGroup);
  return g.length ? g[g.length - 1].text : '';
}

const P = {
  alice: { jid: '100000000000001@s.whatsapp.net', name: 'Ann' },
  bob: { jid: '100000000000002@s.whatsapp.net', name: 'Boris' },
  carla: { jid: '100000000000003@s.whatsapp.net', name: 'Cyrus' },
  dave: { jid: '100000000000004@s.whatsapp.net', name: 'Dora' },
  erin: { jid: '100000000000005@s.whatsapp.net', name: 'Elmo' },
};
const GROUP_SENDERS = [P.alice, P.bob, P.carla, P.dave, P.erin];

function roleOf(g, jid) {
  const p = g.players.find((x) => mm._internal.normJid(x.jid) === mm._internal.normJid(jid));
  return p ? p.role : null;
}
function playerByRole(g, role) {
  return g.players.find((p) => p.role === role) || null;
}
function jidOf(p) { return p.jid; }

async function newGame(sock, hostIdx = 0) {
  await mm.handleCommand(ctxOf(sock, { sub: 'create', sender: GROUP_SENDERS[hostIdx].jid, name: GROUP_SENDERS[hostIdx].name }));
  for (let i = 1; i < GROUP_SENDERS.length; i++) {
    await mm.handleCommand(ctxOf(sock, { sub: 'join', sender: GROUP_SENDERS[i].jid, name: GROUP_SENDERS[i].name }));
  }
  await mm.handleCommand(ctxOf(sock, { sub: 'start', sender: GROUP_SENDERS[hostIdx].jid, name: GROUP_SENDERS[hostIdx].name }));
  return mm._internal.getGame(CHAT);
}

async function runPass(n) {
  console.log(`\n===== PASS ${n} =====`);
  const sock = makeSock();
  QA_SOCK = sock;

  // ---- clean slate ----
  await system.set(`murder_mm_games_v2_${BOT_ID === 'qa-bot' ? 'global' : BOT_ID}`, {});
  await system.set('murder_mm_games_v1', {});
  mm._internal.games.clear();
  mm._internal.ensureRehydrated();
  // NOTE: qa botId is 'qa-bot' but module-level botIdSafe() is whatever botConfig
  // returns locally ('global'). Persistence keys use botIdSafe() — we cleared both above.

  // ---------- A. LOBBY GUARDS ----------
  await mm.handleCommand(ctxOf(sock, { group: false, sub: 'create' })); // DM create → rejected
  ok(groupText(sock, /only opens its doors to \*groups\*/), 'A1 create in DM rejected');

  await mm.handleCommand(ctxOf(sock, { sub: 'create', sender: P.alice.jid, name: P.alice.name }));
  ok(groupText(sock, /OPENS ITS DOORS/), 'A2 lobby opens');
  ok(sock.out.some((m) => m.isGroup && m.image && /OPENS ITS DOORS/.test(m.text)), 'A2b start message carried a card (user ask)');
  ok(!groupText(sock, /Nº|Case N/), 'A3 no case number in opener (bug 3)');

  await mm.handleCommand(ctxOf(sock, { sub: 'create' }));
  ok(groupText(sock, /already open/), 'A4 double create rejected');

  await mm.handleCommand(ctxOf(sock, { chatId: CHAT2, sub: 'join' }));
  ok(sock.out.filter((m) => m.jid === CHAT2 && /No lobby is open/.test(m.text)).length === 1, 'A5 join with no lobby rejected');

  await mm.handleCommand(ctxOf(sock, { sub: 'status' })); // lobby status → guest list
  ok(groupText(sock, /GUEST LIST/) >= 1, 'A6 lobby status shows guest list');

  // typo + punctuation tolerance (seen in live logs)
  await mm.handleCommand(ctxOf(sock, { sub: 'joim', sender: P.bob.jid, name: 'Boris' }));
  ok(groupText(sock, /accepts the invitation/), 'A7 typo `joim` still joins');
  await mm.handleCommand(ctxOf(sock, { sub: 'join;!', sender: P.carla.jid, name: 'Carla' }));
  ok(groupText(sock, /accepts the invitation/) >= 2, 'A8 `join;!` sanitized and joins');
  await mm.handleCommand(ctxOf(sock, { sub: 'join', sender: P.dave.jid, name: 'Dora' }));
  await mm.handleCommand(ctxOf(sock, { sub: 'join', sender: P.erin.jid, name: 'Elmo' }));
  const lobbyG = mm._internal.getGame(CHAT);
  ok(lobbyG && lobbyG.players.length === 5, 'A8b five guests on the list');

  await mm.handleCommand(ctxOf(sock, { sub: '1' })); // bare number → help
  ok(groupText(sock, /MURDER MYSTERY — BLACKVALE MANOR/), 'A9 unknown sub falls to help');

  // ---------- B. START + ROLES ----------
  await mm.handleCommand(ctxOf(sock, { sub: 'start', sender: P.bob.jid, name: 'Boris' }));
  ok(groupText(sock, /Only the host may begin/), 'B1 non-host cannot start');

  const t0 = Date.now();
  await mm.handleCommand(ctxOf(sock, { sub: 'start' }));
  const g = mm._internal.getGame(CHAT);
  ok(g && g.phase === 'NIGHT', 'B2 game reaches NIGHT after deal');
  const roles = g.players.map((p) => p.role).sort();
  ok(roles.filter((r) => r === 'KILLER').length === 1, 'B3 exactly one killer');
  ok(roles.filter((r) => r === 'INVESTIGATOR').length === 1, 'B4 exactly one investigator');
  ok(roles.filter((r) => r === 'GUARDIAN').length === 1, 'B5 guardian dealt at 5 players');
  ok(roles.filter((r) => r === 'CIVILIAN').length === 2, 'B6 two civilians');
  // every player got a private role card (image or text) in their DM
  for (const p of g.players) {
    const got = dmTexts(sock, p.jid, /YOU ARE/i) > 0;
    ok(got, `B7 role DM reached ${p.name}`);
  }
  const charIds = g.players.map((p) => p.char.id);
  ok(new Set(charIds).size === 5, 'B8 distinct characters dealt');

  const killer = playerByRole(g, 'KILLER');
  const invest = playerByRole(g, 'INVESTIGATOR');
  const guardian = playerByRole(g, 'GUARDIAN');
  const civs = g.players.filter((p) => p.role === 'CIVILIAN');
  const victimPlan = civs[0];
  const others = g.players.filter((p) => p.role !== 'KILLER');

  // ---------- C. NIGHT 1 — kill + room + investigate + protect ----------
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: killer.jid, sender: killer.jid, name: killer.name, sub: 'kill', rest: '99' }));
  ok(dmTexts(sock, killer.jid, /Choose a \*living\* guest/) === 1, 'C1 invalid kill target rejected');

  await mm.handleCommand(ctxOf(sock, { group: true, sub: 'investigate', rest: '1', sender: invest.jid, name: invest.name }));
  ok(groupText(sock, /belongs in a DM/), 'C2 investigate in group told to DM');

  await mm.handleCommand(ctxOf(sock, { group: false, chatId: invest.jid, sender: invest.jid, name: invest.name, sub: 'investigate', rest: '0' }));
  ok(dmTexts(sock, invest.jid, /no open night|Choose a \*living\*/) === 1, 'C3 investigator bad target handled');

  // killer kills the planned victim (roster number = index in alive-list minus self)
  const rosterForKiller = g.players.filter((p) => p.alive && mm._internal.normJid(p.jid) !== mm._internal.normJid(killer.jid));
  const vIdx = rosterForKiller.findIndex((p) => mm._internal.normJid(p.jid) === mm._internal.normJid(victimPlan.jid)) + 1;
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: killer.jid, sender: killer.jid, name: killer.name, sub: 'kill', rest: String(vIdx) }));
  ok(dmTexts(sock, killer.jid, /The knife is raised/) === 1, 'C4 kill accepted (private DM confirm)');
  {
    const leak = sock.out.find((m) => m.isGroup && new RegExp(`${victimPlan.name}.*dead|dead.*${victimPlan.name}`, 'i').test(m.text));
    if (leak) { const mm2 = new RegExp(`${victimPlan.name}.*dead|dead.*${victimPlan.name}`, 'i'); console.log('  [C5-LEAK] name=', victimPlan.name, 'match=', JSON.stringify((leak.text.match(mm2) || [''])[0].slice(0, 80)), 'in:', JSON.stringify(leak.text.slice(0, 60))); }
  }
  ok(!groupText(sock, new RegExp(`${victimPlan.name}.*dead|dead.*${victimPlan.name}`, 'i')), 'C5 victim not publicly named at kill time');
  ok(dmTexts(sock, killer.jid, /Where does the body lie|Choose the room|where the body lies/) >= 1, 'C6 room-choice DM sent to killer');

  // investigator acts (on the guardian — never a self-target)
  const rosterForInv = g.players.filter((p) => p.alive && mm._internal.normJid(p.jid) !== mm._internal.normJid(invest.jid));
  const invSubject = playerByRole(g, 'GUARDIAN');
  const iIdx = rosterForInv.findIndex((p) => mm._internal.normJid(p.jid) === mm._internal.normJid(invSubject.jid)) + 1;
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: invest.jid, sender: invest.jid, name: invest.name, sub: 'investigate', rest: String(iIdx) }));
  ok(dmTexts(sock, invest.jid, /INVESTIGATION RESULT|THE KILLER|NOT THE KILLER/i) >= 1, 'C7 investigation result DM sent');
  ok(g.investResults.length === 1, 'C8 investigation recorded');

  // guardian watches someone who is NOT tonight's victim
  // (GA roster = full living list incl. self — number against THAT, like the module does)
  const rosterForGa1 = g.players.filter((p) => p.alive);
  const wardIdx = rosterForGa1.findIndex((p) => mm._internal.normJid(p.jid) === mm._internal.normJid(civs[1].jid)) + 1;
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: guardian.jid, sender: guardian.jid, name: guardian.name, sub: 'protect', rest: String(wardIdx) }));
  ok(g.protectTargetJid != null, 'C9 guardian watch set');

  // dawn: force resolution (skip extension path)
  g.extendedTonight = true;
  await mm._internal.onPhaseTimeout(CHAT, sock);
  await sleep(3200); // resolveNight debounces via maybeResolveNight timer too
  if (g.bodies.length !== 1) {
    console.log('  [C10-DBG] bodies=', g.bodies.length, 'phase=', g.phase, 'killerTarget=', g.killerTargetJid, 'roomIdx=', g.killerRoomIdx, 'protect=', g.protectTargetJid, 'night=', g.night);
    for (const m of sock.out.slice(-8)) console.log('   >', m.isGroup ? '[G]' : '[D]', m.text.slice(0, 100).replace(/\n/g, ' / '));
  }
  ok(g.bodies.length === 1, 'C10 body placed');
  ok(g.bodies[0].found === false, 'C11 body starts unfound');
  ok(groupText(sock, /DAWN — NIGHT 1/), 'C12 morning card sent');
  {
    const leak2 = sock.out.find((m) => m.isGroup && new RegExp(`${victimPlan.name}`, 'i').test(m.text));
    if (leak2) { const mm3 = new RegExp(`${victimPlan.name}`, 'i'); console.log('  [C13-LEAK] name=', victimPlan.name, 'match=', JSON.stringify((leak2.text.match(mm3) || [''])[0]), 'in:', JSON.stringify(leak2.text.slice(0, 60))); }
  }
  ok(!groupText(sock, new RegExp(`${victimPlan.name}`, 'i')) || sock.out.filter((m) => m.isGroup && /has been found dead/.test(m.text)).length > 0, 'C13 victim not named before discovery');
  ok(groupText(sock, /mm search/), 'C14 search instructions in morning/discussion');
  ok(mm.isSilenced(victimPlan.jid, CHAT), 'C15 victim silenced');
  ok(!mm.isSilenced(invest.jid, CHAT), 'C16 living not silenced');
  ok(g.phase === 'DISCUSSION', 'C17 discussion began');

  // ---------- C-extra. KILLER TAUNT (anonymous, once per game) ----------
  // NOTE: civs[0] is the murder victim by now — use the living investigator for the non-killer case
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: invest.jid, sender: invest.jid, name: invest.name, sub: 'taunt', rest: 'definitely not me' }));
  ok(dmTexts(sock, invest.jid, /not yours to give/) === 1, 'T1 non-killer taunt rejected privately (no role leak)');
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: killer.jid, sender: killer.jid, name: killer.name, sub: 'taunt', rest: 'You will never find me in time.' }));
  ok(groupText(sock, /unsigned note circulates/i) >= 1, 'T2 anonymous taunt posted to the group');
  ok(!sock.out.some((m) => m.isGroup && /unsigned/.test(m.text) && new RegExp(killer.name, 'i').test(m.text)), 'T3 taunt names no one');
  ok(sock.out.some((m) => m.isGroup && m.image && /unsigned note/i.test(m.text)), 'T4 taunt carried a card');
  ok(dmTexts(sock, killer.jid, /note is loose in the house/) === 1, 'T4b killer got private confirmation');
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: killer.jid, sender: killer.jid, name: killer.name, sub: 'taunt', rest: 'again' }));
  ok(dmTexts(sock, killer.jid, /One note per game/) === 1, 'T5 second taunt rejected');
  await mm.handleCommand(ctxOf(sock, { sender: P.bob.jid, name: P.bob.name, sub: 'taunt', rest: 'group taunt' }));
  ok(groupText(sock, /belongs in a DM with the bot/) >= 1, 'T6 group taunt redirected to DM (public reply)');

  // dead player cannot search
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: victimPlan.jid, sender: victimPlan.jid, name: victimPlan.name, sub: 'search', rest: '1' }));
  ok(dmTexts(sock, victimPlan.jid, /dead search nothing/) === 1, 'C18 dead cannot search');

  // wrong-room search by the guardian (always alive after night 1) — private nothing
  const rooms = g.rooms;
  const bodyIdx = g.bodies[0].roomIdx;
  const wrongIdx = (bodyIdx + 1) % rooms.length;
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: guardian.jid, sender: guardian.jid, name: guardian.name, sub: 'search', rest: String(wrongIdx + 1) }));
  await sleep(400);
  ok(groupText(sock, new RegExp(`${guardian.name} searches`, 'i')) >= 1, 'C19 search is announced to the group (public)');
  ok(sock.out.filter((m) => m.isGroup && /finds nothing/.test(m.text)).length >= 1, 'C19b empty-room result is public');
  ok(sock.out.filter((m) => m.isGroup && new RegExp(`${guardian.name} searches`, 'i').test(m.text) && m.image).length >= 1, 'C19c public search carried an image card');
  ok(groupText(sock, /makes their search/) === 0, 'C20 legacy private-search leak line is gone');
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: guardian.jid, sender: guardian.jid, name: guardian.name, sub: 'search', rest: '1' }));
  ok(dmTexts(sock, guardian.jid, /already made your one search/) === 1, 'C21 second search same day rejected');

  // discovery by the surviving civilian (group search) — public + clue
  const finder = civs[1];
  await mm.handleCommand(ctxOf(sock, { sender: finder.jid, name: finder.name, sub: 'search', rest: String(bodyIdx + 1) }));
  await sleep(600);
  ok(groupText(sock, /has been found dead/) >= 1, 'C22 discovery announced publicly');
  ok(groupText(sock, new RegExp(`found by \\*?${finder.name}`, 'i')) >= 1, 'C23 finder named publicly');
  ok(dmTexts(sock, finder.jid, /GHOST WHISPERS/i) >= 1, 'C24 ghost clue DM to finder');
  const killerCharId = killer.char.id;
  const expectedTier = Math.min(0 + (rooms[bodyIdx].conceal >= 3 ? 1 : 0), 3); // hard rooms sharpen the clue
  const expectedClue = characters.CLUES[killerCharId][expectedTier];
  ok(dmTexts(sock, finder.jid, new RegExp(expectedClue.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) >= 1, 'C25 clue is the killer-character tier-1 clue (predetermined)');
  ok(g.cluesGiven === 1, 'C26 clue counter advanced');
  ok(sock.out.filter((m) => m.isGroup && /has been found dead/.test(m.text) && m.image).length >= 1, 'C27 discovery carried an image card');

  // ---------- D. STATUS ROLE LEAK (bug 2) ----------
  await mm.handleCommand(ctxOf(sock, { sub: 'status', sender: killer.jid, name: killer.name }));
  const killerStatus = sock.out.filter((m) => m.isGroup && /You are \*/.test(m.text)).pop();
  ok(killerStatus && !/\b(KILLER|INVESTIGATOR|GUARDIAN)\b/i.test(killerStatus.text), 'D1 group status leaks no roles');
  ok(killerStatus && /role is between you and your DMs/.test(killerStatus.text), 'D2 group status points to DMs');
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: killer.jid, sender: killer.jid, name: killer.name, sub: 'status' }));
  ok(dmTexts(sock, killer.jid, /PRIVATE STATUS/) >= 1 && dmTexts(sock, killer.jid, /KILLER/i) >= 1, 'D3 DM status keeps the role private-but-present');

  // ---------- E. VOTING — bad vote continues the game ----------
  // seal the investigator's last words — they are read aloud when they fall
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: invest.jid, sender: invest.jid, name: invest.name, sub: 'will', rest: 'The killer poured the claret. Watch the quiet ones.' }));
  ok(dmTexts(sock, invest.jid, /last words are sealed/) === 1, 'E0 will sealed in DM');
  g.deadline = Date.now() - 10;
  await mm._internal.onPhaseTimeout(CHAT, sock); // discussion → voting
  ok(g.phase === 'VOTING', 'E1 voting begins after discussion');
  // everyone alive votes; majority for the investigator (innocent)
  const alive1 = g.players.filter((p) => p.alive);
  const target = invest;
  for (const p of alive1) {
    const rest = mm._internal.normJid(p.jid) === mm._internal.normJid(target.jid) ? 'skip' : String(alive1.findIndex((x) => x.role === 'INVESTIGATOR') + 1);
    await mm.handleCommand(ctxOf(sock, { sender: p.jid, name: p.name, sub: 'vote', rest: p.role === 'INVESTIGATOR' ? 'skip' : String(alive1.findIndex((x) => x.role === 'INVESTIGATOR') + 1) }));
  }
  ok(await waitFor(() => !g.players.find((p) => p.role === 'INVESTIGATOR').alive), 'E2 innocent eliminated by vote');
  ok(mm.isSilenced(invest.jid, CHAT), 'E3 eliminated player silenced');
  ok(await waitFor(() => g.phase === 'NIGHT'), 'E4 game continues into night 2 (bad vote matters)');
  ok(groupText(sock, /Watch the quiet ones/) >= 1, 'E4b condemned player’s will was read aloud');
  ok(sock.out.some((m) => m.isGroup && m.image && /Last words of/i.test(m.text)), 'E4c will carried a card');
  ok(groupText(sock, /Ballots:/) >= 1, 'E4d ballots are public — who voted for whom');

  // ---------- F. GUARDIAN SAVE on night 2 ----------
  const alive2 = g.players.filter((p) => p.alive);
  const roster2ForKiller = alive2.filter((p) => mm._internal.normJid(p.jid) !== mm._internal.normJid(killer.jid));
  const victim2 = civs[1];
  const v2Idx = roster2ForKiller.findIndex((p) => mm._internal.normJid(p.jid) === mm._internal.normJid(victim2.jid)) + 1;
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: killer.jid, sender: killer.jid, name: killer.name, sub: 'kill', rest: String(v2Idx) }));
  const roomHit = mm._internal.resolveRoom(g, '1');
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: killer.jid, sender: killer.jid, name: killer.name, sub: 'room', rest: '1' }));
  ok(g.killerRoomIdx === 0, 'F1 killer placed body in room 1');
  // guardian protects the actual target this time
  const rosterForGa = alive2; // GA roster includes self
  const gaIdx = rosterForGa.findIndex((p) => mm._internal.normJid(p.jid) === mm._internal.normJid(victim2.jid)) + 1;
  await mm.handleCommand(ctxOf(sock, { group: false, chatId: guardian.jid, sender: guardian.jid, name: guardian.name, sub: 'protect', rest: String(gaIdx) }));
  if (!invest.alive) {
    // investigator is dead — night can resolve once killer acted
    await sleep(3200);
  }
  g.extendedTonight = true;
  await mm._internal.onPhaseTimeout(CHAT, sock);
  // NOTE: resolveNight renders 3+ image cards — on a loaded box this takes
  // several seconds. Wait for the transition instead of a fixed sleep.
  ok(await waitFor(() => g.phase === 'DISCUSSION', 30000), 'F1b night 2 resolution completes (guardian save → dawn)');
  ok(victim2.alive === true, 'F2 protected player survived the kill');
  ok(g.bodies.length === 1, 'F3 no new body from a blocked kill');
  ok(groupText(sock, /DEATH WAS CHEATED|almost died/i) >= 1, 'F4 public almost-died announcement');
  ok(!groupText(sock, new RegExp(`${victim2.name}.*(dead|died)`)), 'F5 save announcement names no one');
  ok(!mm.isSilenced(victim2.jid, CHAT), 'F6 no silence on the saved player');
  ok(dmTexts(sock, guardian.jid, /turned it|watch you promised/i) >= 1, 'F7 guardian got private confirmation');
  ok(dmTexts(sock, victim2.jid, /SHOULD BE DEAD|meant to die|should have died/i) >= 1, 'F8 saved player got private dream DM');
  ok(dmTexts(sock, killer.jid, /stopped mid-air|barred by something/i) >= 1, 'F9 killer learned the kill failed');
  ok(g.phase === 'DISCUSSION', 'F10 discussion 2 began');
  ok(g.searches.night === g.night && Object.keys(g.searches.used).length === 0, 'F11 fresh search round each day');

  // ---------- G. PERSISTENCE ROUND-TRIP ----------
  // wait out any in-flight resolution before simulating the restart, or the
  // old resolution completes against the rehydrated object (race)
  await waitFor(() => g.phase === 'DISCUSSION' && !g._resolving2, 30000);
  mm._internal.persistGames();
  const snapshot = JSON.stringify({ bodies: g.bodies, phase: g.phase, clues: g.cluesGiven, rooms: g.rooms.map((r) => r.id) });
  mm._internal.games.clear();
  mm._internal.loadPersisted();
  const g2 = mm._internal.getGame(CHAT);
  ok(!!g2, 'G1 game rehydrated after simulated restart');
  const snapshot2 = JSON.stringify({ bodies: g2.bodies, phase: g2.phase, clues: g2.cluesGiven, rooms: g2.rooms.map((r) => r.id) });
  ok(snapshot === snapshot2, 'G2 bodies/clues/rooms survive rehydration');
  ok(mm.isSilenced(invest.jid, CHAT), 'G3 silence rebuilt after restart');

  // ---------- H. CIV WIN + CLEANUP ----------
  g2.deadline = Date.now() - 10;
  await mm._internal.onPhaseTimeout(CHAT, sock); // → voting
  const alive3 = g2.players.filter((p) => p.alive);
  const kIdx = alive3.findIndex((p) => p.role === 'KILLER') + 1;
  for (const p of alive3) {
    await mm.handleCommand(ctxOf(sock, { sender: p.jid, name: p.name, sub: 'vote', rest: p.role === 'KILLER' ? 'skip' : String(kIdx) }));
  }
  ok(await waitFor(() => !g2.players.find((p) => p.role === 'KILLER').alive, 12000), 'H1 killer eliminated');
  ok(await waitFor(() => mm._internal.getGame(CHAT) === null, 12000), 'H2 game cleaned up after civ win');
  ok(!mm.isSilenced(invest.jid, CHAT) && !mm.isSilenced(victimPlan.jid, CHAT), 'H3 all silences released at case close');
  ok(groupText(sock, /MYSTERY SOLVED|was the Killer/) >= 1, 'H4 finale announced');
  const archive = await system.get(`murder_mm_archive_v2_${BOT_ID === 'qa-bot' ? 'global' : BOT_ID}`, []);
  ok(Array.isArray(archive) && archive.length >= 1 && archive[0].winner === 'civ', 'H5 archive written (no case number in archive)');

  // ---------- I. KILLER PARITY WIN ----------
  await mm.handleCommand(ctxOf(sock, { sub: 'create', sender: P.alice.jid, name: 'Alice' }));
  for (let i = 1; i < GROUP_SENDERS.length; i++) {
    await mm.handleCommand(ctxOf(sock, { sub: 'join', sender: GROUP_SENDERS[i].jid, name: GROUP_SENDERS[i].name }));
  }
  const sockCountBefore = sock.out.length;
  await mm.handleCommand(ctxOf(sock, { sub: 'start' }));
  const g3 = mm._internal.getGame(CHAT);
  ok(g3 && g3.phase === 'NIGHT', 'I1 second game started');
  // shortcut: parity reached by marking deaths (win-check exercised via beginVoting)
  for (const p of g3.players.filter((x) => x.role !== 'KILLER').slice(0, 3)) { // K+1 left = parity
    p.alive = false;
    mm._internal.silence(CHAT, p.jid);
  }
  g3.deadline = Date.now() - 10;
  await mm._internal.onPhaseTimeout(CHAT, sock); // night → needs extension? kill not acted: extends once
  ok(g3.extendedTonight === true, 'I2 dawn extension granted when the killer idles');
  g3.extendedTonight = true;
  await mm._internal.onPhaseTimeout(CHAT, sock); // force resolve → no victim → morning (parity not yet checked)
  await sleep(2500);
  g3.deadline = Date.now() - 10;
  await mm._internal.onPhaseTimeout(CHAT, sock); // discussion → voting → checkWin → killer win
  ok(await waitFor(() => mm._internal.getGame(CHAT) === null, 12000), 'I3 parity win ended the game');
  ok(groupText(sock, /THE KILLER WINS/) >= 1, 'I4 killer win announced');
  await mm.handleCommand(ctxOf(sock, { sub: 'end', sender: P.alice.jid, name: 'Alice' }));
  ok(sock.out.filter((m) => m.isGroup && /no mystery here to end/.test(m.text)).length === 1, 'I5 force-end with no game rejected');

  // ---------- J. SILENCE GATE SEMANTICS ----------
  await mm.handleCommand(ctxOf(sock, { sub: 'create', sender: P.alice.jid, name: 'Alice' }));
  ok(!mm.isSilenced(P.bob.jid, CHAT), 'J1 nobody silenced in a fresh lobby');
  mm._internal.silence(CHAT, P.bob.jid);
  ok(mm.isSilenced(P.bob.jid, CHAT), 'J2 silence set');
  mm._internal.games.delete(CHAT); // simulate game vanishing (crash/cleanup)
  ok(!mm.isSilenced(P.bob.jid, CHAT), 'J3 silence dies with the game (lifecycle-bound)');
  mm._internal.persistGames();

  // ---------- K. WATCHDOG — the phase machine self-heals ----------
  // (reproduces the live failure: deadline long past + wedged resolution flags)
  await mm.handleCommand(ctxOf(sock, { sub: 'create', sender: P.alice.jid, name: 'Alice' }));
  for (let i = 1; i < GROUP_SENDERS.length; i++) {
    await mm.handleCommand(ctxOf(sock, { sub: 'join', sender: GROUP_SENDERS[i].jid, name: GROUP_SENDERS[i].name }));
  }
  await mm.handleCommand(ctxOf(sock, { sub: 'start' }));
  const g4 = mm._internal.getGame(CHAT);
  ok(g4 && g4.phase === 'NIGHT', 'K1 game running for watchdog test');
  ok(g4._sock === sock, 'K1b game captured the live sock from commands');
  ok(mm._internal.sockForGame(g4) === sock, 'K1c sockForGame prefers the game sock');
  const savedSock = g4._sock; g4._sock = null;
  ok(mm._internal.sockForGame(g4) === QA_SOCK, 'K1d falls back to the module sock');
  g4._sock = savedSock;

  g4._resolving = true;
  g4._resolvingAt = Date.now() - 120000; // wedged 2 min ago
  g4.deadline = Date.now() - 60000;      // deadline blew past a minute ago
  g4.extendedTonight = true;             // (skip the one-time dawn extension so the force resolves)
  await mm._internal.watchdogTick();
  ok(await waitFor(() => ['DISCUSSION', 'VOTING'].includes(g4.phase), 15000), 'K2 watchdog forced the stalled night forward');

  // now wedge a DISCUSSION and let the watchdog bring the vote
  if (g4.phase === 'DISCUSSION') {
    g4.deadline = Date.now() - 60000;
    await mm._internal.watchdogTick();
    ok(await waitFor(() => g4.phase === 'VOTING', 15000), 'K3 watchdog forced discussion into voting');
  }

  // all ballots in but the raw resolve timer is lost → watchdog resolves
  const aliveK = g4.players.filter((p) => p.alive);
  for (const p of aliveK) {
    await mm.handleCommand(ctxOf(sock, { sender: p.jid, name: p.name, sub: 'vote', rest: 'skip' }));
  }
  ok(await waitFor(() => g4.phase === 'NIGHT', 15000), 'K4 all-skip vote resolved into the next night');

  // ---------- L. PERSISTENCE HYGIENE — no internal keys ever saved ----------
  mm._internal.persistGames();
  const savedRaw = await system.get(`murder_mm_games_v2_${BOT_ID === 'qa-bot' ? 'global' : BOT_ID}`, {});
  const savedGame = savedRaw[CHAT];
  ok(savedGame && Object.keys(savedGame).every((k) => k[0] !== '_'), 'L1 no underscore/internal keys persisted (sock, flags, stamps)');
  ok(savedGame && typeof savedGame.votes === 'object' && Array.isArray(savedGame.players), 'L2 core state still persists');

  await mm.handleCommand(ctxOf(sock, { sub: 'end', sender: P.alice.jid, name: 'Alice' }));
  ok(!mm._internal.getGame(CHAT), 'L3 watchdog-test game force-ended cleanly');

  console.log(`\n----- PASS ${n}: ${pass} ok, ${fail} failed -----`);
  return fail;
}

(async () => {
  const passes = parseInt(process.argv[2] || '3', 10);
  let totalFail = 0;
  for (let i = 1; i <= passes; i++) {
    pass = 0; fail = 0;
    totalFail += await runPass(i);
    if (failures.length) {
      console.log('FAILED ASSERTIONS:');
      for (const f of failures) console.log('  -', f);
    }
    failures.length = 0;
  }
  console.log(`\n===== TOTAL: ${totalFail === 0 ? 'ALL CLEAN' : `${totalFail} FAILURES`} across ${passes} pass(es) =====`);
  process.exit(totalFail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('QA crashed:', e);
  process.exit(2);
});
