const mongoose = require('mongoose');

// ============================================
// 🏪 SUMMON MARKET — tradeable summon listings
// ============================================
// Mirrors CardMarket schema (core/models/CardMarket.js).
// Supports fixed-price sales + auctions.
// Soulbound summons (soulboundUntil > now) cannot be listed.
// forSale flag on Summon disables passive income while listed.

const SummonMarketSchema = new mongoose.Schema({
  listingId: { type: String, required: true, unique: true, index: true }, // "smarket_<ts>_<rand>"
  summonId: { type: String, required: true, index: true },               // ref to Summon.summonId
  sellerId: { type: String, required: true, index: true },

  type: { type: String, enum: ['sale', 'auction'], default: 'sale' },

  // Sale fields
  price: { type: Number, default: 0 },           // fixed price for 'sale' type

  // Auction fields
  currentBid: { type: Number, default: null },
  highestBidder: { type: String, default: null },
  auctionEndsAt: { type: Date, default: null },

  status: { type: String, enum: ['active', 'sold', 'cancelled', 'expired'], default: 'active' },
  approvalStatus: { type: String, default: 'approved' }, // 'pending' for high-value listings (mod review)

  // Audit trail
  buyerId: { type: String, default: null },
  soldAt: { type: Date, default: null },
  salePrice: { type: Number, default: null }, // actual sale price (may differ from listing for auctions)

  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

SummonMarketSchema.index({ status: 1, type: 1 });
SummonMarketSchema.index({ status: 1, price: 1 });

module.exports = mongoose.models.SummonMarket || mongoose.model('SummonMarket', SummonMarketSchema);
