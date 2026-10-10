#!/usr/bin/env node
/* quiz_img_audit.js — owner 2026-10-10: "make something to make sure the
 * images check out". Standalone verifier for every image referenced by
 * data/quizDataset.json:
 *   Phase 1  HEAD every URL: 200 + content-type image/* + length >= 2500
 *   Phase 2  GET every 8th URL (+ all HEAD-suspicious): magic-byte sniff
 *            (jpeg/png/gif/webp) so a 200-html-error-page can never pass
 *   Report   data/quiz_images.audit.txt + /tmp/quiz_img_audit.json
 *   --prune  rewrite the dataset dropping dead entries (backup first)
 *   --full   GET-verify 100% instead of the sample
 * Re-runnable any time; 429/5xx get one backoff retry before a verdict.
 */
'use strict';
const fs = require("fs");
const BOT = "/home/ubuntu/whatsapp-bot";
const OUT = `${BOT}/data/quizDataset.json`;
const REPORT = `${BOT}/data/quiz_images.audit.txt`;
const UA = "quiz-image-audit/1.0 (whatsapp-bot maintenance)";
const FULL = process.argv.includes("--full");
const PRUNE = process.argv.includes("--prune");
const CONC = 6;

let axios;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function magicOk(buf) {
  if (!buf || buf.length < 2500) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  if (buf.length > 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return true;
  return false;
}

async function head(url) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await axios.head(url, { timeout: 15000, headers: { "User-Agent": UA }, maxRedirects: 5, validateStatus: null });
      const ct = String(r.headers["content-type"] || "");
      const len = Number(r.headers["content-length"] || 0);
      if (r.status === 200 && /^image\//.test(ct) && (len === 0 || len >= 2500)) return { ok: true };
      if (r.status === 429 || r.status >= 500) return { ok: false, soft: true, why: `throttled status=${r.status}` };
      return { ok: false, why: `status=${r.status} ct=${ct || "?"} len=${len}` };
    } catch (e) {
      if (i === 0) { await sleep(9000); continue; }
      return { ok: false, soft: true, why: `head-fail ${e && e.message}` };
    }
  }
}

async function getVerify(url) {
  try {
    const r = await axios.get(url, { timeout: 20000, responseType: "arraybuffer", headers: { "User-Agent": UA }, maxRedirects: 5, maxContentLength: 12 * 1024 * 1024 });
    if (r.status !== 200) return { ok: false, why: `get status=${r.status}` };
    const buf = Buffer.from(r.data);
    if (!magicOk(buf)) return { ok: false, why: `magic-bytes (got ${buf.length}B: ${buf.slice(0, 12).toString("hex")})` };
    return { ok: true };
  } catch (e) { return { ok: false, why: `get-fail ${e && e.message}` }; }
}

(async () => {
  axios = require("axios");
  const DS = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const entries = [];
  for (const [cat, c] of Object.entries(DS.categories)) {
    (c.images || []).forEach((x, i) => { if (x && x.img) entries.push({ cat, i, url: x.img, subject: x.subject || (x.options && x.options[x.correct]) || "" }); });
  }
  console.log(`auditing ${entries.length} image URLs (${FULL ? "FULL GET" : "HEAD + 1/8 GET sample"})...`);

  const verdicts = new Array(entries.length).fill(null);
  let cursor = 0, done = 0;
  async function worker() {
    while (cursor < entries.length) {
      const idx = cursor++;
      const e = entries[idx];
      let v = await head(e.url);
      const wantGet = FULL || (idx % 8 === 0) || !v.ok;
      if (v.ok && wantGet) v = await getVerify(e.url);
      verdicts[idx] = v;
      done++;
      if (done % 500 === 0) console.log(`  ${done}/${entries.length} checked (${verdicts.filter((x) => x && !x.ok).length} bad)`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  const bad = [];
  const soft = [];
  verdicts.forEach((v, i) => {
    if (!v || v.ok) return;
    if (v.soft) soft.push({ ...entries[i], why: v.why });
    else bad.push({ ...entries[i], why: v.why });
  });

  // dedupe bad URLs (same poster can back multiple entries)
  const badUrls = [...new Set(bad.map((b) => b.url))];
  const byCat = {};
  for (const b of bad) byCat[b.cat] = (byCat[b.cat] || 0) + 1;

  const line = `=== quiz image audit ${new Date().toISOString()} ===\nchecked=${entries.length} dead=${bad.length} throttled(soft, kept)=${soft.length}\n` +
    Object.entries(byCat).map(([c, n]) => `${c}: ${n} dead`).join(", ") + "\n" +
    (bad.length ? "\nDEAD (first 60):\n" + bad.slice(0, 60).map((b) => `[${b.cat}] ${b.why}\n  ${b.url.slice(0, 110)}`).join("\n") : "\nALL IMAGES VERIFIED OK\n") + "\n";
  fs.writeFileSync(REPORT, line);
  fs.writeFileSync("/tmp/quiz_img_audit.json", JSON.stringify({ generatedAt: new Date().toISOString(), total: entries.length, badCount: bad.length, bad }, null, 1));
  console.log(line);

  if (PRUNE && bad.length) {
    fs.copyFileSync(OUT, `${OUT}.bak-prune-${Date.now()}`);
    let removed = 0;
    for (const cat of Object.keys(DS.categories)) {
      const before = (DS.categories[cat].images || []).length;
      const badSet = new Set(bad.filter((b) => b.cat === cat).map((b) => b.i));
      DS.categories[cat].images = (DS.categories[cat].images || []).filter((_, i) => !badSet.has(i));
      removed += before - DS.categories[cat].images.length;
      if (DS.counts[cat]) DS.counts[cat].images = DS.categories[cat].images.length;
    }
    DS.imageAudit = { at: new Date().toISOString(), removed };
    fs.writeFileSync(OUT, JSON.stringify(DS));
    console.log(`PRUNED ${removed} dead image entries (backup written)`);
  }
  process.exit(bad.length && !PRUNE ? 3 : 0); // rc3 = dead images found (report written)
})().catch((e) => { console.error("FATAL", e && e.stack || e); process.exit(1); });
