'use strict';
/**
 * antibot.js — detect other automated accounts (bots) posting in groups.
 *
 * Research basis (2026-09-15): reviewed the antibot implementations of 15+
 * established WhatsApp MD bots (BWM-XMD, BMB-TECH, nikka-md, Silva-MD, the
 * OurinMD family, ELITE-PRO, FEE-XMD, Toxic-MD, LoliBot, …). There is NO
 * WhatsApp-side "this user is a bot" flag — every working implementation
 * fingerprints messages instead:
 *
 *   1. Message-ID shapes. Baileys' generateMessageID() produces
 *      "3EB0" + 18 uppercase hex chars; several frameworks emit 32-char hex
 *      ids, "BAE5…" ids, or debug-style "WAMID."/"false_" prefixes.
 *      ⚠️ "3EB0…" collides with real WhatsApp Web/Desktop users, so it is a
 *      WEAK signal here, never a kick on its own (false-positive guard).
 *   2. deviceSentMessage — the message was relayed from a linked device
 *      (how most self-bots send). Also weak: real people use WA Web.
 *   3. Interactive message payloads (buttons/template/list) — effectively
 *      only bots and WhatsApp Business send these into casual groups.
 *   4. Behaviour — sending within seconds of joining the group.
 *   5. Bot-style watermark text in the message body.
 *
 * Design decisions (deliberately different from the naive forks):
 *   - SCORED verdict instead of kick-on-first-fingerprint: smart mode needs
 *     score >= 2.5 (e.g. fingerprint + corroboration); strict mode (opt-in)
 *     kicks on any fingerprint alone.
 *   - Admins / owner / global mods / the bot itself are always exempt.
 *   - Actions: warn (default; 3 strikes via the existing warning system),
 *     kick, delete — mirroring the antilink action set.
 */

// Message-ID fingerprints
const RE_BAILEYS_DEFAULT = /^3EB0[0-9A-F]{18}$/; // Baileys generateMessageID (22 chars)
const RE_HEX32 = /^[0-9A-F]{32}$/; // frameworks that emit 32-hex ids
const RE_HEX_GENERIC = /^[0-9A-F]{12,}$/; // bare hex, no separators (iOS uses hyphens)
const RE_BAE5 = /^BAE5[0-9A-F]{12}$/; // some WA-web-era clients
const RE_DEBUG_ID = /^(WAMID\.|false_)/; // Cloud API / debug clients — strong

// Interactive payloads: real bots love buttons; humans cannot send them.
function interactiveSignals(msg) {
  const s = [];
  const mm = msg && msg.message ? msg.message : {};
  const interactive = ['buttonsMessage', 'templateMessage', 'listMessage', 'buttonsResponseMessage', 'listResponseMessage', 'interactiveMessage', 'interactiveResponseMessage'];
  for (const k of interactive) {
    if (mm[k]) s.push(k);
  }
  return s;
}

// Watermarks that bot owners sprinkle into every message body.
const RE_BOT_MARK = /(ᴘᴏᴡᴇʀᴇᴅ\s*ʙʏ|powered[ -]?by[ -]?\S* ?bot|⫷[^\n]{0,40}⫸)/i;

const STRONG_SCORE = 2.5;
const MEDIUM_SCORE = 1.5;
const WEAK_SCORE = 1;
const SMART_THRESHOLD = 2.5;
const STRICT_THRESHOLD = 1;

/**
 * Inspect an incoming group message.
 * @param {object} m          Baileys message (m from messages.upsert)
 * @param {object} opts       { joinedAt: number|undefined, selfJid: string }
 * @returns {{isBot: boolean, score: number, signals: string[], mode: string}}
 */
function inspect(m, opts = {}) {
  const signals = [];
  let score = 0;
  const key = (m && m.key) || {};
  const id = String(key.id || '');
  const text = extractText(m);

  // Debug/Cloud-API style ids — real consumer clients never produce these.
  if (id && RE_DEBUG_ID.test(id)) {
    score += STRONG_SCORE;
    signals.push('debug-id');
  }
  // Message-ID shape fingerprints (weak — WA Web collisions exist).
  if (id && RE_BAILEYS_DEFAULT.test(id)) {
    score += WEAK_SCORE;
    signals.push('baileys-id');
  } else {
    if (id && RE_HEX32.test(id)) {
      score += WEAK_SCORE;
      signals.push('hex32-id');
    }
    if (id && RE_BAE5.test(id)) {
      score += WEAK_SCORE;
      signals.push('bae5-id');
    }
    if (id && !/[.\-_]/.test(id) && RE_HEX_GENERIC.test(id)) {
      score += WEAK_SCORE;
      signals.push('hex-id');
    }
  }

  // Linked-device relay (self-bot pattern). Weak alone.
  if (m && m.message && m.message.deviceSentMessage) {
    score += WEAK_SCORE;
    signals.push('deviceSentMessage');
  }

  // Interactive payloads (business/bot only). Medium.
  const inter = interactiveSignals(m);
  if (inter.length) {
    score += MEDIUM_SCORE;
    signals.push('interactive:' + inter[0]);
  }

  // Messaged within seconds of joining the group. Medium.
  if (opts.joinedAt && Date.now() - opts.joinedAt < 20000 && Date.now() >= opts.joinedAt) {
    score += MEDIUM_SCORE;
    signals.push('instant-on-join');
  }

  // Bot watermark text. Medium.
  if (text && RE_BOT_MARK.test(text)) {
    score += MEDIUM_SCORE;
    signals.push('bot-mark');
  }

  const threshold = opts.mode === 'strict' ? STRICT_THRESHOLD : SMART_THRESHOLD;
  return {
    isBot: score >= threshold,
    score: Math.round(score * 100) / 100,
    signals,
    mode: opts.mode || 'smart',
  };
}

