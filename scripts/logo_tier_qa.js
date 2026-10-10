#!/usr/bin/env node
/**
 * logo_tier_qa.js — QA for the logo recognizability tiers (owner 2026-10-10:
 * "Group the logos into the easy medium and hard, with which is more likely
 * to be known"). Run on the box:  node scripts/logo_tier_qa.js
 *
 * A. dataset integrity  — every brand tiered, counts consistent, household
 *                         names can never be below easy.
 * B. quizMedia pool     — tier buckets built + logoTierInfo() agrees.
 * C. live selection     — build real logo questions at session difficulty
 *                         easy + hard: labels valid, tier mix honors the
 *                         session bias, round ramps easy -> medium -> hard.
 */
const path = require("path");
const ROOT = path.join(__dirname, "..");
const ds = require(path.join(ROOT, "data", "logoDataset.json"));
const quizMedia = require(path.join(ROOT, "core", "games", "quizMedia"));

let pass = 0, fail = 0;
const ok = (cond, label, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${label}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? " — " + extra : ""}`); }
};
const RANK = { easy: 0, medium: 1, hard: 2 };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

console.log("\n[A] dataset integrity");
const brands = ds.brands || [];
const noTier = brands.filter((b) => !["easy", "medium", "hard"].includes(b.difficulty));
ok(noTier.length === 0, "every brand carries difficulty ∈ easy|medium|hard", `${noTier.length} missing`);
const counts = { easy: 0, medium: 0, hard: 0 };
for (const b of brands) counts[b.difficulty]++;
ok(ds.tiers && ds.tiers.easy === counts.easy && ds.tiers.medium === counts.medium && ds.tiers.hard === counts.hard,
  "top-level .tiers stats match per-brand fields", JSON.stringify(counts));
ok(counts.easy > brands.length * 0.2 && counts.easy < brands.length * 0.55, "easy tier is a real but not dominant share", `${counts.easy}/${brands.length}`);
ok(counts.hard > brands.length * 0.1, "hard tier populated", `${counts.hard}`);
const mega = ["Coca-Cola", "Nike", "Apple", "McDonald's", "Google", "PlayStation", "Mercedes-Benz", "Netflix"];
const megaBad = mega.filter((m) => {
  const hit = brands.find((b) => norm(b.name) === norm(m));
  return hit && hit.difficulty !== "easy";
});
ok(megaBad.length === 0, "household-name safety net: all MEGA probes are easy", megaBad.length ? megaBad.join(",") : "8/8 easy");
const hardProbe = brands.filter((b) => b.difficulty === "hard" && (b.pv90 || 0) >= 20000);
ok(hardProbe.length === 0, "no high-traffic (pv90>=20k) brand misfiled as hard", hardProbe.length ? hardProbe.slice(0, 4).map((b) => b.name).join(",") : "clean");
const easyProbe = brands.filter((b) => b.difficulty === "easy" && (b.pv90 || 0) > 0 && (b.pv90 || 0) < 400);
ok(easyProbe.length <= 12, "easy tier has at most a handful of near-zero-traffic members (MEGA list only)", `${easyProbe.length}: ${easyProbe.slice(0, 4).map((b) => b.name).join(",")}`);

console.log("\n[B] quizMedia pool");
const info = quizMedia.logoTierInfo();
ok(info.easy > 50 && info.medium > 50 && info.hard > 20, "all three tier buckets populated in LOGOS_POOL", JSON.stringify(info));
ok(info.tieredAt, "tieredAt present (dataset classification baked in)", info.tieredAt);

console.log("\n[C] live selection (network: Commons downloads)");
(async () => {
  for (const diff of ["easy", "hard"]) {
    const qs = await quizMedia.buildLogosQuestions({ count: 12, usedKeys: new Set(), difficulty: diff }).catch((e) => { console.log("  build error:", e.message); return []; });
    ok(qs.length >= 8, `session ${diff}: built enough questions`, `${qs.length}/12`);
    if (!qs.length) continue;
    const labels = qs.map((q) => q.difficulty);
    ok(labels.every((l) => ["easy", "medium", "hard"].includes(l)), `session ${diff}: all labels valid`, labels.join(","));
    const ranked = labels.map((l) => RANK[l]);
    let rampOk = true;
    for (let i = 1; i < ranked.length; i++) if (ranked[i] < ranked[i - 1]) { rampOk = false; break; }
    ok(rampOk, `session ${diff}: round ramps easy -> medium -> hard`, labels.join(">"));
    const cE = labels.filter((l) => l === "easy").length, cH = labels.filter((l) => l === "hard").length;
    if (diff === "easy") ok(cE >= cH, "easy session serves more easy than hard logos", `easy=${cE} hard=${cH}`);
    if (diff === "hard") ok(cH >= cE, "hard session serves more hard than easy logos", `easy=${cE} hard=${cH}`);
    ok(qs.every((q) => q.hideOptions && q.options.length === 4 && q.asset && q.asset.url), "questions keep hideOptions + 4 internal options + asset", "");
  }
  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
