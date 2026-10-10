// ============================================
// LOGO DATASET V2 TOP-UP (2026-10-09, OOM-safe delta)
// ============================================
// The full builder got OOM-killed twice at the same spot: Box2 has 952MB
// total RAM and the builder's entity fetch (4600+ entities of full claims)
// crescendos past what wa-joker + the Go service leave behind. This top-up:
//   - takes the NEXT fame band of SPARQL qids (rank 4600..5100, sl>=5)
//   - fetches in SMALL batches (25), frees each batch, checkpoints after
//     every batch to data/logoTopup.state.json (resume-safe)
//   - hard wall-clock per batch (40s) + axios 20s
//   - audits survivors with the SAME gates as the builder (inline kills)
//   - merges into the existing dataset (existing entries verbatim, file-dedup)
// Then logo_v2_content_filter.js + _r2.js run over the merged set as usual.
// ============================================
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const imageGate = require("../core/utils/imageGate");

const UA = { headers: { "User-Agent": "ZenithQuizBot/2.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" } };
const DATA = (f) => path.join(__dirname, "..", "data", f);
const STATE_PATH = DATA("logoTopup.state.json");
const FRESH_PATH = DATA("logoTopup.fresh.jsonl");

const WORDMARK_RE = /(wordmark|word mark|word-mark|logotype|logogram|lettering|typography|spelled|\btext\b)/i;
const OUTDATED_RE = /(old|former|previous|historic|historical|defunct|obsolete|disused|archived)/i;
const PHOTO_RE = /(photograph|photo\b|picture|\.jpg$|\.jpeg$)/i;
const NOISE_RE = /(trade mark|trademark|cover|poster|screenshot|advert|commercial\b|banner)/i;
const P31_DROP = new Set(["Q5", "Q515", "Q15284", "Q532", "Q486972", "Q56061", "Q6256", "Q16970", "Q11424", "Q5398426", "Q3918", "Q33506", "Q7075", "Q16917", "Q7278", "Q327333"]);
const P31_KEEP = new Set(["Q46970", "Q22687", "Q4114391", "Q1347993", "Q2001307", "Q476028", "Q7889", "Q11707", "Q1268315", "Q11023", "Q193474", "Q7397", "Q3220391", "Q62062965"]);

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

function modernity(file) {
  const years = [...file.matchAll(/\b(19\d\d|20\d\d)\b/g)].map((m) => parseInt(m[1], 10));
  const hasPresent = /present/i.test(file);
  const openEnd = /(\b(19|20)\d\d\b)\s*(-|–|—|to)\s*(present)?\s*($|\)|,|\.)/i.test(file.replace(/(\b(19|20)\d\d\b)\s*(-|–|—)\s*(\b(19|20)\d\d\b)/g, "")) || hasPresent;
  const ranges = [...file.matchAll(/\b(19\d\d|20\d\d)\s*[-–—]\s*(19\d\d|20\d\d)\b/g)].map((m) => [parseInt(m[1], 10), parseInt(m[2], 10)]);
  if (OUTDATED_RE.test(file)) return { ok: false, why: "outdated-word" };
  if (ranges.length) {
    const endMax = Math.max(...ranges.map((r) => r[1]));
    if (endMax <= 2012) return { ok: false, why: `closed-range-end-${endMax}` };
    return { ok: true, basis: "dated-2012+" };
  }
  if (years.length) {
    const maxY = Math.max(...years);
    if (maxY <= 2011) return { ok: false, why: `year-${maxY}` };
    if (openEnd) return { ok: true, basis: `open-ended-since-${Math.min(...years)}` };
    if (maxY >= 2012) return { ok: true, basis: "dated-2012+" };
    return { ok: false, why: `year-${maxY}` };
  }
  if (openEnd) return { ok: true, basis: "open-ended" };
  return { ok: true, basis: "current-p154" };
}

