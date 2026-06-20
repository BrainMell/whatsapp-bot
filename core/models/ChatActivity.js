const mongoose = require('mongoose');

const ChatActivitySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // Format: "chatId_userId"
  count: { type: Number, default: 0 },
  firstSeen: { type: Number, default: Date.now },
  lastMessage: { type: Number, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('ChatActivity', ChatActivitySchema);
