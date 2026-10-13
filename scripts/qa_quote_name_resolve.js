/**
 * QA — `.j s` quoted-author name resolution (2026-10-13 "name doesn't show sometimes")
 *
 * Proves, against the LIVE economy cache on this box:
 *   1. BUG:  economy.getUser() returns null for unregistered users — the exact
 *      screenshot failure (Eve🌸 quoted → raw digits "20525682270384").
 *   2. FIX:  the candidate-bridge chain (original + lidResolver lid/phone forms +
 *      resolveJid + device-suffix-stripped variants) finds her nickname "Eve🌸"
 *      through economy.economyData.get() with NO registration gate.
 *   3. FIX2: a phone-keyed user with a known LID mapping resolves symmetrically.
 *   4. Unknown JID → chain returns null (handler then falls back to digits).
 *
 * Read-only against user data: never calls getOrCreateUser / scheduleSave.
 * PASS = all assertions green, exit 0.
 */
require("dotenv").config();

const PROCESSED = process.env.QS_LID || "20525682270384"; // Eve🌸 (screenshot case)
const EXPECT_NAME = process.env.QS_NAME || "Eve🌸";

function stripDevice(jid) {
  const at = jid.indexOf("@");
  const colon = jid.indexOf(":");
  if (at > 0 && colon > 0 && colon < at) return `${jid.slice(0, colon)}${jid.slice(at)}`;
  return jid;
}

// ── EXACT chain the patched handler uses (kept in sync deliberately) ────────
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
  for (const cand of cands) {
    try {
      const u = economy.economyData && economy.economyData.get(cand);
      const n =
        (u?.nickname && u.nickname !== "Adventurer" && u.nickname) ||
        u?.profile?.whatsappName ||
        null;
      if (n) return { name: n, via: cand };
    } catch {}
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
      console.log(`  ✓ ${label}${extra ? " — " + extra : ""}`);
    } else {
      fail++;
      console.log(`  ✗ FAIL: ${label}${extra ? " — " + extra : ""}`);
    }
  };

  console.log("loading economy cache…");
  await economy.loadEconomy();
  await lidResolver.loadLidMappings();
  console.log(`cache size: ${economy.economyData.size} users, ${lidResolver.lidCache.size} lid mappings`);

  // ── 1. BUG reproduction: registered-gate null ──────────────────────────────
  const lidJid = jidNormalizedUser(`${PROCESSED}@lid`);
  const gatedUser = economy.getUser(lidJid);
  check(
    "bug present: getUser() nulls the unregistered quoted author",
    gatedUser === null || gatedUser === undefined,
    `getUser(${lidJid}) → ${gatedUser === null ? "null" : typeof gatedUser}`
  );

  // ── 2. FIX: bridge chain resolves her name, no registration gate ───────────
  const r1 = resolveQuotedName(lidJid, economy, lidResolver);
  check("fix: candidate chain finds the name", r1.name === EXPECT_NAME, `${lidJid} → "${r1.name}" (via ${r1.via})`);

  // jidNormalizedUser must not have mangled the LID form
  check("jidNormalizedUser keeps @lid form", lidJid.endsWith("@lid"), lidJid);

  // ── 3. reverse direction: phone → name (mapping symmetry) ─────────────────
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

  // ── 4. unknown jid → null (handler falls back to digits) ──────────────────
  const r3 = resolveQuotedName("999999999999999@s.whatsapp.net", economy, lidResolver);
  check("unknown jid → null (digits fallback kicks in)", r3.name === null);

  // ── 5. sanity: at least one known user still resolves (no regression) ─────
  let anyHit = 0;
  let scanned = 0;
  for (const [key, u] of economy.economyData) {
    if (scanned >= 500) break;
    scanned++;
    const n = (u?.nickname && u.nickname !== "Adventurer" && u.nickname) || u?.profile?.whatsappName || null;
    if (n) anyHit++;
  }
  check("sanity: cache read path returns names broadly", anyHit > scanned * 0.5, `${anyHit}/${scanned}`);

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("QA crashed:", e);
  process.exit(1);
});