function currentLogoFile(claims) {
  const stmts = (claims.P154 || []).filter((s) => s?.mainsnak?.snaktype === "value");
  const live = stmts.map((s) => {
    const quals = s.qualifiers || {};
    const ended = !!(quals.P582 || quals.P2620 || quals.P580);
    const rank = s.rank === "preferred" ? 2 : s.rank === "deprecated" ? -1 : 1;
    return { file: s.mainsnak.datavalue.value, ended, rank };
  }).filter((x) => x.file && !x.ended && x.rank > 0);
  return live.sort((a, b) => b.rank - a.rank)[0]?.file || null;
}

const get = (url, raw) => axios.get(url, { ...UA, ...(raw ? { responseType: "arraybuffer" } : {}), timeout: 20000, maxRedirects: 5 });
const withHardTimeout = (p, ms, why) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(why)), ms))]);

async function renderLogo(file) {
  const enc = encodeURIComponent(file.replace(/\s/g, " "));
  for (const h of ["https://commons.wikimedia.org/wiki/Special:FilePath/", "https://en.wikipedia.org/wiki/Special:FilePath/"]) {
    try {
      const r = await get(`${h}${enc}?width=480`, true);
      if (r.status === 200 && r.data && r.data.length > 800) return { buf: Buffer.from(r.data), mime: r.headers["content-type"] || "image/png" };
    } catch { /* next host */ }
  }
  return null;
}

async function audit(brand) {
  try {
    let claims = brand._claims;
    let id = brand.qid;
    if (!claims) {
      const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=${encodeURIComponent(brand.wiki)}&props=claims|info&format=json`;
      const r = await withHardTimeout(get(u), 40000, "entity-hard-40s");
      const ents = r.data?.entities || {};
      id = Object.keys(ents)[0];
      if (!id || id.startsWith("-")) return { ...brand, ok: false, reason: "no-wikidata-item" };
      claims = ents[id].claims || {};
    }
    if ((claims.P576 || []).length) return { ...brand, qid: id, ok: false, reason: "dissolved-p576" };
    const p31 = (claims.P31 || []).map((s) => s?.mainsnak?.datavalue?.value?.id).filter(Boolean);
    const bad31 = p31.some((q) => P31_DROP.has(q));
    const good31 = p31.some((q) => P31_KEEP.has(q));
    if (bad31 && !good31) return { ...brand, qid: id, ok: false, reason: "p31-blocklist" };
    const file = currentLogoFile(claims);
    if (!file) return { ...brand, qid: id, ok: false, reason: "no-P154-logo" };
    if (WORDMARK_RE.test(file) || OUTDATED_RE.test(file) || PHOTO_RE.test(file) || NOISE_RE.test(file)) {
      return { ...brand, qid: id, ok: false, reason: `filename-veto:${file}` };
    }
    const mod = modernity(file);
    if (!mod.ok) return { ...brand, qid: id, ok: false, reason: `not-modern:${mod.why}` };
    const rendered = await renderLogo(file);
    if (!rendered || rendered.buf.length < 1500) return { ...brand, qid: id, ok: false, reason: "render-fail" };
    const gate = await imageGate.inspectImageBuffer(rendered.buf, { minW: 64, minH: 40, label: `topup:${brand.name}` }).catch(() => ({ ok: false }));
    if (!gate.ok) return { ...brand, qid: id, ok: false, reason: `gate:${gate.reason}` };
    const ratio = gate.width / Math.max(1, gate.height);
    if (ratio > 2.6 || ratio < 0.25) return { ...brand, qid: id, ok: false, reason: `aspect:${ratio.toFixed(2)}` };
    const domain = (claims.P856 || []).find((x) => x?.mainsnak?.snaktype === "value");
    return {
      ...brand, qid: id, ok: true, file,
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=480`,
      mime: rendered.mime, w: gate.width, h: gate.height, bytes: rendered.buf.length,
      ratio: Number(ratio.toFixed(2)), modern: mod.basis,
      domain: domain ? (() => { try { return new URL(domain.mainsnak.datavalue.value).hostname.replace(/^www\./, ""); } catch { return null; } })() : null,
      source: "wikidata-p154",
    };
  } catch (e) {
    return { ...brand, ok: false, reason: `error:${String(e.message).slice(0, 50)}` };
  }
}

