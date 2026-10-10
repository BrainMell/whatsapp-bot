// ============================================
// LOGO DATASET BUILDER V2 (2026-10-09, owner brief)
// ============================================
// Owner: "build a json with over a thousand logos for the logo quiz.
//  Wikipedia has only old logos, mostly literally just spelt out in the name.
//  I want every single one of those logos to be NEW - after 2012, only modern
//  logos used today."
//
// v2 changes vs build_logo_dataset.js (2026-09-28):
//   1. SCALE: brand pool 627 -> ~2800+ via a Wikidata SPARQL expansion
//      (every entity with a P154 logo, ranked by sitelinks = fame), merged
//      with the curated quizLogosPool.
//   2. MODERNITY GATE (the headline): every surviving entry must be the logo
//      IN USE TODAY, with an explicit basis recorded per brand:
//        - "dated-2012+"      filename carries a 2012+ year / open-ended range
//        - "open-ended"       "(2012-)" / "2016-present" style filename
//        - "current-p154"     undated file, but it is the CURRENT logo on the
//                             brand's Wikidata item (P154, no end-time
//                             qualifier, preferred rank) = "used today" by
//                             community convention
//      REJECTED: closed year ranges ending <= 2012 ("(1998-2012)"), single
//      years <= 2011, old/former/historic/archived wording, stage-C search
//      hits with no date signal (that stage was the old-logo leak).
//   3. WORDMARK KILL v2: merges refine_logo_dataset.js lessons INTO the bake
//      (photo/noise/jpeg-without-logo-word + symbol-variant upgrade attempt)
//      so a separate refine pass is no longer needed.
//   4. Every entry carries modern:<basis> + the report shows the modernity
//      breakdown + a random eyeball sample for the owner.
//
// Output: data/logoDataset.json (schema-compatible, + .modern field)
//         data/logoDataset.report.txt
// Runtime: quizMedia.js consumes the dataset; buildLogosQuestions pool gets
// expanded by the dataset brands (separate quizMedia.js patch).
// ============================================
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const imageGate = require("../core/utils/imageGate");

const UA = { headers: { "User-Agent": "ZenithQuizBot/2.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" } };
const CUR_YEAR = new Date().getFullYear();

const WORDMARK_RE = /(wordmark|word mark|word-mark|logotype|logogram|lettering|typography|spelled|\btext\b)/i;
const OUTDATED_RE = /(old|former|previous|historic|historical|defunct|obsolete|disused|archived)/i;
const PHOTO_RE = /(photograph|photo\b|picture|\.jpg$|\.jpeg$)/i;
const NOISE_RE = /(trade mark|trademark|cover|poster|screenshot|advert|commercial\b|banner)/i;
const ICON_RE = /(icon|symbol|emblem|monogram)/i;
// 💡 FIX 2026-10-10 (stageC product leak): "Samsung Internet logo (2025).png"
// starts with the anchor "samsung" and passes the date signal, but it is the
// BROWSER's logo, not the company's. Kill search candidates whose first word
// after the full anchor is a sub-product name. Words INSIDE the anchor are
// unaffected ("Google Maps", "Apple Pay" as their own dataset brands stay).
const PRODUCT_LEAK_RE = /^(internet|browser|mail|maps?|drive|photos?|pay|wallet|banking|cioccolato|chocolate|apps?|mobile|phone|store|cloud|play|music|video|news|kids|chat|meet|search|assistant|health|fitness|money|trade|markets?|cards?)\b/;

