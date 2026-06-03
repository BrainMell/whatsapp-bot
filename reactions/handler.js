const axios = require('axios');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { FALLBACK_MAP } = require('./fallbacks');

/**
 * Resolves the target JID based on priority:
 * 1. @mention in message text
 * 2. contextInfo.participant (sender of the quoted/replied message)
 * 3. contextInfo.remoteJid (DM reply fallback)
 * 4. null -> trigger error
 */
function resolveTarget(msg) {
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentions.length > 0) return mentions[0];

  const participant = msg.message?.extendedTextMessage?.contextInfo?.participant;
  if (participant) return participant;

  const remoteJid = msg.key.remoteJid;
  const isGroup = remoteJid.endsWith('@g.us');
  const hasQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!isGroup && hasQuoted) {
    return remoteJid;
  }

  return null;
}

/**
 * Main handler to process the reaction commands.
 */
async function handleReaction(sock, msg, type, emoji, targeted, chatId, senderJid, senderName) {
  const BOT_MARKER = '🃏 ';
  
  // Resolve sender JID cleanly
  const rawSender = senderJid || msg.key.participant || msg.key.remoteJid;
  const resolvedSender = jidNormalizedUser(rawSender);
  const cleanSender = resolvedSender.split('@')[0];

  let targetJid = null;
  let cleanTarget = null;

  if (targeted) {
    const rawTarget = resolveTarget(msg);
    if (!rawTarget) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Tag someone or reply to their message` }, { quoted: msg });
      return;
    }
    
    targetJid = jidNormalizedUser(rawTarget);
    if (targetJid === resolvedSender) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + `😭 You can't ${type} yourself...` }, { quoted: msg });
      return;
    }
    cleanTarget = targetJid.split('@')[0];
  }

  try {
    const resolved = FALLBACK_MAP[type] || type;
    const response = await axios.get(`https://api.waifu.pics/sfw/${resolved}`);
    if (!response.data || !response.data.url) {
      throw new Error('Invalid response from Waifu.pics API');
    }
    const gifUrl = response.data.url;
    
    // Download the GIF buffer
    const bufferResponse = await axios.get(gifUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(bufferResponse.data);

    if (targeted) {
      await sock.sendMessage(chatId, {
        video: buffer,
        gifPlayback: true,
        caption: `@${cleanSender} ${type}s @${cleanTarget} ${emoji}`,
        mentions: [resolvedSender, targetJid]
      }, { quoted: msg });
    } else {
      await sock.sendMessage(chatId, {
        video: buffer,
        gifPlayback: true,
        caption: `@${cleanSender} ${type} ${emoji}`,
        mentions: [resolvedSender]
      }, { quoted: msg });
    }
  } catch (error) {
    console.error(`Waifu.pics fetch failed for ${type}:`, error.message);
    await sock.sendMessage(chatId, { text: BOT_MARKER + `⚠️ Couldn't load the gif, try again` }, { quoted: msg });
  }
}

module.exports = {
  resolveTarget,
  handleReaction
};
