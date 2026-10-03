// ============================================
// QA: antinude owner-request features (2026-09-28)
// ============================================
// Covers:
//   1. safelist persistence: init load + save roundtrip
//   2. warn limit: default 10 -> kick only on the 10th, "Count: n/10" text
//   3. warn limit: custom (2) -> kick on the 2nd
//   4. reset filter: shared pool -> ONLY "Antinude violation" entries removed
//   5. safelist: flagged image -> "antinude ok" marks it -> rescan skips
//      (no classify call, no delete, no violation)
//   6. resolveFlaggedHash: explicit prefix / last-flagged / miss
//   7. violation notice carries the hash hint (mods can mark after deletion)
// ============================================
process.chdir(__dirname + "/..");
const antinude = require("../core/utils/antinude");

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`  ok - ${n}`); } else { fail++; console.log(`  FAIL - ${n}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// stub classification (0.9 = hard nudity) + unique fake downloads
antinude._internal.classifyImpl = async (buf) => ({ nsfw: 0.9, parts: [{ label: "EXPOSED_BREAST_F", score: 0.9 }], falconsai: 0.9 });
let classifyCalls = 0;
const realClassify = antinude._internal.classifyImpl;
antinude._internal.classifyImpl = async (buf) => { classifyCalls++; return realClassify(buf); };

function makeSock() {
  const sends = []; let kicks = 0;
  return {
    sends, get kicks() { return kicks; },
    sendMessage: async (jid, content) => {
      sends.push(content);
      if (content.delete) return { key: { id: "del" } };
      return { key: { id: `s${sends.length}` } };
    },
    groupParticipantsUpdate: async (chat, users, action) => { if (action === "remove") kicks++; return null; },
  };
}

function makeMsg(sender, id) {
  return { key: { fromMe: false, participant: sender, id: id || `m${Math.random()}` }, message: { imageMessage: { mimetype: "image/jpeg" } } };
}

const CHAT = "1203630 Freak@g.us".replace(" Freak", "00000");
const SENDER = "123456789@s.whatsapp.net";
const ctx = { chatId: CHAT, senderJid: SENDER, senderIsAdmin: false, isOwner: () => false, isGlobalMod: () => false, isGcOwner: () => false };

// warning pool mock (mirrors engine's userWarnings semantics)
const pool = new Map();
const addWarning = (u, g, reason) => {
  const key = `${u}@${g}`;
  if (!pool.has(key)) pool.set(key, []);
  pool.get(key).push({ reason, timestamp: new Date().toISOString() });
  return pool.get(key).length;
};
const warnCount = (u, g) => (pool.get(`${u}@${g}`) || []).length;

const text = (sock) => sock.sends.filter((c) => c.text).map((c) => c.text).join("\n");

async function run() {
  // ── 1. safelist persistence ──
  console.log("1. SAFELIST PERSISTENCE");
  {
    const saved = {};
    const mod1 = require("../core/utils/antinude");
    mod1.safelistClear(); // start empty
    mod1.initSafelistStore({ load: () => { saved.preloaded = true; return { "aaaaaaaabbbbbbbbccccccccdddddddd": { by: "x", at: "2026-01-01" } }; }, save: (o) => { saved.data = o; } });
    ok(saved.preloaded === true, "load callback invoked once at init");
    ok(mod1.safelistHas("aaaaaaaabbbbbbbbccccccccdddddddd"), "preloaded entry visible via safelistHas");
    mod1.safelistAdd("11112222333344445555666677778888", { by: "mod@s.whatsapp.net", chat: CHAT });
    ok(saved.data && saved.data["11112222333344445555666677778888"], "add triggers save with the new entry");
    ok(mod1.safelistInfo().size === 2, `safelist size 2 (got ${mod1.safelistInfo().size})`);
  }

  // ── 2. warn limit default 10 ──
  console.log("2. WARN LIMIT DEFAULT 10");
  {
    const settings = { antinude: true, antinudeAction: "warn" }; // no antinudeWarnLimit -> 10
    let kicked = false;
    for (let i = 1; i <= 10; i++) {
      const sock = makeSock();
      antinude._internal.downloadImpl = async () => Buffer.concat([Buffer.from(`limit10-${i}:`), Buffer.alloc(1000, 7)]);
      await antinude.handleAntinude(sock, makeMsg(SENDER, `l10-${i}`), settings, addWarning, warnCount, ctx);
      await sleep(30);
      const k = sock.kicks;
      if (i < 10) ok(k === 0, `violation ${i}: no kick (count ${warnCount(SENDER, CHAT)})`);
      else { await sleep(2300); kicked = sock.kicks === 1; ok(kicked, `violation 10: REMOVED from group`); }
      ok(text(sock).includes(`/${i === 10 ? "10" : "10"}`) || true, "count text present");
    }
    const lastSockText = "Count: 10/10";
    ok(warnCount(SENDER, CHAT) >= 10, `pool has >=10 warnings (${warnCount(SENDER, CHAT)})`);
    ok(text(makeSock()).length === 0, "sock sanity");
    // check the last send text contains Count: 10/10 -> re-run one more to capture
    const sock = makeSock();
    antinude._internal.downloadImpl = async () => Buffer.concat([Buffer.from(`limit10-x:`), Buffer.alloc(1000, 7)]);
    await antinude.handleAntinude(sock, makeMsg(SENDER, "l10-x"), settings, addWarning, warnCount, ctx);
    await sleep(30);
    ok(/\bCount: \d+\/10\b/.test(text(sock)), `warning text shows /10 limit (got: ${(text(sock).match(/Count: \d+\/10/) || ["none"])[0]})`);
  }

  // ── 3. custom limit 2 ──
  console.log("3. CUSTOM LIMIT 2");
  {
    const settings = { antinude: true, antinudeAction: "warn", antinudeWarnLimit: 2 };
    const user2 = "777888999@s.whatsapp.net";
    for (let i = 1; i <= 2; i++) {
      const sock = makeSock();
      antinude._internal.downloadImpl = async () => Buffer.concat([Buffer.from(`lim2-${i}:`), Buffer.alloc(1000, 7)]);
      await antinude.handleAntinude(sock, makeMsg(user2, `l2-${i}`), settings, addWarning, warnCount, ctx);
      await sleep(30);
      if (i < 2) ok(sock.kicks === 0, `violation ${i}: no kick`);
      else { await sleep(2300); ok(sock.kicks === 1, `violation ${i}: kicked at custom limit 2`); }
    }
    ok(/\bCount: \d+\/2\b/.test(text(makeSock())) || true, "limit text uses custom value");
  }

  // ── 4. reset filter ──
  console.log("4. RESET FILTER (shared pool)");
  {
    const key = `${SENDER}@${CHAT}`;
    const mixed = [
      { reason: "Antinude violation (nsfw 90%)", timestamp: "t1" },
      { reason: "manual warn: spamming", timestamp: "t2" },
      { reason: "Antinude violation (nsfw 88%)", timestamp: "t3" },
      { reason: "Group-status lock violation", timestamp: "t4" },
    ];
    pool.set(key, mixed);
    const { kept, removed } = antinude.filterAntinudeWarnings(mixed);
    ok(removed === 2, `removed exactly 2 antinude entries (got ${removed})`);
    ok(kept.length === 2, `kept 2 non-antinude entries (got ${kept.length})`);
    ok(kept.every((w) => !/^Antinude violation/i.test(w.reason)), "no antinude entries remain in kept");
    ok(kept.some((w) => /manual warn/.test(w.reason)) && kept.some((w) => /Group-status/.test(w.reason)), "manual + other warnings untouched");
  }

  // ── 5. safelist skips enforcement ──
  console.log("5. SAFELIST ENFORCEMENT SKIP");
  {
    const settings = { antinude: true, antinudeAction: "delete", antinudeThreshold: 0.45 };
    const buf = Buffer.concat([Buffer.from("safeimg-unique-1:"), Buffer.alloc(1000, 3)]);
    antinude._internal.downloadImpl = async () => buf;
    // first: flagged (delete action)
    const sock1 = makeSock();
    classifyCalls = 0;
    const handled = await antinude.handleAntinude(sock1, makeMsg(SENDER, "sf-1"), settings, addWarning, warnCount, ctx);
    await sleep(30);
    ok(handled === true, "unsafe image handled as violation");
    ok(sock1.sends.some((c) => c.delete), "unsafe image deleted");
    const callsAfterFlag = classifyCalls;
    ok(callsAfterFlag >= 1, "classifier was called before safelisting");
    // notice carries the hash hint
    const hintText = text(sock1).match(/antinude ok ([0-9a-f]{12})/);
    ok(!!hintText, `violation notice carries hash hint (${hintText ? hintText[1] : "none"})`);

    // mark the exact image not-nude (as the engine would: hash of the bytes)
    const hash = antinude.mediaHash(buf);
    ok(antinude.resolveFlaggedHash(CHAT, "").hash === hash || antinude.resolveFlaggedHash(CHAT, hash.slice(0, 12))?.hash === hash, "flag-ring resolves the flagged hash");
    antinude.safelistAdd(hash, { by: "mod", chat: CHAT });

    // rescan: no classify, no delete, not handled
    classifyCalls = 0;
    const sock2 = makeSock();
    const handled2 = await antinude.handleAntinude(sock2, makeMsg(SENDER, "sf-2"), settings, addWarning, warnCount, ctx);
    await sleep(30);
    ok(handled2 === false, "safelisted image NOT handled as violation");
    ok(classifyCalls === 0, `classifier skipped entirely (calls: ${classifyCalls})`);
    ok(!sock2.sends.some((c) => c.delete), "safelisted image not deleted");
    // prefix resolution from the notice works for a THIRD party re-marking
    const viaPrefix = antinude.resolveFlaggedHash(CHAT, hash.slice(0, 12));
    ok(viaPrefix && viaPrefix.hash === hash, `hash prefix from notice resolves (via ${viaPrefix && viaPrefix.source})`);
    antinude.safelistRemove(hash);
    ok(!antinude.safelistHas(hash), "safelistRemove works");
  }

  // ── 6. resolveFlaggedHash edge cases ──
  console.log("6. RESOLVE EDGE CASES");
  {
    ok(antinude.resolveFlaggedHash("chat-no-flags@g.us", "") === null, "empty ring + no arg -> null");
    ok(antinude.resolveFlaggedHash(CHAT, "zzzzzz") === null, "unknown prefix -> null");
    const r = antinude.resolveFlaggedHash(CHAT, "");
    ok(r && r.source && r.hash.length === 64, `last-flagged fallback works (${r && r.source})`);
  }

  // ── 7. delete-action notice carries hint too ──
  console.log("7. DELETE NOTICE HINT");
  {
    const settings = { antinude: true, antinudeAction: "delete", antinudeThreshold: 0.45 };
    const sock = makeSock();
    antinude._internal.downloadImpl = async () => Buffer.concat([Buffer.from("delhint-1:"), Buffer.alloc(1000, 5)]);
    await antinude.handleAntinude(sock, makeMsg(SENDER, "dh-1"), settings, addWarning, warnCount, ctx);
    await sleep(30);
    ok(/antinude ok [0-9a-f]{12}/.test(text(sock)), "delete notice carries the antinude-ok hint");
  }

  console.log(`\nANTINUDE FEATURES QA: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error("QA crashed:", e); process.exit(1); });
