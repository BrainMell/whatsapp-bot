const assert = require('assert'); const g = require('../core/utils/ownerAdminGuard');
const OWNER = '233201487480@s.whatsapp.net', OWNER_LID = '251453323092189@lid', RANDOM = '233555000111@s.whatsapp.net', CREATOR = '233244000999@s.whatsapp.net';
const num = (j) => String(j).split('@')[0].split(':')[0];
const BOT1 = '233111000001@s.whatsapp.net', BOT2 = '233111000002@s.whatsapp.net', BOTLID = '777000111@lid';
const reg = { joker: { nums: ['233111000001'] }, subaru: { nums: ['233111000002', '777000111'] } };
const H = { isBot: (j) => g.isRegisteredBot(j, reg), isOwner: (j) => ['233201487480', '251453323092189', '105712667648066'].includes(num(j)), same: (a, b) => num(a) === num(b) };
const P = (o) => g.planRestore({ id: 'g@g.us', action: 'demote', ...o }, { owner: CREATOR }, H);
(async () => {
  assert.deepStrictEqual(P({ participants: [OWNER], author: RANDOM }).restore, [OWNER], 'random admin demotes owner -> restore');
  assert.deepStrictEqual(P({ participants: [OWNER_LID], author: RANDOM }).restore, [OWNER_LID], 'LID form restored in the same form it arrived');
  assert.deepStrictEqual(P({ participants: [{ id: OWNER }], author: RANDOM }).restore, [OWNER], 'object participants');
  assert.deepStrictEqual(P({ participants: [OWNER], author: CREATOR }).restore, [], 'group creator may demote the owner');
  assert.strictEqual(g.planRestore({ id: 'g', action: 'demote', participants: [OWNER], author: '999@lid' }, { owner: '999@lid' }, H).restore.length, 0, 'creator in LID form');
  assert.strictEqual(g.planRestore({ id: 'g', action: 'demote', participants: [OWNER], author: '233244000999@s.whatsapp.net' }, { ownerPn: '233244000999@s.whatsapp.net', owner: 'x@lid' }, H).restore.length, 0, 'creator matched via ownerPn');
  assert.deepStrictEqual(P({ participants: [OWNER], author: OWNER_LID }).restore, [], 'owner stepping down on purpose is respected');
  assert.deepStrictEqual(P({ participants: [RANDOM], author: CREATOR }).restore, [], 'non-owner demotion ignored');
  assert.deepStrictEqual(P({ participants: [RANDOM, OWNER], author: RANDOM }).restore, [OWNER], 'only the owner is restored from a mixed demote');
  assert.deepStrictEqual(P({ participants: [OWNER] }).restore, [OWNER], 'unknown author -> restore');
  assert.deepStrictEqual(g.planRestore({ action: 'promote', participants: [OWNER], author: RANDOM }, {}, H).restore, [], 'promote ignored');
  // bots protect each other
  assert.deepStrictEqual(P({ participants: [BOT1], author: RANDOM }).restore, [BOT1], 'random admin demotes a bot -> restore');
  assert.deepStrictEqual(P({ participants: [BOTLID], author: RANDOM }).restore, [BOTLID], 'bot in LID form (registered num) -> restore');
  assert.deepStrictEqual(P({ participants: [BOT1], author: OWNER }).restore, [], 'owner may demote a bot');
  assert.deepStrictEqual(P({ participants: [BOT1], author: OWNER_LID }).restore, [], 'owner (LID form) may demote a bot');
  assert.deepStrictEqual(P({ participants: [BOT1], author: CREATOR }).restore, [], 'group creator may demote a bot');
  assert.deepStrictEqual(P({ participants: [BOT1], author: BOT2 }).restore, [], 'a sibling bot acting via a permission-checked command is left alone');
  assert.deepStrictEqual(P({ participants: [BOT1, BOT2, OWNER], author: RANDOM }).restore.sort(), [BOT1, BOT2, OWNER].sort(), 'mixed: all protected accounts restored');
  assert.deepStrictEqual(P({ participants: [BOT1, OWNER], author: BOT2 }).restore, [OWNER], 'a bot can demote a bot (command) but NOT the owner');
  assert.strictEqual(g.isRegisteredBot('233111000002:12@s.whatsapp.net', reg), true, 'device-suffix form matches');
  assert.strictEqual(g.isRegisteredBot(RANDOM, reg), false);
  // registry round trip
  const kv = {}; const fakeSys = { getFresh: async (k) => kv[k] || null, get: (k) => kv[k] || null, set: async (k, v) => { kv[k] = JSON.parse(JSON.stringify(v)); } };
  assert.strictEqual(await g.registerSelf({ user: { id: '233111000001:5@s.whatsapp.net', lid: '999111@lid' } }, 'joker', fakeSys), true);
  await g.registerSelf({ user: { id: '233111000002:9@s.whatsapp.net' } }, 'subaru', fakeSys);
  const loaded = kv._shared_bot_accounts; assert.deepStrictEqual(loaded.joker.nums.sort(), ['233111000001', '999111'].sort()); assert(loaded.subaru.nums.includes('233111000002'), 'both bots coexist in the shared key');
  // enforcement with a mock socket
  const calls = []; let fail = 0;
  const sock = { groupParticipantsUpdate: async (id, jids, act) => { calls.push([id, jids, act]); if (fail > 0) { fail--; throw new Error('boom'); } } };
  const quiet = () => {};
  let r = await g.enforceOwnerAdmin(sock, { id: 'a@g.us', action: 'demote', participants: [OWNER], author: RANDOM }, { owner: CREATOR }, H, quiet);
  assert.deepStrictEqual(calls[0], ['a@g.us', [OWNER], 'promote']); assert.deepStrictEqual(r.restored, [OWNER]);
  r = await g.enforceOwnerAdmin(sock, { id: 'b@g.us', action: 'demote', participants: [OWNER], author: CREATOR }, { owner: CREATOR }, H, quiet); assert.strictEqual(calls.length, 1, 'creator demotion not reverted');
  fail = 1; r = await g.enforceOwnerAdmin(sock, { id: 'c@g.us', action: 'demote', participants: [OWNER], author: RANDOM }, { owner: CREATOR }, H, quiet); assert.deepStrictEqual(r.restored, [OWNER], 'transient failure retried once');
  const notAdmin = { groupParticipantsUpdate: async () => { throw new Error('not-authorized'); } };
  r = await g.enforceOwnerAdmin(notAdmin, { id: 'd@g.us', action: 'demote', participants: [OWNER], author: RANDOM }, { owner: CREATOR }, H, quiet); assert.deepStrictEqual(r.restored, [], 'non-admin bot fails quietly, never throws');
  let n = 0; for (let i = 0; i < 12; i++) { const x = await g.enforceOwnerAdmin(sock, { id: 'e@g.us', action: 'demote', participants: [OWNER], author: RANDOM }, { owner: CREATOR }, H, quiet); n += x.restored.length; }
  assert.strictEqual(n, 8, 'rate limited to 8/min per group+owner (no endless fight)');
  process.env.OWNER_ADMIN_SHIELD = '0'; r = await g.enforceOwnerAdmin(sock, { id: 'f@g.us', action: 'demote', participants: [OWNER], author: RANDOM }, { owner: CREATOR }, H, quiet); assert.strictEqual(r.reason, 'disabled');
  console.log('owner admin guard QA: PASS');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
