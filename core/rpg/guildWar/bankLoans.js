// ============================================
// 🏦 GUILD BANK LOANS — Guild War Overhaul 2026-10-03
// Support-system loans ONLY: player requests → Guild Master approves →
// repayable to the bank. No interest, no penalties (owner spec).
// Replaces the old Guild.loans subdoc + interest/penalty jobs (REMOVED).
// ============================================

const GuildLoan = require('../../models/GuildLoan');
const guilds = require('../guilds');
const economy = require('../economy');
const CFG = require('./config');

// max single loan vs current bank balance
function maxLoan(guildBalance) {
    return Math.max(0, Math.floor((guildBalance || 0) * CFG.LOANS.MAX_FRACTION_OF_BANK));
}

async function requestLoan(playerJid, playerName, guildId, amount) {
    const guild = guilds.getGuild(guildId);
    if (!guild) return { ok: false, text: '❌ Guild not found.' };

    amount = Math.floor(Number(amount));
    if (!Number.isFinite(amount) || amount < CFG.LOANS.MIN_LOAN) {
        return { ok: false, text: `❌ Minimum loan: ${CFG.LOANS.MIN_LOAN.toLocaleString()} Zeni.` };
    }
    const cap = maxLoan(guild.balance);
    if (amount > cap) {
        return { ok: false, text: `❌ The bank can lend at most *${cap.toLocaleString()}* Zeni right now (10% of the guild balance).\nGuild balance: ${(guild.balance || 0).toLocaleString()} Zeni.` };
    }

    if (CFG.LOANS.ONE_ACTIVE_PER_PLAYER) {
        const existing = await GuildLoan.findOne({ guildId, playerId: playerJid, status: { $in: ['requested', 'active'] } });
        if (existing) {
            return { ok: false, text: `❌ You already have a ${existing.status} loan of ${existing.amount.toLocaleString()} Zeni. Repay it first (\`.j guild loan repay <amt>\`).` };
        }
    }

    // funds reserved check happens at approval; requests are free
    await GuildLoan.create({ guildId, playerId: playerJid, playerName, amount, status: 'requested' });
    return {
        ok: true,
        text: `📜 Loan request for *${amount.toLocaleString()}* Zeni submitted to the Guild Master of *${guildId}*.\nThey approve with: \`.j guild loan approve @${playerName}\``,
    };
}

async function approveLoan(guildMasterJid, guildId, targetJid) {
    const member = guilds.getGuildMember(guildId, guildMasterJid);
    if (!member || (member.role !== 'leader' && member.role !== 'officer')) {
        return { ok: false, text: '❌ Only the Guild Master (or an officer) can approve loans.' };
    }
    const req = await GuildLoan.findOne({ guildId, playerId: targetJid, status: 'requested' }).sort({ requestedAt: -1 });
    if (!req) return { ok: false, text: '❌ No pending loan request from that player.' };

    // fresh balance check (refreshGuildMoney re-reads DB for money-critical ops)
    const fresh = await guilds.refreshGuildMoney(guildId);
    const cap = maxLoan(fresh?.balance ?? 0);
    if (req.amount > cap) {
        return { ok: false, text: `❌ The bank can no longer cover this loan (cap ${cap.toLocaleString()}).` };
    }

    // checked debit: bank → wallet
    const guild = guilds.getGuild(guildId);
    if ((guild?.balance || 0) < req.amount) return { ok: false, text: '❌ Guild balance changed — insufficient funds.' };
    guild.balance -= req.amount;
    const persisted = await guilds.syncGuild(guildId);
    if (!persisted) return { ok: false, text: '❌ Bank persist failed — loan not paid out.' };

    economy.addMoney(req.playerId, req.amount, `Guild loan from ${guildId}`);

    req.status = 'active';
    req.approvedBy = guildMasterJid;
    req.approvedAt = new Date();
    req.dueAt = new Date(Date.now() + CFG.LOANS.TERM_MS);
    await req.save();
    return { ok: true, text: `✅ Loan approved: *${req.amount.toLocaleString()}* Zeni paid to <@${req.playerId}> from the guild bank.\n_No interest. Repay with \`.j guild loan repay <amt>\`._` };
}

