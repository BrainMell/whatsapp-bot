// ============================================
// LOGO DATASET REFINEMENT PASS (2026-09-28)
// ============================================
// Visual audit of the first bake surfaced four leak classes the bake-time
// gates missed - each maps to an owner complaint:
//   1. photos masquerading as logos (Peugeot: a 2021 car photo)   -> mismatch
//   2. century-old trademark scans (Dr Pepper "trade mark 1910") -> outdated
//   3. old-version logos with a year in the name (Gucci 1960s)   -> outdated
//   4. wordmark-only artwork where a symbol variant exists       -> wordmark
//        (some brands' canonical logo IS text - those stay, but only after
//         a symbol alternative was searched for and not found)
// Re-audits EVERY entry of data/logoDataset.json and upgrades in place.
// ============================================
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const imageGate = require("../core/utils/imageGate");

const UA = { headers: { "User-Agent": "ZenithQuizBot/1.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" } };
const get = (url, raw) => axios.get(url, { ...UA, ...(raw ? { responseType: "arraybuffer" } : {}), timeout: 25000, maxRedirects: 5 });
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const WORDMARK_RE = /(wordmark|word mark|word-mark|logotype|logogram|lettering|typography|spelled|\btext\b)/i;
const PHOTO_RE = /(photograph|photo\b|picture|\.jpg$|\.jpeg$)/i;
const NOISE_RE = /(trade mark|trademark|cover|poster|screenshot|advert|commercial\b)/i;
const ICON_RE = /(icon|symbol|emblem|monogram)/i;
const CUR_YEAR = new Date().getFullYear();

// years in the filename; an open-ended "(2021-)" / "2017-present" keeps it current
function yearsInfo(file) {
  const years = [...file.matchAll(/\b(19\d\d|20\d\d)s?\b/g)].map((m) => parseInt(m[1], 10));
  const openEnded = /(19\d\d|20\d\d)s?\s*(-|–|—|to\s*present|\/|,)\s*(present)?/i.test(file) || /present/i.test(file);
  if (!years.length) return { old: false, years };
  const maxY = Math.max(...years);
  return { old: !openEnded && maxY < CUR_YEAR - 3, years, maxY, openEnded };
}

async function renderLogo(file, hostIdx = 0) {
  const enc = encodeURIComponent(file.replace(/\s/g, " "));
  const hosts = ["https://commons.wikimedia.org/wiki/Special:FilePath/", "https://en.wikipedia.org/wiki/Special:FilePath/"];
  for (const h of hosts) {
    try {
      const r = await get(`${h}${enc}?width=480`, true);
      if (r.status === 200 && r.data && r.data.length > 800) return { buf: Buffer.from(r.data), mime: r.headers["content-type"] || "image/png" };
    } catch { /* next host */ }
  }
  return null;
}

async function gateRendered(buf) {
  const gate = await imageGate.inspectImageBuffer(buf, { minW: 64, minH: 40, label: "refine" }).catch(() => ({ ok: false }));
  if (!gate.ok) return null;
  const ratio = gate.width / Math.max(1, gate.height);
  if (ratio > 2.6 || ratio < 0.25) return null;
  return { w: gate.width, h: gate.height, ratio: Number(ratio.toFixed(2)) };
}