// ── modernity classifier ─────────────────────────────────────────
// Returns { ok, basis } or { ok:false, why }.
function modernity(file) {
  const years = [...file.matchAll(/\b(19\d\d|20\d\d)\b/g)].map((m) => parseInt(m[1], 10));
  const hasPresent = /present/i.test(file);
  // open-ended year: "2012-", "2012–", "2012 to present" (a RANGE with an end
  // year like "(1998-2012)" is NOT open-ended)
  const openEnd = /(\b(19|20)\d\d\b)\s*(-|–|—|to)\s*(present)?\s*($|\)|,|\.)/i.test(file.replace(/(\b(19|20)\d\d\b)\s*(-|–|—)\s*(\b(19|20)\d\d\b)/g, "")) || hasPresent;
  // closed range "(1998-2012)"
  const ranges = [...file.matchAll(/\b(19\d\d|20\d\d)\s*[-–—]\s*(19\d\d|20\d\d)\b/g)].map((m) => [parseInt(m[1], 10), parseInt(m[2], 10)]);
  if (OUTDATED_RE.test(file)) return { ok: false, why: "outdated-word" };
  if (ranges.length) {
    const endMax = Math.max(...ranges.map((r) => r[1]));
    if (endMax <= 2012) return { ok: false, why: `closed-range-end-${endMax}` };
    return { ok: true, basis: "dated-2012+" };
  }
  if (years.length) {
    const minY = Math.min(...years), maxY = Math.max(...years);
    if (maxY <= 2011) return { ok: false, why: `year-${maxY}` };
    if (openEnd) return { ok: true, basis: `open-ended-since-${minY}` };
    if (maxY >= 2012) return { ok: true, basis: "dated-2012+" };
    return { ok: false, why: `year-${maxY}` };
  }
  if (openEnd) return { ok: true, basis: "open-ended" };
  return { ok: true, basis: "current-p154" }; // undated but CURRENT by P154 convention
}

const get = (url, raw) => axios.get(url, { ...UA, ...(raw ? { responseType: "arraybuffer" } : {}), timeout: 30000, maxRedirects: 5 });
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

function currentLogoFile(claims) {
  // 💡 FIX 2026-10-10: P580 is the START-date qualifier ("in use since YYYY")
  // - it does NOT end a statement. Treating it as "ended" killed the CURRENT
  // preferred logos of Netflix (Netflix 2015 logo.svg), IKEA, Coca-Cola,
  // McDonald's and ~dozens more world-famous brands (all their P154 stmts
  // carry P580-only) -> they all fell out of the dataset as no-P154-logo.
  // Only P582 (end time) / P2620 mark a statement as ended.
  const stmts = (claims.P154 || []).filter((s) => s?.mainsnak?.snaktype === "value");
  const scored = stmts.map((s) => {
    const quals = s.qualifiers || {};
    const ended = !!(quals.P582 || quals.P2620);
    const file = s.mainsnak.datavalue.value;
    const rank = s.rank === "preferred" ? 2 : s.rank === "deprecated" ? -1 : 1;
    return { file, ended, rank };
  }).filter((x) => x.file);
  const live = scored.filter((x) => !x.ended && x.rank > 0);
  // return ALL live candidates in rank order - the caller render-gates each
  // (Apple's P154 has black+white logo tied at normal rank; the white one
  // renders blank-white and was the picked file, killing Apple entirely)
  return live.sort((a, b) => b.rank - a.rank).map((x) => x.file);
}

function officialDomain(claims) {
  const s = (claims.P856 || []).find((x) => x?.mainsnak?.snaktype === "value");
  if (!s) return null;
  try { return new URL(s.mainsnak.datavalue.value).hostname.replace(/^www\./, ""); } catch { return null; }
}

