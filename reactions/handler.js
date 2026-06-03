const axios = require('axios');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { WAIFU_PICS_MAP, NEKOS_BEST_MAP } = require('./fallbacks');
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
 * Resolves and fetches the GIF URL from Waifu.pics or falls back to Nekos.best.
 */
async function fetchGifUrl(category) {
  // Try 1: Waifu.pics (Standard axios)
  try {
    const waifuCat = WAIFU_PICS_MAP[category] || category;
    const res = await axios.get(`https://api.waifu.pics/sfw/${waifuCat}`, { timeout: 10000 });
    if (res.data && res.data.url) return res.data.url;
  } catch (err) {
    console.warn(`Waifu.pics standard fetch failed for ${category}: ${err.message}`);
  }

  // Try 2: Waifu.pics (With browser User-Agent headers)
  try {
    const waifuCat = WAIFU_PICS_MAP[category] || category;
    const res = await axios.get(`https://api.waifu.pics/sfw/${waifuCat}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 10000
    });
    let data = res.data;
    if (typeof data === 'string') data = JSON.parse(data);
    if (data && data.url) return data.url;
  } catch (err) {
    console.warn(`Waifu.pics browser-header fetch failed for ${category}: ${err.message}`);
  }

  // Try 3: Nekos.best API fallback
  try {
    const nekosCat = NEKOS_BEST_MAP[category] || category;
    const res = await axios.get(`https://nekos.best/api/v2/${nekosCat}`, { timeout: 10000 });
    if (res.data && res.data.results && res.data.results[0] && res.data.results[0].url) {
      return res.data.results[0].url;
    }
  } catch (err) {
    console.warn(`Nekos.best fetch failed for ${category}: ${err.message}`);
  }

  throw new Error('All SFW GIF endpoints (Waifu.pics and Nekos.best) timed out or failed to connect.');
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
    // Resolve URL using multi-stage fetch with original type
    const gifUrl = await fetchGifUrl(type);
    
    // Download the GIF file
    let bufferResponse;
    try {
      bufferResponse = await axios.get(gifUrl, { responseType: 'arraybuffer', timeout: 15000 });
    } catch (downloadErr) {
      // Retry with browser headers if direct download fails
      bufferResponse = await axios.get(gifUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        timeout: 15000
      });
    }
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
