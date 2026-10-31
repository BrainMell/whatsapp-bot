// rpg/itemMarket.js
// Player-to-player item/gear market - list, buy, unlist, browse.
//
// Commands (dispatched from cardSystem.handleCommand):
//   listitem <slot> <price> [qty]   (alias: li)   - list an inventory item for sale
//   unlistitem <market#>            (alias: uli)   - cancel own listing, return item to inventory
//   buyitem <market#>              (alias: bi)    - buy a listing (10% tax, seller gets 90%)
//   itemmarket [page]               (alias: im)    - browse active listings
//
// 10% tax rule matches card market (cardSystem.cmdBuyCard) and P2P transfers (economy.transferMoney):
//   buyer pays full listing price, seller receives 90%, 10% evaporates (genuine sink).

const mongoose = require('mongoose');
const ItemMarket = require('../models/ItemMarket');
const economy = require('./economy');
const inventorySystem = require('./inventorySystem');
const lootSystem = require('./lootSystem');

const MIN_LISTING = 100; // 💡 Rebalanced 2026-08-17: prevent 1-zeni spam listings.
const MAX_LISTING = 5000000; // 💡 Rebalanced 2026-08-17: cap so a single listing can't absorb 1% of community cap.

const { getInventory, removeItem, addItem, saveUserRef } = (() => {
  return {
    getInventory: inventorySystem.getInventory,
    removeItem: inventorySystem.removeItem,
    addItem: inventorySystem.addItem,
    saveUserRef: null
  };
})();

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

function ZENI() { return economy.getZENI ? economy.getZENI() : '💰'; }

// Build an ordered list of inventory items for slot-numbered access.
// Sort EXACTLY like inventorySystem.formatInventory (rarity → type → name)
// so `.j listitem <#>` / `.j buyitem <#>` numbers match the bag display.
const SLOT_RARITY_ORDER = ['MYTHIC', 'LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON'];
const SLOT_TYPE_ORDER = ['EQUIPMENT', 'POTION', 'CONSUMABLE', 'MATERIAL', 'ITEM'];
function getInventorySlotList(userId) {
  const inventory = getInventory(userId);
  const entries = Object.entries(inventory)
    .filter(([k, v]) => v !== null && v !== undefined)
    .map(([k, v]) => {
      const qty = typeof v === 'number' ? v : (v && v.quantity) || 0;
      const name = (v && v.name) || k;
      const rarity = (v && v.rarity) || 'COMMON';
      const type = (v && v.type) || 'ITEM';
      return { itemId: k, name, rarity, type, quantity: qty };
    })
    .filter(e => e.quantity > 0);
  entries.sort((a, b) => {
    const rA = SLOT_RARITY_ORDER.indexOf(a.rarity || 'COMMON');
    const rB = SLOT_RARITY_ORDER.indexOf(b.rarity || 'COMMON');
    if (rA !== rB) return rA - rB;
    const tA = SLOT_TYPE_ORDER.indexOf(a.type || 'ITEM');
    const tB = SLOT_TYPE_ORDER.indexOf(b.type || 'ITEM');
    if (tA !== tB) return tA - tB;
    return (a.name || '').localeCompare(b.name || '');
  });
  return entries;
}

// ───────────────────────────────────────────────────────────
// .j listitem <slot> <price> [qty]   (alias: li)
// ───────────────────────────────────────────────────────────
async function cmdListItem(senderJid, reply, args = []) {
  const slot = parseInt(args[0]);
  const price = parseInt(args[1]);
  const qty = args[2] !== undefined ? parseInt(args[2]) : 1;

  if (isNaN(slot) || slot < 1 || isNaN(price) || price < MIN_LISTING || isNaN(qty) || qty < 1 || price > MAX_LISTING) {
    return reply(
      `❌ Usage: \`listitem <slot> <price> [qty]\`\n` +
      `Example: \`listitem 3 5000 5\` - list 5 of slot-3 item for 5,000 total.\n` +
      `Look up your slot numbers with the bag command first.`
    ), true;
  }

  const items = getInventorySlotList(senderJid);
  if (items.length === 0) return reply('❌ Your inventory is empty.'), true;
  const target = items[slot - 1];
  if (!target) return reply(`❌ No item in slot #${slot}. You have ${items.length} inventory item(s).`), true;
  if (target.quantity < qty) return reply(`❌ You only have ${target.quantity} of ${target.name} (need ${qty}).`), true;

  // Remove from seller's inventory FIRST. If this fails, abort - no listing should be created
  // for items that aren't actually in the inventory.
  const removed = removeItem(senderJid, target.itemId, qty);
  if (!removed || !removed.success) {
    return reply(`❌ Failed to remove ${qty}× ${target.name} from your inventory. Sale aborted.`), true;
  }

  // Persist the inventory change so the item count is consistent before we create the listing.
  await economy.saveUser(senderJid);

  try {
    const listing = await ItemMarket.create({
      sellerId: senderJid,
      itemId: target.itemId,
      itemName: target.name,
      itemRarity: target.rarity,
      quantity: qty,
      price,
      status: 'active'
    });
    const perUnit = Math.floor(price / qty);
    return reply(
      `🛒 *ITEM LISTED FOR SALE!*\n\n` +
      `📦 ${target.name} ×${qty}\n` +
      `🏷️ Total Price: ${ZENI()}${price.toLocaleString()} (${ZENI()}${perUnit.toLocaleString()}/ea)\n` +
      `👤 Seller: @${economy.getDisplayName(senderJid)}\n\n` +
      `💡 Other players can buy with \`buyitem <#>\` once the market page refreshes.`
    ), true;
  } catch (err) {
    // Listing creation failed - restore the item to the seller's inventory.
    console.error('[ItemMarket] listItem create failed:', err);
    await addItem(senderJid, target.itemId, qty, { name: target.name, rarity: target.rarity });
    await economy.saveUser(senderJid);
    return reply('❌ Listing failed (database error). Your items have been returned.'), true;
  }
}

