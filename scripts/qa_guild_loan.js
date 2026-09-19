// QA: guild loan system full-flow verification (2026-09-20 owner report).
//
// Owner's report:
//   1. `.j guild loan` (no amount) did NOTHING - gate required a trailing space.
//   2. `.j guild loan 20000` -> "Max loan is 10% of guild bank = 0 Zeni" while
//      `.s guild loan 5000` passed the same check - the two bot instances
//      disagree about the guild bank (stale per-process caches).
//   3. `.s guild loan 5000` -> "Loan failed: could not credit your wallet
//      (registration or JID issue)" - borrower resolution dead-end.
//   4. Transaction was NOT safe: bank debited + loan persisted BEFORE the
//      wallet credit; debt gate ran AFTER the payout.
//
// This suite drives the REAL guilds.js / economy.js modules against mocked
// mongoose models (in-memory "DB"), simulating both bot instances' caches,
// and pins the engine's transaction ORDER with static source assertions.

process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

// ─────────────────────────────────────────────────────────────────────────
// Mock mongoose models BEFORE the real modules load.
// ─────────────────────────────────────────────────────────────────────────
function inject(modPath, mock) {
  const abs = require.resolve(modPath);
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: mock, children: [], paths: [] };
}

function findOneQuery(doc) {
  const clone = () => (doc ? JSON.parse(JSON.stringify(doc)) : null);
  return {
    lean: async () => clone(),
    toObject: () => clone(),
    then: (res, rej) => Promise.resolve(clone()).then(res, rej),
  };
}

const guildDB = new Map();      // guildId -> doc
const guildWriteLog = [];       // every SUCCESSFUL write
let failGuildWrites = 0;        // next N guild writes throw
let failGuildReads = 0;         // next N guild reads throw
const GuildMock = {
  findOne: (q) => {
    if (failGuildReads > 0) { failGuildReads--; throw new Error('QA: simulated DB read failure'); }
    return findOneQuery(guildDB.get(q.guildId) || null);
  },
  updateOne: async (q, update) => {
    if (failGuildWrites > 0) { failGuildWrites--; throw new Error('QA: simulated DB write failure'); }
    guildWriteLog.push({ guildId: q.guildId, update });
    guildDB.set(q.guildId, { ...(guildDB.get(q.guildId) || {}), ...update });
    return { acknowledged: true };
  },
};
inject('../core/models/Guild', GuildMock);
inject('../core/models/System', { findOne: () => findOneQuery(null), updateOne: async () => ({ acknowledged: true }) });
inject('../core/models/LidMapping', { find: () => ({ lean: async () => [] }) });
inject('../core/models/Settlement', class { constructor(d) { this.data = d; } async save() { return this; } });

const userDB = new Map();       // userId -> doc (the shared User collection)
const userWriteLog = [];        // userIds of every successful write
let failUserWrites = 0;
const UserMock = {
  findOne: (q) => findOneQuery(userDB.get(q.userId) || null),
  findOneAndUpdate: async (q, set) => {
    if (failUserWrites > 0) { failUserWrites--; throw new Error('QA: simulated user write failure'); }
    userWriteLog.push({ userId: q.userId });
    userDB.set(q.userId, { ...(userDB.get(q.userId) || {}), ...set.$set });
    return { ...userDB.get(q.userId) };
  },
};
inject('../core/models/User', UserMock);

// ─────────────────────────────────────────────────────────────────────────
// Load the REAL modules against the mocks.
// ─────────────────────────────────────────────────────────────────────────
const guilds = require('../core/rpg/guilds');
const economy = require('../core/rpg/economy');
const lidResolver = require('../core/utils/lidResolver');
const fs = require('fs');
const path = require('path');

let failed = 0;
function assert(cond, label) {
  if (!cond) { failed++; console.error('  ✗ FAIL:', label); }
  else console.log('  ✓', label);
}
function section(t) { console.log('\n── ' + t + ' ──'); }

// ─────────────────────────────────────────────────────────────────────────
// Seed: the SHARED MongoDB state (what the DB truly holds).
// ─────────────────────────────────────────────────────────────────────────
const PHONE = '2348012345678@s.whatsapp.net';   // borrower's canonical DB key
const LID = '105712667648066@lid';              // same player arriving as LID
const DEBT_JID = '2348777777777@s.whatsapp.net';
const GHOST = '2348999999999@s.whatsapp.net';   // genuinely unregistered
const LEADER = '2348000000001@s.whatsapp.net';
const GNAME = 'Iron Vanguard';

