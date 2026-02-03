const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
  sender: String,
  body: String,
  type: String,
  timestamp: { type: Date, default: Date.now, expires: 3600 }, // 1-hour TTL
  chatId: String,
  botId: String
});

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);