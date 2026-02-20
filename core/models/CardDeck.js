// models/CardDeck.js
// Tracks custom named decks created by the server owner.
// Each deck holds references to UserCard _ids.

const mongoose = require('mongoose');

const CardDeckSchema = new mongoose.Schema({
  // Owner of the deck
  userId: { type: String, required: true, index: true },

  // Display name (e.g. "My Bawls")
  name: { type: String, required: true },

  // Ordered array of UserCard ObjectIds in this deck
  cards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'UserCard' }],

  createdAt: { type: Date, default: Date.now }

}, { collection: 'cardDecks' });

CardDeckSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.CardDeck || mongoose.model('CardDeck', CardDeckSchema);
