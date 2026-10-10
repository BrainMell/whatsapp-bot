// ============================================
// LOGO DATASET V2 CONTENT FILTER (2026-10-09)
// ============================================
// The fame-ranked wikidata expansion pulls entities that are NOT brand-quiz
// material even though they have a "current" P154 logo:
//   - dissolved orgs (Hitler Youth — P154 just was never end-qualified)
//   - cities / municipalities (Kyoto)
//   - films & TV series with title wordmarks (Doctor Strange in the...)
//   - courts, ministries, agencies, churches, universities, events
// Owner spec: "only modern logos used today" + this is a BRAND quiz.
// Filter pass: fetch P31 + P576 for every dataset qid (batched), then:
//   drop if dissolved (P576)                -> not "used today" by definition
//   drop if P31 in the class blocklist      -> not brand material
//   drop if label matches the place/institution/event veto regex
// Rewrites data/logoDataset.json + appends to the report.
// ============================================
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const UA = { headers: { "User-Agent": "ZenithQuizBot/2.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" } };
const get = (url) => axios.get(url, { ...UA, timeout: 30000 });

const P31_DROP = new Set([
  "Q5", // human
  "Q515", "Q15284", "Q532", "Q486972", "Q56061", "Q6256", "Q16970", // places
  "Q11424", "Q5398426", "Q506240", // film, TV series, film genre-ish entries
  "Q3918", "Q33506", "Q7075", "Q16917", // university, museum, library, hospital-ish
  "Q7278", "Q327333", "Q7187", "Q10498148", // political party, gov agency, government, international court? (safe side)
  "Q43229", // organization (bare) — too generic to be a brand answer? no: keep; remove from set if harmful
]);
P31_DROP.delete("Q43229");

const LABEL_VETO = /(city|town|municipality|village|commune|province|district|prefecture|cathedral|\bchurch\b|diocese|parish|mosque|temple|synagogue|\bcourt of|ministry of|department of|government of|political party|\belection\b|\bfestival\b|\baward\b|film$|movie$|\bnyx\b|university|college|school|museum of|library|hospital|\bfoundation\b|championship|world cup|tournament|federation of|association of|union of|order of|archdiocese)/i;

async function claimsBatch(ids) {
  const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join("|")}&props=claims|labels&languages=en&format=json&formatversion=2`;
  const r = await get(u);
  return r.data?.entities || {};
}

(async () => {
  const dataPath = path.join(__dirname, "..", "data", "logoDataset.json");
  const ds = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const brands = ds.brands;
  console.log(`content filter: ${brands.length} entries`);

  const claimsById = {};
  const withQid = brands.filter((b) => b.qid);
  for (let i = 0; i < withQid.length; i += 50) {
    const ids = withQid.slice(i, i + 50).map((b) => b.qid);
    try {
      const ents = await claimsBatch(ids);
      Object.assign(claimsById, ents);
    } catch (e) { console.log(`batch ${i} failed: ${String(e.message).slice(0, 60)}`); }
    if ((i / 50) % 5 === 0) console.log(`  ...${i}/${withQid.length}`);
    await new Promise((r) => setTimeout(r, 150));
  }

  const kept = [];
  const dropped = [];
  for (const b of brands) {
    const ent = b.qid ? claimsById[b.qid] : null;
    const claims = ent?.claims || {};
    const label = ent?.labels?.en?.value || b.name;
    const p31 = (claims.P31 || []).map((s) => s?.mainsnak?.datavalue?.value?.id).filter(Boolean);
    const dissolved = (claims.P576 || []).length > 0;
    const bad31 = p31.some((q) => P31_DROP.has(q));
    const veto = LABEL_VETO.test(label) || LABEL_VETO.test(b.name);
    if (dissolved) { dropped.push(`${b.name}: dissolved(P576)`); continue; }
    if (bad31) { dropped.push(`${b.name}: p31-blocklist`); continue; }
    if (veto) { dropped.push(`${b.name}: label-veto`); continue; }
    kept.push(b);
  }
  console.log(`kept ${kept.length}, dropped ${dropped.length}`);

  ds.brands = kept;
  ds.count = kept.length;
  ds.gates = [...(ds.gates || []), "content-filter: dissolved(P576) | place/institution/film/event blocklist + label veto"];
  ds.filteredAt = new Date().toISOString();
  fs.writeFileSync(dataPath, JSON.stringify(ds, null, 1));
  fs.appendFileSync(path.join(__dirname, "..", "data", "logoDataset.report.txt"),
    `\n\nCONTENT FILTER PASS - ${ds.filteredAt}\nkept: ${kept.length} | dropped: ${dropped.length}\n` +
    dropped.map((d) => `  - ${d}`).join("\n"));
  console.log(dropped.slice(0, 30).map((d) => `  - ${d}`).join("\n"));
})().catch((e) => { console.error("FILTER CRASH:", e); process.exit(1); });
