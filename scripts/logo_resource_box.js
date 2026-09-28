// On-box logo re-source: for flagged brands, search enwiki File NS via the
// bot's quizLore.wikiApi, download top candidates via downloadMedia, and
// bundle everything for manual vision inspection.
process.chdir("/home/ubuntu/whatsapp-bot");
const fs = require("fs");
const quizLore = require("/home/ubuntu/whatsapp-bot/core/games/quizLore");
const axios = require("axios");
const _http = axios.create({ timeout: 15000, family: 4 });
const WP_UA = { "User-Agent": "ZenithQuizBot/1.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" };
async function wpSearch(query, limit) {
  const r = await _http.get("https://en.wikipedia.org/w/api.php", {
    params: { action: "query", list: "search", srsearch: query, srnamespace: 6, srlimit: limit, format: "json", formatversion: 2 },
    headers: WP_UA,
  });
  return (r.data?.query?.search || []).map((h) => h.title);
}

const FLAGGED = {
  "Supreme": "Supreme (brand)",
  "Omega": "Omega SA",
  "Mars": "Mars, Incorporated",
  "Mango": "Mango (retailer)",
  "Bolt": "Bolt (company)",
  "IBM": "IBM",
  "Under Armour": "Under Armour",
  "CVS": "CVS Pharmacy",
  "Taco Bell": "Taco Bell",
  "Paris Saint-Germain": "Paris Saint-Germain F.C.",
};

(async () => {
  fs.mkdirSync("/tmp/logo_resource", { recursive: true });
  const out = {};
  for (const [brand, wiki] of Object.entries(FLAGGED)) {
    console.log(`== ${brand} (${wiki})`);
    let cands = [];
    try { cands = await wpSearch(`${wiki} logo`, 8); } catch (e) { console.log("  search fail:", e.message); }
    try { cands.push(...(await wpSearch(`${brand} logo`, 4))); } catch { }
    // heuristic ordering: logo in name good; old years / junk words bad
    const scored = cands.map((t) => {
      const low = t.toLowerCase();
      let s = 0;
      if (low.includes("logo")) s += 2;
      for (let y = 1970; y < 2015; y++) if (low.includes(String(y))) s -= 2;
      for (const w of ["icon", "sign", "building", "store", "product", "headquarters"]) if (low.includes(w)) s -= 2;
      return { s, t };
    }).sort((a, b) => b.s - a.s).slice(0, 4);
    out[brand] = { wiki, candidates: scored.map((x) => x.t) };
    let i = 0;
    for (const { t } of scored) {
      const enc = encodeURIComponent(t.replace(/^File:/, "").replace(/\s/g, " "));
      const dl = await quizLore.downloadMedia(`https://commons.wikimedia.org/wiki/Special:FilePath/${enc}?width=320`, "image").catch(() => null);
      if (dl && dl.buf && dl.buf.length > 800) {
        const ext = (dl.mime || "").endsWith("png") ? "png" : (dl.mime || "").endsWith("webp") ? "webp" : "jpg";
        const fn = `/tmp/logo_resource/${brand.replace(/[/ ]/g, "_")}_${i}.${ext}`;
        fs.writeFileSync(fn, dl.buf);
        out[brand][`cand${i}`] = { title: t, local: fn, bytes: dl.buf.length };
        console.log(`   cand${i}: ${t} (${dl.buf.length}B)`);
        i++;
      } else {
        console.log(`   cand${i}: ${t} DOWNLOAD-FAIL`);
      }
      if (i >= 3) break;
    }
  }
  fs.writeFileSync("/tmp/logo_resource/candidates.json", JSON.stringify(out, null, 1));
  console.log("saved /tmp/logo_resource/candidates.json");
  process.exit(0);
})().catch((e) => { console.error("CRASH:", e); process.exit(2); });
