const axios = require('axios');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { NEKOS_BEST_MAP, NEKOS_LIFE_CATS, NEKOS_LIFE_REDIRECT, PURRBOT_CATS, PURRBOT_REDIRECT } = require('./fallbacks');
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
 * Resolves and fetches the GIF URL via a 3-source fallback chain.
 *
 * 💡 2026-09-01 ENDPOINT OVERHAUL (Task 4 — dead endpoint + .gif kill fix).
 * The original chain (nekos.best → waifu.pics) went fully dead:
 *   - nekos.best: Cloudflare JS challenge (403) on all datacenter requests.
 *     Kept first because the 403 fails fast (~0.2s) and the source auto-
 *     recovers if protection is ever lifted — it has the best coverage.
 *   - api.waifu.pics: NXDOMAIN — domain decommissioned. Removed.
 * New working sources (verified 2026-09-01 from the production host):
 *   - nekos.life v2       → GET /api/v2/img/<cat>      → { url }
 *   - api.purrbot.site/v2 → GET /v2/img/sfw/<cat>/gif  → { link }
 * Every reaction type maps to the closest category each source actually
 * has (see reactions/fallbacks.js maps).
 */
async function fetchGifUrl(category) {
  // Try 1: Nekos.best API (original primary — currently Cloudflare-blocked
  // from datacenter IPs; fast-fails with 403 so staying in the chain is cheap)
  try {
    const nekosCat = NEKOS_BEST_MAP[category] || category;
    const res = await axios.get(`https://nekos.best/api/v2/${nekosCat}`, { timeout: 4000 });
    if (res.data && res.data.results && res.data.results[0] && res.data.results[0].url) {
      return res.data.results[0].url;
    }
  } catch (err) {
    // expected while the Cloudflare challenge is active — fall through
  }

  // Try 2: nekos.life v2 (NEW 2026-09-01)
  const nlCat = NEKOS_LIFE_REDIRECT[category] ||
    (NEKOS_LIFE_CATS.includes(category) ? category : null);
  if (nlCat) {
    try {
      const res = await axios.get(`https://nekos.life/api/v2/img/${nlCat}`, { timeout: 8000 });
      if (res.data && res.data.url) return res.data.url;
    } catch (err) {
      console.warn(`nekos.life fetch failed for ${category} (${nlCat}): ${err.message}`);
    }
  }

  // Try 3: PurrBot v2 (NEW 2026-09-01)
  const pbCat = PURRBOT_REDIRECT[category] ||
    (PURRBOT_CATS.includes(category) ? category : null);
  if (pbCat) {
    try {
      const res = await axios.get(`https://api.purrbot.site/v2/img/sfw/${pbCat}/gif`, { timeout: 8000 });
      if (res.data && res.data.link) return res.data.link;
    } catch (err) {
      console.warn(`PurrBot fetch failed for ${category} (${pbCat}): ${err.message}`);
    }
  }

  // (waifu.pics REMOVED 2026-09-01 — api.waifu.pics returns NXDOMAIN, domain dead)

  throw new Error('All SFW GIF endpoints failed (nekos.best is Cloudflare-blocked; nekos.life and PurrBot both failed).');
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
    console.error(`Reaction GIF failed for ${type}:`, error);
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
  handleReaction,
  fetchGifUrl
};
