// rpg/playerMarket.js
// 🏪 UNIFIED PLAYER MARKET (2026-10-11) — one market for items, runes and summons.
//
// Commands (all legacy aliases keep working and land here):
//   market [page]                       (alias: market)   - browse everything
//   market items|runes|summons [page]   - browse by kind
//   market sell item <bagSlot#> <price> [qty]             (legacy: listitem/li)
//   market sell rune <runeId> <price>                     (legacy: rune sell)
//   market sell summon <summon#|id> <price>               (legacy: summon market sell)
//   market buy <listingId|#>                              (legacy: buyitem/bi, rune buy, summon market buy)
//   market cancel <listingId|#>                           (legacy: unlistitem/uli, rune unsell, summon market cancel)
//   market my                                             (legacy: summon market my)
//
// Custody semantics per kind are preserved from the legacy markets (see
// models/PlayerMarket.js header). Fee: 10% tax on sale for every kind.

const crypto = require('crypto');
const PlayerMarket = require('../models/PlayerMarket');
const ItemMarket = require('../models/ItemMarket');
const economy = require('./economy');
const inventorySystem = require('./inventorySystem');

const MIN_LISTING = 100;      // same floor as the legacy item market
const MAX_LISTING = 5000000;  // same cap as the legacy item market
const TAX_RATE = 0.10;        // unified sale tax

let _migrated = false;

function ZENI() { return economy.getZENI ? economy.getZENI() : '💰'; }

