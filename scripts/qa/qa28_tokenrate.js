// QA 2026-10-28 — Task 28: per-GC GUARANTEED token payout modes (owner v3).
// Runs the REAL cardSystem module with `core/models/System` stubbed via
// require.cache (plain-Map mock) — NO database, NO network, NO prod writes.
// Verifies: low/high payout tables, per-GC isolation, invalid-mode rejection,
// restart survival (persist -> reload), and static wiring of the claim path
// + the `.j event rate` dispatcher gate.
// Run: node scripts/qa/qa28_tokenrate.js

const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log(`  ✅ ${label}`); } else { fail++; console.log(`  ❌ ${label}`); } }
function section(t) { console.log(`\n=== ${t} ===`); }

// ---------- boot: stub System model BEFORE cardSystem loads ----------
const SYS_PATH = path.join(__dirname, '..', '..', 'core', 'models', 'System.js');
const sysStore = new Map(); // key -> value doc
const SystemMock = {
  findOne: async (q) => {
    if (!sysStore.has(q.key)) return null;
    const doc = { key: q.key, value: sysStore.get(q.key) };
    doc.lean = async () => ({ key: doc.key, value: doc.value });
    return doc;
  },
  findOneAndUpdate: async (q, upd) => {
    sysStore.set(q.key, upd.$set.value);
    return { key: q.key, value: upd.$set.value };
  },
};
require.cache[require.resolve(SYS_PATH)] = {
  id: SYS_PATH, filename: SYS_PATH, loaded: true, exports: SystemMock,
};

const cards = require(path.join(__dirname, '..', '..', 'core', 'rpg', 'cardSystem.js'));
const GC1 = '120363409013549791@g.us';
const GC2 = '197370994229253@lid';

// ---------- 1. default mode = LOW, guaranteed per tier ----------
section('default mode LOW — guaranteed tier-keyed payouts (owner v3 table)')
ok(cards.getTokenRateMode(GC1) === 'low', 'unset group defaults to low');
ok(cards.tokenPayFor(GC1, '1') === 1, 'T1 -> 1');
ok(cards.tokenPayFor(GC1, '2') === 2, 'T2 -> 2 (always, no RNG)');
ok(cards.tokenPayFor(GC1, '3') === 3, 'T3 -> 3');
ok(cards.tokenPayFor(GC1, '4') === 5, 'T4 -> 5 (always)');
ok(cards.tokenPayFor(GC1, '5') === 8, 'T5 -> 8');
ok(cards.tokenPayFor(GC1, '6') === 8, 'T6 rides table cap -> 8');
ok(cards.tokenPayFor(GC1, 'S') === 8, 'S rides cap -> 8');
ok(cards.tokenPayFor(GC1, 'E') === 8, 'E rides cap -> 8');
ok(cards.tokenPayFor(GC1, undefined) === 1, 'unknown tier falls back to T1 row (never NaN)');

// ---------- 2. HIGH mode per GC + isolation ----------
section('per-GC HIGH mode (old v1 rates) + isolation')
(async () => {
  const r = await cards.setTokenRateMode(GC1, 'high');
  ok(r && r.success === true, 'setTokenRateMode(high) succeeds');
  ok(cards.getTokenRateMode(GC1) === 'high', 'GC1 now high');
  ok(cards.getTokenRateMode(GC2) === 'low', 'GC2 still low (per-GC isolation)');
  ok(cards.tokenPayFor(GC1, '1') === 5, 'high T1 -> 5');
  ok(cards.tokenPayFor(GC1, '2') === 10, 'high T2 -> 10');
  ok(cards.tokenPayFor(GC1, '3') === 15, 'high T3 -> 15');
  ok(cards.tokenPayFor(GC1, '4') === 20, 'high T4 -> 20');
  ok(cards.tokenPayFor(GC1, '5') === 25, 'high T5 -> 25');
  ok(cards.tokenPayFor(GC1, '6') === 30, 'high T6 -> 30');
  ok(cards.tokenPayFor(GC1, 'S') === 35, 'high S -> 35');
  ok(cards.tokenPayFor(GC1, 'E') === 35, 'high E -> 35');
  ok(cards.tokenPayFor(GC2, '5') === 8, 'GC2 (low) T5 still 8 while GC1 pays 25');

  // ---------- 3. invalid mode rejected ----------
  section('invalid mode rejected, state untouched')
  const bad = await cards.setTokenRateMode(GC2, 'mega');
  ok(bad && bad.success === false, 'unknown mode returns success:false');
  ok(cards.getTokenRateMode(GC2) === 'low', 'GC2 unchanged after invalid attempt');

  // ---------- 4. restart survival ----------
  section('restart survival: persist -> reload')
  ok(sysStore.has('token_rate_modes'), 'modes persisted under System key token_rate_modes');
  const r2 = await cards.setTokenRateMode(GC2, 'high');
  ok(r2 && r2.success === true, 'GC2 pinned high too');
  await cards.loadTokenRateModes(); // simulates a fresh boot
  ok(cards.getTokenRateMode(GC1) === 'high', 'GC1 restored to high after reload');
  ok(cards.getTokenRateMode(GC2) === 'high', 'GC2 restored to high after reload');
  ok(cards.tokenPayFor('999@ignored-g.us', '4') === 5, 'never-pinned group still defaults low after reload');
  const back = await cards.setTokenRateMode(GC1, 'low');
  ok(back && back.success === true, 'switch back to low works');
  await cards.loadTokenRateModes();
  ok(cards.getTokenRateMode(GC1) === 'low' && cards.tokenPayFor(GC1, '5') === 8, 'GC1 low again (T5 -> 8) after round-trip');

  // ---------- 5. static wiring of claim path + dispatcher ----------
  section('static wiring (claim path + .j event rate dispatcher)')
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'rpg', 'cardSystem.js'), 'utf8');
  ok(src.includes('tokenPayFor(chatId, spawn.card && spawn.card.tier)'), 'cmdClaim pays via tokenPayFor(chatId, tier)');
  ok(!src.includes('rollTokenDrop') && !src.includes('TOKEN_DROP_LADDER'), 'v2 RNG ladder fully retired');
  ok(src.includes("eventSub === 'rate'"), 'event dispatcher has rate subcommand');
  ok(src.includes("chatId.endsWith('@g.us') || chatId.endsWith('@lid')"), 'rate toggle group-gated (@g.us/@lid)');
  ok(src.includes('loadTokenRateModes()'), 'init() loads persisted modes on boot');
  ok(/if \(!isOwner && !isMod && !isCardMod\) return reply\('❌ Only Card Mods, Global Mods, or the Owner can control the token event\.'\)/.test(src), 'rate sits behind the existing mod gate');

  console.log(`\n${'='.repeat(40)}\nRESULT: ${pass} pass, ${fail} fail\n${'='.repeat(40)}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA crashed:', e); process.exit(1); });
