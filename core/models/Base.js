const mongoose = require('mongoose');

// ===========================================================================
// BASE - per-user outdoor base hub state (Sections 6/7/8)
// One document per adventurer. Fixed zones (house, mines, pond, hunting
// grounds) are seeded at L1 when the base is created - the house is free and
// is always Structure #1. Purchasable structures (blacksmith, med bay,
// alchemy centre) are built on expansion plots and stored here with their
// level + position so they persist across restarts.
// ===========================================================================

const StructureSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true },
    type: { type: String, required: true },   // house|blacksmith|medbay|alchemy|mines|pond|hunting
    level: { type: Number, default: 1 },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    _id: false,
  },
);

const BaseSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },

    structures: { type: [StructureSchema], default: [] },

 // per-activity gating - hunt: huntDay (UTC YYYY-MM-DD) + huntCount daily
 // limit (no timer, ); fish: NO gating at all - rpg/baseActivities.js
    cooldowns: { type: mongoose.Schema.Types.Mixed, default: {} },

    createdAt: { type: Number, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() },
  },
  { minimize: false },
);

BaseSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports =
  mongoose.models.Base || mongoose.model('Base', BaseSchema);
