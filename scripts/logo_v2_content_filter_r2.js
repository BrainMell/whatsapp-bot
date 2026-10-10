// ============================================
// LOGO DATASET V2 CONTENT FILTER ROUND 2 (2026-10-09)
// ============================================
// Round 1 caught direct P31 hits; subclasses dodged it (municipality-of-the-
// Netherlands != Q15284 directly). This round uses SPARQL with the transitive
// class path (wdt:P31/wdt:P279*) over ALL remaining entries — one query per
// 250 qids — plus cheap vetoes: TLD domains (.us), language-edition wikis,
// sexual-content symbols.
// ============================================
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const UA = { headers: { "User-Agent": "ZenithQuizBot/2.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" } };

// transitive bad classes: places, settlements, admin divisions, films, TV
// programs, religious buildings, universities/museums/libraries/hospitals,
// courts, political parties
const BAD_CLASSES = [
  "Q515", "Q486972", "Q532", "Q15284", "Q56061", "Q10864048", "Q82794",
  "Q11424", "Q5398426", "Q15416", "Q24856", // film / tv series / tv program / series
  "Q16970", "Q2977", "Q32815", // church building / cathedral / mosque
  "Q3918", "Q33506", "Q7075", "Q16917", "Q9842", // uni / museum / library / hospital / school building?
  "Q10498148", "Q7278", "Q41487", // court / political party / ? election-ish
];
const TLD_RE = /^\.[a-z]{2,}$/i;
const SEXUAL_RE = /(bdsm|porn|erotic|sex\b|brothel|striptease)/i;
const WIKI_EDITION_RE = /(wikipedia|wikimedia|wikinews|wiktionary|wikivoyage)/i;

async function sparqlBad(ids) {
  const bad = BAD_CLASSES.map((c) => `wd:${c}`).join(" ");
  const items = ids.map((id) => `wd:${id}`).join(" ");
  const q = `SELECT ?item WHERE {
    VALUES ?item { ${items} }
    ?item wdt:P31/wdt:P279* ?bad .
    VALUES ?bad { ${bad} }
  }`;
  const r = await axios.get(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}&format=json`, { ...UA, timeout: 90000 });
  return new Set((r.data?.results?.bindings || []).map((b) => b.item.value.split("/").pop()));
}

(async () => {
  const dataPath = path.join(__dirname, "..", "data", "logoDataset.json");
  const ds = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const brands = ds.brands;
  console.log(`round 2: ${brands.length} entries`);

  // cheap vetoes first
  const kept1 = [];
  const dropped = [];
  for (const b of brands) {
    if (TLD_RE.test(b.name)) { dropped.push(`${b.name}: tld-domain`); continue; }
    if (SEXUAL_RE.test(b.name)) { dropped.push(`${b.name}: sexual-content`); continue; }
    if (WIKI_EDITION_RE.test(b.name) && !/^(wikipedia|wikimedia)$/.test(b.name.trim())) {
      dropped.push(`${b.name}: wiki-language-edition`); continue;
    }
    kept1.push(b);
  }
  console.log(`cheap vetoes: -${brands.length - kept1.length}`);

  // transitive class check (batches of 250)
  const badSet = new Set();
  const withQid = kept1.filter((b) => b.qid);
  for (let i = 0; i < withQid.length; i += 250) {
    const ids = withQid.slice(i, i + 250).map((b) => b.qid);
    try {
      const bad = await sparqlBad(ids);
      for (const q of bad) badSet.add(q);
      console.log(`  batch ${i}-${i + ids.length}: cumulative bad=${badSet.size}`);
    } catch (e) { console.log(`sparql batch at ${i} failed: ${String(e.message).slice(0, 80)}`); }
    await new Promise((r) => setTimeout(r, 400));
  }

  const kept = kept1.filter((b) => {
    if (b.qid && badSet.has(b.qid)) { dropped.push(`${b.name}: transitive-class-block`); return false; }
    return true;
  });

  ds.brands = kept;
  ds.count = kept.length;
  ds.gates = [...(ds.gates || []), "content-filter-r2: transitive P31/P279* blocklist (places/films/institutions) + tld/wiki-edition/sexual vetoes"];
  ds.filteredAt = new Date().toISOString();
  fs.writeFileSync(dataPath, JSON.stringify(ds, null, 1));
  fs.appendFileSync(path.join(__dirname, "..", "data", "logoDataset.report.txt"),
    `\n\nCONTENT FILTER R2 - ${ds.filteredAt}\nkept: ${kept.length} | dropped: ${dropped.length}\n` +
    dropped.map((d) => `  - ${d}`).join("\n"));
  console.log(`FINAL: kept ${kept.length}, dropped ${dropped.length}`);
  console.log(dropped.slice(0, 40).map((d) => `  - ${d}`).join("\n"));
})().catch((e) => { console.error("FILTER R2 CRASH:", e); process.exit(1); });
