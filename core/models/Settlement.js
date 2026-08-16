// models/Settlement.js
// Canonical settlement record — one auditable line item for every
// currency-moving action in the bot.
//
// Classification:
//   source    = zeni created from nothing (rewards, quests, raids)
//   sink      = zeni destroyed (tax, shop purchases, gambling losses)
//   transfer  = zeni moved between players (P2P transfers, card sales)

const mongoose = require('mongoose');

const SettlementSchema = new mongoose.Schema({
  // Who was involved
  userId:     { type: String, required: true, index: true },
  counterpartyId: { type: String, default: null }, // for transfers: the other party

  // Classification
  type: {
    type: String,
    enum: ['source', 'sink', 'transfer'],
    required: true,
    index: true
  },

  // What happened
  category: { type: String, required: true }, // e.g. 'quest', 'tax', 'gambling', 'card_sale', 'deposit'
  description: { type: String, default: '' },

  // Amount (positive = user gained, negative = user lost)
  amount: { type: Number, required: true },

  // Balances BEFORE and AFTER (for audit trail)
  preWallet:  { type: Number, default: null },
  postWallet: { type: Number, default: null },
  preBank:    { type: Number, default: null },
  postBank:   { type: Number, default: null },

  // Metadata
  botId:      { type: String, default: null }, // which bot instance processed this
  chatId:     { type: String, default: null }, // which GC it happened in
  timestamp:  { type: Date, default: Date.now, index: true },
}, { collection: 'settlements' });

// Compound index for querying by user + time range
SettlementSchema.index({ userId: 1, timestamp: -1 });
SettlementSchema.index({ type: 1, timestamp: -1 });

module.exports = mongoose.models.Settlement || mongoose.model('Settlement', SettlementSchema);
