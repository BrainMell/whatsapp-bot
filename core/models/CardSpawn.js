'use strict';
/**
 * CardSpawn - persistent record of an unclaimed card spawn.
 *
 * 💡 RESTART-SAFE SPAWNS (2026-10-08): activeSpawns used to live only in the
 * process Map, so every deploy/restart silently erased every unclaimed card
 * in every group - players read that as "my cards are randomly disappearing".
 * doSpawn() upserts here, the claim path deletes after a successful claim,
 * the expiry sweeper deletes (and announces) on timeout, and cardSystem
 * init() restores unexpired docs back into the Map via loadActiveSpawns().
 *
 * One doc per `${groupJid}_${cardId}` - mirrors the activeSpawns Map key.
 */
const mongoose = require('mongoose');

const CardSpawnSchema = new mongoose.Schema({
  key:        { type: String, required: true, unique: true }, // `${groupJid}_${cardId}`
  botId:      { type: String, required: true, index: true },
  groupJid:   { type: String, required: true },
  cardId:     { type: String, required: true },
  copyNumber: { type: Number, default: 1 },
  maxCopies:  { type: Number, default: 0 },
  price:      { type: Number, default: 0 },
  hasToken:   { type: Boolean, default: false },
  spawnedAt:  { type: Date, default: Date.now },
  expiresAt:  { type: Date, required: true },
}, { collection: 'cardSpawns', timestamps: true });

CardSpawnSchema.index({ botId: 1, expiresAt: 1 });

module.exports = mongoose.models.CardSpawn || mongoose.model('CardSpawn', CardSpawnSchema);
