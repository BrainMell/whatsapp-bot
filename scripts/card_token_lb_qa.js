#!/usr/bin/env node
'use strict';
// ============================================
// TOKEN LB INNER-CIRCLE FILTER — dispatch-level QA (Oatmeal 2026-10-26)
// Owner request (Mellow): the private mods/close-friends GC must never
// appear on the public event-token leaderboard (.j tokenlb / .j tlb).
// Drives the REAL cardSystem.handleCommand dispatcher with a fake sock:
//   hide gc by name (ambiguity + unicode) -> board filters members
//   (mixed @s.whatsapp.net / @lid identities via LidMapping variants)
//   -> explicit user hide/unhide -> snapshot fallback during an outage
//   -> unhide gc -> top-10 refill -> all-hidden empty board -> mod gate.
// Run: node scripts/card_token_lb_qa.js [repoRoot]
// Exits non-zero on any failed assertion.
// ============================================

const REPO = process.argv[2] || '/home/z/my-project/repos/whatsapp-bot';
const path = require('path');
const assert = require('node:assert/strict');

// ---- fixtures ---------------------------------------------------------------
const CHAT_JID = '120363777703@g.us'; // The Public Square (where commands run)
const ESCAPE_JID = '120363999901@g.us';
const OTHER_JID = '120363888802@g.us';
const CAROL = '234333000@s.whatsapp.net'; // Public Square member -> visible
const EVE = '234555000@s.whatsapp.net';   // no group ties -> explicit-hide demo
const DAVE = '444444444@lid';             // visible lid-form user
const ALICE = '234111000@s.whatsapp.net'; // phone record, member via lid variant
const BOB = '222222222@lid';              // lid record, direct member
const OWNER = '234800000000@s.whatsapp.net';

let QA_USERS = [];
const L2P = { '111111111': '234111000', '222222222': '234222000' };
const P2L = { '234111000': ['111111111'], '234222000': ['222222222'] };
const NAMES = {
  [CAROL]: 'Carol', [EVE]: 'Eve', [DAVE]: 'Dave', [ALICE]: 'Alice',
  [BOB]: 'Bob', [OWNER]: 'Mellow',
};

let META_FAILS = false;
let SENT = [];
const GROUPS_ALL = {
  [ESCAPE_JID]: {
    id: ESCAPE_JID, subject: 'Escape Privé \u{1F3AD}',
    participants: [{ id: '111111111@lid' }, { id: '222222222@lid' }, { id: '999999999@lid' }],
  },
  [OTHER_JID]: { id: OTHER_JID, subject: 'Escape 2', participants: [{ id: '555000111@lid' }] },
  [CHAT_JID]: { id: CHAT_JID, subject: 'The Public Square', participants: [{ id: CAROL }] },
};
function setGroupMembers(gid, ids) {
  GROUPS_ALL[gid].participants = ids.map((id) => ({ id }));
}

// ---- stubs (pre-seeded before cardSystem loads) ------------------------------
const memory = new Map(); // System KV
function seedMemory() { memory.clear(); }

