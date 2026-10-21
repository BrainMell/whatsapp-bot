// models/CardBackup.js
// (Task 15c, owner request 2026-10-21: "give me a command that removes all of
// someone's cards and make a back up of his so that you can place it back")
// Full snapshot of a player's UserCard rows taken automatically by Super RC
// (.j src @user confirm) right before the wipe. Rows keep their ORIGINAL
// userId (and _id) so a restore re-inserts byte-identical cards. One doc per
// wipe; 807-row collections are a few hundred KB — well under the 16MB doc cap.
const mongoose = require('mongoose');

const CardBackupSchema = new mongoose.Schema({
  // The jid the wipe was aimed at (as resolved by the command)
  targetJid: { type: String, required: true, index: true },

  // Every identity form captured (phone + all @lid forms from LidMapping) —
  // a restore looks these up so a split collection can always be reassembled
  variants: { type: [String], default: [] },

  cardCount: { type: Number, default: 0 },
  deckCount: { type: Number, default: 0 },

  // Full UserCard docs (lean), original userId + _id preserved per row
  rows: { type: Array, default: [] },

  wipedBy: { type: String, default: null },
  restoredAt: { type: Date, default: null, index: true },
  restoredBy: { type: String, default: null },

}, { collection: 'cardBackups', timestamps: true, minimize: false });

module.exports = mongoose.models.CardBackup || mongoose.model('CardBackup', CardBackupSchema);