// ───────────────────────────────────────────────────────────
// .j unlistitem <market#>   (alias: uli)
// ───────────────────────────────────────────────────────────
async function cmdUnlistItem(senderJid, reply, args = []) {
  const num = parseInt(args[0]);
  if (isNaN(num) || num < 1) return reply('❌ Usage: `unlistitem <market#>` - find the number in `itemmarket`.'), true;

  const active = await ItemMarket.find({ status: 'active' }).sort({ listedAt: -1 });
  const listing = active[num - 1];
  if (!listing) return reply(`❌ No active listing #${num}.`), true;
  if (listing.sellerId !== senderJid) return reply('❌ You can only unlist your own items.'), true;

  try {
    // Return the items to the seller's inventory FIRST.
    const restored = await addItem(senderJid, listing.itemId, listing.quantity, {
      name: listing.itemName,
      rarity: listing.itemRarity
    });
    if (!restored || !restored.success) {
      // Inventory full - keep the listing active, tell them to clear space.
      return reply(
        `❌ Couldn't return ${listing.quantity}× ${listing.itemName} to your inventory (full?). ` +
        `Clear some space and try again. Listing still active.`
      ), true;
    }
    await economy.saveUser(senderJid);

    listing.status = 'cancelled';
    listing.completedAt = new Date();
    await listing.save();
    return reply(`✅ Unlisted: ${listing.itemName} ×${listing.quantity} returned to your inventory.`), true;
  } catch (err) {
    console.error('[ItemMarket] unlistItem error:', err);
    return reply('❌ Unlist failed: ' + (err.message || 'unknown error')), true;
  }
}