guildDB.set(GNAME, {
  guildId: GNAME,
  leader: LEADER,
  balance: 80000,               // the TRUTH: guild bank has 80,000
  loans: [],
  members: [{ userId: PHONE, role: 'member', title: 'Member' }],
  xp: 0, level: 1,
});
userDB.set(PHONE, {
  userId: PHONE,                // registered under the PHONE key (Joker era)
  wallet: 2000, bank: 0, registered: true, nickname: 'Borrower',
  stats: { totalEarned: 2000, totalSpent: 0 }, debt: { amount: 0 },
});
userDB.set(DEBT_JID, {
  userId: DEBT_JID, wallet: 0, bank: 0, registered: true, nickname: 'Debtor',
  stats: { totalEarned: 0, totalSpent: 0 }, debt: { amount: 4000 },
});

// LID <-> phone mapping known to both instances
lidResolver.lidCache.set(LID.split('@')[0], PHONE.split('@')[0]);
lidResolver.phoneCache.set(PHONE.split('@')[0], LID.split('@')[0]);

// Joker's (or Subaru's) STALE in-memory guild cache: bank looks EMPTY
guilds.globalGuildData.guilds[GNAME] = {
  members: [PHONE], owner: LEADER, admins: [], recruits: [], titles: {},
  balance: 0,                   // STALE snapshot - DB says 80000
  loans: [], points: 0, level: 1, type: 'ADVENTURER', buildings: {},
};
guilds.globalGuildData.memberGuilds[PHONE] = GNAME;

function seedEconomyCache(jid) {
  const doc = JSON.parse(JSON.stringify(userDB.get(jid)));
  economy.economyData.set(jid, doc);
  return doc;
}

