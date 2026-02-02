const mongoose = require('mongoose');

const GuildSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    leader: { type: String, required: true }, // userId
    
    // Stats
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    balance: { type: Number, default: 0 }, // Guild Bank
    
    // Members & Roles
    members: [{
        userId: { type: String, required: true },
        role: { type: String, default: 'member' }, // leader, officer, member
        joinedAt: { type: Date, default: Date.now },
        contribution: { type: Number, default: 0 }
    }],
    
    // Settings
    icon: { type: String, default: null },
    requirements: {
        level: { type: Number, default: 1 },
        rank: { type: String, default: 'F' },
        fee: { type: Number, default: 0 }
    },

    // Extras
    upgrades: { type: Map, of: Number, default: {} },
    logs: { type: Array, default: [] }

}, { timestamps: true });

module.exports = mongoose.model('Guild', GuildSchema);