async function enwikiLogoSearch(brand, symbolBias = false) {
  const anchors = [...new Set([brand.wiki, brand.name].map(norm))].filter(Boolean);
  const base = symbolBias
    ? [`${brand.name} icon`, `${brand.name} symbol`, `${brand.name} emblem`, `${brand.wiki} icon`, `${brand.wiki} symbol`]
    : [`${brand.name} logo`, `${brand.wiki} logo`];
  const seen = new Set();
  let candidates = [];
  for (const q of base) {
    const u = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=10&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|size&format=json`;
    try {
      const r = await get(u);
      for (const p of Object.values(r.data?.query?.pages || {})) {
        if (!p.imageinfo || !p.imageinfo[0]) continue;
        const ii = p.imageinfo[0];
        const title = p.title.replace(/^file:/i, "");
        const t = norm(title);
        if (seen.has(t)) continue;
        seen.add(t);
        if (!anchors.some((a) => t.startsWith(a))) continue;
        if (!/(logo|symbol|icon|emblem|monogram)/.test(t)) continue;
        if (WORDMARK_RE.test(t) || PHOTO_RE.test(t) || NOISE_RE.test(t)) continue;
        if (yearsInfo(title).old) continue;
        const w = Number(ii.width) || 0, h = Number(ii.height) || 0;
        const ratio = w > 0 && h > 0 ? w / h : 1;
        if (ratio > 2.6 || ratio < 0.25) continue;
        const isIcon = ICON_RE.test(t);
        const isExact = anchors.some((a) => t === `${a} logo` || t === `${a}-logo`);
        const mimeScore = /svg|png/i.test(ii.mime || "") ? 2 : 0;
        candidates.push({
          title,
          score: (isIcon ? 30 : 0) + (isExact ? 25 : 0) + (ratio >= 0.6 && ratio <= 1.9 ? 20 : 0) + mimeScore * 10,
        });
      }
    } catch { /* next query */ }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates.slice(0, 4)) {
    const rendered = await renderLogo(c.title).catch(() => null);
    if (!rendered || rendered.buf.length < 1500) continue;
    const g = await gateRendered(rendered.buf);
    if (!g) continue;
    return {
      file: c.title,
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(c.title)}?width=480`,
      mime: rendered.mime, ...g, bytes: rendered.buf.length,
    };
  }
  return null;
}

(async () => {
  const dataPath = path.join(__dirname, "..", "data", "logoDataset.json");
  const ds = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  console.log(`refining ${ds.brands.length} entries...`);
  const kept = [];
  const dropped = [];
  let upgraded = 0;

  for (const b of ds.brands) {
    const t = norm(b.file);
    // rule 1+2: photos / noise / jpeg-without-logo-word -> mismatch class
    if (PHOTO_RE.test(t) || NOISE_RE.test(t) || (/image\/(jpe?g)/i.test(b.mime || "") && !/(logo|symbol|icon|emblem)/.test(t))) {
      // try to REPLACE with a clean current logo before dropping the brand
      const rep = await enwikiLogoSearch(b, false).catch(() => null);
      if (rep) { kept.push({ ...b, ...rep, source: "enwiki-file-search", note: `replaced:${b.file}` }); upgraded += 1; }
      else dropped.push({ ...b, why: "photo-or-noise" });
      continue;
    }
    // rule 3: outdated by filename year (unless open-ended "2017-present")
    const y = yearsInfo(b.file);
    if (y.old) {
      const rep = await enwikiLogoSearch(b, false).catch(() => null);
      if (rep) { kept.push({ ...b, ...rep, source: "enwiki-file-search", note: `replaced-outdated(${y.maxY}):${b.file}` }); upgraded += 1; }
      else dropped.push({ ...b, why: `outdated-year(${y.maxY})` });
      continue;
    }
    // rule 4: wordmark-ish -> search a symbol variant once; keep wordmark if none
    if (!ICON_RE.test(t) && b.ratio > 1.4) {
      const alt = await enwikiLogoSearch(b, true).catch(() => null);
      if (alt) {
        kept.push({ ...b, ...alt, source: "enwiki-file-search", note: `upgraded-from:${b.file}` });
        upgraded += 1;
      } else {
        kept.push(b);
      }
      continue;
    }
    kept.push(b);
    if (kept.length % 60 === 0) console.log(`  ...${kept.length + dropped.length}/${ds.brands.length}`);
  }

  const out = { ...ds, refinedAt: new Date().toISOString(), count: kept.length, brands: kept };
  fs.writeFileSync(dataPath, JSON.stringify(out, null, 1));
  const rep = [
    `REFINEMENT PASS - ${out.refinedAt}`,
    `kept: ${kept.length} | dropped: ${dropped.length} | symbol-upgraded: ${upgraded}`,
    ``,
    `dropped entries:`,
    ...dropped.map((d) => `  [${d.cat}] ${d.name}: ${d.why} (${d.file})`),
  ].join("\n");
  fs.appendFileSync(path.join(__dirname, "..", "data", "logoDataset.report.txt"), "\n\n" + rep);
  console.log(rep.split("\n").slice(0, 3).join("\n"));
})().catch((e) => { console.error("REFINE CRASH:", e); process.exit(1); });
