const axios = require('axios');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { FALLBACK_MAP } = require('./fallbacks');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');

const execPromise = promisify(exec);

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
      await sock.sendMessage(chatId, { text: BOT_MARKER + `❌ Tag someone or reply to their message` });
      return;
    }
    
    targetJid = jidNormalizedUser(rawTarget);
    if (targetJid === resolvedSender) {
      await sock.sendMessage(chatId, { text: BOT_MARKER + `😭 You can't ${type} yourself...` });
      return;
    }
    cleanTarget = targetJid.split('@')[0];
  }

  // Determine message quoting priority:
  // Quote the target's/replied message if it exists, otherwise do not quote the sender.
  let quoteOption = {};
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  if (contextInfo?.quotedMessage) {
    quoteOption = {
      quoted: {
        key: {
          remoteJid: chatId,
          fromMe: contextInfo.participant === sock.user.id,
          id: contextInfo.stanzaId,
          participant: contextInfo.participant
        },
        message: contextInfo.quotedMessage
      }
    };
  }

  // Setup temporary files for GIF-to-MP4 conversion
  const uniqueId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const tempGif = path.join(os.tmpdir(), `gif_${uniqueId}.gif`);
  const tempVideo = path.join(os.tmpdir(), `video_${uniqueId}.mp4`);

  try {
    const resolved = FALLBACK_MAP[type] || type;

    // Fetch JSON from waifu.pics (without custom browser headers to avoid Cloudflare TLS fingerprinter block)
    const response = await axios.get(`https://api.waifu.pics/sfw/${resolved}`);
    
    let responseData = response.data;
    if (typeof responseData === 'string') {
      try {
        responseData = JSON.parse(responseData);
      } catch (e) {
        throw new Error(`Failed to parse JSON response. Response starts with: ${responseData.slice(0, 150)}`);
      }
    }

    if (!responseData || !responseData.url) {
      const keys = responseData ? Object.keys(responseData).join(', ') : 'none';
      throw new Error(`Missing url in response. Response keys: ${keys}. Data: ${JSON.stringify(responseData).slice(0, 150)}`);
    }
    
    const gifUrl = responseData.url;
    
    // Download the GIF file
    const bufferResponse = await axios.get(gifUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(bufferResponse.data);
    fs.writeFileSync(tempGif, buffer);

    // Convert GIF to MP4 using FFmpeg (H.264 video encoding suitable for WhatsApp)
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const toMp4 = `"${ffmpegPath}" -i "${tempGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "${tempVideo}"`;
    await execPromise(toMp4);

    if (!fs.existsSync(tempVideo)) {
      throw new Error('FFmpeg conversion failed to produce an MP4 file');
    }

    if (targeted) {
      await sock.sendMessage(chatId, {
        video: { url: tempVideo },
        gifPlayback: true,
        caption: `@${cleanSender} ${type}s @${cleanTarget} ${emoji}`,
        mentions: [resolvedSender, targetJid]
      }, quoteOption);
    } else {
      await sock.sendMessage(chatId, {
        video: { url: tempVideo },
        gifPlayback: true,
        caption: `@${cleanSender} ${type} ${emoji}`,
        mentions: [resolvedSender]
      }, quoteOption);
    }
  } catch (error) {
    console.error(`Waifu.pics command failed for ${type}:`, error);
    await sock.sendMessage(chatId, { text: BOT_MARKER + `⚠️ Couldn't load the gif: ${error.message}` });
  } finally {
    // Clean up temporary files
    try {
      if (fs.existsSync(tempGif)) fs.unlinkSync(tempGif);
      if (fs.existsSync(tempVideo)) fs.unlinkSync(tempVideo);
    } catch (e) {
      console.error('Failed to clean up temp files:', e.message);
    }
  }
}

module.exports = {
  resolveTarget,
  handleReaction
};