function extractText(m) {
  if (!m || !m.message) return '';
  const mm = m.message;
  return (
    mm.conversation ||
    mm.extendedTextMessage?.text ||
    mm.imageMessage?.caption ||
    mm.videoMessage?.caption ||
    mm.documentMessage?.caption ||
    ''
  );
}

/**
 * Execute the configured action against a detected bot message.
 * @returns {Promise<boolean>} true if the bot acted
 */
async function act(sock, chatId, m, senderJid, verdict, helpers) {
  const { settings, addWarning, getWarningCount, resetWarnings, displayName, isBotAdmin } = helpers;
  const action = settings.antibotAction || 'warn';

  // Delete the offending message first (best-effort in every mode).
  let deleted = false;
  try {
    await sock.sendMessage(chatId, { delete: m.key });
    deleted = true;
  } catch (e) {
    console.log('[AntiBot] delete failed:', e.message);
  }

  const tag = verdict.signals.join(', ');
  const who = `@${(senderJid || '').split('@')[0].split(':')[0]}`;

  if (action === 'delete') return deleted;

  if (action === 'kick') {
    await announce(sock, chatId, who, senderJid, `🤖 *Bot detected & removed*\n\n*Signals:* ${tag}\n_(anti-bot is on — admins: use .antibot off to disable)_`);
    await kick(sock, chatId, senderJid);
    return true;
  }

  // warn (default) — 3 strikes via the shared warning system, then kick.
  const count = addWarning ? addWarning(senderJid, chatId, `AntiBot: ${tag}`) : 1;
  const maxWarn = 3;
  if (count >= maxWarn) {
    await announce(sock, chatId, who, senderJid, `🤖 *Bot detected — warning ${count}/${maxWarn} exceeded. Removing…*\n\n*Signals:* ${tag}`);
    if (resetWarnings) resetWarnings(senderJid, chatId);
    await kick(sock, chatId, senderJid);
  } else {
    await announce(
      sock,
      chatId,
      who,
      senderJid,
      `🤖 *Automated account suspected*\n\n*Signals:* ${tag}\n*Warning:* ${count}/${maxWarn}\n\n_If you are a human, you are safe — this account is only removed after ${maxWarn} strikes._`
    );
  }
  return true;
}

async function announce(sock, chatId, who, senderJid, text) {
  try {
    await sock.sendMessage(chatId, { text, mentions: [senderJid] });
  } catch (e) {
    console.log('[AntiBot] announce failed:', e.message);
  }
}

async function kick(sock, chatId, senderJid) {
  try {
    await sock.groupParticipantsUpdate(chatId, [senderJid], 'remove');
  } catch (e) {
    console.log('[AntiBot] kick failed (bot may not be admin):', e.message);
  }
}

// Join-time tracking (engine calls these from group-participants.update).
const joinTimes = new Map(); // `${groupJid}|${userJid}` -> epoch ms
const JOIN_TTL = 10 * 60 * 1000;

function noteJoin(groupJid, userJid) {
  if (!groupJid || !userJid) return;
  const key = `${groupJid}|${userJid}`;
  joinTimes.set(key, Date.now());
  // opportunistic prune
  if (joinTimes.size > 500) {
    const now = Date.now();
    for (const [k, t] of joinTimes) {
      if (now - t > JOIN_TTL) joinTimes.delete(k);
    }
  }
}

function getJoinedAt(groupJid, userJid) {
  const t = joinTimes.get(`${groupJid}|${userJid}`);
  if (!t) return undefined;
  if (Date.now() - t > JOIN_TTL) {
    joinTimes.delete(`${groupJid}|${userJid}`);
    return undefined;
  }
  return t;
}

module.exports = {
  inspect,
  act,
  noteJoin,
  getJoinedAt,
  _internals: { RE_BAILEYS_DEFAULT, RE_HEX32, RE_HEX_GENERIC, RE_BAE5, RE_DEBUG_ID, RE_BOT_MARK },
};
