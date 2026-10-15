const mongoose = require('mongoose');

// 🏠 Base Builder (prototype) — per-player homestead state.
// One doc per player: where they are in the world (map / zone / inside their
// house) and what they have placed in their isometric room. Deliberately
// kept RPG-agnostic: when the base builder is integrated into the economy /
// progression systems later, this doc is the single place to extend (furniture
// ownership, build limits by adventurer rank, storage costs, ...).
const BaseBuildSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },

    // 'map' = looking at the world chart, 'zone' = standing in a zone,
    // 'room' = inside the homestead house (isometric room).
    view: { type: String, enum: ['map', 'zone', 'room'], default: 'map' },

    // Zone index (0-9) when view === 'zone' or 'room' (house lives in zone 0).
    zone: { type: Number, default: null, min: 0, max: 9 },

    // Room placements: { slot: 1..49, item: 'furn_bed' ... }
    // One item per slot; slot numbering is row-major over the 7x7 iso grid.
    placements: {
        type: [{ _id: false, slot: { type: Number, min: 1, max: 49 }, item: String }],
        default: [],
    },

    updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

BaseBuildSchema.statics.getFor = async function (userId) {
    let doc = await this.findOne({ userId });
    if (!doc) doc = await this.create({ userId });
    return doc;
};

BaseBuildSchema.statics.safeSave = async function (doc) {
    doc.updatedAt = new Date();
    return doc.save();
};

module.exports = mongoose.model('BaseBuild', BaseBuildSchema);
