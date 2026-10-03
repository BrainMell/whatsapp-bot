// ============================================
// 🏦 GUILD LOAN MODEL — Guild War Overhaul 2026-10-03
// Support-system loans: player requests → Guild Master approves → repayable.
// No interest, no penalties (owner spec). Replaces Guild.loans subdoc.
// ============================================

const mongoose = require('mongoose');

const GuildLoanSchema = new mongoose.Schema({
    guildId: { type: String, index: true },
    playerId: { type: String, index: true },
    playerName: String,
    amount: { type: Number, min: 1 },
    status: { type: String, default: 'requested', index: true }, // requested|active|repaid|rejected|converted_debt
    approvedBy: String,
    requestedAt: { type: Date, default: Date.now },
    approvedAt: Date,
    dueAt: Date,            // soft reminder only
    repaidAt: Date,
    repaidAmount: { type: Number, default: 0 },
    note: String,
}, { collection: 'guildloans' });

GuildLoanSchema.index({ guildId: 1, playerId: 1, status: 1 });

module.exports = mongoose.model('GuildLoan', GuildLoanSchema);
