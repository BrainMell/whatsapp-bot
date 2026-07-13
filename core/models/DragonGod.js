const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════════════════════
//  DRAGON GOD — World-First Leviathan Slayer Record
// ═══════════════════════════════════════════════════════════════════════════
//
//  The Leviathan is the ultimate trial boss. The first player to defeat it
//  ascends to DRAGON_GOD — a unique class that can only ever be held by ONE
//  player per server (per MongoDB collection). Once crowned, the path to
//  DRAGON_GOD closes forever; all future Dragon-class ascenders become
//  DRAGON_LORD instead.
//
//  This document is created AT MOST ONCE. The `bossId` field is unique-indexed
//  so concurrent victories cannot race past each other — Mongoose will reject
//  the second insert. Code that grants DRAGON_GOD must check this collection
//  first AND handle the duplicate-key error as a fallback safety net.
//
//  Schema fields:
//    bossId           — always 'LEVIATHAN' (unique)
//    dragonGodJid     — the JID of the one true Dragon God
//    dragonGodName    — cached display name (WhatsApp profile name or pushname)
//    ascendedAt       — timestamp of the victory
//    trialSessionKey  — the guildAdventure session key (for audit)
//    successorClass   — 'DRAGON_LORD' (for documentation)

const DragonGodSchema = new mongoose.Schema({
  bossId: { type: String, required: true, unique: true, index: true, default: 'LEVIATHAN' },
  dragonGodJid: { type: String, required: true, index: true },
  dragonGodName: { type: String, required: true },
  ascendedAt: { type: Date, default: Date.now },
  trialSessionKey: { type: String, default: null },
  successorClass: { type: String, default: 'DRAGON_LORD' },
}, { timestamps: true });

// Static helper: returns the one true Dragon God record, or null if uncrowned.
DragonGodSchema.statics.getCurrent = function() {
  return this.findOne({ bossId: 'LEVIATHAN' }).lean().exec();
};

// Static helper: atomic check-and-crown. Returns the new record on success,
// or the existing record if someone else was already crowned (race-safe).
DragonGodSchema.statics.crown = function(jid, name, sessionKey) {
  return this.findOneAndUpdate(
    { bossId: 'LEVIATHAN' },
    {
      $setOnInsert: {
        bossId: 'LEVIATHAN',
        dragonGodJid: jid,
        dragonGodName: name,
        ascendedAt: new Date(),
        trialSessionKey: sessionKey || null,
        successorClass: 'DRAGON_LORD',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean().exec();
};

module.exports = mongoose.model('DragonGod', DragonGodSchema);
