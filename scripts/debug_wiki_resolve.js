// debug_wiki_resolve.js — per-name resolution trace for one franchise
const w = require(path_join("../core/utils/wikiEntityImages"));
function path_join(p) { return require("path").join(__dirname, p); }

(async () => {
  const fr = process.argv[2] || "gta";
  const reg = w.W[fr];
  if (!reg) { console.log("no registry for", fr); process.exit(1); }
  console.log(`franchise=${fr} qualifier=${reg.q}`);
  const out = await w.resolveFranchisePortraits(fr, reg.q, reg.names, { difficulty: "easy", limit: 15 });
  console.log(`resolved=${out.length}/${reg.names.length}`);
  for (const p of out) console.log(`  + ${p.name}  via ${p.method}  ${p.article || ""} ${p.w}x${p.h}`);
  const names = new Set(out.map((p) => p.name));
  for (const n of reg.names) if (!names.has(n)) console.log(`  - ${n}  (miss)`);
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
