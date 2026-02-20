// models/UserCard.js
// Each document = one card owned by one user.
// A user with 3 copies of the same card has 3 documents.

const mongoose = require('mongoose');

const UserCardSchema = new mongoose.Schema({
  // Owner
  userId: { type: String, required: true, index: true },

  // Which card this is (matches cards_data.json .id field, e.g. "3-04521")
  cardId: { type: String, required: true, index: true },

  // Which global copy number this is out of maxCopies
  copyNumber: { type: Number, required: true },

  // ISO timestamp when the user claimed it
  claimedAt: { type: Date, default: Date.now },

  // ── Deck System ──────────────────────────────────────────
  // Is this card currently loaded into the user's main 12-slot deck?
  inMainDeck: { type: Boolean, default: false },
  mainDeckSlot: { type: Number, default: null }, // 1–12

  // Is this card in a custom deck?
  inCustomDeck: { type: Boolean, default: false },
  customDeckName: { type: String, default: null },
  customDeckSlot: { type: Number, default: null },

  // ── Market ───────────────────────────────────────────────
  // Is this card listed for sale?
  forSale: { type: Boolean, default: false },
  salePrice: { type: Number, default: null },

  // Is this card currently in an auction?
  inAuction: { type: Boolean, default: false },

}, { collection: 'userCards', timestamps: true });

// Compound index so we can quickly find all cards of a user
UserCardSchema.index({ userId: 1, cardId: 1 });

module.exports = mongoose.models.UserCard || mongoose.model('UserCard', UserCardSchema);
