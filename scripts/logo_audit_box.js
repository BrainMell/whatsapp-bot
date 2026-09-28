// On-box logo audit: pull sample images through the bot's OWN downloadMedia
// (got-scraping fallback beats the Commons rate-limit that blocks plain HTTP).
// Writes /tmp/logo_audit/<name>.<ext> + a manifest for the sandbox to fetch.
process.chdir("/home/ubuntu/whatsapp-bot");
const fs = require("fs");
const quizLore = require("/home/ubuntu/whatsapp-bot/core/games/quizLore");
const ds = require("/home/ubuntu/whatsapp-bot/data/logoDataset.json");
const POOL = require("/home/ubuntu/whatsapp-bot/core/games/quizLogosPool.js");

(async () => {
  fs.mkdirSync("/tmp/logo_audit", { recursive: true });
  // deterministic sample covering all 14 categories + known-suspect names
  const suspects = ["Supreme", "Omega", "Mars", "Mango", "Bolt", "IBM", "Paris Saint-Germain", "DreamWorks", "Caterpillar", "CVS", "O2", "Nivea", "Vans", "Seat", "Fiat", "Zomato", "Paramount", "Under Armour", "Apple Pay", "Pringles", "Popeyes", "IPL", "Dallas Cowboys", "NBA"];
  const poolNames = new Set();
  for (const cat of Object.keys(POOL)) { (POOL[cat] || []).forEach((b) => poolNames.add(b.name)); }
  const dsBy = new Map(ds.brands.map((b) => [b.name, b]));
  // prioritize suspects present in dataset; then fill to 40 with category spread
  const picks = [];
  const seen = new Set();
  for (const n of suspects) { const b = dsBy.get(n); if (b && !seen.has(b.name)) { picks.push(b); seen.add(b.name); } }
  const cats = {};
  for (const b of ds.brands) {
    if (picks.length >= 40) break;
    const poolCat = [...poolNames].length ? null : null; // pool cat lookup below
    if (!seen.has(b.name) && picks.length < 40) { picks.push(b); seen.add(b.name); }
  }
  const manifest = [];
  for (const b of picks) {
    const enc = encodeURIComponent(b.file.replace(/\s/g, " "));
    const hosts = ["https://commons.wikimedia.org/wiki/Special:FilePath/", "https://en.wikipedia.org/wiki/Special:FilePath/"];
    let ok = false, bytes = 0;
    for (const h of hosts) {
      const dl = await quizLore.downloadMedia(`${h}${enc}?width=320`, "image").catch(() => null);
      if (dl && dl.buf && dl.buf.length > 800) {
        const ext = (b.mime || "").endsWith("png") ? "png" : (b.mime || "").endsWith("webp") ? "webp" : "jpg";
        const fn = `/tmp/logo_audit/${b.name.replace(/[/ ]/g, "_")}.${ext}`;
        fs.writeFileSync(fn, dl.buf);
        manifest.push({ name: b.name, file: b.file, source: b.source, local: fn, bytes: dl.buf.length });
        ok = true; bytes = dl.buf.length;
        break;
      }
    }
    console.log(`${ok ? "OK " : "ERR"} ${b.name} ${bytes ? bytes + "B" : ""} <- ${b.file.slice(0, 60)}`);
  }
  fs.writeFileSync("/tmp/logo_audit/manifest.json", JSON.stringify(manifest, null, 1));
  console.log(`manifest: ${manifest.length} entries`);
  process.exit(0);
})().catch((e) => { console.error("AUDIT CRASH:", e.message); process.exit(2); });
