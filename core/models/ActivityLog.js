const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  chatId: { type: String, required: true },
  userId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

// TTL index to automatically delete records older than 30 days (2592000 seconds)
ActivityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

// Query index for quick filtering by chat and timestamp range
ActivityLogSchema.index({ chatId: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
