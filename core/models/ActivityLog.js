const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  chatId: { type: String, required: true },
  userId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  // 📊 DAILY GC ACTIVITY (2026-09-22, owner: ".j activity for that day"):
  // one log per message/event; type carries WHAT happened so `.j activity
  // [day]` can break a day down into messages / images / videos / stickers /
  // audio / documents / contacts / locations / polls / link_deleted /
  // join / left / kicked / promote / demote. ADDITIVE field with a default -
  // every pre-existing document aggregates as a plain 'message', so no
  // historical counts change and no migration is needed.
  type: { type: String, default: 'message' }
});

// TTL index to automatically delete records older than 30 days (2592000 seconds)
ActivityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

// Query index for quick filtering by chat and timestamp range
ActivityLogSchema.index({ chatId: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