async function rejectLoan(guildMasterJid, guildId, targetJid) {
    const member = guilds.getGuildMember(guildId, guildMasterJid);
    if (!member || (member.role !== 'leader' && member.role !== 'officer')) {
        return { ok: false, text: '❌ Only the Guild Master (or an officer) can reject loans.' };
    }
    const req = await GuildLoan.findOneAndUpdate(
        { guildId, playerId: targetJid, status: 'requested' },
        { status: 'rejected' },
        { new: true }
    );
    if (!req) return { ok: false, text: '❌ No pending loan request from that player.' };
    return { ok: true, text: '🚫 Loan request rejected.' };
}

async function repayLoan(playerJid, guildId, amount) {
    const loan = await GuildLoan.findOne({ guildId, playerId: playerJid, status: 'active' });
    if (!loan) return { ok: false, text: '❌ You have no active loan in this guild.' };

    amount = Math.floor(Number(amount) || loan.amount);
    const wallet = economy.getGold(playerJid) || 0;
    if (wallet < amount) return { ok: false, text: `❌ You only have *${wallet.toLocaleString()}* Zeni in your wallet.` };

    if (!economy.removeMoney(playerJid, amount, `Guild loan repayment to ${guildId}`)) {
        return { ok: false, text: '❌ Payment failed.' };
    }
    const guild = guilds.getGuild(guildId);
    if (guild) {
        guild.balance = (guild.balance || 0) + amount;
        await guilds.syncGuild(guildId);
    }

    loan.repaidAmount = (loan.repaidAmount || 0) + amount;
    if (loan.repaidAmount >= loan.amount) {
        loan.status = 'repaid';
        loan.repaidAt = new Date();
    }
    await loan.save();

    const remaining = Math.max(0, loan.amount - (loan.repaidAmount || 0));
    return { ok: true, text: remaining === 0
        ? `✅ Loan fully repaid (${loan.amount.toLocaleString()} Zeni). The bank thanks you.`
        : `✅ Repaid ${amount.toLocaleString()} Zeni. Remaining: ${remaining.toLocaleString()} Zeni.` };
}

async function listLoans(playerJid, guildId) {
    const mine = await GuildLoan.find({ guildId, playerId: playerJid, status: { $in: ['requested', 'active'] } });
    const pending = await GuildLoan.find({ guildId, status: 'requested' });
    const lines = [];
    for (const l of mine) lines.push(`🧾 Your ${l.status} loan: ${l.amount.toLocaleString()} Zeni${l.status === 'active' ? ` (repaid ${(l.repaidAmount || 0).toLocaleString()})` : ' — awaiting Guild Master approval'}`);
    return { mine: lines, pending };
}

// player leaves guild with an active loan → wallet deduct or debt flag (config)
async function handleGuildLeave(playerJid, guildId) {
    const loan = await GuildLoan.findOne({ guildId, playerId: playerJid, status: 'active' });
    if (!loan) return null;
    const remaining = loan.amount - (loan.repaidAmount || 0);
    const wallet = economy.getGold(playerJid) || 0;

    if (wallet >= remaining) {
        economy.removeMoney(playerJid, remaining, `Loan settled on leaving ${guildId}`);
        const guild = guilds.getGuild(guildId);
        if (guild) { guild.balance += remaining; await guilds.syncGuild(guildId); }
        loan.status = 'repaid'; loan.repaidAmount = loan.amount; loan.repaidAt = new Date();
        await loan.save();
        return { action: 'deducted', amount: remaining };
    }
    // cannot pay: convert to personal debt (existing User.debt system)
    try {
        const User = require('../../models/User');
        await User.updateOne({ jid: playerJid }, { $inc: { debt: remaining } });
    } catch (e) { /* User debt field per audit */ }
    loan.status = 'converted_debt';
    loan.note = `left guild owing ${remaining}`;
    await loan.save();
    return { action: 'debt', amount: remaining };
}

module.exports = { requestLoan, approveLoan, rejectLoan, repayLoan, listLoans, handleGuildLeave, maxLoan };
