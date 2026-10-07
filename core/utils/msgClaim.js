// ============================================
// 🤝 GC COEXISTENCE — cross-instance command claim (2026-10-07)
// Owner directive: "scrape the one-group-per-bot concept … allow all the
// bots to exist in any gc together." All instances share ONE MongoDB, so
// every bot's WhatsApp socket receives EVERY group message. Without this
// claim, a `.j rank` typed in a shared GC was answered by Joker AND anyone
// else whose pipeline matched (and reconnect backfill could double-fire a
// single instance too).
//
// Contract: the FIRST instance to insert the claim key handles the message;
// every other instance (and the same instance's backfill copy) loses the
// E11000 duplicate-key race and skips. Key = chat|sender|msgId — unique per
// WhatsApp stanza. Claims expire via TTL (15 min) so the collection self-cleans.
//
// Fail-open policy: any NON-duplicate error (DB blip, collection missing on
// a cold shard) returns true → the bot behaves like the legacy single-bot
// world. A rare double reply beats a dead command pipeline.
// ============================================

const mongoose = require('mongoose');

const ClaimSchema = new mongoose.Schema({
    _id: String, // `${chatId}|${senderKey}|${m.key.id}`
    bot: String, // which instance won (debugging aid)
    at: { type: Date, default: Date.now, expires: '15m' },
}, { collection: 'msgclaims', versionKey: false });

let _Model = null;
function model() {
    if (!_Model) _Model = mongoose.models.MsgClaim || mongoose.model('MsgClaim', ClaimSchema);
    return _Model;
}

/**
 * Try to claim exclusive handling rights for one group message.
 * @param {string} chatId group jid
 * @param {string} senderKey m.key.participant (or senderJid fallback)
 * @param {string} msgId m.key.id (unique per sender message)
 * @returns {boolean} true → THIS instance handles it; false → another instance won
 */
async function claimGroupCommand(chatId, senderKey, msgId) {
    if (!chatId || !msgId) return true; // nothing to key on → legacy behavior
    const key = `${chatId}|${senderKey || 'unknown'}|${msgId}`;
    try {
        await model().create({ _id: key, bot: String(require('../../botConfig').getBotId() || 'bot') });
        return true;
    } catch (e) {
        if (e && (e.code === 11000 || e.code === 11001)) return false; // lost the race — someone else is on it
        // infra failure → fail-open (never freeze the pipeline on claim infra)
        return true;
    }
}

module.exports = { claimGroupCommand, _model: model };