function stubModule(resolved, exports) {
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
const R = (...p) => require.resolve(path.join(REPO, ...p));

stubModule(R('botConfig.js'), {
  getBotId: () => 'tokenlb-qa-bot',
  getPrefix: () => '.j',
  getBotName: () => 'QA',
  getCurrency: () => 'tokens',
  get: () => null,
});
stubModule(R('db.js'), async () => { throw new Error('QA: no mongo'); });
stubModule(R('core', 'models', 'System.js'), Object.assign(() => ({}), {
  findOne: async ({ key }) => (memory.has(key) ? { key, value: JSON.parse(JSON.stringify(memory.get(key))) } : null),
  findOneAndUpdate: async ({ key }, upd, _opts) => {
    memory.set(key, upd.value);
    return { key, value: JSON.parse(JSON.stringify(upd.value)) };
  },
}));
stubModule(R('core', 'models', 'User.js'), Object.assign(() => ({}), {
  find: (_q) => ({
    sort: () => ({
      limit: (n) => ({
        select: () => ({
          lean: async () => QA_USERS
            .filter((u) => Number(u.eventTokens) > 0)
            .sort((a, b) => b.eventTokens - a.eventTokens)
            .slice(0, n),
        }),
      }),
    }),
  }),
}));
stubModule(R('core', 'models', 'LidMapping.js'), Object.assign(() => ({}), {
  // cardOwnerVariants() consumes .lean() on both queries — mirror mongoose.
  findOne: ({ lid }) => ({
    lean: async () => (L2P[lid] ? { lid, phone: L2P[lid] } : null),
  }),
  find: ({ phone }) => ({
    lean: async () => (P2L[phone] || []).map((lid) => ({ lid, phone })),
  }),
}));
stubModule(R('core', 'engine.js'), {
  getSock: () => null,
  isGlobalMod: () => false,
  isRpgMod: () => false,
  isBotOwner: () => false,
  isCardsMod: () => false,
  addCardsMod: () => {},
  delCardsMod: () => {},
});
stubModule(R('core', 'rpg', 'economy.js'), {
  getDisplayName: (jid) => NAMES[jid] || null,
  initializeClass: () => {},
  getUser: () => null,
  getUserClass: () => null,
  saveUser: () => {},
});

function makeSock() {
  return {
    groupFetchAllParticipating: async () => GROUPS_ALL,
    groupMetadata: async (jid) => {
      if (META_FAILS) throw new Error('QA metadata outage');
      if (!GROUPS_ALL[jid]) throw new Error('QA: unknown group ' + jid);
      return GROUPS_ALL[jid];
    },
    sendMessage: async (jid, content) => { SENT.push({ jid, content }); return { ok: true }; },
  };
}

// ---- cardSystem loader (fresh module per test = fresh module-internal caches)
const CARD_PATH = R('core', 'rpg', 'cardSystem.js');
function loadCardSystem() {
  delete require.cache[CARD_PATH];
  const cardSystem = require(CARD_PATH);
  const inst = cardSystem.getInst();
  inst.sock_ref = makeSock();
  return cardSystem;
}

// ---- dispatch helper ----------------------------------------------------------
const ECON = { getDisplayName: (jid) => NAMES[jid] || null };
async function run(cardSystem, txt, { as = OWNER, isOwner = true, isMod = false, m = null } = {}) {
  SENT = [];
  const msg = m || { key: { remoteJid: CHAT_JID } };
  const ok = await cardSystem.handleCommand({
    lowerTxt: txt.toLowerCase(), txt, senderJid: as, chatId: CHAT_JID, m: msg,
    economy: ECON, isOwner, senderIsAdmin: false, isMod,
  });
  return { ok, texts: SENT.map((s) => s.content && s.content.text || '') };
}

const baseUsers = () => ([
  { userId: CAROL, eventTokens: 67 },
  { userId: EVE, eventTokens: 58 },
  { userId: DAVE, eventTokens: 45 },
  { userId: ALICE, eventTokens: 40 },
  { userId: BOB, eventTokens: 35 },
]);

// ============================================
(async () => {
  let n = 0;
  const t = async (name, fn) => {
    n++;
    QA_USERS = baseUsers();
    META_FAILS = false;
    seedMemory();
    setGroupMembers(ESCAPE_JID, ['111111111@lid', '222222222@lid', '999999999@lid']);
    setGroupMembers(OTHER_JID, ['555000111@lid']);
    const cs = loadCardSystem();
    try {
      await fn(cs);
      console.log(`  ✅ T${n} ${name}`);
    } catch (e) {
      console.error(`  ❌ T${n} ${name}: ${e.message}`);
      throw e;
    }
  };

  // T1: ambiguous short name lists both matches instead of guessing
  await t('hide gc "escape" -> AMBIGUOUS, both groups listed', async (cs) => {
    const r = await run(cs, '.j tokenlb hide gc escape');
    assert.equal(r.ok, true, 'dispatcher must handle tokenlb');
    const txt = r.texts.join('\n');
    assert.match(txt, /AMBIGUOUS NAME/);
    assert.match(txt, /Escape Priv/);
    assert.match(txt, /Escape 2/);
    assert.equal(memory.has('card_token_lb_hidden'), false, 'nothing persisted on ambiguity');
  });

  // T2: hide by distinctive (unicode) name
  await t('hide gc "privé" -> INNER CIRCLE HIDDEN with 3 members', async (cs) => {
    const r = await run(cs, '.j tokenlb hide gc privé');
    const txt = r.texts.join('\n');
    assert.match(txt, /INNER CIRCLE HIDDEN/);
    assert.match(txt, /Escape Privé/);
    assert.match(txt, /\*Members now filtered:\* _3_/);
    const cfg = memory.get('card_token_lb_hidden');
    assert.deepEqual(cfg.groups, [ESCAPE_JID]);
    assert.equal(cfg.snapshots[ESCAPE_JID].members.length, 3);
  });

  // T3: the board filters group members across BOTH identity flavors
  await t('board filters Alice (phone record via lid variant) + Bob (lid record)', async (cs) => {
    await run(cs, '.j tokenlb hide gc privé');
    const r = await run(cs, '.j tokenlb');
    const txt = r.texts.join('\n');
    assert.match(txt, /EVENT TOKEN LEADERBOARD/);
    assert.match(txt, /Carol/);
    assert.match(txt, /Dave/);
    assert.match(txt, /2 inner-circle accounts hidden/);
    assert.doesNotMatch(txt, /Alice/);
    assert.doesNotMatch(txt, /Bob/);
    // Eve is NOT in the group and not yet explicitly hidden -> still on board
    assert.match(txt, /Eve/);
    // ranks refilled: Carol #1, Eve #2, Dave #3
    assert.ok(txt.indexOf('Carol') < txt.indexOf('Eve') && txt.indexOf('Eve') < txt.indexOf('Dave'), 'rank order');
  });

  // T4: explicit user hide (raw JID) + unhide round-trip
  await t('hide @user by raw JID, board updates, unhide restores', async (cs) => {
    await run(cs, '.j tokenlb hide gc privé');
    const r1 = await run(cs, `.j tokenlb hide ${EVE}`);
    assert.match(r1.texts.join('\n'), /ACCOUNT HIDDEN/);
    assert.match(r1.texts.join('\n'), /Eve/);
    const r2 = await run(cs, '.j tokenlb');
    const t2 = r2.texts.join('\n');
    assert.doesNotMatch(t2, /Eve/);
    assert.match(t2, /3 inner-circle accounts hidden/);
    const r3 = await run(cs, `.j tokenlb unhide ${EVE}`);
    assert.match(r3.texts.join('\n'), /VISIBLE AGAIN/);
    const r4 = await run(cs, '.j tokenlb');
    assert.match(r4.texts.join('\n'), /Eve/);
  });

  // T5: hide via @mention context (getTaggedJids path)
  await t('hide via @mention contextInfo', async (cs) => {
    const m = {
      key: { remoteJid: CHAT_JID },
      message: { extendedTextMessage: { contextInfo: { mentionedJid: [EVE] } } },
    };
    const r = await run(cs, '.j tokenlb hide @eve', { m });
    assert.match(r.texts.join('\n'), /ACCOUNT HIDDEN/);
    const cfg = memory.get('card_token_lb_hidden');
    assert.ok(cfg.users.includes(EVE), 'phone-form jid stored');
  });

  // T6: mod gate — plain users cannot manage the filter
  await t('non-mod is denied (public board still works for them)', async (cs) => {
    const r = await run(cs, '.j tokenlb hidden', { as: CAROL, isOwner: false, isMod: false });
    assert.match(r.texts.join('\n'), /Only card moderators/);
    const r2 = await run(cs, '.j tokenlb', { as: CAROL, isOwner: false, isMod: false });
    assert.match(r2.texts.join('\n'), /EVENT TOKEN LEADERBOARD/);
  });

  // T7: WhatsApp outage -> snapshot fallback still filters
  await t('metadata outage -> KV snapshot keeps the filter alive', async (cs) => {
    await run(cs, '.j tokenlb hide gc privé');
    assert.equal(memory.get('card_token_lb_hidden').snapshots[ESCAPE_JID].members.length, 3);
    META_FAILS = true;
    const cs2 = loadCardSystem(); // fresh module = cold roster cache, like a restart
    const r = await run(cs2, '.j tokenlb');
    const txt = r.texts.join('\n');
    assert.match(txt, /2 inner-circle accounts hidden/);
    assert.doesNotMatch(txt, /Alice/);
    assert.doesNotMatch(txt, /Bob/);
  });

  // T8: unhide gc by raw JID
  await t('unhide gc by JID -> members visible again', async (cs) => {
    await run(cs, '.j tokenlb hide gc privé');
    const r = await run(cs, `.j tokenlb unhide gc ${ESCAPE_JID}`);
    assert.match(r.texts.join('\n'), /VISIBLE AGAIN/);
    assert.match(r.texts.join('\n'), /Escape Privé/);
    const cfg = memory.get('card_token_lb_hidden');
    assert.deepEqual(cfg.groups, [], 'group removed');
    assert.ok(!cfg.snapshots[ESCAPE_JID], 'snapshot cleaned up');
    const r2 = await run(cs, '.j tokenlb');
    assert.match(r2.texts.join('\n'), /Alice/);
    assert.match(r2.texts.join('\n'), /Bob/);
  });

  // T9: top-10 must REFILL from outside the circle (12 hidden + 8 visible)
  await t('board refills past hidden members (12 hidden, 8 shown)', async (cs) => {
    QA_USERS = []; // only this scenario's population counts
    const hiddenIds = [];
    for (let i = 1; i <= 12; i++) {
      const lid = `g${String(i).padStart(2, '0')}@lid`;
      hiddenIds.push(lid);
      QA_USERS.push({ userId: lid, eventTokens: 200 - i });
    }
    setGroupMembers(ESCAPE_JID, hiddenIds);
    QA_USERS.push(...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ userId: `pub${i}@lid`, eventTokens: 50 - i })));
    const r1 = await run(cs, '.j tokenlb hide gc privé');
    assert.match(r1.texts.join('\n'), /\*Members now filtered:\* _12_/);
    const r2 = await run(cs, '.j tokenlb');
    const txt = r2.texts.join('\n');
    assert.match(txt, /12 inner-circle accounts hidden/);
    assert.doesNotMatch(txt, /pub\d@lid/);
    for (let i = 1; i <= 8; i++) assert.match(txt, new RegExp(`pub${i}`));
    assert.ok(!/\b12\./.test(txt), 'never renders more than 10 rows');
  });

  // T10: everyone holding tokens is inner circle -> dedicated empty text
  await t('all top holders hidden -> inner-circle empty message', async (cs) => {
    QA_USERS = [
      { userId: '222222222@lid', eventTokens: 100 },
      { userId: '111111111@lid', eventTokens: 90 },
    ];
    await run(cs, '.j tokenlb hide gc privé');
    const r = await run(cs, '.j tokenlb');
    assert.match(r.texts.join('\n'), /No one outside the inner circle/);
  });

  // T11: duplicate hide + unhide-when-not-hidden are friendly no-ops
  await t('duplicate hide / spurious unhide handled cleanly', async (cs) => {
    await run(cs, '.j tokenlb hide gc privé');
    const r = await run(cs, '.j tokenlb hide gc privé');
    assert.match(r.texts.join('\n'), /already hidden/);
    const r2 = await run(cs, '.j tokenlb unhide gc public-square-nope');
    assert.match(r2.texts.join('\n'), /No group named/);
  });

  // T12: unknown subcommand falls through to the PUBLIC board (not manage)
  await t('unknown subcommand -> public board, manage stays gated', async (cs) => {
    const r = await run(cs, '.j tokenlb bogus');
    assert.match(r.texts.join('\n'), /EVENT TOKEN LEADERBOARD/);
    const r2 = await run(cs, '.j tokenlb help');
    assert.match(r2.texts.join('\n'), /EVENT TOKEN LEADERBOARD/);
  });

  // T13: REAL-WORLD FAILURE Mellow hit (2026-10-26): he typed "Escape Privé",
  // actual subject is "espace privé" (French spelling) -> dead end, no hints.
  await t('close-match: typo "Escape Privé" auto-resolves to "espace privé"', async (cs) => {
    const prev = GROUPS_ALL[ESCAPE_JID].subject;
    GROUPS_ALL[ESCAPE_JID].subject = 'espace privé'; // real GC name, no emoji
    try {
      const r = await run(cs, '.j tokenlb hide gc Escape Privé');
      const txt = r.texts.join('\n');
      assert.match(txt, /INNER CIRCLE HIDDEN/);
      assert.match(txt, /espace privé/, 'actual subject echoed back');
      const cfg = memory.get('card_token_lb_hidden');
      assert.deepEqual(cfg.groups, [ESCAPE_JID]);
      assert.equal(cfg.snapshots[ESCAPE_JID].members.length, 3);
    } finally {
      GROUPS_ALL[ESCAPE_JID].subject = prev;
    }
  });

  // T14: unaccented spelling "espace prive" -> accent-folded exact match
  await t('accent-folded exact match: "espace prive" (no accent) hides', async (cs) => {
    const prev = GROUPS_ALL[ESCAPE_JID].subject;
    GROUPS_ALL[ESCAPE_JID].subject = 'espace privé';
    try {
      const r = await run(cs, '.j tokenlb hide gc espace prive');
      const txt = r.texts.join('\n');
      assert.match(txt, /INNER CIRCLE HIDDEN/);
      assert.match(txt, /espace privé/);
      assert.deepEqual(memory.get('card_token_lb_hidden').groups, [ESCAPE_JID]);
    } finally {
      GROUPS_ALL[ESCAPE_JID].subject = prev;
    }
  });

  // T15: two accent spellings that FOLD to the same name -> AMBIGUOUS, never guess
  await t('folded-exact ambiguity: "espace privé" + "ESPACE PRIVÉ" -> listed', async (cs) => {
    const ALT = '120363555509@g.us';
    const prev = GROUPS_ALL[ESCAPE_JID].subject;
    GROUPS_ALL[ESCAPE_JID].subject = 'espace privé';
    GROUPS_ALL[ALT] = { id: ALT, subject: 'ESPACE PRIVÉ', participants: [{ id: '777000111@lid' }] };
    try {
      const r = await run(cs, '.j tokenlb hide gc Escape Privé');
      const txt = r.texts.join('\n');
      assert.match(txt, /AMBIGUOUS NAME/);
      assert.match(txt, /espace privé/);
      assert.match(txt, /ESPACE PRIVÉ/);
      assert.equal(memory.has('card_token_lb_hidden'), false, 'nothing persisted on close-ambiguity');
    } finally {
      delete GROUPS_ALL[ALT];
      GROUPS_ALL[ESCAPE_JID].subject = prev;
    }
  });

  console.log(`\nALL ${n} TOKEN-LB QA TESTS PASSED`);
  process.exit(0);
})().catch((e) => {
  console.error('TOKEN-LB QA FAILED:', e.message);
  process.exit(1);
});
