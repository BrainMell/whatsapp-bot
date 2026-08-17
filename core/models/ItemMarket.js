// models/ItemMarket.js
// Player-to-player item/gear market listings.
// Companion to CardMarket — handles stackable inventory items (potions, materials, gear).
// 10% tax applied on every sale (genuine sink, same as card sales + P2P transfers).

const mongoose = require('mongoose');

const ItemMarketSchema = new mongoose.Schema({
  sellerId: { type: String, required: true, index: true },

  // Inventory item key (matches the key used in User.inventory map)
  itemId: { type: String, required: true },

  // Convenience copy of display name (so we don't need a join to render market)
  itemName: { type: String, required: false, default: '' },
  itemRarity: { type: String, required: false, default: 'COMMON' },

  // Number of units being sold in this listing
  quantity: { type: Number, required: true, min: 1, default: 1 },

  // Total price for the whole stack (NOT per-unit). Buyer pays this, gets the full stack.
  price: { type: Number, required: true, min: 1 },

  status: {
    type: String,
    enum: ['active', 'sold', 'cancelled'],
    default: 'active',
    index: true
  },

  listedAt:    { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },

  // Buyer reference (filled on completion)
  buyerId: { type: String, default: null }
}, { collection: 'itemMarket', timestamps: true });

ItemMarketSchema.index({ status: 1, listedAt: -1 });

module.exports = mongoose.model('ItemMarket', ItemMarketSchema);
