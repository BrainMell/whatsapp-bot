"use strict";
const fs = require("fs");
const path = require("path");
const moderation = require("../core/utils/gstatusModeration");
let pass = 0, fail = 0;
function assert(condition, label) {
  if (condition) { pass++; console.log("  ok -", label); }
  else { fail++; console.error("  FAIL -", label); }
}

async function main() {
  console.log("\n── group-status detection ──");
  const v2 = moderation.inspectGroupStatus({ groupStatusMessageV2: { message: { extendedTextMessage: { text: "status" } } } });
  assert(!!v2 && v2.wrapperKey === "groupStatusMessageV2", "recognizes V2 group-status envelope");
  const v1 = moderation.inspectGroupStatus({ groupStatusMessage: { message: { imageMessage: {} } } });
  assert(!!v1 && v1.wrapperKey === "groupStatusMessage", "recognizes legacy group-status envelope");
  const mention = moderation.inspectGroupStatus({ groupStatusMentionMessage: { message: { videoMessage: {} } } });
  assert(!!mention && mention.wrapperKey === "groupStatusMentionMessage", "recognizes groupStatusMentionMessage");
  const flagged = moderation.inspectGroupStatus({ extendedTextMessage: { contextInfo: { isGroupStatus: true, participant: "member@s.whatsapp.net" } } });
  assert(!!flagged && flagged.contextInfo.participant === "member@s.whatsapp.net", "recognizes isGroupStatus=true");
  const nested = moderation.inspectGroupStatus({ ephemeralMessage: { message: { imageMessage: { contextInfo: { isGroupStatus: 1 } } } } });
  assert(!!nested && nested.contextInfo.isGroupStatus === 1, "recognizes isGroupStatus in an ephemeral envelope");
  assert(moderation.inspectGroupStatus({ extendedTextMessage: { text: "normal", contextInfo: { isForwarded: true } } }) === null, "ordinary forwarded message is not a status");
  assert(moderation.inspectGroupStatus({ extendedTextMessage: { contextInfo: { quotedMessage: { groupStatusMessageV2: { message: { conversation: "quoted" } } } } } }) === null, "quoted status is not a new status");

  console.log("\n── author, permissions and revoke key ──");
  assert(moderation.resolveGroupStatusAuthor({ participant: "member-lid@lid" }, { participant: "quoted@s.whatsapp.net" }, "fallback@s.whatsapp.net") === "member-lid@lid", "actual message participant wins over fallback");
  const key = moderation.buildGroupStatusRevokeKey({ remoteJid: "123@g.us", id: "STATUS1", fromMe: false, participant: "member@lid" }, "123@g.us", "member@s.whatsapp.net");
  assert(key.id === "STATUS1" && key.remoteJid === "123@g.us" && key.fromMe === false && key.participant === "member@lid", "revoke key preserves stanza and addressing mode");
  const filled = moderation.buildGroupStatusRevokeKey({ id: "STATUS2" }, "123@g.us", "member@s.whatsapp.net");
  assert(filled.participant === "member@s.whatsapp.net", "revoke key fills missing participant");
  assert(moderation.isAllowedGroupStatusAuthor("mod@lid", "mod@s.whatsapp.net", { isGlobalMod: jid => jid === "mod@s.whatsapp.net" }), "global mod is exempt across LID/phone JIDs");
  assert(moderation.isAllowedGroupStatusAuthor("owner@s.whatsapp.net", null, { isOwner: jid => jid === "owner@s.whatsapp.net" }), "bot owner is exempt");
  assert(!moderation.isAllowedGroupStatusAuthor("admin@s.whatsapp.net", null, { isOwner: () => false, isGlobalMod: () => false, isGroupAdmin: () => true }), "group-admin-only user is not exempt");

  console.log("\n── revoke transport ──");
  const relays = [];
  const ok = await moderation.revokeGroupStatus({
    relayMessage: async (jid, message, options) => relays.push({ jid, message, options }),
    sendMessage: async () => { throw new Error("fallback should not run"); },
  }, "123@g.us", key, {
    generateMessageID: () => "REVOKE1",
    randomBytes: () => Buffer.alloc(32, 7),
    logger: { log() {} },
  });
  assert(ok.ok && ok.method === "wrapped", "uses the groupStatusMessageV2 revoke envelope");
  assert(relays[0].message.groupStatusMessageV2.message.protocolMessage.type === 0, "revoke uses protocol type 0");
  assert(relays[0].options.messageId === "REVOKE1", "wrapped revoke receives a generated id");
  let fallbackKey = null;
  const fallback = await moderation.revokeGroupStatus({
    relayMessage: async () => { throw new Error("relay rejected"); },
    sendMessage: async (jid, payload) => { fallbackKey = payload.delete; },
  }, "123@g.us", key, {
    generateMessageID: () => "REVOKE2",
    randomBytes: () => Buffer.alloc(32, 8),
    logger: { log() {} },
  });
  assert(fallback.ok && fallback.method === "plain" && fallbackKey === key, "plain delete is the fallback");
  const failed = await moderation.revokeGroupStatus({
    relayMessage: async () => { throw new Error("wrapped denied"); },
    sendMessage: async () => { throw new Error("plain denied"); },
  }, "123@g.us", key, {
    generateMessageID: () => "REVOKE3",
    randomBytes: () => Buffer.alloc(32, 9),
    logger: { log() {} },
  });
  assert(!failed.ok && /plain denied/.test(failed.error), "reports failure when both revoke routes fail");
  assert(!(await moderation.revokeGroupStatus({}, "123@g.us", {}, {})).ok, "rejects an incomplete revoke key");

  console.log("\n── engine integration ──");
  const engine = fs.readFileSync(path.join(__dirname, "..", "core", "engine.js"), "utf8");
  const guardAt = engine.indexOf('const __gsStatusModeration = require("./utils/gstatusModeration")');
  const masterGateAt = engine.indexOf("// 🚫 MASTER GC GATE (2026-09-28) - DEFAULT BLACKLIST EVERY GROUP");
  assert(guardAt >= 0 && masterGateAt > guardAt, "auto-moderator runs before the actual master group gate");
  const guard = guardAt >= 0 && masterGateAt > guardAt ? engine.slice(guardAt, masterGateAt) : "";
  assert(guard.includes('String(BOT_ID || "").toLowerCase() === "joker"'), "automatic rule is scoped to Joker");
  assert(guard.includes("isAllowedGroupStatusAuthor"), "guard checks owner/global-moderator exemptions");
  assert(!/senderIsAdmin|gslIsAdmin|isGroupAdmin/.test(guard), "group-admin status is not an exemption");
  assert(guard.includes("revokeGroupStatus") && guard.includes("return;"), "rejected statuses are revoked and stopped");
  assert(engine.includes("Group-status protection is always ON"), "legacy lock command cannot disable auto-moderation");
  assert(engine.includes("const GS_UNSUPPORTED = '__gs_unsupported_media__';"), "gstatus media error sentinel remains in the message-handler scope");

  console.log("\n── result ──");
  console.log("PASS: " + pass + " | FAIL: " + fail);
  if (fail) process.exitCode = 1;
}
main().catch(error => { console.error("GSTATUS MODERATION QA CRASHED:", error); process.exitCode = 1; });
