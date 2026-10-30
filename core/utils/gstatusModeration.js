"use strict";
const STATUS_WRAPPER_KEYS = ["groupStatusMessageV2", "groupStatusMessage", "groupStatusMentionMessage"];
const NESTED_MESSAGE_KEYS = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage", "editedMessage", "deviceSentMessage"];
const CONTENT_KEYS = ["conversation", "extendedTextMessage", "imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage", "contactMessage", "locationMessage"];

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isGroupStatusFlag(contextInfo) {
  if (!isObject(contextInfo)) return false;
  return contextInfo.isGroupStatus === true || contextInfo.isGroupStatus === 1 ||
    contextInfo.isGroupStatus === "1" || contextInfo.isGroupStatus === "true";
}

function findGroupStatusContext(message) {
  if (!isObject(message)) return null;
  if (isGroupStatusFlag(message.contextInfo)) return message.contextInfo;
  for (const key of CONTENT_KEYS) {
    const payload = message[key];
    if (isObject(payload) && isGroupStatusFlag(payload.contextInfo)) return payload.contextInfo;
  }
  return null;
}

/**
 * Finds a group-status envelope or isGroupStatus-marked payload.
 * Does not walk quotedMessage/contextInfo.quotedMessage, so replying to a
 * status cannot make the reply itself look like a new status.
 */
function inspectGroupStatus(message) {
  const queue = [message];
  const visited = new Set();
  while (queue.length && visited.size < 16) {
    const current = queue.shift();
    if (!isObject(current) || visited.has(current)) continue;
    visited.add(current);

    for (const key of STATUS_WRAPPER_KEYS) {
      const wrapper = current[key];
      if (isObject(wrapper)) {
        const inner = isObject(wrapper.message) ? wrapper.message : wrapper;
        return {
          isGroupStatus: true,
          wrapperKey: key,
          envelope: wrapper,
          message: inner,
          contextInfo: findGroupStatusContext(inner),
        };
      }
    }

    const contextInfo = findGroupStatusContext(current);
    if (contextInfo) {
      return { isGroupStatus: true, wrapperKey: null, envelope: null, message: current, contextInfo };
    }

    for (const key of NESTED_MESSAGE_KEYS) {
      const nested = current[key];
      if (!isObject(nested)) continue;
      queue.push(isObject(nested.message) ? nested.message : nested);
    }
  }
  return null;
}

function resolveGroupStatusAuthor(key, contextInfo, fallbackJid) {
  const candidate = key?.participant || key?.participantAlt || contextInfo?.participant || fallbackJid || null;
  return candidate ? String(candidate) : null;
}

function buildGroupStatusRevokeKey(key, groupJid, authorJid) {
  if (!isObject(key)) return null;
  return {
    ...key,
    remoteJid: groupJid || key.remoteJid,
    fromMe: false,
    participant: key.participant || key.participantAlt || authorJid || undefined,
  };
}

/** Only the bot owner and registered global moderators are exempt. */
function isAllowedGroupStatusAuthor(authorJid, resolvedJid, predicates = {}) {
  const candidates = [...new Set([authorJid, resolvedJid].filter(Boolean).map(String))];
  for (const jid of candidates) {
    for (const check of [predicates.isOwner, predicates.isGlobalMod]) {
      if (typeof check !== "function") continue;
      try {
        if (check(jid)) return true;
      } catch (_) {
        // A broken permission lookup must not silently grant an exemption.
      }
    }
  }
  return false;
}

/**
 * Group-status revokes need the groupStatusMessageV2 envelope.
 * A normal Baileys { delete: key } is only a best-effort fallback.
 */
async function revokeGroupStatus(sock, groupJid, messageKey, dependencies = {}) {
  if (!sock || !messageKey?.id || !groupJid) {
    return { ok: false, method: null, error: "missing group, socket or message id" };
  }

  const generateMessageID = dependencies.generateMessageID || require("@whiskeysockets/baileys").generateMessageID;
  const randomBytes = dependencies.randomBytes || require("crypto").randomBytes;
  const logger = dependencies.logger || console;
  const revokeMessage = { protocolMessage: { key: messageKey, type: 0 } };

  // WhatsApp drops revokes without the `edit` stanza attr: '7' = own message, '8' = admin
  // revoking someone else's (Baileys sets this itself only for sendMessage({delete})).
  const edit = messageKey.fromMe ? "7" : "8";
  let wrappedOk = false;
  try {
    const secret = randomBytes(32);
    await sock.relayMessage(groupJid, {
      messageContextInfo: { messageSecret: secret },
      groupStatusMessageV2: {
        message: { ...revokeMessage, messageContextInfo: { messageSecret: secret } },
      },
    }, { messageId: generateMessageID(), additionalAttributes: { edit } });
    wrappedOk = true;
  } catch (wrappedError) {
    try {
      logger.log("[GStatus] wrapped revoke failed, trying plain delete:", wrappedError?.message || wrappedError);
    } catch (_) {}
  }

  // bare revoke with the edit attr too - covers clients that don't want the V2 envelope
  try {
    await sock.relayMessage(groupJid, revokeMessage, { messageId: generateMessageID(), additionalAttributes: { edit } });
    if (wrappedOk) return { ok: true, method: "wrapped+bare", error: null };
    wrappedOk = true;
  } catch (_) {}

  if (wrappedOk) return { ok: true, method: "wrapped", error: null };

  try {
    await sock.sendMessage(groupJid, { delete: messageKey });
    return { ok: true, method: "plain", error: null };
  } catch (plainError) {
    return {
      ok: false,
      method: null,
      error: plainError?.message || String(plainError || "status revoke failed"),
    };
  }
}

module.exports = {
  inspectGroupStatus,
  resolveGroupStatusAuthor,
  buildGroupStatusRevokeKey,
  isAllowedGroupStatusAuthor,
  revokeGroupStatus,
};
