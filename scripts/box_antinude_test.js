// FULL antinude enforcement E2E on Box 1.
// Mock NSFW service + injected media buffer -> exercise the REAL
// handleAntinude path: exemption semantics, scoring, threshold, delete,
// warn (3-strike kick), and the delete-failure message path.
process.chdir("/home/ubuntu/whatsapp-bot");
const http = require("http");
const fs = require("fs");
// MUST be set BEFORE requiring antinude - the module captures SERVICE_URL at load
defineEnv();
function defineEnv() { process.env.NSFW_SERVICE_URL = "http://127.0.0.1:7788/vision/nsfw"; }
const antinude = require("/home/ubuntu/whatsapp-bot/core/utils/antinude.js");

let pass = 0, fail = 0;
function t(name, cond) { if (cond) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}`); } }

(async () => {
  // 1. mock NSFW service on 127.0.0.1:7788
  let verdict = { nsfw: 0.1, parts: [], falconsai: 0.1 };
  const mock = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(verdict));
    });
  });
  await new Promise((r) => mock.listen(7788, "127.0.0.1", r));

  // clear the verdict cache between scenarios
  const fakeBuf = fs.readFileSync("/home/ubuntu/vt_goku.png");
  const realBuf = fs.readFileSync("/home/ubuntu/vt_gaara.img");
  let counter = 0;
  antinude._internal.downloadImpl = async () => {
    counter++;
    // unique bytes per call so the sha256 verdict cache never short-circuits
    return Buffer.concat([Buffer.from(`case-${counter}-${Date.now()}:`), fakeBuf]);
  };

  const mkCtx = (over) => Object.assign({
    chatId: "120363409013549791@g.us",
    senderJid: "999888777@s.whatsapp.net",
    senderIsAdmin: false, isOwner: false,
    isGlobalMod: () => false, isGcOwner: () => false,
  }, over);
  const mkMsg = () => ({
    key: { fromMe: false, id: `msg${counter}`, participant: "999888777@s.whatsapp.net" },
    message: { imageMessage: { mimetype: "image/jpeg", caption: "" } },
  });
  const mkSock = () => {
    const calls = { deleted: 0, texts: [], kicks: 0 };
    return {
      calls,
      async sendMessage(chatId, content) {
        if (content.delete) { calls.deleted++; return {}; }
        if (content.text) calls.texts.push(String(content.text));
        return {};
      },
      async groupParticipantsUpdate(chatId, users, action) { if (action === "remove") calls.kicks++; return {}; },
    };
  };
  const addWarning = () => 1;

  // 2. NON-exempt + high score -> DELETE + ANTINUDE message (the actual bug fix)
  verdict = { nsfw: 0.93, parts: [{ label: "EXPOSED_BREAST_F", score: 0.93 }], falconsai: 0.93 };
  let sock = mkSock();
  let handled = await antinude.handleAntinude(sock, mkMsg(), { antinude: true, antinudeThreshold: 0.45, antinudeAction: "delete" }, addWarning, () => 1, mkCtx({}));
  t("violation: handleAntinude returns true", handled === true);
  t("violation: message DELETED", sock.calls.deleted === 1);
  t("violation: group told about the removal", sock.calls.texts.some((x) => x.includes("ANTINUDE") && x.includes("removed")));
  t("violation: parts surfaced in message", sock.calls.texts.some((x) => x.includes("EXPOSED_BREAST_F") || x.includes("confidence 93%")));

  // 3. NON-exempt + low score -> NO action
  verdict = { nsfw: 0.05, parts: [], falconsai: 0.05 };
  sock = mkSock();
  handled = await antinude.handleAntinude(sock, mkMsg(), { antinude: true, antinudeThreshold: 0.45, antinudeAction: "delete" }, addWarning, () => 1, mkCtx({}));
  t("safe image: no action", handled === false && sock.calls.deleted === 0 && sock.calls.texts.length === 0);

  // 4. 2026-09-28 owner directive: GROUP ADMIN is NOT exempt -> high score
  //    still enforces (deleted + group message). This is the regression pin
  //    for "the antinude should affect admins except the owner".
  antinude._internal.downloadImpl = async () => Buffer.concat([Buffer.from(`case-admin-${Date.now()}:`), fakeBuf]);
  verdict = { nsfw: 0.99, parts: [], falconsai: 0.99 };
  sock = mkSock();
  handled = await antinude.handleAntinude(sock, mkMsg(), { antinude: true, antinudeThreshold: 0.45, antinudeAction: "delete" }, addWarning, () => 1, mkCtx({ senderIsAdmin: true }));
  t("admin + violation: STILL enforced (deleted)", handled === true && sock.calls.deleted === 1);
  t("admin + violation: group notified", sock.calls.texts.some((x) => x.includes("ANTINUDE")));

  // 4b. General Mod / GC owner functions -> STILL EXEMPT (owner correction
  //     2026-09-28: "I meant ONLY admins minus mods and GC owner") -> skipped
  antinude._internal.downloadImpl = async () => { throw new Error("should not download for exempt senders"); };
  verdict = { nsfw: 0.9, parts: [], falconsai: 0.9 };
  sock = mkSock();
  handled = await antinude.handleAntinude(sock, mkMsg(), { antinude: true, antinudeThreshold: 0.45, antinudeAction: "delete" }, addWarning, () => 1, mkCtx({ isGlobalMod: () => true, isGcOwner: () => true }));
  t("global mod / gc owner: exempt (mods keep immunity)", handled === false && sock.calls.deleted === 0);

  // 4c. bot OWNER is exempt (alongside mods + GC owner) -> skipped, no download
  antinude._internal.downloadImpl = async () => { throw new Error("should not download for exempt senders"); };
  verdict = { nsfw: 0.99, parts: [], falconsai: 0.99 };
  sock = mkSock();
  handled = await antinude.handleAntinude(sock, mkMsg(), { antinude: true, antinudeThreshold: 0.45, antinudeAction: "delete" }, addWarning, () => 1, mkCtx({ isOwner: true }));
  t("owner: skipped entirely (only exempt role)", handled === false && sock.calls.deleted === 0);

  // 5. warn action -> warning message + count
  antinude._internal.downloadImpl = async () => Buffer.concat([Buffer.from(`case-warn-${Date.now()}:`), fakeBuf]);
  verdict = { nsfw: 0.8, parts: [], falconsai: 0.8 };
  sock = mkSock();
  const warns = [];
  handled = await antinude.handleAntinude(sock, mkMsg(), { antinude: true, antinudeThreshold: 0.45, antinudeAction: "warn" }, (u, c, r) => { warns.push(r); return 2; }, () => 2, mkCtx({}));
  t("warn action: deleted + warned", handled === true && sock.calls.deleted === 1);
  t("warn action: warning text shows count", sock.calls.texts.some((x) => x.includes("ANTINUDE WARNING") && x.includes("2/3")));

  // 6. delete fails (bot not admin) -> explicit fallback message, no crash
  verdict = { nsfw: 0.9, parts: [], falconsai: 0.9 };
  sock = mkSock();
  sock.sendMessage = async (c, content) => { if (content.delete) throw new Error("forbidden - not admin"); if (content.text) sock.calls.texts.push(String(content.text)); return {}; };
  handled = await antinude.handleAntinude(sock, mkMsg(), { antinude: true, antinudeThreshold: 0.45, antinudeAction: "delete" }, addWarning, () => 1, mkCtx({}));
  t("delete-failure: still reports to the group", handled === true && sock.calls.texts.some((x) => x.includes("make me a *group admin*")));

  // 7. safe-content sanity (negative): a LOW verdict must produce no action.
  // NOTE: the verdict MUST be reset here - scenario 6 leaves 0.9 in the mock
  // (stale-verdict made this scenario fail spuriously on 2026-09-28). The
  // REAL Box 2 service check lives in box_antinude_real.js (SERVICE_URL is
  // captured at require time, so this suite always talks to the mock).
  verdict = { nsfw: 0.05, parts: [], falconsai: 0.05 };
  antinude._internal.downloadImpl = async () => Buffer.concat([Buffer.from(`case-real-${Date.now()}:`), realBuf]);
  sock = mkSock();
  handled = await antinude.handleAntinude(sock, mkMsg(), { antinude: true, antinudeThreshold: 0.45, antinudeAction: "delete" }, addWarning, () => 1, mkCtx({}));
  t("safe content (low verdict): no action", handled === false && sock.calls.deleted === 0);

  mock.close();
  console.log(`\nANTINUDE ENFORCEMENT: ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("SUITE ERR", e); process.exit(1); });