function newListingId() {
  return 'M-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ───────────────────────────────────────────────────────────
// Legacy migration: copy ACTIVE listings from the three legacy
// collections into PlayerMarket, mark the originals 'migrated'
// (invisible to every legacy status:'active' query). Idempotent.
// ───────────────────────────────────────────────────────────
async function ensureMigrated() {
  if (_migrated) return;
  _migrated = true;
  try {
    // 1. items
    const items = await ItemMarket.find({ status: 'active' }).limit(500);
    for (const l of items) {
      await PlayerMarket.create({
        listingId: newListingId(), kind: 'item', sellerId: l.sellerId, price: l.price,
        itemId: l.itemId, itemName: l.itemName, itemRarity: l.itemRarity || 'COMMON',
        quantity: l.quantity || 1, listedAt: l.listedAt || new Date(),
      });
      l.status = 'migrated';
      await l.save();
    }
    // 2. runes (live in the CARD system's CardMarket collection with isRune:true)
    try {
      const CardMarket = require('../models/CardMarket');
      const Rune = require('../models/Rune');
      const runes = await CardMarket.find({ isRune: true, status: 'active' }).limit(500);
      for (const l of runes) {
        const rune = await Rune.findOne({ runeId: l.runeId });
        await PlayerMarket.create({
          listingId: newListingId(), kind: 'rune', sellerId: l.sellerId, price: l.price,
          runeId: l.runeId,
          runeLabel: rune ? `${rune.type} (${rune.tier})` : (l.runeId || 'rune'),
          listedAt: l.createdAt || new Date(),
        });
        l.status = 'migrated';
        await l.save();
        // rune keeps onMarket=true - custody unchanged
      }
    } catch (e) {
      console.error('[PlayerMarket] rune migration skipped:', e.message);
    }
    // 3. summons
    try {
      const SummonMarket = require('../models/SummonMarket');
      const count = await SummonMarket.countDocuments({ status: 'active' });
      if (count > 0) {
        const summons = await SummonMarket.find({ status: 'active' }).limit(500);
        for (const l of summons) {
          await PlayerMarket.create({
            listingId: newListingId(), kind: 'summon', sellerId: l.sellerId, price: l.price,
            summonId: l.summonId, summonLabel: l.summonId, listedAt: l.createdAt || new Date(),
          });
          l.status = 'migrated';
          await l.save();
        }
      }
    } catch (e) {
      console.error('[PlayerMarket] summon migration skipped:', e.message);
    }
  } catch (e) {
    console.error('[PlayerMarket] migration error (non-fatal, will retry next boot):', e.message);
    _migrated = false; // allow retry
  }
}

// ───────────────────────────────────────────────────────────
// Browse: market [kind] [page]
// ───────────────────────────────────────────────────────────
async function cmdBrowse(senderJid, reply, args = []) {
  await ensureMigrated();
  let kind = null, page = 1;
  for (const a of args) {
    const la = String(a).toLowerCase();
    if (['items', 'item', 'gear'].includes(la)) kind = 'item';
    else if (['runes', 'rune'].includes(la)) kind = 'rune';
    else if (['summons', 'summon'].includes(la)) kind = 'summon';
    else { const n = parseInt(a); if (!isNaN(n) && n > 0) page = n; }
  }
  const pageSize = 10;
  const query = { status: 'active' };
  if (kind) query.kind = kind;
  const [active, total] = await Promise.all([
    PlayerMarket.find(query).sort({ listedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
    PlayerMarket.countDocuments(query),
  ]);
  if (active.length === 0) {
    return reply(kind
      ? `📭 No ${kind} listings right now. Sellers: \`${'.'}market sell ${kind} <#> <price>\``
      : '📭 The player market is empty. Be the first seller: `.market sell item <bag#> <price>`'), true;
  }
  const KIND_ICON = { item: '📦', rune: '💎', summon: '🐉' };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  let msg = `🏪 *PLAYER MARKET*${kind ? ` • ${kind.toUpperCase()}` : ' • ALL'} • Page ${page}/${totalPages}\n`;
  msg += `━━━━━━━━━━━━━━━\n\n`;
  active.forEach((l, i) => {
    const num = (page - 1) * pageSize + i + 1;
    msg += `*${num}.* ${KIND_ICON[l.kind]} `;
    if (l.kind === 'item') msg += `${l.itemName} ×${l.quantity} (${l.itemRarity})`;
    else if (l.kind === 'rune') msg += `Rune: ${l.runeLabel}`;
    else msg += `${l.summonLabel} (Lv.${l.summonLevel} ${l.summonRarity})`;
    msg += `\n   💰 ${ZENI()}${l.price.toLocaleString()} · 👤 @${economy.getDisplayName(l.sellerId)} · 🆔 \`${l.listingId}\`\n`;
  });
  msg += `━━━━━━━━━━━━━━━\n💡 Buy: \`market buy <id|#>\` • Filter: \`market runes\` • Your listings: \`market my\``;
  const mentions = active.map(l => l.sellerId);
  return reply(msg, { mentions }), true;
}

// ───────────────────────────────────────────────────────────
// Sell: market sell item <slot> <price> [qty] | rune <id> <price> | summon <q> <price>
// ───────────────────────────────────────────────────────────
async function cmdSell(senderJid, reply, args = []) {
  await ensureMigrated();
  const what = String(args[0] || '').toLowerCase();
  if (!['item', 'rune', 'summon'].includes(what)) {
    return reply(
      `❌ Usage:\n` +
      `• \`market sell item <bagSlot#> <price> [qty]\`\n` +
      `• \`market sell rune <runeId> <price>\`\n` +
      `• \`market sell summon <summon#|id> <price>\`\n` +
      `_Slot numbers come from your bag command. 10% tax on sale._`
    ), true;
  }
  if (what === 'item') return sellItem(senderJid, reply, args.slice(1));
  if (what === 'rune') return sellRune(senderJid, reply, args.slice(1));
  return sellSummon(senderJid, reply, args.slice(1));
}

// items: slot-numbered exactly like the bag display (legacy itemMarket logic)
function getInventorySlotList(userId) {
  const SLOT_RARITY_ORDER = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];
  const SLOT_TYPE_ORDER = ['EQUIPMENT', 'POTION', 'CONSUMABLE', 'MATERIAL', 'ITEM'];
  const inventory = inventorySystem.getInventory(userId);
  const entries = Object.entries(inventory || {})
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => {
      const qty = typeof v === 'number' ? v : (v && v.quantity) || 0;
      const name = (v && v.name) || k;
      const rarity = (v && v.rarity) || 'COMMON';
      const type = (v && v.type) || 'ITEM';
      return { itemId: k, name, rarity, type, quantity: qty };
    })
    .filter(e => e.quantity > 0);
  entries.sort((a, b) => {
    const rA = SLOT_RARITY_ORDER.indexOf(a.rarity || 'COMMON'), rB = SLOT_RARITY_ORDER.indexOf(b.rarity || 'COMMON');
    if (rA !== rB) return rA - rB;
    const tA = SLOT_TYPE_ORDER.indexOf(a.type || 'ITEM'), tB = SLOT_TYPE_ORDER.indexOf(b.type || 'ITEM');
    if (tA !== tB) return tA - tB;
    return (a.name || '').localeCompare(b.name || '');
  });
  return entries;
}

async function sellItem(senderJid, reply, args) {
  const slot = parseInt(args[0]);
  const price = parseInt(args[1]);
  const qty = args[2] !== undefined ? parseInt(args[2]) : 1;
  if (isNaN(slot) || slot < 1 || isNaN(price) || price < MIN_LISTING || isNaN(qty) || qty < 1 || price > MAX_LISTING) {
    return reply(`❌ Usage: \`market sell item <bagSlot#> <price> [qty]\` — price ${MIN_LISTING.toLocaleString()}-${MAX_LISTING.toLocaleString()}. Look up slot numbers in your bag.`), true;
  }
  const items = getInventorySlotList(senderJid);
  if (items.length === 0) return reply('❌ Your inventory is empty.'), true;
  const target = items[slot - 1];
  if (!target) return reply(`❌ No item in bag slot #${slot}. You have ${items.length} item type(s).`), true;
  if (target.quantity < qty) return reply(`❌ You only have ${target.quantity} of ${target.name} (need ${qty}).`), true;

  // Escrow: remove from bag FIRST (abort if that fails - no ghost listings)
  const removed = inventorySystem.removeItem(senderJid, target.itemId, qty);
  if (!removed || !removed.success) {
    return reply(`❌ Failed to remove ${qty}× ${target.name} from your bag. Sale aborted.`), true;
  }
  await economy.saveUser(senderJid);
  try {
    await PlayerMarket.create({
      listingId: newListingId(), kind: 'item', sellerId: senderJid, price,
      itemId: target.itemId, itemName: target.name, itemRarity: target.rarity, quantity: qty,
    });
    const perUnit = Math.floor(price / qty);
    return reply(
      `🛒 *LISTED FOR SALE!*\n\n` +
      `📦 ${target.name} ×${qty}\n` +
      `🏷️ ${ZENI()}${price.toLocaleString()} (${ZENI()}${perUnit.toLocaleString()}/ea)\n` +
      `👤 @${economy.getDisplayName(senderJid)}\n\n` +
      `💡 Buyers: \`market buy <id|#>\` · Cancel: \`market cancel <id>\`\n_10% tax on sale._`
    ), true;
  } catch (err) {
    console.error('[PlayerMarket] item listing failed:', err);
    await inventorySystem.addItem(senderJid, target.itemId, qty, { name: target.name, rarity: target.rarity });
    await economy.saveUser(senderJid);
    return reply('❌ Listing failed (database error). Your items have been returned.'), true;
  }
}

async function sellRune(senderJid, reply, args) {
  const runeId = args[0];
  const price = parseInt(args[1], 10);
  if (!runeId || !price || price <= 0 || price > MAX_LISTING) {
    return reply(`❌ Usage: \`market sell rune <runeId> <price>\``), true;
  }
  const Rune = require('../models/Rune');
  const runeSystem = require('./runeSystem');
  const rune = await Rune.findOne({ runeId, ownerJid: senderJid });
  if (!rune) return reply('❌ Rune not found in your inventory.'), true;
  if (rune.socketedSkillId) return reply('❌ Cannot sell a socketed rune. Remove it first (needs a Rune Removal Scroll).'), true;
  if (rune.onMarket) return reply('❌ This rune is already on the market.'), true;
  const existing = await PlayerMarket.findOne({ kind: 'rune', runeId: rune.runeId, sellerId: senderJid, status: 'active' });
  if (existing) return reply('❌ This rune already has an active listing.'), true;
  try {
    const rt = runeSystem.RUNE_TYPES[rune.type], tt = runeSystem.RUNE_TIERS[rune.tier];
    const label = rt ? `${rt.name} (${tt ? tt.name : rune.tier})` : rune.runeId;
    await PlayerMarket.create({
      listingId: newListingId(), kind: 'rune', sellerId: senderJid, price,
      runeId: rune.runeId, runeLabel: label,
    });
    rune.onMarket = true;
    rune.marketPrice = price;
    await rune.save();
    return reply(
      `💎 *RUNE LISTED FOR SALE!*\n\n${rt && rt.icon ? rt.icon + ' ' : ''}${label}\n🏷️ ${ZENI()}${price.toLocaleString()}\n🆔 \`${'see market my'}\`\n\n💡 Buyers: \`market buy <id>\`\n_10% tax on sale._`
    ), true;
  } catch (err) {
    console.error('[PlayerMarket] rune listing failed:', err);
    return reply('❌ Listing failed: ' + err.message), true;
  }
}

async function sellSummon(senderJid, reply, args) {
  const query = String(args[0] || '').trim();
  const price = parseInt(args[1]) || 0;
  if (!query || price < 1000 || price > MAX_LISTING) {
    return reply(`❌ Usage: \`market sell summon <summon#|id> <price>\` — minimum 1,000 Zeni.`), true;
  }
  const summonSystem = require('./summonSystem');
  const registry = require('./summonRegistry');
  const user = economy.getUser(senderJid);
  if (!user) return reply('❌ Not registered.'), true;
  const summons = await summonSystem.getUserSummons(senderJid);
  // resolve by position number or id/nickname (same rules as summon commands)
  let target = null;
  const num = parseInt(query);
  if (!isNaN(num) && num >= 1 && num <= summons.length) target = summons[num - 1];
  if (!target) target = summons.find(s => s.summonId.endsWith(query) || s.summonId === query || (s.nickname && s.nickname.toLowerCase() === query.toLowerCase())) || null;
  if (!target) return reply(`❌ No summon matching "${query}".`), true;
  if (target.forSale) return reply('❌ This summon is already listed for sale.'), true;
  if (target.isLocked) return reply('❌ This summon is locked and cannot be sold.'), true;
  if (target.soulboundUntil && target.soulboundUntil > new Date()) return reply('❌ This summon is soulbound. Wait for the soulbound period to end.'), true;
  if (user.activeSummonId === target.summonId) return reply('❌ Cannot sell your active summon. Dismiss it first.'), true;

  const species = registry.getSpecies(target.species);
  try {
    await PlayerMarket.create({
      listingId: newListingId(), kind: 'summon', sellerId: senderJid, price,
      summonId: target.summonId,
      summonLabel: target.nickname || (species && species.name) || target.species,
      summonLevel: target.level || 1, summonRarity: target.rarity || 'COMMON',
      summonElement: target.element || (species && species.element) || 'neutral',
    });
    target.forSale = true;
    target.salePrice = price;
    await target.save();
    try { await summonSystem.refreshUserResonances(user); } catch (e) {}
    return reply(
      `🐉 *SUMMON LISTED FOR SALE!*\n\n${(species && species.icon) || '🐉'} *${target.nickname || (species && species.name) || target.species}*\n💰 ${ZENI()}${price.toLocaleString()}\n\n💡 Buyers: \`market buy <id>\` · Cancel: \`market cancel <id>\`\n_10% tax on sale._`
    ), true;
  } catch (err) {
    console.error('[PlayerMarket] summon listing failed:', err);
    return reply('❌ Listing failed: ' + err.message), true;
  }
}

// ───────────────────────────────────────────────────────────
// Buy: market buy <listingId|#>   (id prefix match, or index in
// the default browse order = active, listedAt desc, all kinds)
// ───────────────────────────────────────────────────────────
async function resolveListing(query) {
  if (/^\d+$/.test(query)) {
    const num = parseInt(query);
    if (num < 1) return null;
    const active = await PlayerMarket.find({ status: 'active' }).sort({ listedAt: -1 });
    return active[num - 1] || null;
  }
  // id prefix (case-insensitive)
  const byId = await PlayerMarket.findOne({ listingId: { $regex: query + '$', $options: 'i' }, status: 'active' });
  return byId;
}

async function cmdBuy(senderJid, reply, args = []) {
  await ensureMigrated();
  const query = String(args[0] || '').trim();
  if (!query) return reply('❌ Usage: `market buy <listingId|#>` — find both in `market`.'), true;
  const listing = await resolveListing(query);
  if (!listing) return reply(`❌ No active listing matching "${query}".`), true;
  if (listing.sellerId === senderJid) return reply('❌ You cannot buy your own listing. Use `market cancel <id>` to cancel it.'), true;

  const balance = economy.getBalance(senderJid);
  if (balance < listing.price) {
    return reply(`❌ Insufficient funds! Need ${ZENI()}${listing.price.toLocaleString()}, have ${ZENI()}${balance.toLocaleString()}.`), true;
  }
  // Summon kind: extra checks preserved from the legacy summon market
  if (listing.kind === 'summon') {
    const summonSystem = require('./summonSystem');
    const user = economy.getUser(senderJid);
    if (!user) return reply('❌ Not registered.'), true;
    try {
      const altDetection = require('./altDetection');
      const altCheck = altDetection.checkTransfer(senderJid, listing.sellerId);
      if (altCheck.blocked) return reply(`❌ ${altCheck.reason}`), true;
    } catch (e) {}
    const userSummons = await summonSystem.getUserSummons(senderJid);
    if (userSummons.length >= (user.summonSlots || 5)) {
      return reply(`❌ Summon slots full (${userSummons.length}/${user.summonSlots || 5}).`), true;
    }
  }

  const taxAmount = Math.floor(listing.price * TAX_RATE);
  const sellerGets = listing.price - taxAmount;

  // Pay FIRST (abort if the wallet changed mid-transaction)
  const paid = economy.removeMoney(senderJid, listing.price, `Market purchase (${listing.kind}): ${listing.listingId}`);
  if (!paid) {
    return reply('❌ Purchase failed: wallet balance changed during transaction. Try again.'), true;
  }
  // Credit seller (roll back buyer on failure)
  const credited = economy.addMoney(listing.sellerId, sellerGets, `Market sale (${listing.kind}): ${listing.listingId} (after 10% tax)`);
  if (!credited) {
    economy.addMoney(senderJid, listing.price, `Market purchase rollback (seller credit failed)`);
    return reply('❌ Purchase failed: seller could not be credited. Try again later.'), true;
  }

  // Kind-specific transfer with rollback
  try {
    if (listing.kind === 'item') {
      const transferred = await inventorySystem.addItem(senderJid, listing.itemId, listing.quantity, {
        name: listing.itemName, rarity: listing.itemRarity,
      });
      if (!transferred || !transferred.success) throw new Error('INVENTORY_FULL');
      await economy.saveUser(senderJid);
    } else if (listing.kind === 'rune') {
      const Rune = require('../models/Rune');
      const rune = await Rune.findOne({ runeId: listing.runeId });
      if (!rune) throw new Error('RUNE_GONE');
      rune.ownerJid = senderJid;
      rune.onMarket = false;
      rune.marketPrice = 0;
      await rune.save();
    } else {
      const SummonModel = require('../models/Summon');
      const summonSystem = require('./summonSystem');
      const summon = await SummonModel.findOneAndUpdate(
        { summonId: listing.summonId },
        { ownerJid: senderJid, forSale: false, salePrice: null },
        { new: true },
      );
      if (!summon) throw new Error('SUMMON_GONE');
      try {
        const seller = economy.getUser(listing.sellerId);
        if (seller) await summonSystem.refreshUserResonances(seller);
        const buyer = economy.getUser(senderJid);
        if (buyer) await summonSystem.refreshUserResonances(buyer);
      } catch (e) {}
    }
  } catch (e) {
    // full rollback
    economy.addMoney(senderJid, listing.price, `Market purchase rollback (${e.message})`);
    economy.removeMoney(listing.sellerId, sellerGets, `Market sale rollback (${e.message})`);
    const why = e.message === 'INVENTORY_FULL' ? 'your inventory is full' : e.message === 'SUMMON_GONE' ? 'the summon no longer exists' : e.message === 'RUNE_GONE' ? 'the rune no longer exists' : 'the transfer failed';
    return reply(`❌ Purchase failed: ${why}. No money was lost — everything rolled back.`), true;
  }

  // Finalize
  listing.status = 'sold';
  listing.buyerId = senderJid;
  listing.completedAt = new Date();
  await listing.save();

  const KIND_ICON = { item: '📦', rune: '💎', summon: '🐉' };
  const label = listing.kind === 'item' ? `${listing.itemName} ×${listing.quantity}`
    : listing.kind === 'rune' ? `Rune: ${listing.runeLabel}`
    : `${listing.summonLabel} (Lv.${listing.summonLevel})`;
  return reply(
    `✅ *PURCHASE COMPLETE!*\n\n${KIND_ICON[listing.kind]} ${label}\n` +
    `💰 Paid: ${ZENI()}${listing.price.toLocaleString()} (10% tax: ${ZENI()}${taxAmount.toLocaleString()})\n` +
    `👤 Seller: @${economy.getDisplayName(listing.sellerId)}`
  ), true;
}

// ───────────────────────────────────────────────────────────
// Cancel: market cancel <listingId|#>
// ───────────────────────────────────────────────────────────
async function cmdCancel(senderJid, reply, args = []) {
  await ensureMigrated();
  const query = String(args[0] || '').trim();
  if (!query) return reply('❌ Usage: `market cancel <listingId|#>` — your listings: `market my`.'), true;
  let listing;
  if (/^\d+$/.test(query)) {
    const mine = await PlayerMarket.find({ status: 'active', sellerId: senderJid }).sort({ listedAt: -1 });
    listing = mine[parseInt(query) - 1] || null;
  } else {
    listing = await PlayerMarket.findOne({ listingId: { $regex: query + '$', $options: 'i' }, status: 'active', sellerId: senderJid });
  }
  if (!listing) return reply(`❌ No active listing matching "${query}" belonging to you.`), true;

  // Return custody (inventory-full keeps the listing alive, same as legacy)
  if (listing.kind === 'item') {
    const restored = await inventorySystem.addItem(senderJid, listing.itemId, listing.quantity, {
      name: listing.itemName, rarity: listing.itemRarity,
    });
    if (!restored || !restored.success) {
      return reply(`❌ Couldn't return ${listing.quantity}× ${listing.itemName} to your bag (full?). Clear some space and try again. Listing still active.`), true;
    }
    await economy.saveUser(senderJid);
  } else if (listing.kind === 'rune') {
    const Rune = require('../models/Rune');
    await Rune.updateOne({ runeId: listing.runeId }, { $set: { onMarket: false, marketPrice: 0 } });
  } else {
    const SummonModel = require('../models/Summon');
    const summonSystem = require('./summonSystem');
    await SummonModel.updateOne({ summonId: listing.summonId }, { $set: { forSale: false, salePrice: null } });
    const user = economy.getUser(senderJid);
    if (user) { try { await summonSystem.refreshUserResonances(user); } catch (e) {} }
  }

  listing.status = 'cancelled';
  listing.completedAt = new Date();
  await listing.save();
  return reply('✅ Listing cancelled' + (listing.kind === 'item' ? ` — ${listing.quantity}× ${listing.itemName} returned to your bag.` : '.')), true;
}

// ───────────────────────────────────────────────────────────
// My listings
// ───────────────────────────────────────────────────────────
async function cmdMy(senderJid, reply) {
  await ensureMigrated();
  const mine = await PlayerMarket.find({ sellerId: senderJid, status: 'active' }).sort({ listedAt: -1 });
  if (mine.length === 0) {
    return reply('📭 You have no active listings. Sell something: `market sell item|runes|summon ...`'), true;
  }
  const KIND_ICON = { item: '📦', rune: '💎', summon: '🐉' };
  let msg = `🏷️ *YOUR MARKET LISTINGS*\n\n`;
  mine.forEach((l, i) => {
    msg += `*${i + 1}.* ${KIND_ICON[l.kind]} `;
    if (l.kind === 'item') msg += `${l.itemName} ×${l.quantity}`;
    else if (l.kind === 'rune') msg += `Rune: ${l.runeLabel}`;
    else msg += `${l.summonLabel} (Lv.${l.summonLevel})`;
    msg += ` — ${ZENI()}${l.price.toLocaleString()} · 🆔 \`${l.listingId}\`\n`;
  });
  msg += `\n💡 Cancel: \`market cancel <id|#>\``;
  return reply(msg), true;
}

// Legacy help text (surfaced by old command menus)
function unifiedHelp() {
  return `🏪 *PLAYER MARKET* — one market for everything\n\n` +
    `• \`market\` - browse all listings\n• \`market items|runes|summons\` - browse by kind\n` +
    `• \`market sell item <bag#> <price> [qty]\`\n• \`market sell rune <runeId> <price>\`\n` +
    `• \`market sell summon <#|id> <price>\`\n• \`market buy <id|#>\` · \`market cancel <id>\` · \`market my\`\n\n_10% tax on sale. Old commands (listitem, rune sell, summon market ...) still work._`;
}

module.exports = { cmdBrowse, cmdSell, cmdBuy, cmdCancel, cmdMy, ensureMigrated, unifiedHelp, newListingId };
