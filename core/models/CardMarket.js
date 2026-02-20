// models/CardMarket.js
// Tracks active sale listings and live auctions.

const mongoose = require('mongoose');

const BidSchema = new mongoose.Schema({
  bidderId: String,
  amount: Number,
  placedAt: { type: Date, default: Date.now }
}, { _id: false });

const CardMarketSchema = new mongoose.Schema({
  // The specific UserCard document being listed
  userCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserCard', required: true },

  // Convenience copies so we don't always need a join
  cardId:   { type: String, required: true },
  sellerId: { type: String, required: true },

  // 'sale' = fixed price | 'auction' = bidding
  type: { type: String, enum: ['sale', 'auction'], required: true },

  // Fixed price (sale) or starting price (auction)
  price: { type: Number, required: true },

  // Auction fields
  bids:         { type: [BidSchema], default: [] },
  currentBid:   { type: Number, default: 0 },
  highBidderId: { type: String, default: null },
  auctionEndsAt:{ type: Date, default: null },

  // Status lifecycle
  status: {
    type: String,
    enum: ['active', 'sold', 'cancelled', 'expired'],
    default: 'active'
  },

  listedAt:    { type: Date, default: Date.now },
  completedAt: { type: Date, default: null }

}, { collection: 'cardMarket', timestamps: true });

CardMarketSchema.index({ status: 1 });
CardMarketSchema.index({ sellerId: 1 });
CardMarketSchema.index({ cardId: 1 });

module.exports = mongoose.models.CardMarket || mongoose.model('CardMarket', CardMarketSchema);