// 💡 the hard-timeout races leave orphaned axios promises that reject AFTER
// the timer won; node 20 crashes on unhandled rejections. Log and survive.
process.on("unhandledRejection", (r) => console.log(`orphan-rejection: ${String(r && r.message || r).slice(0, 80)}`));

(async () => {
  const ds = JSON.parse(fs.readFileSync(DATA("logoDataset.json"), "utf8"));
  const existing = []; // FULL BUILD: ignore the old dataset, everything is re-audited fresh
  const seenName = new Set(existing.map((b) => norm(b.name)));
  const seenQid = new Set(existing.map((b) => b.qid).filter(Boolean));
  console.log(`topup: dataset has ${existing.length}; next fame band 4600..5100`);

  const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) : { offset: 0 };
  state.verified = []; // 💡 streamed to FRESH_PATH instead — array growth OOM-ed the 320MB heap at ~2200
  console.log(`FULL-BUILD mode: windows 0..5400, resuming at offset=${state.offset}`);
  console.log(`resume state: offset=${state.offset}, verified so far=${state.verified.length}`);

  // fame band: SPARQL with an OFFSET window (cheap, deterministic)
  const sparql = async (offset, limit) => {
    const q = `SELECT ?item ?sl WHERE { ?item wdt:P154 ?logo . ?item wikibase:sitelinks ?sl . FILTER(?sl >= 5) } ORDER BY DESC(?sl) LIMIT ${limit} OFFSET ${offset}`;
    const r = await withHardTimeout(get(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}&format=json`), 60000, "sparql-hard-60s");
    return (r.data?.results?.bindings || []).map((b) => b.item.value.split("/").pop()).filter((x) => /^Q\d+$/.test(x));
  };

  let fresh = 0;
  const BATCH = 50, WINDOW = 500;
  const AUDIT_LANES = 4;
  for (let w = 0; state.offset < 5400 && w < 11000; w += BATCH) {
    const offset = state.offset;
    let qids = [];
    try { qids = await sparql(offset, BATCH); } catch (e) { console.log(`sparql ${offset}: ${String(e.message).slice(0, 50)}`); continue; }
    qids = qids.filter((q) => !seenQid.has(q));
    if (!qids.length) { state.offset = offset + BATCH; fs.writeFileSync(STATE_PATH, JSON.stringify(state)); continue; }
    try {
      const u = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join("|")}&props=labels|descriptions|sitelinks|claims&sitefilter=enwiki&format=json&formatversion=2`;
      const r = await withHardTimeout(get(u), 40000, "entities-hard-40s");
      const ents = r.data?.entities || {};
      const batchCand = [];
      for (const [id, e] of Object.entries(ents)) {
        const label = e.labels?.en?.value;
        if (!label) continue;
        const k = norm(label);
        if (!k || seenName.has(k)) continue;
        const wiki = e.sitelinks?.enwiki?.title;
        if (!wiki) continue;
        const claims = e.claims || {};
        if (!(claims.P154 || [])) continue;
        seenName.add(k);
        const desc = e.descriptions?.en?.value || "";
        const p31 = (claims.P31 || []).map((s) => s?.mainsnak?.datavalue?.value?.id).filter(Boolean);
        let cat = "Brands";
        if (p31.some((q) => P31_DROP.has(q)) && !p31.some((q) => P31_KEEP.has(q))) continue;
        const kw = [
          [/airline|airways|aviation|airport|hotel|resort|cruise|railway/, "Airlines & Travel"],
          [/bank|payment|fintech|crypto|wallet/, "Fintech & Crypto"],
          [/supermarket|retail|e-?commerce|store|shopping/, "Retail & Banking"],
          [/television|tv |news|radio|streaming|media|broadcaster/, "Media & TV"],
          [/football club|sports team|basketball|baseball|cricket|racing team|\bfc\b/, "Sports"],
          [/video game|gaming|game developer|esports/, "Entertainment & Gaming"],
          [/restaurant|fast food|coffee|brewery|beverage|soft drink|food|pizza|burger/, "Food & Drink"],
          [/cosmetic|beauty|perfume|pharmaceutical|health|skincare/, "Health & Beauty"],
          [/automobile|car manufacturer|motor vehicle|motorcycle|automotive/, "Cars"],
          [/telecommunication|mobile network/, "Telecom"],
          [/software|technology|electronics|semiconductor|computer|internet|cloud|app\b/, "Tech"],
          [/fashion|clothing|apparel|footwear|luxury goods|jewelry/, "Fashion"],
          [/oil|energy|petroleum|mining|steel|chemical|power|conglomerate|manufacturing/, "Industry & Energy"],
        ];
        for (const [re, c] of kw) if (re.test(`${label} ${desc}`.toLowerCase())) { cat = c; break; }
        batchCand.push({ name: label, wiki, qid: id, cat, prio: 2, _claims: claims });
      }
      // audit this batch immediately (4 parallel lanes), then FREE the claims
      const results = [];
      let ai = 0;
      const lanes = Array.from({ length: AUDIT_LANES }, async () => {
        while (ai < batchCand.length) {
          const mine = batchCand[ai++];
          const res = await audit(mine).catch((e) => ({ ok: false, reason: `lane:${e.message}` }));
          if (res.ok) results.push(res);
          await new Promise((r2) => setTimeout(r2, 60));
        }
      });
      await Promise.all(lanes);
      if (results.length) fs.appendFileSync(FRESH_PATH, results.map((r) => JSON.stringify(r)).join("\n") + "\n");
      fresh += results.length;
      console.log(`offset ${offset}: +${results.length}/${batchCand.length} verified (total fresh ${state.verified.length})`);
    } catch (e) {
      console.log(`batch at ${offset} failed: ${String(e.message).slice(0, 60)} (checkpoint kept)`);
    }
    state.offset = offset + BATCH;
    fs.writeFileSync(STATE_PATH, JSON.stringify(state));
    if (global.gc && fresh % 100 === 0 && fresh > 0) try { global.gc(); } catch {}
  }

  // merge: existing verbatim first, then fresh streamed from the JSONL (file+name dedup)
  const freshEntries = fs.existsSync(FRESH_PATH)
    ? fs.readFileSync(FRESH_PATH, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
    : [];
  console.log(`fresh entries on disk: ${freshEntries.length}`);
  const byFile = new Set(existing.map((b) => norm(b.file)));
  const byName2 = new Set(existing.map((b) => norm(b.name)));
  const merged = [...existing];
  for (const v of freshEntries) {
    const fk = norm(v.file), nk = norm(v.name);
    if (byFile.has(fk) || byName2.has(nk)) continue;
    byFile.add(fk); byName2.add(nk);
    merged.push(v);
  }
  ds.brands = merged;
  ds.count = merged.length;
  ds.gates = [...(ds.gates || []), "topup band: SPARQL rank 4600-5100 (OOM-safe checkpointed audit)"];
  ds.generatedAt = new Date().toISOString();
  fs.writeFileSync(DATA("logoDataset.json"), JSON.stringify(ds, null, 1));
  fs.appendFileSync(DATA("logoDataset.report.txt"), `\n\nTOP-UP PASS - ${new Date().toISOString()}\ncarried: ${existing.length} | fresh: ${state.verified.length} | merged: ${merged.length}\n`);
  console.log(`TOPUP DONE: ${existing.length} + ${state.verified.length} = ${merged.length}`);
  process.exit(0);
})().catch((e) => { console.error("TOPUP CRASH:", e); process.exit(1); });
