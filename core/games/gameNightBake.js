// ============================================
// GAME NIGHT - PRE-BAKED QUIZ ASSETS
// ============================================
// Logo images and theme-song clips for the two event quiz packs are fetched ONCE ahead of time
// (`.j gn bake`, also auto-run in the background after boot) and stored on disk. When the quiz
// starts it reads them from disk instead of fetching live, so the "planning" phase is instant.
//   logos : <base>/gamenight_bake/logos/<name>.png + .json   (800x800-normalised by the quiz pipeline)
//   audio : <base>/gamenight_bake/audio/<cacheKey>.mp3       (30 s clips; also restored into the quiz audio cache)
// Idempotent: anything already baked is skipped.
// ============================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const audioCache = require("../utils/quizAudioCache");
const quizMedia = require("./quizMedia");
const packs = require("./quizEventPacks");

const base = () => path.join(global.WA_INSTANCE_DIR || path.join(__dirname, "..", "data"), "gamenight_bake");
const sub = (d) => { const p = path.join(base(), d); try { fs.mkdirSync(p, { recursive: true }); } catch (_) { /* ignore */ } return p; };
const nrm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const safe = (k) => String(k).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---- what the event needs ----
function logoList() {
  const seen = new Set(); const out = [];
  for (const b of [...packs.E1_BRANDS, ...packs.E2_BRANDS]) if (!seen.has(nrm(b.name))) { seen.add(nrm(b.name)); out.push(b); }
  return out;
}
function themeEntries() { return packs.get("event1").plan().filter((s) => s.pinnedThemes).flatMap((s) => s.pinnedThemes); }
const themeKey = (e) => e.cacheKey || `theme:${nrm(e.show)}`;

// ---- logos ----
const logoFile = (name) => path.join(sub("logos"), nrm(name));
function hasLogo(name) { return fs.existsSync(logoFile(name) + ".png") && fs.existsSync(logoFile(name) + ".json"); }
function saveLogo(brand, q) {
  const a = q && q._cachedAsset; if (!a || !a.buf) return false;
  fs.writeFileSync(logoFile(brand.name) + ".png", a.buf);
  fs.writeFileSync(logoFile(brand.name) + ".json", JSON.stringify({ name: brand.name, wiki: brand.wiki, url: a.url, mime: a.mime, source: (q.asset && q.asset.source) || "baked" }));
  return true;
}
// same question shape the quiz's own logo builder returns, served from disk
function logoQuestion(brand, others, difficulty) {
  try {
    if (!hasLogo(brand.name)) return null;
    const meta = JSON.parse(fs.readFileSync(logoFile(brand.name) + ".json", "utf8"));
    const buf = fs.readFileSync(logoFile(brand.name) + ".png");
    if (buf.length < 1500) return null;
    const pool = [brand.name, ...others.map((o) => o.name)];
    const order = shuffle(pool.map((_, i) => i));
    return {
      q: "Which brand or company does this logo belong to?", options: order.map((i) => pool[i]), correct: order.indexOf(0),
      hideOptions: true, difficulty: difficulty || "easy", topic: "Logo", domain: "logos", type: "image", assetKey: meta.url,
      asset: { kind: "image", url: meta.url, mime: meta.mime, subject: brand.name, source: `baked:${meta.source}`, bytesHash: crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16) },
      loreRef: { wiki: "wikipedia", page: brand.wiki, section: "logo" },
      _cachedAsset: { url: meta.url, buf, mime: meta.mime, kind: "image" },
    };
  } catch (_) { return null; }
}

// ---- audio ----
const audioFile = (key) => path.join(sub("audio"), safe(key) + ".mp3");
function hasAudio(entry) { return fs.existsSync(audioFile(themeKey(entry))); }
function restoreAudio(entries) {
  let n = 0;
  for (const e of entries || []) {
    const key = themeKey(e);
    try {
      if (audioCache.get(key)) { n++; continue; }
      if (fs.existsSync(audioFile(key))) { audioCache.put(key, fs.readFileSync(audioFile(key))); audioCache.clearFail(key); n++; }
    } catch (_) { /* ignore */ }
  }
  return n;
}

// ---- status / bake ----
function status() {
  const logos = logoList(), themes = themeEntries();
  const missL = logos.filter((b) => !hasLogo(b.name)).map((b) => b.name);
  const missA = themes.filter((e) => !hasAudio(e)).map((e) => e.show);
  return { logos: { have: logos.length - missL.length, total: logos.length, missing: missL }, audio: { have: themes.length - missA.length, total: themes.length, missing: missA }, complete: !missL.length && !missA.length };
}

let BAKING = false;
async function bakeAll(onProgress = () => {}) {
  if (BAKING) return { busy: true };
  BAKING = true;
  try {
    const quiz = require("./quiz"); // lazy: quiz.js requires this module
    const st0 = status();
    // logos (4 at a time)
    const todoL = logoList().filter((b) => !hasLogo(b.name));
    const failL = [];
    for (let i = 0; i < todoL.length; i += 4) {
      const batch = todoL.slice(i, i + 4);
      const res = await Promise.all(batch.map((b) => quizMedia.buildLogosQuestion(b, (b.decoys || []).map((n) => ({ name: n })), "medium").catch(() => null)));
      res.forEach((q, j) => { if (!saveLogo(batch[j], q)) failL.push(batch[j].name); });
      onProgress(`logos ${Math.min(i + 4, todoL.length)}/${todoL.length}`);
    }
    // audio (sequential - each retrieval is heavy)
    const entries = themeEntries();
    restoreAudio(entries);
    const todoA = entries.filter((e) => !hasAudio(e));
    const failA = [];
    if (todoA.length && typeof quiz.bakeThemeEntries === "function") {
      const res = await quiz.bakeThemeEntries(todoA, 30).catch(() => []);
      for (const r of res) {
        const buf = r.ok ? audioCache.get(r.key) : null;
        if (buf) { try { fs.writeFileSync(audioFile(r.key), buf); } catch (_) { failA.push(r.show); } } else failA.push(r.show);
        onProgress(`audio ${r.show}: ${buf ? "ok" : "failed"}`);
      }
    } else failA.push(...todoA.map((e) => e.show));
    return { before: st0, after: status(), failedLogos: failL, failedAudio: failA };
  } finally { BAKING = false; }
}

module.exports = { logoQuestion, restoreAudio, status, bakeAll, hasLogo, logoList, themeEntries, _base: base };