// ───────────────────────────────────────────────────────────
// .j buyitem <market#>   (alias: bi)
// ───────────────────────────────────────────────────────────
async function cmdBuyItem(senderJid, reply, args = []) {
  const num = parseInt(args[0]);
  if (isNaN(num) || num < 1) return reply('❌ Usage: `buyitem <market#>` - find the number in `itemmarket`.'), true;

  const active = await ItemMarket.find({ status: 'active' }).sort({ listedAt: -1 });
  const listing = active[num - 1];
  if (!listing) return reply(`❌ No active listing #${num}.`), true;
  if (listing.sellerId === senderJid) return reply('❌ You cannot buy your own listing. Use `unlistitem <#>` to cancel it.'), true;

  const balance = economy.getBalance(senderJid);
  if (balance < listing.price) {
    return reply(`❌ Insufficient funds! Need ${ZENI()}${listing.price.toLocaleString()}, have ${ZENI()}${balance.toLocaleString()}.`), true;
  }

  // 💡 FIX 2026-10-31: atomic claim. The old flow read status:'active', moved
  // money/items across several awaits and only flipped the status at the end -
  // two concurrent buys BOTH passed every check (seller paid twice, item
  // duplicated). Claim the listing for THIS buyer first; loser of the race aborts.
  const claimed = await ItemMarket.findOneAndUpdate(
    { _id: listing._id, status: 'active' },
    { $set: { status: 'pending', buyerId: senderJid } },
    { new: true }
  );
  if (!claimed) {
    return reply('❌ Someone else just bought this listing. Try another one!'), true;
  }

  const releaseClaim = async () => {
    await ItemMarket.updateOne({ _id: claimed._id, status: 'pending' }, { $set: { status: 'active' }, $unset: { buyerId: 1 } }).catch(() => {});
  };

  // 10% tax - buyer pays full price, seller gets 90%, 10% evaporates.
  const taxAmount = Math.floor(claimed.price * 0.10);
  const sellerGets = claimed.price - taxAmount;

  // Pay FIRST. If buyer's wallet changes mid-transaction, abort.
  const paid = economy.removeMoney(senderJid, claimed.price, `Bought item ${claimed.itemId} ×${claimed.quantity} on market`);
  if (!paid) {
    await releaseClaim();
    return reply('❌ Purchase failed: wallet balance changed during transaction. Try again.'), true;
  }

  // Credit seller. If this fails, roll back buyer payment.
  const credited = economy.addMoney(claimed.sellerId, sellerGets, `Sold item ${claimed.itemId} ×${claimed.quantity} (after 10% tax)`);
  if (!credited) {
    economy.addMoney(senderJid, claimed.price, `Item purchase rollback (seller credit failed)`);
    await releaseClaim();
    return reply('❌ Purchase failed: seller could not be credited. Try again later.'), true;
  }

  // Transfer items to buyer. If this fails, roll back the entire money transaction.
  const transferred = await addItem(senderJid, claimed.itemId, claimed.quantity, {
    name: claimed.itemName,
    rarity: claimed.itemRarity
  });
  if (!transferred || !transferred.success) {
    // Roll back money (buyer refund + checked seller clawback)
    economy.addMoney(senderJid, claimed.price, `Item purchase rollback (inventory full)`);
    const clawedBack = economy.removeMoney(claimed.sellerId, sellerGets, `Item sale rollback (buyer inventory full)`);
    if (!clawedBack) {
      // 💡 FIX 2026-10-31: checked clawback - if the seller already spent the
      // credit we keep the listing PENDING (escrow preserved, sale blocked) and
      // alert. Never leave it 'active' (double-sale risk) or 'sold' (item never moved).
      console.error(`[ItemMarket] ROLLBACK INCOMPLETE: seller ${claimed.sellerId} could not be clawed back ${sellerGets} for listing ${claimed._id} - listing left pending`);
      return reply(
        `❌ Purchase failed: your inventory is full. Your payment was refunded, ` +
        `but the seller's credit could not be reversed - an admin has been notified via logs.`
      ), true;
    }
    await releaseClaim();
    return reply(
      `❌ Purchase failed: your inventory is full (or another error). ` +
      `Clear space and try again. No money was lost.`
    ), true;
  }
  await economy.saveUser(senderJid);

  // Finalize the listing.
  claimed.status = 'sold';
  claimed.buyerId = senderJid;
  claimed.completedAt = new Date();
  await claimed.save().catch(err => console.error(`[ItemMarket] finalize save failed for ${claimed._id}:`, err.message));

  return reply(
    `✅ *PURCHASE COMPLETE!*\n\n` +
    `📦 ${claimed.itemName} ×${claimed.quantity}\n` +
    `💰 Paid: ${ZENI()}${claimed.price.toLocaleString()} (10% tax: ${ZENI()}${taxAmount.toLocaleString()})\n` +
    `👤 Seller: @${economy.getDisplayName(claimed.sellerId)}`
  ), true;
}

// ───────────────────────────────────────────────────────────
// .j itemmarket [page]   (alias: im)
// ───────────────────────────────────────────────────────────
async function cmdItemMarket(senderJid, reply, args = []) {
  const page = Math.max(1, parseInt(args[0]) || 1);
  const pageSize = 10;
  const skip = (page - 1) * pageSize;

  const [active, total] = await Promise.all([
    ItemMarket.find({ status: 'active' }).sort({ listedAt: -1 }).skip(skip).limit(pageSize),
    ItemMarket.countDocuments({ status: 'active' })
  ]);

  if (active.length === 0) {
    return reply('📭 No items currently listed for sale on the market.'), true;
  }

  let msg = `🛒 *ITEM MARKET* • Page ${page}/${Math.max(1, Math.ceil(total / pageSize))}\n`;
  msg += `━━━━━━━━━━━━━━━\n\n`;
  active.forEach((l, i) => {
    const num = skip + i + 1;
    const perUnit = l.quantity > 0 ? Math.floor(l.price / l.quantity) : l.price;
    msg += `*${num}.* ${l.itemName} ×${l.quantity} (${l.itemRarity})\n`;
    msg += `   💰 ${ZENI()}${l.price.toLocaleString()} (${ZENI()}${perUnit.toLocaleString()}/ea) · 👤 @${economy.getDisplayName(l.sellerId)}\n`;
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  let foot = `💡 Buy: \`buyitem <#>\``;
  if (totalPages > 1) foot += ` • Page: \`itemmarket ${page + 1}\``;
  msg += `━━━━━━━━━━━━━━━\n${foot}`;
  return reply(msg, { mentions: active.map(l => l.sellerId) }), true;
}

// ───────────────────────────────────────────────────────────
// Public exports - wired into cardSystem.handleCommand
// ───────────────────────────────────────────────────────────
module.exports = {
  ItemMarket,
  cmdListItem,
  cmdUnlistItem,
  cmdBuyItem,
  cmdItemMarket
};