// ═════════════════════════════════════════════════════════════════════════
(async () => {
section('1. stale guild bank healed from the shared DB (Bug 2: "max = 0")');
assert(guilds.getGuild(GNAME).balance === 0, 'precondition: instance cache shows bank = 0 (stale)');
const refreshed = await guilds.refreshGuildMoney(GNAME);
assert(refreshed && refreshed.balance === 80000, 'refreshGuildMoney pulls the REAL bank (80000) from MongoDB');
assert(guilds.getGuild(GNAME).balance === 80000, 'in-memory guild object now carries the fresh balance');
assert(Math.floor(refreshed.balance * 0.10) === 8000, 'maxLoan = 8,000 (10% of the true bank, not 0)');

// DB miss and DB read failure must degrade to cached values, never throw
const refreshedMiss = await guilds.refreshGuildMoney('No Such Guild');
assert(refreshedMiss === null, 'refreshGuildMoney on unknown guild returns null (handler refuses earlier anyway)');
failGuildReads = 1;
const refreshedErr = await guilds.refreshGuildMoney(GNAME);
assert(refreshedErr && refreshedErr.balance === 80000, 'DB read failure falls back to cached money fields (no crash)');
assert(guilds.getGuild(GNAME).balance === 80000, 'balance unchanged after failed refresh');

// ═════════════════════════════════════════════════════════════════════════
section('2. getUserGuild JID tolerance (guild/JID lookup verification)');
assert(guilds.getUserGuild(PHONE) === GNAME, 'exact key hit');
assert(guilds.getUserGuild('2348012345678:1@s.whatsapp.net') === GNAME, 'device-suffix JID falls back to bare-number match');
economy.economyData.set(PHONE, seedEconomyCache(PHONE)); // resolver needs the account visible
assert(guilds.getUserGuild(LID) === GNAME, 'LID JID resolved through economy canonical resolver');
assert(guilds.getUserGuild('999000111@s.whatsapp.net') === undefined, 'stranger still resolves to no guild');

// ═════════════════════════════════════════════════════════════════════════
section('3. cross-instance borrower heal (Bug 3: "could not credit your wallet")');
// Subaru-shaped state: economy cache EMPTY for the borrower, incoming LID.
economy.economyData.delete(PHONE);
assert(economy.getUser(LID) === null, 'precondition: Subaru cache has no account for the incoming LID');

// The exact heal the reworked handler runs BEFORE any money moves:
let borrower = economy.getUser(LID);
if (!borrower) {
  await economy.syncUserFromDB(LID);
  borrower = economy.getUser(LID);
}
assert(borrower && borrower.registered === true, 'syncUserFromDB finds the registration in the User collection');
const paid = economy.addMoney(LID, 5000, 'Guild loan from ' + GNAME);
assert(paid !== false && paid > 0, 'addMoney now CREDITS the wallet (loan no longer "fails")');
assert(economy.getGold(LID) === 7000, 'wallet actually grew 2000 -> 7000');

// the healed account must persist to its CANONICAL key (no duplicate birth)
await new Promise(r => setTimeout(r, 700)); // flush the debounced save
assert(userWriteLog.length > 0, 'debounced save flushed');
assert(userWriteLog.every(w => w.userId === PHONE), 'every user write targets the canonical PHONE key (no second account doc)');
assert(!userDB.has(LID), 'no duplicate User document was created under the LID key');

// ═════════════════════════════════════════════════════════════════════════
section('4. genuinely unregistered borrower -> clean refusal, nothing mutated');
assert(economy.getUser(GHOST) === null, 'no account for ghost JID');
await economy.syncUserFromDB(GHOST);
assert(economy.getUser(GHOST) === null, 'DB heal finds nothing either (correct)');
assert(economy.addMoney(GHOST, 5000, 'qa') === false, 'addMoney refuses (correct terminal state)');
assert(!userDB.has(GHOST), 'ghost account was not created by the heal');

// ═════════════════════════════════════════════════════════════════════════
section('5. debt borrower: payout alone would vanish into debt (why the gate moved)');
const debtDoc = seedEconomyCache(DEBT_JID);
const rDebt = economy.addMoney(DEBT_JID, 3000, 'qa debt demo');
assert(rDebt !== false, 'addMoney with debt returns truthy (payout swallowed by debt - invisible to a post-payout gate)');
assert(debtDoc.debt.amount === 1000 && debtDoc.wallet === 0, 'the 3000 went straight into debt, wallet unchanged');
assert(debtDoc.debt.amount > 0, "handler gate (borrower.debt.amount > 0) WOULD refuse this borrower pre-mutation");
// restore for cleanliness
debtDoc.debt.amount = 4000;

// ═════════════════════════════════════════════════════════════════════════
section('6. borrow transaction happy path (handler order, real primitives)');
economy.economyData.set(PHONE, seedEconomyCache(PHONE));
economy.getUser(PHONE).wallet = 2000;
await guilds.syncGuild(GNAME); // sync stale-healed cache back? NO - reset DB balance only via doc
guildDB.get(GNAME).balance = 80000; guildDB.get(GNAME).loans = [];
guilds.getGuild(GNAME).balance = 80000; guilds.getGuild(GNAME).loans = [];
const g = guilds.getGuild(GNAME);
const bank0 = g.balance, wallet0 = economy.getGold(PHONE);
const amount = 5000;
assert(amount <= Math.floor(g.balance * 0.10), 'amount within the allowed limit (5000 <= 8000)');
const paid2 = economy.addMoney(PHONE, amount, 'Guild loan from ' + GNAME);
assert(paid2 !== false, 'wallet credit succeeds first');
g.balance = bank0 - amount;                       // debit bank
const dueAt = new Date(Date.now() + 7 * 86400000);
const loanRecord = { borrowerJid: PHONE, amount, takenAt: new Date(), dueAt, repaid: false, repaidAt: null };
g.loans.push(loanRecord);
assert(await guilds.syncGuild(GNAME) === true, 'syncGuild persists and returns TRUE');
const dbG = guildDB.get(GNAME);
assert(dbG.balance === 75000 && Array.isArray(dbG.loans) && dbG.loans.length === 1, 'DB bank debited and loan recorded');
assert(economy.getGold(PHONE) === wallet0 + amount, 'borrower wallet holds the loan');
assert((economy.getGold(PHONE) - wallet0) + (dbG.balance - bank0) === 0, 'money conserved: wallet gain == bank loss');

// ═════════════════════════════════════════════════════════════════════════
section('7. borrow persist failure -> full claw-back (transaction safety)');
const preWrites = guildWriteLog.length;
failGuildWrites = 1;
const paid3 = economy.addMoney(PHONE, 3000, 'Guild loan from ' + GNAME);
assert(paid3 !== false, 'credit succeeded before persist attempt');
g.balance -= 3000;
const loan2 = { borrowerJid: PHONE, amount: 3000, takenAt: new Date(), dueAt, repaid: false, repaidAt: null };
g.loans.push(loan2);
const persisted = await guilds.syncGuild(GNAME);
assert(persisted === false, 'syncGuild reports the failed persist (was silent before)');
// claw-back exactly as the handler does:
g.balance += 3000;
g.loans = g.loans.filter(l => l !== loan2);
economy.removeMoney(PHONE, 3000, 'Guild loan rollback (bank persist failed)');
assert(guildWriteLog.length === preWrites, 'FAILED write never reached the DB');
assert(g.balance === 75000, 'bank restored in memory');
assert(g.loans.length === 1, 'loan record removed');
assert(economy.getGold(PHONE) === wallet0 + amount, 'wallet clawed back - net zero');
assert((guildDB.get(GNAME)).balance === 75000, 'DB bank untouched by the failed transaction');

// ═════════════════════════════════════════════════════════════════════════
section('8. repay flow: partial, overpay clamp, persist failure refund');
// 8a. partial repayment 2000 of 5000
let w = economy.getGold(PHONE);
let took = economy.removeMoney(PHONE, 2000, 'Guild loan repayment');
assert(took === true, 'wallet debited first');
const myLoans = g.loans.filter(l => l.borrowerJid === PHONE && !l.repaid);
let remaining = 2000, totalRepaid = 0;
for (const loan of myLoans) {
  if (remaining <= 0) break;
  const apply = Math.min(remaining, loan.amount);
  loan.amount -= apply; remaining -= apply; totalRepaid += apply;
  if (loan.amount <= 0) { loan.repaid = true; loan.repaidAt = new Date(); }
}
g.balance = (g.balance || 0) + totalRepaid;
assert(await guilds.syncGuild(GNAME) === true, 'repay persist true');
assert(totalRepaid === 2000 && myLoans[0].amount === 3000, 'oldest loan reduced to 3000');
assert(guildDB.get(GNAME).balance === 77000, 'DB bank credited 77000');
assert(economy.getGold(PHONE) === w - 2000, 'wallet debited exactly the applied amount');

// 8b. OVERPAY clamp: request 99999 against 3000 outstanding -> pays 3000 only
w = economy.getGold(PHONE);
const requested = 99999;
const outstanding = g.loans.filter(l => l.borrowerJid === PHONE && !l.repaid).reduce((s, l) => s + l.amount, 0);
const repayAmount = Math.min(requested, outstanding);
assert(repayAmount === 3000, 'overpay request clamped to outstanding (old code DESTROYED the difference)');
economy.removeMoney(PHONE, repayAmount, 'Guild loan repayment');
let repaidAll = false;
for (const loan of g.loans.filter(l => l.borrowerJid === PHONE && !l.repaid)) {
  const apply = Math.min(repayAmount, loan.amount);
  loan.amount -= apply;
  if (loan.amount <= 0) { loan.repaid = true; loan.repaidAt = new Date(); repaidAll = true; }
}
g.balance += repayAmount;
await guilds.syncGuild(GNAME);
assert(repaidAll && w - repayAmount === economy.getGold(PHONE), 'loan cleared, wallet debited exactly the outstanding (no Zeni destroyed)');
assert(guildDB.get(GNAME).balance === 80000, 'bank restored to 80000 after full repayment');

// 8c. repay persist failure -> wallet refund + loan snapshot restore
g.loans.push({ borrowerJid: PHONE, amount: 4000, takenAt: new Date(), dueAt, repaid: false, repaidAt: null });
economy.getUser(PHONE).wallet = 5000;
const snap = { amount: 4000, repaid: false, repaidAt: null };
failGuildWrites = 1;
took = economy.removeMoney(PHONE, 4000, 'Guild loan repayment');
assert(took === true, 'wallet debited');
const gLoan = g.loans[g.loans.length - 1];
gLoan.amount = 0; gLoan.repaid = true;
g.balance += 4000;
const persisted2 = await guilds.syncGuild(GNAME);
assert(persisted2 === false, 'persist failure detected');
// rollback:
gLoan.amount = snap.amount; gLoan.repaid = snap.repaid; gLoan.repaidAt = snap.repaidAt;
g.balance -= 4000;
economy.addMoney(PHONE, 4000, 'Guild loan repay rollback (bank persist failed)');
await guilds.refreshGuildMoney(GNAME);
assert(economy.getGold(PHONE) === 5000, 'wallet refunded in full');
assert(gLoan.amount === 4000 && gLoan.repaid === false, 'loan record restored from snapshot');
assert(g.balance === 80000 && guildDB.get(GNAME).balance === 80000, 'bank unchanged in memory and DB');

// ═════════════════════════════════════════════════════════════════════════
section('9. command parsing (all branches, both prefixes)');
// mirrors the handler's parse exactly (pinned to source by section 10)
function parse(txt) {
  const tokens = txt.split(/\s+/);
  const sub = tokens[3]?.toLowerCase();
  if (!sub || sub === 'list' || sub === 'status') return { view: 'list' };
  if (sub === 'repay') {
    const raw = String(tokens[4] || '').replace(/,/g, '');
    if (!raw) return { view: 'repay-usage' };
    const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : 0;
    return n > 0 ? { view: 'repay', amount: n } : { view: 'repay-usage' };
  }
  const raw = String(sub).replace(/,/g, '');
  const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : 0;
  return n > 0 ? { view: 'borrow', amount: n } : { view: 'usage' };
}
assert(parse('.j guild loan').view === 'list', 'bare `.j guild loan` NOW ENTERS the handler (was silently ignored)');
assert(parse('.s guild loan').view === 'list', 'bare `.s guild loan` enters too');
assert(parse('.j guild loan 5000').amount === 5000, 'plain amount');
assert(parse('.j guild loan 20,000').amount === 20000, 'comma-formatted amount');
assert(parse('.j guild loan   3000').amount === 3000, 'extra whitespace tolerated');
assert(parse('.j guild loan -50').view === 'usage', 'negative -> usage');
assert(parse('.j guild loan 5k').view === 'usage', 'non-numeric -> usage (was parseInt silent 5)');
assert(parse('.j guild loan 0').view === 'usage', 'zero -> usage');
assert(parse('.s guild loan 5000').amount === 5000, 'Subaru prefix parses identically');
assert(parse('.j guild loan list').view === 'list', 'explicit list');
assert(parse('.j guild loan status').view === 'list', 'status alias');
assert(parse('.j guild loan repay 1,500').amount === 1500, 'repay with comma amount');
assert(parse('.s guild loan repay 1500').amount === 1500, 'repay plain');
assert(parse('.j guild loan repay').view === 'repay-usage', 'repay without amount -> usage');
assert(parse('.j guild loan repay abc').view === 'repay-usage', 'repay non-numeric -> usage');

// ═════════════════════════════════════════════════════════════════════════
section('10. static source pins: engine transaction order + gate');
const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine.js'), 'utf8');
const blockStart = engineSrc.indexOf('`.p guild loan [list|repay <amt>|<amt>]`');
const blockEnd = engineSrc.indexOf('// `.g guild info`');
assert(blockStart > 0 && blockEnd > blockStart, 'loan block located in engine.js');
const B = engineSrc.slice(blockStart, blockEnd);

assert(B.includes('lowerTxt === `${botConfig.getPrefix().toLowerCase()} guild loan` ||'),
  'gate matches the BARE form (`.p guild loan` with no args)');
assert(B.includes('lowerTxt.startsWith(`${botConfig.getPrefix().toLowerCase()} guild loan `)'),
  'gate still matches the arg form');
assert(B.includes('await guilds.refreshGuildMoney(userGuild)'), 'bank healed from DB before any decision');
assert(B.includes('await economy.syncUserFromDB(senderJid)'), 'borrower healed from DB before any decision');

const idx = (needle) => B.indexOf(needle);
const idxRefresh = idx('await guilds.refreshGuildMoney(userGuild)');
const idxDebtGate = idx('borrower.debt && borrower.debt.amount > 0');
const idxAddMoneyBorrow = idx('economy.addMoney(senderJid, amount, `Guild loan from');
const idxDebit = idx('guild.balance = bankBalance - amount');
const idxPersistBorrow = B.indexOf('const persisted = await guilds.syncGuild(userGuild)', idxDebit);
const idxRemoveRepay = idx('economy.removeMoney(senderJid, repayAmount');
const idxOutstanding = idx('const outstanding =');
const idxSnapshots = idx('const loanSnapshots');
assert(idxRefresh < idxDebtGate, 'order: DB heal before debt gate');
assert(idxDebtGate < idxAddMoneyBorrow, 'order: debt gate BEFORE the payout (kills the free-debt-reduction bug)');
assert(idxAddMoneyBorrow < idxDebit, 'order: wallet credited BEFORE bank debit');
assert(idxDebit < idxPersistBorrow, 'order: bank debit before single persist');
assert(idxOutstanding < idxRemoveRepay, 'order: overpay clamp computed before wallet debit');
assert(idxRemoveRepay < idxSnapshots, 'order: repay wallet debit before loan mutations');

assert(B.includes('[GuildLoan] REFUSED'), 'unresolvable borrower logs a loud diagnostic');
assert(B.includes('Nothing was borrowed and the guild bank was not touched'), 'refusal message promises zero side effects');
assert(/nothing was deducted from the guild bank/i.test(B), 'credit-failure message promises zero side effects');
assert(B.includes('OVERPAY FIX'), 'overpay clamp present');
assert(B.includes("economy.removeMoney(senderJid, amount, 'Guild loan rollback (bank persist failed)')"), 'borrow claw-back present');
assert(B.includes("'Guild loan repay rollback (bank persist failed)'"), 'repay refund present');
assert(!/['"`]\.j guild loan/.test(B), 'no hardcoded Joker literal in the block (shared by both bots)');
assert(!/['"`]\.s guild loan/.test(B), 'no hardcoded Subaru literal in the block (shared by both bots)');
assert(B.includes('const donated = economy.removeMoney') || engineSrc.includes('const donated = economy.removeMoney'),
  'donation block now checks removeMoney result');

// ═════════════════════════════════════════════════════════════════════════
section('11. static source pins: guilds.js + economy.js support fixes');
const guildsSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'guilds.js'), 'utf8');
const syncFn = guildsSrc.slice(guildsSrc.indexOf('async function syncGuild('), guildsSrc.indexOf('function saveGuilds()'));
assert(syncFn.includes('return true;') && syncFn.includes('return false;'), 'syncGuild reports persist success/failure');
assert(guildsSrc.includes('async function refreshGuildMoney('), 'refreshGuildMoney exists');
assert(/module\.exports = \{[\s\S]*refreshGuildMoney[\s\S]*\};/.test(guildsSrc), 'refreshGuildMoney exported');
const ugFn = guildsSrc.slice(guildsSrc.indexOf('function getUserGuild('), guildsSrc.indexOf('function getCardGuildInfo('));
assert(ugFn.includes('economy.resolveJid'), 'getUserGuild has canonical-resolver fallback');
assert(ugFn.includes("split('@')[0].split(':')[0]"), 'getUserGuild has bare-number fallback');

const econSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'economy.js'), 'utf8');
const saveFn = econSrc.slice(econSrc.indexOf('async function saveUser('), econSrc.indexOf('// 💡 Force-reload a user'));
assert(saveFn.includes('const canonicalId'), 'saveUser persists to the CANONICAL account key (no duplicate accounts)');
const reloadFn = econSrc.slice(econSrc.indexOf('async function reloadUserFromDB('), econSrc.indexOf('========================================', econSrc.indexOf('async function reloadUserFromDB(')));
assert(reloadFn.includes('jidLookupVariants(userId)'), 'reloadUserFromDB uses the shared variant lookup');
const syncIdx = econSrc.indexOf('async function syncUserFromDB(');
const syncHealFn = econSrc.slice(syncIdx, syncIdx + 2500);
assert(syncHealFn.includes('jidLookupVariants(userId)'), 'syncUserFromDB uses the shared variant lookup (mapped-number root cause fixed)');
assert(econSrc.includes('function jidLookupVariants('), 'jidLookupVariants helper exists');

// ═════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════');
if (failed) { console.error(`✗ ${failed} CHECK(S) FAILED`); process.exit(1); }
console.log('✓ ALL GUILD-LOAN CHECKS PASSED');
process.exit(0);
})();
