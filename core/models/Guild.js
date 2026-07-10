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
    type: { type: String, default: 'ADVENTURER' }, // Archetype: ADVENTURER / MERCHANT / RESEARCH

    // Members & Roles
    members: [{
        userId: { type: String, required: true },
        role: { type: String, default: 'member' }, // leader, officer, member, recruit
        joinedAt: { type: Date, default: Date.now },
        contribution: { type: Number, default: 0 },
        title: { type: String, default: null } // 💡 Phase 2: custom member title (was lost on restart — schema drift fix)
    }],

    // Board
    dailyBoard: {
        lastUpdate: { type: Date, default: Date.now },
        targets: { type: Array, default: [] }, // { type: 'monster_id', count: 5, current: 0 }
        rewards: { xp: Number, gold: Number }
    },

    // Settings
    icon: { type: String, default: null },
    motto: { type: String, default: 'Adapt or be Infected.' }, // 💡 Phase 2: was lost on restart — schema drift fix
    requirements: {
        level: { type: Number, default: 1 },
        rank: { type: String, default: 'F' },
        fee: { type: Number, default: 0 }
    },

    // 💡 Phase 2: Buildings as proper subdocuments (was Map<Number> causing data loss).
    // Each building: { level: Number, name: String }
    buildings: {
        hall: { level: { type: Number, default: 1 }, name: { type: String, default: 'Guild Hall' } },
        training: { level: { type: Number, default: 0 }, name: { type: String, default: 'Training Grounds' } },
        treasury: { level: { type: Number, default: 0 }, name: { type: String, default: 'Treasury' } }
    },

    // Keep legacy upgrades field for backward-compat reads
    upgrades: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },

    // 💡 Phase 2: Guild emblem (cosmetic)
    emblem: {
        icon: { type: String, default: null },     // emoji or short text
        color: { type: String, default: '#FFD700' }, // hex color for rendering
        background: { type: String, default: null }   // optional background pattern
    },

    // 💡 Phase 2: Guild loans — members can borrow from guild bank
    loans: [{
        borrowerJid: { type: String, required: true },
        amount: { type: Number, required: true },
        takenAt: { type: Date, default: Date.now },
        dueAt: { type: Date, required: true },
        repaid: { type: Boolean, default: false },
        repaidAt: { type: Date, default: null }
    }],

    // 💡 Phase 2: Last interest payout timestamp (for daily bank interest)
    lastInterestPayout: { type: Date, default: null },

    // 💡 Phase 2: Weekly war points (for Phase 7 guild wars)
    warPoints: { type: Number, default: 0 },
    warPointsWeek: { type: String, default: null }, // ISO week key e.g. "2026-W28"

    // Extras
    logs: { type: Array, default: [] }

}, { timestamps: true });

module.exports = mongoose.model('Guild', GuildSchema);
