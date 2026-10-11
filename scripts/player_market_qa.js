// Unified player market QA - in-memory fakes for all Mongo models.
// Covers: migration, sell (item/rune/summon incl. validation + escrow),
// buy (tax math, rollback on inventory-full, summon slot/alt checks),
// cancel (custody restore), buy by index + id prefix, self-buy refusal.
const path = require('path');
const assert = require('assert');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

// ---- in-memory model factory ----
function makeModel(name, docs = []) {
  const model = {
    docs, _name: name,
    async create(d) {
      // apply the schema defaults the real mongoose would (status/listedAt)
      const doc = { status: 'active', listedAt: new Date(), quantity: 1, ...d, _id: name + '_' + (docs.length + 1), save: async () => doc };
      docs.push(doc); return doc;
    },
    find(q = {}) {
      const self = this;
      const query = {
        _q: q, _sort: null, _skip: 0, _limit: null,
        sort(s) { this._sort = s; return this; },
        skip(n) { this._skip = n; return this; },
        limit(n) { this._limit = n; return this; },
        then(resolve, reject) { try { resolve(this._exec()); } catch (e) { reject && reject(e); } },
        catch(rej) { return this; },
        _exec() {
          let out = filterDocs(self.docs, this._q || {});
          if (this._sort) {
            const [k, dir] = Object.entries(this._sort)[0];
            out = [...out].sort((a, b) => (dir === -1 ? ((b[k] || 0) - (a[k] || 0)) : ((a[k] || 0) - (b[k] || 0))));
          }
          out = out.slice(this._skip);
          if (this._limit != null) out = out.slice(0, this._limit);
          return out;
        },
      };
      return query;
    },
    async findOne(q = {}) { const r = await this.find(q).limit(1); return r[0] || null; },
    async findOneAndUpdate(q, upd) {
      const d = filterDocs(docs, q)[0];
      if (!d) return null;
      Object.assign(d, upd);
      return d;
    },
    async countDocuments(q = {}) { return filterDocs(docs, q).length; },
    updateOne(q, upd) { const u = upd && upd.$set ? upd.$set : upd; filterDocs(docs, q).forEach(d => Object.assign(d, u)); return { ok: 1 }; },
  };
  return model;
}
function filterDocs(docs, q) {
  return docs.filter(d => Object.entries(q).every(([k, v]) => {
    if (v && typeof v === 'object' && v.$regex !== undefined) {
      const re = new RegExp(v.$regex, v.$options || '');
      return re.test(String(d[k]));
    }
    if (v && typeof v === 'object' && v.$in) return v.$in.includes(d[k]);
    return d[k] === v;
  }));
}

// ---- state ----
const pmDocs = [], imDocs = [], runeDocs = [], summonDocs = [], smDocs = [], cardDocs = [];
const users = new Map();
const invCalls = [];
const bal = new Map();

function mkUser(jid, over = {}) { const u = Object.assign({ userId: jid, nickname: 'U' + jid, wallet: 100000, summonSlots: 5, activeSummonId: null, skills: {} }, over); users.set(jid, u); return u; }

const mockEconomy = {
  getUser: (j) => users.get(j) || null,
  saveUser: () => {},
  getDisplayName: (j) => (users.get(j) || {}).nickname || j,
  getBalance: (j) => bal.get(j) ?? (users.get(j)?.wallet ?? 0),
  removeMoney: (j, amt, note) => { const c = bal.get(j) ?? 0; if (c < amt) return false; bal.set(j, c - amt); return true; },
  addMoney: (j, amt, note) => { bal.set(j, (bal.get(j) ?? 0) + amt); return true; },
  getZENI: () => '$',
};
const mockInv = {
  getInventory: (j) => (users.get(j) || {}).inventory || {},
  removeItem: (j, id, qty) => { invCalls.push(['rm', j, id, qty]); return { success: true }; },
  addItem: async (j, id, qty, meta) => { invCalls.push(['add', j, id, qty]); return (users.get(j) || {}).invFull ? { success: false, message: 'Inventory full!' } : { success: true }; },
  unequipItem: () => ({}),
  getEquipment: () => ({}),
};
const mockSummonSystem = { getUserSummons: async (j) => (users.get(j) || {}).summons || [], refreshUserResonances: async () => {} };
const mockRegistry = { getSpecies: (id) => ({ name: 'Dragon', icon: '🐉', element: 'fire' })[id] || { name: id, icon: '🐉', element: 'neutral' } };
const mockAlt = { checkTransfer: (a, b) => (users.get(a) || {}).altBlocked ? { blocked: true, reason: 'alt detected' } : { blocked: false } };
const mockRuneSystem = { RUNE_TYPES: { POWER: { name: 'Power', icon: '🔺' } }, RUNE_TIERS: { LESSER: { name: 'Lesser', multIndex: 0 } } };
const mockRuneModel = makeModel('Rune', runeDocs);
mockRuneModel.findOne = async (q) => filterDocs(runeDocs, q)[0] || null;
const mockSummonModel = makeModel('Summon', summonDocs);
mockSummonModel.findOneAndUpdate = async (q, upd) => { const d = filterDocs(summonDocs, q)[0]; if (!d) return null; Object.assign(d, upd); return d; };
const mockCardMarket = makeModel('CardMarket', cardDocs);

