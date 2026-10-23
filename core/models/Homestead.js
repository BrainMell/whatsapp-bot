const mongoose = require('mongoose');

// ===========================================================================
// HOMESTEAD - per-user isometric house-builder state (joker base builder)
// One document per adventurer. `owned` is an INVENTORY of furniture instances
// (buying adds an instance; placing moves it into `placed`; `.home store`
// `placed` geometry (12x12 interior grid, matches homesteadRenderer.js):
// layer 'item'/'rug' → { item, x, y } (x,y = top-left tile of footprint)
// layer 'wall' → { item, x, y } (x = wall tile index 1..10,
// y = 0 left wall / 1 right wall)
// ===========================================================================

const HomesteadSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },

 // active wall/floor skin (key from homesteadRenderer.THEMES)
    theme: { type: String, default: 'oakhaven' },

 // themes purchased (one-time unlocks)
    themesOwned: { type: Array, default: ['oakhaven'] },

 // furniture instances not currently placed: [{ id, uid }, ...]
 // (§4: instances carry stable uids so writes are uid-precise $pull/$push;
 // legacy string entries are backfilled on load by homestead.migrateRec)
    owned: { type: Array, default: [] },

 // furniture instances currently in the room
    placed: {
      type: [
        {
          item: { type: String, required: true },
          x: { type: Number, required: true },
          y: { type: Number, required: true },
          uid: { type: String, default: '' },   // instance identity (atomic ops)
          f: { type: Boolean, default: false }, // flipped facing (rotate)
          _id: false,
        },
      ],
      default: [],
    },

 // soft stats cache (recomputed on write; informational)
    comfort: { type: Number, default: 0 },

    createdAt: { type: Number, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() },
  },
  { minimize: false },
);

HomesteadSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports =
  mongoose.models.Homestead || mongoose.model('Homestead', HomesteadSchema);
