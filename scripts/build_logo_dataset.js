// ============================================
// LOGO DATASET BUILDER (2026-09-28, owner brief §3)
// ============================================
// "Search the web for a large, free, up-to-date collection of company logos.
//  Replace or refill the current ~500-logo dataset. Audit every entry."
//
// Source: **Wikidata P154 (logo image)** — structured, community-maintained,
// free, and CURRENT (when a brand rebrands, editors update P154; superseded
// logos carry an end-time qualifier which we treat as OUTDATED and skip).
// Matching is by wiki ITEM (wbgetentities sites=enwiki&titles=<article>) —
// authoritative identity, not fuzzy filename search, so "the image actually
// matches the company being asked about" holds by construction.
//
// Wordmark kill-chain (owner: "too many straight up spelt out word versions"):
//   1. filename words: wordmark|logotype|word mark|lettering|typography -> skip
//   2. aspect ratio: w/h > 2.6 or < 0.25 -> skip (spelled-out text is wide)
//   3. pixel gate (imageGate): min 64x40, non-blank, decodable
//   4. byte floor: <1.5KB -> placeholder
//
// Output: data/logoDataset.json  (+ data/logoDataset.report.txt)
// Runtime: quizMedia.js consumes the dataset FIRST, per-brand runtime
// Wikipedia search stays as the fallback for unresolved brands.
// ============================================
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const imageGate = require("../core/utils/imageGate");

const UA = { headers: { "User-Agent": "ZenithQuizBot/1.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" } };
const pool = (() => {
  const p = require("../core/games/quizLogosPool");
  return Object.values(p).flat();
})();

const WORDMARK_RE = /(wordmark|word mark|word-mark|logotype|logogram|lettering|typography|spelled|\btext\b)/i;
const OUTDATED_RE = /(old|former|previous|historic|defunct|obsolete|disused|1980|1990|200[0-9]_|_19\d\d)/i;

const get = (url, raw) => axios.get(url, { ...UA, ...(raw ? { responseType: "arraybuffer" } : {}), timeout: 25000, maxRedirects: 5 });

function entityFor(title) {
  const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=${encodeURIComponent(title)}&props=claims|info&format=json`;
  return get(u).then((r) => {
    const ents = r.data?.entities || {};
    const id = Object.keys(ents)[0];
    if (!id || id.startsWith("-")) return null; // "-1" = no such article
    return { qid: id, claims: ents[id].claims || {} };
  });
}

// pick the CURRENT logo statement: P154 without an end-time qualifier;
// prefer higher rank (preferred > normal), skip ones explicitly ended.
function currentLogoFile(claims) {
  const stmts = (claims.P154 || []).filter((s) => s?.mainsnak?.snaktype === "value");
  const scored = stmts.map((s) => {
    const quals = s.qualifiers || {};
    const ended = !!(quals.P582 || quals.P2620 || quals.P580); // end/deprecated-dates
    const file = s.mainsnak.datavalue.value;
    const rank = s.rank === "preferred" ? 2 : s.rank === "deprecated" ? -1 : 1;
    return { file, ended, rank };
  }).filter((x) => x.file);
  const live = scored.filter((x) => !x.ended && x.rank > 0);
  const pick = live.sort((a, b) => b.rank - a.rank)[0] || null;
  return pick ? pick.file : null;
}

function officialDomain(claims) {
  const s = (claims.P856 || []).find((x) => x?.mainsnak?.snaktype === "value");
  if (!s) return null;
  try { return new URL(s.mainsnak.datavalue.value).hostname.replace(/^www\./, ""); } catch { return null; }
}

async function renderLogo(file) {
  const enc = encodeURIComponent(file.replace(/\s/g, " "));
  const hosts = ["https://commons.wikimedia.org/wiki/Special:FilePath/", "https://en.wikipedia.org/wiki/Special:FilePath/"];
  let lastErr = null;
  for (const h of hosts) {
    try {
      const r = await get(`${h}${enc}?width=480`, true);
      if (r.status === 200 && r.data && r.data.length > 800) {
        return { buf: Buffer.from(r.data), mime: r.headers["content-type"] || "image/png" };
      }
    } catch (e) { lastErr = e; }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function auditOne(brand, idx) {
  const out = { name: brand.name, cat: brand.cat, wiki: brand.wiki, ok: false, reason: "" };
  try {
    const ent = await entityFor(brand.wiki);
    if (!ent) { out.reason = "no-wikidata-item"; return out; }
    out.qid = ent.qid;
    out.domain = officialDomain(ent.claims) || undefined;
    const file = currentLogoFile(ent.claims);
    if (!file) { out.reason = "no-P154-logo"; return out; }
    if (WORDMARK_RE.test(file)) { out.reason = `wordmark-filename:${file}`; return out; }
    if (OUTDATED_RE.test(file)) { out.reason = `outdated-filename:${file}`; return out; }
    const rendered = await renderLogo(file);
    if (!rendered || !rendered.buf) { out.reason = `render-failed:${file}`; return out; }
    if (rendered.buf.length < 1500) { out.reason = `too-small:${rendered.buf.length}B`; return out; }
    const gate = await imageGate.inspectImageBuffer(rendered.buf, { minW: 64, minH: 40, label: `dataset:${brand.name}` });
    if (!gate.ok) { out.reason = `gate:${gate.reason}`; return out; }
    const ratio = gate.width / Math.max(1, gate.height);
    if (ratio > 2.6 || ratio < 0.25) { out.reason = `aspect:${ratio.toFixed(2)}:${file}`; return out; }
    out.ok = true;
    out.reason = "ok";
    out.file = file;
    out.url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=480`;
    out.mime = rendered.mime;
    out.w = gate.width;
    out.h = gate.height;
    out.bytes = rendered.buf.length;
    out.ratio = Number(ratio.toFixed(2));
    return out;
  } catch (e) {
    out.reason = `error:${String(e.message).slice(0, 60)}`;
    return out;
  }
}