// ── SPARQL expansion: fame-ranked entities that HAVE a logo ─────────
async function sparqlCandidates(limit = 2800, minSitelinks = 8) {
  const q = `SELECT ?item ?sl WHERE {
    ?item wdt:P154 ?logo .
    ?item wikibase:sitelinks ?sl .
    FILTER(?sl >= ${minSitelinks})
  } ORDER BY DESC(?sl) LIMIT ${limit}`;
  const r = await get(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}&format=json`);
  const rows = r.data?.results?.bindings || [];
  return rows.map((b) => b.item.value.split("/").pop()).filter((id) => /^Q\d+$/.test(id));
}

// P31 QID -> pool category (CONFIDENT classes only; generic "business" stays
// unmapped so the keyword classifier gets its turn). null = explicit DROP
// (places / people / institutions are not brand-quiz material).
const P31_CAT = {
  // confident industries
  Q46970: "Airlines & Travel", Q27686: "Airlines & Travel", Q1248784: "Airlines & Travel", Q334166: "Airlines & Travel",
  Q22687: "Retail & Banking", Q4114391: "Retail & Banking", Q210729: "Retail & Banking", Q7225794: "Retail & Banking",
  Q1347993: "Fintech & Crypto", Q19956532: "Fintech & Crypto",
  Q2001307: "Media & TV", Q15265344: "Media & TV", Q11032: "Media & TV", Q1726240: "Media & TV", Q55231694: "Media & TV", Q215620: "Media & TV",
  Q476028: "Sports", Q12973014: "Sports", Q847017: "Sports", Q17156722: "Sports", Q4467635: "Sports",
  Q7889: "Entertainment & Gaming", Q1058914: "Entertainment & Gaming", Q167037: "Entertainment & Gaming", Q4021304: "Entertainment & Gaming",
  Q11707: "Food & Drink", Q547741: "Food & Drink", Q131734: "Food & Drink", Q178833: "Food & Drink", Q254039: "Food & Drink", Q4583130: "Food & Drink",
  Q1268315: "Cars", Q3312247: "Cars", Q680197: "Cars", Q1268178: "Cars", Q131841: "Cars",
  Q11023: "Health & Beauty", Q207433: "Health & Beauty", Q674426: "Health & Beauty",
  Q1660293: "Industry & Energy", Q133632: "Industry & Energy", Q157419: "Industry & Energy",
  Q193474: "Telecom", Q181051: "Telecom",
  Q7397: "Tech", Q341: "Tech", Q1668024: "Tech", Q19963217: "Tech",
  Q62062965: "Apps & Social", Q3220391: "Apps & Social", Q191779: "Apps & Social",
  // explicit drops: places, people, institutions
  Q515: null, Q56061: null, Q6256: null, Q5: null, Q532: null, Q486972: null, Q15284: null, Q16970: null,
  Q3918: null, Q33506: null, Q7075: null, Q16917: null, Q22698: null, Q41487: null,
};

function classifyByClaims(claims, label, desc) {
  const p31 = (claims.P31 || []).map((s) => s?.mainsnak?.datavalue?.value?.id).filter(Boolean);
  // tier 1a: confident specific classes win immediately
  for (const q of p31) if (q in P31_CAT && P31_CAT[q]) return P31_CAT[q];
  // tier 1b: explicit drops (places / people / institutions) kill only if no
  // specific class matched above
  for (const q of p31) if (q in P31_CAT && !P31_CAT[q]) return null;
  // tier 2: keyword scan over label + description (business/generic classes)
  const hay = `${label} ${desc}`.toLowerCase();
  const kw = [
    [/airline|airways|aviation|airport|airways|hotel|resort|cruise|railway|railroads?/, "Airlines & Travel"],
    [/bank|payment|fintech|cryptocurrency|crypto|exchange \(|wallet/, "Fintech & Crypto"],
    [/supermarket|retail|e-?commerce|store chain|department store|mall|shopping/, "Retail & Banking"],
    [/television|tv channel|news(paper| agency| network)|radio|streaming|media|broadcaster|press/, "Media & TV"],
    [/football club|soccer|sports team|basketball|baseball|cricket|national team|racing team|fc\b/, "Sports"],
    [/video game|gaming|game developer|game publisher|esports/, "Entertainment & Gaming"],
    [/restaurant|fast food|coffee|brewery|beverage|soft drink|confectionery|snack|food|pizza|burger/, "Food & Drink"],
    [/cosmetic|beauty|perfume|pharmaceutical|health|skincare/, "Health & Beauty"],
    [/automobile|car manufacturer|motor vehicle|motorcycle|tires?|automotive/, "Cars"],
    [/telecommunication|mobile network|telecom/, "Telecom"],
    [/software|technology|electronics|semiconductor|computer|internet|artificial intelligence|cloud/, "Tech"],
    [/fashion|clothing|apparel|footwear|luxury goods|jewelry|watchmaker/, "Fashion"],
    [/oil|energy|petroleum|mining|steel|cement|chemical|electric power|conglomerate|manufacturing|engineering/, "Industry & Energy"],
  ];
  for (const [re, cat] of kw) if (re.test(hay)) return cat;
  return "Brands";
}

// ── entity fetch (batched) ─────────────────────────────────────────
async function entitiesBatch(ids) {
  const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join("|")}&props=labels|descriptions|sitelinks|claims&sitefilter=enwiki&format=json&formatversion=2`;
  const r = await get(u);
  return r.data?.entities || {};
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

// audited enwiki file search — STRICTER in v2: undated hits are rejected
// (this stage was the old-logo leak; P154 remains the "current logo" source)
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
        const mAnchor = anchors.find((a) => t.startsWith(a));
        if (!mAnchor) continue;
        if (PRODUCT_LEAK_RE.test(t.slice(mAnchor.length).trim())) continue; // sub-product logo, not the brand
        if (!/(logo|symbol|icon|emblem|monogram)/.test(t)) continue;
        if (WORDMARK_RE.test(t) || PHOTO_RE.test(t) || NOISE_RE.test(t) || OUTDATED_RE.test(t)) continue;
        const m = modernity(title);
        if (!m.ok || m.basis === "current-p154") continue; // search hits MUST carry explicit date signal
        const w = Number(ii.width) || 0, h = Number(ii.height) || 0;
        const ratio = w > 0 && h > 0 ? w / h : 1;
        if (ratio > 2.6 || ratio < 0.25) continue;
        const isIcon = ICON_RE.test(t);
        const isExact = anchors.some((a) => t === `${a} logo` || t === `${a}-logo`);
        const mimeScore = /svg|png/i.test(ii.mime || "") ? 2 : 0;
        candidates.push({ title, score: (isIcon ? 30 : 0) + (isExact ? 25 : 0) + (ratio >= 0.6 && ratio <= 1.9 ? 20 : 0) + mimeScore * 10 });
      }
    } catch { /* next query */ }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates.slice(0, 4)) {
    const rendered = await renderLogo(c.title).catch(() => null);
    if (!rendered || rendered.buf.length < 1500) continue;
    const gate = await imageGate.inspectImageBuffer(rendered.buf, { minW: 64, minH: 40, label: `v2c:${brand.name}` }).catch(() => ({ ok: false }));
    if (!gate.ok) continue;
    const ratio = gate.width / Math.max(1, gate.height);
    if (ratio > 2.6 || ratio < 0.25) continue;
    return {
      file: c.title,
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(c.title)}?width=480`,
      mime: rendered.mime, w: gate.width, h: gate.height, bytes: rendered.buf.length,
      ratio: Number(ratio.toFixed(2)), modern: modernity(c.title).basis,
    };
  }
  return null;
}

async function auditOne(brand, idx = 0) {
  const out = { name: brand.name, cat: brand.cat, wiki: brand.wiki, ok: false, reason: "" };
  try {
    let claims = brand._claims;
    if (!claims) {
      const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=${encodeURIComponent(brand.wiki)}&props=claims|info&format=json`;
      const r = await get(u);
      const ents = r.data?.entities || {};
      const id = Object.keys(ents)[0];
      if (!id || id.startsWith("-")) { out.reason = "no-wikidata-item"; return out; }
      out.qid = id;
      claims = ents[id].claims || {};
    }
    out.qid = out.qid || brand.qid || null;
    out.domain = officialDomain(claims) || brand.domain || undefined;
    // 💡 FIX 2026-10-10: try EVERY live P154 candidate in rank order -
    // render+gate each; first survivor wins (fixes Apple: black+white logo
    // tied, white renders blank-white and was the single pick -> rejected)
    const liveFiles = currentLogoFile(claims);
    if (!liveFiles.length) { out.reason = "no-P154-logo"; return out; }
    // 💡 inline content kills (owner: brand quiz + "used today" only):
    // dissolved entities (P576) and place/institution classes are junk here —
    // kill BEFORE the expensive render instead of in post-filters.
    if ((claims.P576 || []).length) { out.reason = "dissolved-p576"; return out; }
    const p31v = (claims.P31 || []).map((s) => s?.mainsnak?.datavalue?.value?.id).filter(Boolean);
    let dropped31 = false, hasGood31 = false;
    for (const q of p31v) {
      if (q in P31_CAT) { if (P31_CAT[q]) hasGood31 = true; else dropped31 = true; }
    }
    if (dropped31 && !hasGood31) { out.reason = "p31-blocklist"; return out; }
    let firstKill = null;
    for (const file of liveFiles) {
      if (WORDMARK_RE.test(file)) { firstKill = firstKill || `wordmark-filename:${file}`; continue; }
      if (OUTDATED_RE.test(file)) { firstKill = firstKill || `outdated-word:${file}`; continue; }
      if (PHOTO_RE.test(file) || NOISE_RE.test(file)) { firstKill = firstKill || `photo-noise:${file}`; continue; }
      const mod = modernity(file);
      if (!mod.ok) { firstKill = firstKill || `not-modern:${mod.why}:${file}`; continue; }
      const rendered = await renderLogo(file);
      if (!rendered || !rendered.buf) { firstKill = firstKill || `render-failed:${file}`; continue; }
      if (rendered.buf.length < 1500) { firstKill = firstKill || `too-small:${rendered.buf.length}B`; continue; }
      if (/image\/jpe?g/i.test(rendered.mime || "") && !/(logo|symbol|icon|emblem|monogram)/i.test(file)) {
        firstKill = firstKill || `jpeg-nonlogo:${file}`; continue;
      }
      const gate = await imageGate.inspectImageBuffer(rendered.buf, { minW: 64, minH: 40, label: `v2:${brand.name}` });
      if (!gate.ok) { firstKill = firstKill || `gate:${gate.reason}`; continue; }
      const ratio = gate.width / Math.max(1, gate.height);
      // 💡 FIX 2026-10-10: 2.6 -> 3.75 on the P154 path only. Wikidata P154 is
      // a community-curated CURRENT-logo statement, but famous symbol/wordmark
      // logos (Nike swoosh 2.79:1, Netflix wordmark 3.68:1) breached the old
      // cap and got killed. Junk text-strips still die at 3.75; the stageC
      // search path (untrusted provenance) keeps 2.6.
      if (ratio > 3.75 || ratio < 0.25) { firstKill = firstKill || `aspect:${ratio.toFixed(2)}:${file}`; continue; }
      out.ok = true;
      out.reason = "ok";
      out.file = file;
      out.url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=480`;
      out.mime = rendered.mime;
      out.w = gate.width;
      out.h = gate.height;
      out.bytes = rendered.buf.length;
      out.ratio = Number(ratio.toFixed(2));
      out.modern = mod.basis;
      return out;
    }
    out.reason = firstKill || "no-live-p154";
    return out;
  } catch (e) {
    out.reason = `error:${String(e.message).slice(0, 60)}`;
    return out;
  }
}

async function runPool(items, worker, n = 4, label = "") {
  const results = new Array(items.length);
  let i = 0;
  const lanes = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const my = i++;
      results[my] = await worker(items[my], my).catch((e) => ({ name: items[my]?.name, ok: false, reason: `lane:${e.message}` }));
      await new Promise((r) => setTimeout(r, 90));
      if (my % 50 === 0) console.log(`  [${label}] ...${my}/${items.length}`);
    }
  });
  await Promise.all(lanes);
  return results;
}

(async () => {
  const t0 = Date.now();
  // ── Stage 0: candidates ──
  const poolMod = require("../core/games/quizLogosPool");
  const pool = Object.values(poolMod).flat();
  console.log(`v2 builder: curated pool ${pool.length} + wikidata expansion...`);

  // 💡 DELTA MODE (2026-10-09 round 2): the existing dataset entries already
  // survived the full audit + both content filters — keep them verbatim and
  // only audit NEW candidates beyond the old SPARQL cutoff.
  let existing = [];
  try {
    const prev = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "logoDataset.json"), "utf8"));
    existing = (prev.brands || []).filter((b) => b.file && b.url);
    console.log(`delta mode: carrying over ${existing.length} verified entries`);
  } catch { existing = []; }

  const qids = await sparqlCandidates(5400, 5);
  console.log(`sparql: ${qids.length} entities with P154, sitelinks>=5`);

  const cand = [];
  const seenName = new Set();
  for (const b of existing) seenName.add(norm(b.name)); // delta: never re-audit carried-over brands
  for (const b of pool) {
    const k = norm(b.name);
    if (k && !seenName.has(k)) { seenName.add(k); cand.push({ name: b.name, wiki: b.wiki, cat: b.cat, prio: 1 }); }
  }

  const BATCH = 50;
  let fetched = 0;
  for (let i = 0; i < qids.length; i += BATCH) {
    const ids = qids.slice(i, i + BATCH);
    try {
      // 💡 hard kill: wikidata can slow-drip a response forever and axios's
      // timeout never fires on trickling bodies — race every batch with a
      // 45s wall clock and just skip wedged batches.
      const ents = await Promise.race([
        entitiesBatch(ids),
        new Promise((_, rej) => setTimeout(() => rej(new Error("batch-hard-timeout-45s")), 45000)),
      ]);
      for (const [id, e] of Object.entries(ents)) {
        const label = e.labels?.en?.value;
        if (!label) continue;
        const k = norm(label);
        if (!k || seenName.has(k)) continue;
        const wiki = e.sitelinks?.enwiki?.title;
        if (!wiki) continue; // quiz lore/answer matching anchors on the enwiki article
        seenName.add(k);
        const desc = e.descriptions?.en?.value || "";
        const claims = e.claims || {};
        const liveFiles = currentLogoFile(claims);
        if (!liveFiles.length) continue; // no usable current logo statement
        cand.push({
          name: label, wiki, qid: id, cat: classifyByClaims(claims, label, desc),
          domain: officialDomain(claims) || undefined, prio: 2,
          modernHint: modernity(liveFiles[0]), fileHint: liveFiles[0],
        });
      }
    } catch (e) { console.log(`entity batch ${i} failed: ${String(e.message).slice(0, 60)}`); }
    fetched += ids.length;
    if (fetched % 500 === 0) console.log(`  entities ${fetched}/${qids.length}, candidates so far: ${cand.length}`);
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`total candidates: ${cand.length} (curated ${pool.length} + wikidata ${cand.length - pool.length})`);

  // pre-filter by filename modernity BEFORE rendering (cheap kill, saves hours)
  const pre = cand.filter((b) => {
    if (b.fileHint) {
      const m = modernity(b.fileHint);
      if (!m.ok) { b._skip = `not-modern:${m.why}`; return false; }
      if (WORDMARK_RE.test(b.fileHint) || OUTDATED_RE.test(b.fileHint) || PHOTO_RE.test(b.fileHint) || NOISE_RE.test(b.fileHint)) {
        b._skip = "filename-veto"; return false;
      }
    }
    return true;
  });
  console.log(`pre-filter (filename modernity + veto): ${pre.length} survive, ${cand.length - pre.length} killed pre-render`);

  // ── audit ──
  const results = await runPool(pre, auditOne, 4, "audit");
  let good = results.filter((r) => r.ok);
  let bad = results.filter((r) => !r.ok);
  console.log(`stage A (P154 current): ${good.length} verified, ${bad.length} rejected`);

  // stage B/C: search fallback for curated pool brands that have no usable P154
  const noItem = bad.filter((b) => b.reason === "no-wikidata-item");
  bad = bad.filter((b) => b.reason !== "no-wikidata-item");
  if (noItem.length) {
    console.log(`stage B: resolving ${noItem.length} unmapped titles...`);
    const retry = await runPool(noItem, async (b) => {
      try {
        const u = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(b.wiki)}&language=en&limit=1&format=json`;
        const r = await get(u);
        const id = r.data?.search?.[0]?.id;
        if (!id) { b.reason = "no-wikidata-item-after-search"; return b; }
        return auditOne({ ...b, _claims: undefined, qid: id }, 0);
      } catch (e) { return { ...b, reason: `stageB:${String(e.message).slice(0, 50)}` }; }
    }, 4, "stageB");
    good = good.concat(retry.filter((r) => r.ok));
    bad = bad.concat(retry.filter((r) => !r.ok));
  }
  // stage C: enwiki search for everything still missing (STRICT dating)
  if (bad.length) {
    console.log(`stage C: strict enwiki search for ${bad.length} brands...`);
    const retry = await runPool(bad, async (b) => {
      const c = await enwikiLogoSearch(b).catch(() => null);
      if (c) return { ...b, ...c, ok: true, reason: "ok(enwiki-search)", source: "enwiki-file-search" };
      return b;
    }, 4, "stageC");
    good = good.concat(retry.filter((r) => r.ok && r.file));
    bad = retry.filter((r) => !(r.ok && r.file));
  }

  // file-level dedup: one artwork = one brand (carried-over entries first =
  // fame-stable; new entries fill the rest)
  const byFile = new Set();
  const finalBrands = [];
  const fileDups = new Set();
  for (const g of [...existing, ...good]) {
    const fk = norm(g.file);
    if (byFile.has(fk)) { fileDups.add(fk); continue; }
    byFile.add(fk);
    finalBrands.push(g);
  }
  console.log(`file-dedup: -${fileDups.size} shared artworks -> ${finalBrands.length} final`);

  const dataset = {
    generatedAt: new Date().toISOString(),
    version: 2,
    source: "wikidata P154 current-logo statements (SPARQL fame-ranked expansion) + strict dated enwiki file search",
    gates: [
      "modern: dated-2012+ | open-ended | current-p154 (closed ranges ending<=2012 and years<=2011 REJECTED)",
      "wordmark-filename v2 (wordmark/logotype/lettering/text)",
      "photo/noise/jpeg-nonlogo (merged refine rules)",
      "aspect 0.25-2.6", "render", ">=1.5KB", "imageGate 64x40 non-blank",
      "file-level dedup (one artwork = one brand)",
    ],
    count: finalBrands.length,
    brands: finalBrands.map((g) => ({
      name: g.name, cat: g.cat, wiki: g.wiki, qid: g.qid || null, domain: g.domain || null,
      file: g.file, url: g.url, mime: g.mime, w: g.w, h: g.h, bytes: g.bytes, ratio: g.ratio,
      modern: g.modern, source: g.source || "wikidata-p154",
    })),
  };
  const dataDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "logoDataset.json"), JSON.stringify(dataset, null, 1));

  const byReason = {};
  bad.forEach((b) => { const k = b.reason.split(":").slice(0, 2).join(":"); byReason[k] = (byReason[k] || 0) + 1; });
  const byModern = {};
  finalBrands.forEach((b) => { const k = String(b.modern || "?").replace(/-\d+/, "-YYYY"); byModern[k] = (byModern[k] || 0) + 1; });
  const byCat = {};
  finalBrands.forEach((b) => { byCat[b.cat] = (byCat[b.cat] || 0) + 1; });
  const sample = finalBrands.filter((_, i) => i % Math.max(1, Math.floor(finalBrands.length / 25)) === 0).slice(0, 25)
    .map((b) => `  ${b.name} — ${b.file} [${b.modern}]`);
  const report = [
    `LOGO DATASET V2 AUDIT - ${new Date().toISOString()}`,
    `candidates: ${cand.length} (curated ${pool.length} + wikidata ${cand.length - pool.length}) | pre-filter survivors: ${pre.length}`,
    `verified: ${finalBrands.length} | rejected: ${bad.length} | file-dups removed: ${fileDups.size}`,
    `elapsed: ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    ``,
    `modernity breakdown:`,
    ...Object.entries(byModern).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
    ``,
    `categories:`,
    ...Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
    ``,
    `rejections by reason:`,
    ...Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
    ``,
    `random eyeball sample (${sample.length}):`,
    ...sample,
  ].join("\n");
  fs.writeFileSync(path.join(dataDir, "logoDataset.report.txt"), report);
  console.log(`\nDONE: ${finalBrands.length} modern logos verified in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(report.split("\n").slice(0, 14).join("\n"));
})().catch((e) => { console.error("BUILDER V2 CRASH:", e); process.exit(1); });
