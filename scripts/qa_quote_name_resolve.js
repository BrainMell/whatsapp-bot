/**
 * QA - `.j s` quoted-author name resolution
 * (2026-10-13 "name doesn't show sometimes" + "Use WhatsApp name instead of
 *  bots registered name")
 *
 * Proves, against the LIVE economy cache on this box:
 *   1. BUG:  economy.getUser() returns null for unregistered users - the exact
 *      screenshot failure (Eve🌸 quoted → raw digits "20525682270384").
 *   2. FIX:  the candidate-bridge chain (original + lidResolver lid/phone forms +
 *      resolveJid + device-suffix-stripped variants) finds her name through
 *      economy.economyData.get() with NO registration gate.
 *   3. PRIORITY: WhatsApp display name (profile.whatsappName) wins over the
 *      bot-registered nickname - asserted on a live user where the two differ.
 *   4. FIX2: a phone-keyed user with a known LID mapping resolves symmetrically.
 *   5. Unknown JID → chain returns null (handler then falls back to digits).
 *
 * Read-only against user data: never calls getOrCreateUser / scheduleSave.
 * PASS = all assertions green, exit 0.
 */
require("dotenv").config();

const PROCESSED = process.env.QS_LID || "20525682270384"; // Eve (screenshot case)
const EXPECT_NAME = process.env.QS_NAME || "Eve🌸";

function stripDevice(jid) {
  const at = jid.indexOf("@");
  const colon = jid.indexOf(":");
  if (at > 0 && colon > 0 && colon < at) return `${jid.slice(0, colon)}${jid.slice(at)}`;
  return jid;
}

const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// -- EXACT chain the patched handler uses (kept in sync deliberately) --------
function resolveQuotedName(quotedJid, economy, lidResolver) {
  const cands = [];
  const pushCand = (v) => {
    if (v && typeof v === "string" && !cands.includes(v)) cands.push(v);
  };
  pushCand(quotedJid);
  try {
    if (quotedJid) {
      const { lid, phone } = lidResolver.getMapping(quotedJid);
      if (lid) pushCand(`${lid}@lid`);
      if (phone) pushCand(`${phone}@s.whatsapp.net`);
      pushCand(lidResolver.resolveJid(quotedJid));
    }
  } catch {}
  for (const c of [...cands]) pushCand(stripDevice(c));

 // two passes: whatsappName first across ALL candidates, then nickname
  const found = [];
  for (const cand of cands) {
    try {
      const u = economy.economyData && economy.economyData.get(cand);
      if (u) found.push(u);
    } catch {}
  }
  for (const u of found) {
    const n = clean(u?.profile?.whatsappName);
    if (n) return { name: n, via: "whatsappName" };
  }
  for (const u of found) {
    if (clean(u?.nickname) && u.nickname !== "Adventurer" && u.nickname) {
      return { name: clean(u.nickname), via: "nickname" };
    }
  }
  return { name: null, via: null };
}

(async () => {
  const path = require("path");
  const ROOT = path.join(__dirname, "..");
  const economy = require(path.join(ROOT, "core", "rpg", "economy.js"));
  const lidResolver = require(path.join(ROOT, "core", "utils", "lidResolver.js"));
  const { jidNormalizedUser } = require(path.join(ROOT, "node_modules", "@whiskeysockets", "baileys"));

  let pass = 0;
  let fail = 0;
  const check = (label, cond, extra = "") => {
    if (cond) {
      pass++;
      console.log(`  ✓ ${label}${extra ? " - " + extra : ""}`);
    } else {
      fail++;
      console.log(`  ✗ FAIL: ${label}${extra ? " - " + extra : ""}`);
    }
  };

  console.log("loading economy cache…");
  await economy.loadEconomy();
  await lidResolver.loadLidMappings();
  console.log(`cache size: ${economy.economyData.size} users, ${lidResolver.lidCache.size} lid mappings`);

 // -- 1. BUG reproduction: registered-gate null ------------------------------
  const lidJid = jidNormalizedUser(`${PROCESSED}@lid`);
  const gatedUser = economy.getUser(lidJid);
  check(
    "bug present: getUser() nulls the unregistered quoted author",
    gatedUser === null || gatedUser === undefined,
    `getUser(${lidJid}) → ${gatedUser === null ? "null" : typeof gatedUser}`
  );

 // -- 2. FIX: bridge chain resolves the name, no registration gate -----------
  const r1 = resolveQuotedName(lidJid, economy, lidResolver);
  check("fix: candidate chain finds the name", r1.name === EXPECT_NAME, `${lidJid} → "${r1.name}" (via ${r1.via})`);
  check("jidNormalizedUser keeps @lid form", lidJid.endsWith("@lid"), lidJid);

 // -- 3. PRIORITY: WhatsApp name beats registered nickname on a real case ----
  let prioChecked = false;
  for (const [key, u] of economy.economyData) {
    const wa = clean(u?.profile?.whatsappName);
    const nick = clean(u?.nickname);
    if (wa && nick && nick !== "Adventurer" && wa !== nick) {
      const r = resolveQuotedName(key, economy, lidResolver);
      check(
        "priority: whatsappName wins over registered nickname",
        r.name === wa && r.via === "whatsappName",
        `user ${key}: wa="${wa}" nick="${nick}" → "${r.name}" (via ${r.via})`
      );
      prioChecked = true;
      break;
    }
  }
  if (!prioChecked) {
    console.log("  ℹ no user with differing wa/nickname found; priority check skipped");
  }

 // -- 4. reverse direction: phone → name (mapping symmetry) ------------------
  const phone = lidResolver.lidCache.get(PROCESSED);
  if (phone) {
    const r2 = resolveQuotedName(`${phone}@s.whatsapp.net`, economy, lidResolver);
    check(
      "fix: phone-form candidate resolves too",
      r2.name === EXPECT_NAME,
      `${phone}@s.whatsapp.net → "${r2.name}" (via ${r2.via})`
    );
  } else {
    console.log("  ℹ no lid→phone mapping for this LID; skipping reverse check");
  }

 // -- 5. unknown jid → null (handler falls back to digits) -------------------
  const r3 = resolveQuotedName("999999999999999@s.whatsapp.net", economy, lidResolver);
  check("unknown jid → null (digits fallback kicks in)", r3.name === null);

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("QA crashed:", e);
  process.exit(1);
});
