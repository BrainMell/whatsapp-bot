// models/CardStat.js
// Tracks the game-state of each unique card ID (how many spawned, owners, etc.)

const mongoose = require('mongoose');

const CardStatSchema = new mongoose.Schema({
  cardId: { type: String, unique: true, required: true, index: true },

  // How many copies have ever been spawned into the world
  totalSpawned: { type: Number, default: 0 },

  // The hard cap — no more spawn after this unless admin bypasses
  maxCopies: { type: Number, default: 200 },

  // How many unique users own at least one copy
  uniqueOwners: { type: Number, default: 0 },

  // Total copies currently in circulation (not deleted/merged)
  totalCirculation: { type: Number, default: 0 },

  // Price of the last completed trade
  lastTradePrice: { type: Number, default: 0 },

  // When this card was last spawned
  lastSpawnedAt: { type: Date, default: null },

  // Tracks recent trade prices for demand scoring (last 5)
  recentTradePrices: { type: [Number], default: [] }

}, { collection: 'cardStats', timestamps: true });

module.exports = mongoose.models.CardStat || mongoose.model('CardStat', CardStatSchema);
