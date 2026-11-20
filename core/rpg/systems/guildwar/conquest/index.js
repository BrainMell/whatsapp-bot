'use strict';
const { enabled, CFG } = require('./config');
module.exports = { enabled, CFG, handle: (...a) => require('./commands').handle(...a), engine: () => require('./engine'), store: () => require('./store') };

/** `cq ...` typed in ANY chat (group or DM). Replies where the player typed; reminders then follow them there. */
async function handleChat(sock, chatId, jid, text, prefix = '.') {
    if (!enabled()) return false; const botId = sock && sock.user && String(sock.user.id).split(':')[0].split('@')[0];
    const r = await require('./commands').handle({ jid, text, prefix, eventDoc: null, chatId, botId }); if (!r) return false;
    // the bot players are actually talking to must be the one that ticks their war (arrivals / sieges / video notes), or events are consumed by a bot that can't reach the chat
    try { const k = await require('./store').keyFor(jid); if (k) require('./testWar').ensureTicker(sock, k); } catch (e) { /* ticker is best-effort */ }
    const inGroup = String(chatId).endsWith('@g.us'); const tag = inGroup ? `@${String(jid).split('@')[0]} ` : ''; const opt = inGroup ? { mentions: [jid] } : {};
    if (r.image) await sock.sendMessage(chatId, { image: r.image, caption: tag + (r.text || ''), ...opt }); else await sock.sendMessage(chatId, { text: tag + (r.text || '…'), ...opt });
    if (r.video) { try { await sock.sendMessage(chatId, { video: r.video, ptv: true, mimetype: 'video/mp4' }); } catch (e) { console.warn('[conquest] video note failed:', e.message); } }
    return true;
}
module.exports.handleChat = handleChat; module.exports.launch = (...a) => require('./launch').launch(...a); module.exports.replacesLegacy = () => require('./launch').replacesLegacy();