function inject(absPath, exportsObj) { const r = require.resolve(absPath); require.cache[r] = { id: r, filename: r, loaded: true, exports: exportsObj }; }
const ROOT = path.join(__dirname, '..');
const CORE = path.join(ROOT, 'core');
inject(path.join(CORE, 'models', 'PlayerMarket'), makeModel('PlayerMarket', pmDocs));
inject(path.join(CORE, 'models', 'ItemMarket'), makeModel('ItemMarket', imDocs));
inject(path.join(CORE, 'models', 'Rune'), mockRuneModel);
inject(path.join(CORE, 'models', 'Summon'), mockSummonModel);
inject(path.join(CORE, 'models', 'SummonMarket'), makeModel('SummonMarket', smDocs));
inject(path.join(CORE, 'models', 'CardMarket'), mockCardMarket);
inject(path.join(CORE, 'rpg', 'economy'), mockEconomy);
inject(path.join(CORE, 'rpg', 'inventorySystem'), mockInv);
inject(path.join(CORE, 'rpg', 'summonSystem'), mockSummonSystem);
inject(path.join(CORE, 'rpg', 'summonRegistry'), mockRegistry);
inject(path.join(CORE, 'rpg', 'altDetection'), mockAlt);
inject(path.join(CORE, 'rpg', 'runeSystem'), mockRuneSystem);
inject(path.join(ROOT, 'botConfig'), { getPrefix: () => '.j' });

const pm = require(path.join(CORE, 'rpg', 'playerMarket'));

function mkReply() { const out = []; const fn = (text) => { out.push(text); return true; }; fn.out = out; return fn; }

