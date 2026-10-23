// models/PlayerMarket.js
// UNIFIED PLAYER MARKET - consolidates the three standalone
// RPG markets (item market, rune market, summon market) into one listing
// collection with a `kind` discriminator.
// Kinds and custody semantics (preserved from each legacy market so nothing
// else in the RPG breaks):
// item - escrowed: removed from the seller's bag at listing time,
// returned via addItem on cancel/rollback.
// rune - NOT escrowed: the Rune doc stays with the seller but carries
// onMarket=true (blocks socket/destroy/duplicate listings);
// ownership transfers on purchase.
// summon - NOT escrowed: the Summon doc carries forSale=true + salePrice
// (blocks deploy, excluded from resonance); ownership transfers
// on purchase.
// Fee rule (unified): 10% tax on sale - buyer pays full price, seller nets
// 90%, 10% evaporates. Matches the item market, the card market and P2P
// transfers. (Legacy rune market was 0%, legacy summon market was a 5%
// upfront listing fee - both retired in favor of the one rule.)

const mongoose = require('mongoose');

const PlayerMarketSchema = new mongoose.Schema({
 // Short human-typable id (e.g. "M-7KQ2X9") - unique
  listingId: { type: String, required: true, unique: true, index: true },

  kind: { type: String, required: true, enum: ['item', 'rune', 'summon'], index: true },
  sellerId: { type: String, required: true, index: true },

  price: { type: Number, required: true, min: 1 },

  status: {
    type: String,
    enum: ['active', 'sold', 'cancelled'],
    default: 'active',
    index: true,
  },

  listedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  buyerId: { type: String, default: null },

 // -- kind: item --
  itemId: { type: String, default: null },
  itemName: { type: String, default: '' },
  itemRarity: { type: String, default: 'COMMON' },
  quantity: { type: Number, default: 1 },

 // -- kind: rune --
  runeId: { type: String, default: null },
  runeLabel: { type: String, default: '' },   // "Lesser Power" style display

 // -- kind: summon --
  summonId: { type: String, default: null },
  summonLabel: { type: String, default: '' }, // nickname or species name
  summonLevel: { type: Number, default: 1 },
  summonRarity: { type: String, default: 'COMMON' },
  summonElement: { type: String, default: 'neutral' },
}, { collection: 'playerMarket', timestamps: true });

PlayerMarketSchema.index({ status: 1, listedAt: -1 });
PlayerMarketSchema.index({ status: 1, kind: 1, listedAt: -1 });

module.exports = mongoose.models.PlayerMarket || mongoose.model('PlayerMarket', PlayerMarketSchema);
