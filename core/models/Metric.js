const mongoose = require('mongoose');

const MetricSchema = new mongoose.Schema({
  botId: String,
  ramUsage: Number,
  timestamp: { type: Date, default: Date.now, expires: 86400 } // 24-hour TTL for stats
});

module.exports = mongoose.model('Metric', MetricSchema);