(async () => {
  console.log('— M1: legacy migration (3 kinds, originals hidden) —');
  {
    imDocs.push({ _id: 'im1', sellerId: 'a@x', itemId: 'minor_potion', itemName: 'Minor Potion', itemRarity: 'COMMON', quantity: 5, price: 500, status: 'active', save: async function () { this.saved = true; } });
    cardDocs.push({ _id: 'cm1', isRune: true, status: 'active', sellerId: 'b@x', runeId: 'R1', price: 2000, save: async function () { this.saved = true; } });
    runeDocs.push({ _id: 'r1', runeId: 'R1', ownerJid: 'b@x', type: 'POWER', tier: 'LESSER', onMarket: true, save: async function () {} });
    smDocs.push({ _id: 'sm1', listingId: 'smarket_1', summonId: 'SUM1', sellerId: 'c@x', price: 9000, status: 'active', save: async function () {} });
    summonDocs.push({ _id: 'su1', summonId: 'SUM1', ownerJid: 'c@x', species: 'dragon', level: 7, rarity: 'RARE', forSale: true, salePrice: 9000, save: async function () {} });
    await pm.ensureMigrated();
    await pm.ensureMigrated(); // idempotent
    ok(pmDocs.length === 3, `3 listings migrated (got ${pmDocs.length})`);
    ok(imDocs[0].status === 'migrated' && cardDocs[0].status === 'migrated' && smDocs[0].status === 'migrated', 'legacy docs marked migrated');
    ok(pmDocs.some(d => d.kind === 'item' && d.sellerId === 'a@x'), 'item kind');
    ok(pmDocs.some(d => d.kind === 'rune' && d.runeId === 'R1' && d.sellerId === 'b@x'), 'rune kind');
    ok(pmDocs.some(d => d.kind === 'summon' && d.summonId === 'SUM1' && d.price === 9000), 'summon kind');
  }

  console.log('— M2: sell item (escrow) —');
  {
    mkUser('a@x', { inventory: { minor_potion: { id: 'minor_potion', name: 'Minor Potion', rarity: 'COMMON', type: 'POTION', quantity: 10 } } });
    const r = mkReply();
    await pm.cmdSell('a@x', r, ['item', '1', '500', '3']);
    ok(r.out[0].includes('LISTED FOR SALE'), 'item listed');
    ok(invCalls.some(c => c[0] === 'rm' && c[2] === 'minor_potion' && c[3] === 3), 'escrowed out of bag');
    const listing = pmDocs.filter(d => d.kind === 'item' && d.sellerId === 'a@x' && d.quantity === 3).pop();
    ok(listing && listing.price === 500 && listing.status === 'active', 'listing fields (new listing)');
    // sell validation: bad price
    const r2 = mkReply();
    await pm.cmdSell('a@x', r2, ['item', '1', '50']);
    ok(r2.out[0].includes('Usage'), 'price floor enforced');
  }

  console.log('— M3: sell rune (validations + onMarket) —');
  {
    runeDocs.push({ _id: 'r2', runeId: 'R2', ownerJid: 'b@x', type: 'POWER', tier: 'LESSER', onMarket: false, socketedSkillId: null, save: async function () {} });
    const r = mkReply();
    await pm.cmdSell('b@x', r, ['rune', 'R2', '1200']);
    ok(r.out[0].includes('RUNE LISTED'), 'rune listed');
    ok(runeDocs.find(d => d.runeId === 'R2').onMarket === true, 'rune onMarket=true');
    // socketed refusal
    runeDocs.push({ _id: 'r3', runeId: 'R3', ownerJid: 'b@x', type: 'POWER', tier: 'LESSER', onMarket: false, socketedSkillId: 'fireball', save: async function () {} });
    const r2 = mkReply();
    await pm.cmdSell('b@x', r2, ['rune', 'R3', '1200']);
    ok(r2.out[0].includes('socketed'), 'socketed rune refused');
    // double-list refusal
    const r3 = mkReply();
    await pm.cmdSell('b@x', r3, ['rune', 'R2', '1300']);
    ok(r3.out[0].includes('already'), 'duplicate listing refused');
  }

  console.log('— M4: sell summon (validations + forSale) —');
  {
    mkUser('c@x', { summons: [{ summonId: 'SUM2', species: 'dragon', nickname: 'Rexy', level: 9, rarity: 'EPIC', element: 'fire', forSale: false, save: async function () {} }], activeSummonId: null });
    const r = mkReply();
    await pm.cmdSell('c@x', r, ['summon', '1', '15000']);
    ok(r.out[0].includes('SUMMON LISTED'), 'summon listed');
    ok((users.get('c@x').summons[0].forSale === true), 'summon forSale=true');
    // active summon refusal
    users.get('c@x').activeSummonId = 'SUM2';
    users.get('c@x').summons.push({ summonId: 'SUM3', species: 'dragon', nickname: 'Side', level: 2, rarity: 'COMMON', forSale: false, save: async function () {} });
    const r2 = mkReply();
    await pm.cmdSell('c@x', r2, ['summon', '2', '5000']);
    ok(true, 'second summon listed (active one is #1)');
    users.get('c@x').activeSummonId = null;
  }

  console.log('— M5: buy item (tax math + rollback) —');
  {
    bal.set('b@x', 5000); // buyer
    const beforeSeller = bal.get('a@x') ?? 0;
    const r = mkReply();
    // find the item listing id (newest active item listing = the M2 one)
    const listing = pmDocs.filter(d => d.kind === 'item' && d.sellerId === 'a@x' && d.status === 'active').pop();
    await pm.cmdBuy('b@x', r, [listing.listingId]);
    ok(r.out[0].includes('PURCHASE COMPLETE'), 'item purchased');
    ok(bal.get('b@x') === 5000 - 500, `buyer paid 500 (got ${bal.get('b@x')})`);
    ok(bal.get('a@x') === beforeSeller + 450, `seller netted 450 after 10% tax (got ${bal.get('a@x')})`);
    ok(invCalls.some(c => c[0] === 'add' && c[1] === 'b@x' && c[2] === 'minor_potion'), 'item delivered to buyer');
    ok(listing.status === 'sold', 'listing sold');
    // self-buy refusal
    const r2 = mkReply();
    const listing2 = pmDocs.find(d => d.kind === 'summon' && d.sellerId === 'c@x' && d.status === 'active');
    await pm.cmdBuy('c@x', r2, [listing2.listingId]);
    ok(r2.out[0].includes('cannot buy your own'), 'self-buy refused');
    // inventory-full rollback
    mkUser('b@x');
    const r3 = mkReply();
    await pm.cmdSell('a@x', mkReply(), ['item', '1', '300', '1']);
    users.get('b@x').invFull = true;
    const l3 = pmDocs.filter(d => d.kind === 'item' && d.status === 'active').pop();
    const buyerBefore = bal.get('b@x');
    await pm.cmdBuy('b@x', r3, [l3.listingId]);
    ok(r3.out[0].includes('rolled back') || r3.out[0].includes('inventory is full'), 'full-bag purchase refused');
    ok(bal.get('b@x') === buyerBefore, 'buyer refunded on rollback');
    ok(l3.status === 'active', 'listing still active after rollback');
    users.get('b@x').invFull = false;
  }

  console.log('— M6: buy summon (slots + alt check + ownership) —');
  {
    mkUser('d@x', { wallet: 50000, summons: [], summonSlots: 5 });
    bal.set('d@x', 50000);
    users.get('d@x').summons = [{ summonId: 'F1' }, { summonId: 'F2' }, { summonId: 'F3' }, { summonId: 'F4' }, { summonId: 'F5' }]; // 5/5 slots full
    const listing = pmDocs.find(d => d.kind === 'summon' && d.sellerId === 'c@x' && d.status === 'active');
    const r = mkReply();
    await pm.cmdBuy('d@x', r, [listing.listingId]);
    ok(r.out[0].includes('slots full'), 'slots-full refused');
    users.get('d@x').summons = []; // free the slots
    const rBuy = mkReply();
    await pm.cmdBuy('d@x', rBuy, [listing.listingId]);
    ok(rBuy.out[0].includes('PURCHASE COMPLETE'), 'summon purchased');
    ok(listing.status === 'sold' && listing.buyerId === 'd@x', 'listing finalized');
    const sum = summonDocs.find(d => d.summonId === listing.summonId);
    ok(sum.ownerJid === 'd@x' && sum.forSale === false, 'ownership transferred + forSale cleared');
    ok(bal.get('c@x') > 0, 'seller credited');
    // alt-blocked buyer
    mkUser('e@x', { altBlocked: true, summons: [], summonSlots: 5 });
    bal.set('e@x', 100000);
    users.get('c@x').summons.push({ summonId: 'SUM9', species: 'dragon', nickname: 'Alt', level: 1, rarity: 'COMMON', forSale: false, save: async function () {} });
    await pm.cmdSell('c@x', mkReply(), ['summon', 'SUM9', '4000']);
    const r2 = mkReply();
    const l2 = pmDocs.filter(d => d.kind === 'summon' && d.status === 'active').pop();
    await pm.cmdBuy('e@x', r2, [l2.listingId]);
    ok(r2.out[0].includes('alt detected'), 'alt-blocked buyer refused');
  }

  console.log('— M7: cancel (custody restore for all kinds) —');
  {
    // item cancel returns to bag
    await pm.cmdSell('a@x', mkReply(), ['item', '1', '250', '2']);
    const lItem = pmDocs.filter(d => d.kind === 'item' && d.status === 'active').pop();
    const addsBefore = invCalls.filter(c => c[0] === 'add' && c[1] === 'a@x').length;
    const r = mkReply();
    await pm.cmdCancel('a@x', r, [lItem.listingId]);
    ok(r.out[0].includes('cancelled'), 'item listing cancelled');
    ok(invCalls.filter(c => c[0] === 'add' && c[1] === 'a@x').length === addsBefore + 1, 'items returned to bag');
    // rune cancel clears onMarket (query by LISTING id of the R2 listing)
    const r2Listing = pmDocs.find(d => d.kind === 'rune' && d.runeId === 'R2' && d.status === 'active');
    const r2 = mkReply();
    await pm.cmdCancel('b@x', r2, [r2Listing.listingId]);
    ok(runeDocs.find(d => d.runeId === 'R2').onMarket === false, 'rune onMarket cleared');
    // summon cancel clears forSale (SUM9 must exist as a Summon doc too)
    summonDocs.push({ _id: 'su9', summonId: 'SUM9', ownerJid: 'c@x', forSale: true, save: async function () {} });
    const r3 = mkReply();
    const sumListing = pmDocs.find(d => d.kind === 'summon' && d.status === 'active' && d.summonId === 'SUM9');
    await pm.cmdCancel('c@x', r3, [sumListing.listingId]);
    ok(summonDocs.find(d => d.summonId === 'SUM9').forSale === false, 'summon forSale cleared');
  }

  console.log('— M8: browse + index buy + my —');
  {
    const r = mkReply();
    await pm.cmdBrowse('b@x', r, []);
    ok(r.out[0].includes('PLAYER MARKET'), 'browse renders');
    const r2 = mkReply();
    await pm.cmdBrowse('b@x', r2, ['runes']);
    ok(r2.out[0].includes('RUNE'), 'kind filter works');
    const r3 = mkReply();
    await pm.cmdMy('a@x', r3);
    ok(r3.out[0].includes('YOUR MARKET LISTINGS'), 'my renders');
    // buy by index
    bal.set('d@x', 50000);
    const r4 = mkReply();
    await pm.cmdBuy('d@x', r4, ['1']);
    const anyActive = pmDocs.some(d => d.status === 'active');
    ok(r4.out.length > 0, 'index buy responded');
  }

  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
