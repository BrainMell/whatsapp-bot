const mongoose = require('mongoose');

const ErrorLogSchema = new mongoose.Schema({
  errorType: String,
  message: String,
  stack: String,
  metadata: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ErrorLog', ErrorLogSchema);