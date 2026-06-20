const mongoose = require('mongoose');

const GroupProfileSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true }, // WhatsApp group JID (e.g. 12345@g.us)
  name: { type: String, default: 'Group Chat' },
  
  metadata: {
    createdTime: { type: Date, default: Date.now },
    vibeRating: { type: String, default: 'neutral' }, // e.g. chaotic, chill, funny
    pinnedRules: [{ type: String }]
  },

  // Persistent group-wide inside jokes
  insideJokes: [{
    joke: { type: String, required: true },
    establishedBy: { type: String, default: 'Unknown' },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Group facts and community details
  groupFacts: [{
    fact: { type: String, required: true },
    confidence: { type: Number, default: 1.0 },
    timestamp: { type: Date, default: Date.now }
  }],

  activeTopics: [{
    topic: { type: String },
    lastMentioned: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('GroupProfile', GroupProfileSchema);