// gentle concurrency pool
async function runPool(items, worker, n = 4) {
  const results = new Array(items.length);
  let i = 0;
  const lanes = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const my = i++;
      results[my] = await worker(items[my], my).catch((e) => ({ name: items[my].name, ok: false, reason: `lane:${e.message}` }));
      await new Promise((r) => setTimeout(r, 120));
      if (my % 40 === 0) console.log(`  ...${my}/${items.length}`);
    }
  });
  await Promise.all(lanes);
  return results;
}

// ── Stage B fallback: resolve the enwiki ARTICLE's own logo via the
// pageimages property (many company articles carry the logo as page image).
// Only accepted when the rendered image passes the SAME gates; a photo of a
// headquarters or product would usually fail the aspect/blank gates but may
// occasionally slip - the vision-verify pass on the box double-checks.
// ── Stage C fallback: offline AUDITED Wikipedia file-namespace search.
// The runtime heuristic (quizLore.wikipediaLogoImage) becomes a BAKE-TIME
// decision here: candidates scored with the quizLore rubric, then the winner
// must pass render + imageGate + aspect gates before it enters the dataset.
// Unresolved brands stay on the runtime-search path (progressive quality).
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

async function enwikiLogoSearch(brand) {
  const anchors = [...new Set([brand.wiki, brand.name].map(norm))].filter(Boolean);
  const queries = [...new Set([`${brand.name} logo`, `${brand.wiki} logo`])];
  const seen = new Set();
  let candidates = [];
  for (const q of queries) {
    const u = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=10&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|size&format=json`;
    try {
      const r = await get(u);
      const pages = r.data?.query?.pages || {};
      for (const p of Object.values(pages)) {
        if (!p.imageinfo || !p.imageinfo[0]) continue;
        const ii = p.imageinfo[0];
        const title = p.title.replace(/^file:/i, "");
        const t = norm(title);
        if (seen.has(t)) continue;
        seen.add(t);
        if (!anchors.some((a) => t.startsWith(a))) continue;
        if (!/(logo|symbol|icon|emblem|monogram)/.test(t)) continue;
        if (WORDMARK_RE.test(t) || OUTDATED_RE.test(t)) continue;
        const w = Number(ii.width) || 0, h = Number(ii.height) || 0;
        const ratio = w > 0 && h > 0 ? w / h : 1;
        if (ratio > 2.6 || ratio < 0.25) continue; // pre-download wordmark kill
        const isIcon = /(icon|symbol|emblem|monogram)/.test(t);
        const isExact = anchors.some((a) => t === `${a} logo` || t === `${a}-logo` || t === `${a} logo.svg` || t === `${a} logo.png`);
        const mimeScore = /svg|png/i.test(ii.mime || "") ? 2 : /jpeg/i.test(ii.mime || "") ? 0 : 1;
        candidates.push({
          title, ii,
          score: (isIcon ? 30 : 0) + (isExact ? 25 : 0) + (ratio >= 0.6 && ratio <= 1.9 ? 20 : 0) + mimeScore * 10,
        });
      }
    } catch { /* next query */ }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates.slice(0, 3)) {
    try {
      const rendered = await renderLogo(c.title);
      if (!rendered || !rendered.buf || rendered.buf.length < 1500) continue;
      const gate = await imageGate.inspectImageBuffer(rendered.buf, { minW: 64, minH: 40, label: `dataset-c:${brand.name}` });
      if (!gate.ok) continue;
      const ratio = gate.width / Math.max(1, gate.height);
      if (ratio > 2.6 || ratio < 0.25) continue;
      return {
        file: c.title,
        url: `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(c.title)}?width=480`,
        mime: rendered.mime, w: gate.width, h: gate.height, bytes: rendered.buf.length,
        ratio: Number(ratio.toFixed(2)),
      };
    } catch { /* next candidate */ }
  }
  return null;
}

(async () => {
  console.log(`LOGO DATASET BUILDER: auditing ${pool.length} brands via Wikidata P154`);
  const t0 = Date.now();
  const results = await runPool(pool, auditOne, 4);
  let good = results.filter((r) => r.ok);
  let bad = results.filter((r) => !r.ok);
  console.log(`stage A (wikidata P154): ${good.length} verified, ${bad.length} rejected`);

  // Stage B: retry no-wikidata-item via search-based entity resolution
  const noItem = bad.filter((b) => b.reason === "no-wikidata-item");
  bad = bad.filter((b) => b.reason !== "no-wikidata-item");
  if (noItem.length) {
    console.log(`stage B: search-resolving ${noItem.length} unmapped titles...`);
    const retry = await runPool(noItem, async (b) => {
      try {
        const u = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(b.wiki)}&language=en&limit=1&format=json`;
        const r = await get(u);
        const id = r.data?.search?.[0]?.id;
        if (!id) { b.reason = "no-wikidata-item-after-search"; return b; }
        const u2 = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=claims&format=json`;
        const r2 = await get(u2);
        const claims = r2.data?.entities?.[id]?.claims || {};
        return auditOne({ ...b, wiki: b.wiki, qidOverride: id }, 0).then(async (res) => {
          if (res.ok) return res;
          // item resolved but still no logo: try the enwiki file search (stage C inline)
          const c = await enwikiLogoSearch(b).catch(() => null);
          if (c) return { ...b, ...c, qid: id, ok: true, reason: "ok(enwiki-search)", source: "enwiki-file-search" };
          return { ...b, reason: `stageC-miss:${res.reason}` };
        });
      } catch (e) { return { ...b, reason: `stageB:${String(e.message).slice(0, 50)}` }; }
    }, 4);
    good = good.concat(retry.filter((r) => r.ok));
    bad = bad.concat(retry.filter((r) => !r.ok));
    console.log(`stage B done: +${retry.filter((r) => r.ok).length} verified`);
  }

  // Stage C: audited enwiki file-namespace search for the rest
  if (bad.length) {
    console.log(`stage C: audited enwiki file search for ${bad.length} brands...`);
    const retry = await runPool(bad, async (b) => {
      const c = await enwikiLogoSearch(b).catch(() => null);
      if (c) return { ...b, ...c, ok: true, reason: "ok(enwiki-search)", source: "enwiki-file-search" };
      return b;
    }, 4);
    good = good.concat(retry.filter((r) => r.ok && r.file));
    bad = retry.filter((r) => !(r.ok && r.file));
    console.log(`stage C done: +${retry.filter((r) => r.ok && r.file).length} verified`);
  }

  const dataset = {
    generatedAt: new Date().toISOString(),
    source: "wikidata-p154 current-logo statements + audited enwiki file search (stage C marked in .source)",
    gates: ["wordmark-filename", "outdated-filename", "aspect<=2.6 pre-gate", "render", ">=1.5KB", "imageGate 64x40 non-blank", "aspect 0.25-2.6"],
    count: good.length,
    brands: good.map((g) => ({
      name: g.name, cat: g.cat, wiki: g.wiki, qid: g.qid || null, domain: g.domain || null,
      file: g.file, url: g.url, mime: g.mime, w: g.w, h: g.h, bytes: g.bytes, ratio: g.ratio,
      source: g.source || "wikidata-p154",
    })),
  };
  const dataDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "logoDataset.json"), JSON.stringify(dataset, null, 1));

  const byReason = {};
  bad.forEach((b) => { const k = b.reason.split(":").slice(0, 2).join(":"); byReason[k] = (byReason[k] || 0) + 1; });
  const report = [
    `LOGO DATASET AUDIT - ${new Date().toISOString()}`,
    `pool: ${pool.length} brands | verified: ${good.length} | rejected: ${bad.length} (${((good.length / pool.length) * 100).toFixed(1)}% pass)`,
    `elapsed: ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    ``,
    `rejections by reason:`,
    ...Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
    ``,
    `rejected brands (runtime falls back to live Wikipedia search for these):`,
    ...bad.map((b) => `  [${b.cat}] ${b.name}: ${b.reason}`),
  ].join("\n");
  fs.writeFileSync(path.join(dataDir, "logoDataset.report.txt"), report);
  console.log(`\nverified: ${good.length}/${pool.length}`);
  console.log(byReason, "\n");
  console.log(report.split("\n").slice(0, 8).join("\n"));
})().catch((e) => { console.error("BUILDER CRASH:", e); process.exit(1); });
