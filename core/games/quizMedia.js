// ============================================
// QUIZ MEDIA MODES (2026-09-27): LOGOS + SPOT THE SONG
// ============================================
// Two standalone quiz modes requested by the owner. Both are LLM-FREE:
// questions are built deterministically from curated pools + real verified
// media, so preparation is fast (seconds) and cannot hallucinate.
//
//   LOGOS  - "Which brand does this logo belong to?"  Assets are real logos
//            from Wikipedia's file namespace (strict brand anchoring,
//            junk-filtered, magic-byte verified). Distractors come from the
//            SAME category so the question stays fair.
//   SONG   - "Which song is this clip from?"  Assets are real 25s clips via
//            the existing Go audio service (the .j audio infra - P11 rule:
//            no parallel fetch system), verified with the same P14-style
//            title-overlap gate + byte gates as theme songs.
//
// Both modes integrate through generateSectionQuestions (domain "logos" /
// "song") and reuse the whole live-session machinery: answers, timers,
// scoring, sections, banking (quizBank), dedup (usedKeys).
// ============================================

const crypto = require("crypto");
const quizLore = require("./quizLore");
const imageGate = require("../utils/imageGate"); // 2026-09-27: pixel gates on every logo/audio-cover image
const system = require("../utils/system");       // 2026-09-27: usage-fairness persistence
const quizImagePipeline = require("../utils/quizImagePipeline"); // 2026-10-01: white-bg flatten + uniform canvas
const logoPoolsV2 = require("./quizLogosPool");  // 2026-09-27: 500+ curated pool (owner brief §1)
const songsPoolV2 = require("./quizSongsPool");  // 2026-09-27: 280-track pool (owner brief §3)
const themesPool = require("./quizThemesPool");   // 2026-09-27: theme songs across fiction (§2)
// 2026-09-27 owner brief §8: visual-similarity decoys (offline embeddings)
let logoEmbeddings = null;
try { logoEmbeddings = require("../../data/logoEmbeddings.json"); } catch { logoEmbeddings = null; }

const _norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const _sha = (s) => crypto.createHash("sha1").update(_norm(s)).digest("hex").slice(0, 16);

// ── shuffle helper (Fisher-Yates, no bias) ──
const audioCache = require("../utils/quizAudioCache"); // 2026-09-28 owner spec §3: disk-cached verified clips

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ════════════════════════════════════════════
// USAGE FAIRNESS (2026-09-27, owner brief §1 & §3)
// "Track how many times each item has been used. The more it is used, the
// lower its chance of being selected again. Once roughly half of the items
// have stopped being selected because of the weighting, reset the counts."
//
// weight(entry) = 1 / (1 + uses)^2  - a fresh item weighs 1.0, once-used
// 0.25, twice-used 0.11, 4+-used < 0.04 (effectively benched).
// Reset rule: when >= 50% of the pool is benched (BENCH_USES), all counts
// zero and the cycle restarts. Counts persist in the system KV store.
// ════════════════════════════════════════════
const USAGE_BENCH_USES = 4;
const USAGE_KEY = { logos: "quiz_usage:logos", song: "quiz_usage:songs", theme: "quiz_usage:themes" };

function loadUsage(mode) {
  try {
    const d = system.get(USAGE_KEY[mode], null);
    if (d && typeof d === "object" && d.counts) return { counts: { ...d.counts }, resets: d.resets | 0 };
  } catch { /* KV unavailable (tests) - in-memory only */ }
  return { counts: {}, resets: 0 };
}
function saveUsage(mode, usage) {
  try { system.set(USAGE_KEY[mode], usage).catch(() => {}); } catch { /* non-fatal */ }
}
function _entryKey(mode, entry) {
  if (mode === "logos") return _norm(entry.name);
  if (mode === "theme") return _norm(entry.show);
  return `${_norm(entry.song)}|${_norm(entry.artist)}`;
}
function weightOf(uses) { return 1 / Math.pow(1 + (uses || 0), 2); }

// Weighted random draw WITHOUT replacement. Returns a candidate order with
// frequently-used items pushed to the tail (they still act as spare
// candidates when the pool is exhausted).
function weightedOrder(pool, usage, mode) {
  const scored = pool.map((e) => {
    const key = _entryKey(mode, e);
    return { e, key, w: weightOf(usage.counts[key]) };
  });
  const fresh = scored.filter((s) => s.w >= 0.04);
  const benched = scored.filter((s) => s.w < 0.04);
  // owner reset rule: half the pool benched -> zero everything
  if (benched.length >= Math.floor(pool.length / 2) && pool.length > 20) {
    usage.counts = {};
    usage.resets += 1;
    console.log(`[QuizMedia] usage fairness reset #${usage.resets} for ${mode} (${benched.length}/${pool.length} benched)`);
    return _shuffle(scored.map((s) => s.e));
  }
  const pick = [];
  const rest = [...fresh];
  while (rest.length) {
    const total = rest.reduce((a, s) => a + s.w, 0);
    let roll = Math.random() * total;
    let idx = rest.length - 1;
    for (let i = 0; i < rest.length; i++) {
      roll -= rest[i].w;
      if (roll <= 0) { idx = i; break; }
    }
    pick.push(rest.splice(idx, 1)[0]);
  }
  return [...pick.map((s) => s.e), ..._shuffle(benched.map((s) => s.e))];
}
function bumpUsage(usage, mode, entry) {
  const key = _entryKey(mode, entry);
  usage.counts[key] = (usage.counts[key] || 0) + 1;
}

// ════════════════════════════════════════════
// VISUAL-SIMILARITY DECOYS (owner brief §8)
// Embeddings are generated OFFLINE (scripts/embed_logos.js, MobileNetV2) and
// shipped as data/logoEmbeddings.json - the live quiz path is a cosine
// top-k over floats, no model, no network. Falls back to same-category
// decoys when the file is absent or a name has no embedding.
// ════════════════════════════════════════════
let _embIndex = null;
function embeddingsIndex() {
  if (_embIndex !== null) return _embIndex;
  try {
    if (!logoEmbeddings || !logoEmbeddings.model) { _embIndex = false; return _embIndex; }
    const names = Object.keys(logoEmbeddings.vectors || {});
    // 💡 FIX 2026-10-09: vectors are int8-quantized {q: base64, s: scale} —
    // dequantize HERE. _cosine expects float arrays; a bare object has no
    // .length, so the whole visual-decoy path silently degraded to the
    // same-category shuffle ever since this shipped.
    _embIndex = {
      names,
      get: (n) => {
        const raw = logoEmbeddings.vectors[n];
        if (!raw || !raw.q) return null;
        try {
          const q = Buffer.from(raw.q, "base64");
          if (!q.length) return null;
          const out = new Float32Array(q.length);
          for (let i = 0; i < q.length; i++) out[i] = (q[i] / 127) * (raw.s || 1);
          return out;
        } catch { return null; }
      },
    };
  } catch { _embIndex = false; }
  return _embIndex;
}
function _cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
// Returns up to 3 visually-similar LOGOS_POOL entries for a brand. Ranking
// is restricted to the brand's OWN CATEGORY first: MobileNet embeddings
// capture low-level visual stats (colors/gradients/shapes), so unrestricted
// cosine would pair Pepsi with colorful tech marks - "looks similar" is only
// a GOOD decoy when the category already matches (Pepsi vs Coca-Cola, BMW vs
// Mercedes). Falls back to plain same-category picks when a brand has no
// embedding. Never returns the brand itself.
function visuallySimilarDecoys(brand, k = 3) {
  const idx = embeddingsIndex();
  const vec = idx ? idx.get(brand.name) : null;
  const sameCat = LOGOS_POOL.filter((b) => b.cat === brand.cat && b.name !== brand.name);
  if (vec && idx) {
    const scored = sameCat
      .map((b) => ({ b, sim: (() => { const v = idx.get(b.name); return v ? _cosine(vec, v) : -1; })() }))
      .filter((s) => s.sim >= 0)
      .sort((a, b) => b.sim - a.sim);
    if (scored.length >= k) return scored.slice(0, k).map((s) => s.b);
  }
  return _shuffle(sameCat).slice(0, k);
}

// ════════════════════════════════════════════
// LOGOS POOL - famous brands / apps / companies.
// name = display name, wiki = exact Wikipedia article title (the logo file
// search anchors on it), cat = category for fair distractors.
// ════════════════════════════════════════════
// ── LOGOS POOL v2 (2026-09-27, owner brief §1) ──
// 500+ hand-curated recognizable brands across 14 categories: modern apps,
// platforms, companies, games + iconic classics. Previously a 153-entry
// literal. Junk/variant entries (product lines, regional duplicates) are
// excluded by curation; dedupe by display name guarantees a distractor can
// never be the correct answer's twin.
//
// 💡 V2 EXPANSION (2026-10-10 owner brief: "build a json with over a thousand
// logos, every single one NEW/modern"): the baked dataset
// (data/logoDataset.json, built by scripts/build_logo_dataset_v2.js) now
// carries 1800+ VERIFIED MODERN logos (Wikidata P154 current-logo statements
// + dated enwiki search hits, every one render-gated). Its brands join the
// question pool below (deduped vs curated), so the quiz draws from the full
// modern set instead of asking the same 627 brands forever. Dataset load is
// hoisted ABOVE this IIFE because the expansion reads it.
let logoDataset = null;
try { logoDataset = require("../../data/logoDataset.json"); } catch { logoDataset = null; }

const LOGOS_POOL = (() => {
  const all = [
    ...logoPoolsV2.TECH, ...logoPoolsV2.APPS, ...logoPoolsV2.FOOD, ...logoPoolsV2.CARS,
    ...logoPoolsV2.FASHION, ...logoPoolsV2.SPORTS, ...logoPoolsV2.GAMING, ...logoPoolsV2.RETAIL,
    ...logoPoolsV2.TRAVEL, ...logoPoolsV2.MEDIA, ...logoPoolsV2.FINTECH, ...logoPoolsV2.HEALTH,
    ...logoPoolsV2.INDUSTRY, ...logoPoolsV2.TELECOM,
  ];
  // dataset-sourced additions: only entries that carry a verified modern logo
  for (const b of ((logoDataset && logoDataset.brands) || [])) {
    if (!b || !b.name || !b.file || !b.modern) continue;
    all.push({ name: b.name, wiki: b.wiki || b.name, cat: b.cat || "Brands" });
  }
  const seen = new Set();
  return all.filter((b) => {
    const k = _norm(b.name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
})();

const LOGO_JPEG_FALLBACK_OK = true; // jpeg logos allowed only if nothing better exists (handled by mimeScore)

// ── 2026-09-28 OWNER BRIEF §3: BAKED VERIFIED LOGO DATASET ──
// data/logoDataset.json is built by scripts/build_logo_dataset.js +
// scripts/refine_logo_dataset.js: Wikidata P154 CURRENT-logo statements
// (end-time qualified = outdated, skipped) + an audited enwiki file-search
// stage. Every entry passed bake-time gates: wordmark-filename reject,
// outdated-year reject, photo/trademark reject, aspect 0.25-2.6, render,
// >=1.5KB, imageGate 64x40 non-blank. Matching is by wiki ITEM, so the
// image provably belongs to the company being asked about.
// The dataset is the PRIMARY source; the live per-brand Wikipedia search
// (wikipediaLogoImage) remains the fallback for brands without a verified
// entry or when a baked URL dies.
const DATASET_BY_NAME = new Map(((logoDataset && logoDataset.brands) || []).map((b) => [_norm(b.name), b]));

function logoDatasetInfo() {
  return { available: !!logoDataset, count: DATASET_BY_NAME.size, generatedAt: logoDataset?.generatedAt || null, refinedAt: logoDataset?.refinedAt || null };
}

// shared question assembler (dataset path + live-search path)
// 💡 OWNER SPEC §2/§7 (2026-09-28): logo questions carry hideOptions - the
// card shows NO options ("name the brand" IS the challenge). Options remain
// stored internally for answer matching + reveal text.
function assembleLogoQuestion(brand, others, difficulty, url, buf, mime, sourceTag) {
  const optionsPool = [brand.name, ...others.map((o) => o.name)];
  const optOrder = _shuffle(optionsPool.map((_, i) => i)); // fair option order (Fisher-Yates)
  return {
    q: `Which brand or company does this logo belong to?`,
    options: optOrder.map((i) => optionsPool[i]),
    correct: optOrder.indexOf(0),
    hideOptions: true,
    difficulty: difficulty || "easy",
    topic: "Logo",
    domain: "logos",
    type: "image",
    assetKey: url,
    asset: { kind: "image", url, mime, subject: brand.name, source: sourceTag, bytesHash: crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16) },
    loreRef: { wiki: "wikipedia", page: brand.wiki, section: "logo" },
    _cachedAsset: { url, buf, mime, kind: "image" },
  };
}

// One logo question. Returns null when no verified logo asset is found.
async function buildLogosQuestion(brand, others, difficulty) {
  // PRIMARY: baked verified dataset entry (audited at bake time). The baked
  // URL points at Commons - files that live enwiki-local render 404 there,
  // so try the SAME verified filename on the other host before giving up.
  // A total fetch failure falls through to the live search below.
  const dsEntry = DATASET_BY_NAME.get(_norm(brand.name));
  if (dsEntry && dsEntry.file) {
    const enc = encodeURIComponent(dsEntry.file.replace(/\s/g, " "));
    const hosts = [
      "https://commons.wikimedia.org/wiki/Special:FilePath/",
      "https://en.wikipedia.org/wiki/Special:FilePath/",
    ];
    for (const h of hosts) {
      const dsDl = await quizLore.downloadMedia(`${h}${enc}?width=640`, "image").catch(() => null);
      if (dsDl && dsDl.buf && dsDl.buf.length >= 1500) {
        // 2026-10-01 owner bug report §2/§3: normalize EVERY logo before it
        // reaches the quiz UI - transparent/empty backgrounds flattened onto
        // solid white, uniform 800x800 canvas, contain-fit (never stretched).
        const norm = await quizImagePipeline.normalize(dsDl.buf, { url: `${h}${enc}`, minW: 64, minH: 40, label: `logo:${brand.name}` }).catch(() => ({ ok: false, reason: "norm-crash" }));
        if (norm.ok) return assembleLogoQuestion(brand, others, difficulty, `${h}${enc}?width=640`, norm.buf, norm.mime, `logo-dataset:${dsEntry.source || "baked"}`);
        // normalization failed (exotic format etc.) -> gate raw bytes and send
        // as before rather than losing the question entirely
        const gate = await imageGate.inspectImageBuffer(dsDl.buf, { minW: 64, minH: 40, label: `logo:${brand.name}`.slice(0, 50) }).catch(() => ({ ok: false, reason: "gate-crash" }));
        if (gate.ok) return assembleLogoQuestion(brand, others, difficulty, `${h}${enc}?width=640`, dsDl.buf, dsDl.mime || dsEntry.mime || "image/png", `logo-dataset:${dsEntry.source || "baked"}`);
      }
    }
  }
  // 💡 2026-10-10 (owner: "1000+ modern logos JSON"): dataset entries sourced
  // from iTunes official artwork / favicons have NO Commons file - they carry
  // a direct, bake-time-verified URL instead. Try it when the file-host path
  // above is not applicable or failed.
  if (dsEntry && !dsEntry.file && dsEntry.url) {
    const dl2 = await quizLore.downloadMedia(dsEntry.url, "image").catch(() => null);
    if (dl2 && dl2.buf && dl2.buf.length >= 1500) {
      const norm2 = await quizImagePipeline.normalize(dl2.buf, { url: dsEntry.url, minW: 64, minH: 40, label: `logo:${brand.name}` }).catch(() => ({ ok: false, reason: "norm-crash" }));
      if (norm2.ok) return assembleLogoQuestion(brand, others, difficulty, dsEntry.url, norm2.buf, norm2.mime, `logo-dataset:${dsEntry.source || "baked"}`);
      const gate2 = await imageGate.inspectImageBuffer(dl2.buf, { minW: 64, minH: 40, label: `logo:${brand.name}`.slice(0, 50) }).catch(() => ({ ok: false, reason: "gate-crash" }));
      if (gate2.ok) return assembleLogoQuestion(brand, others, difficulty, dsEntry.url, dl2.buf, dl2.mime || dsEntry.mime || "image/png", `logo-dataset:${dsEntry.source || "baked"}`);
    }
  }
  // FALLBACK: live per-brand Wikipedia file search (quizLore heuristic)
  const img = await quizLore.wikipediaLogoImage(brand.wiki, 640, brand.name).catch(() => null);
  if (!img || !img.url) return null;
  const dl = await quizLore.downloadMedia(img.url, "image").catch(() => null);
  if (!dl || !dl.buf || dl.buf.length < 1500) return null; // tiny = placeholder/blank
  // 2026-10-01: normalize first (white bg + uniform canvas, owner bug report
  // §2/§3) - the pipeline runs its own pixel gates internally.
  const norm = await quizImagePipeline.normalize(dl.buf, { url: img.url, minW: 64, minH: 40, label: `logo:${brand.name}` }).catch(() => ({ ok: false, reason: "norm-crash" }));
  if (norm.ok) return assembleLogoQuestion(brand, others, difficulty, img.url, norm.buf, norm.mime, "wikipedia-logo");
  // normalization failed -> previous behavior (pixel gate + raw bytes)
  const gate = await imageGate.inspectImageBuffer(dl.buf, { minW: 64, minH: 40, label: `logo:${brand.name}`.slice(0, 50) }).catch(() => ({ ok: false, reason: "gate-crash" }));
  if (!gate.ok) return null;
  return assembleLogoQuestion(brand, others, difficulty, img.url, dl.buf, dl.mime, "wikipedia-logo");
}

// build `count` verified logo questions. Tries many brands (each candidate
// costs one API call + one download); stops at count or pool exhaustion.
// usedKeys: session-level Set (dedup across sections/retries).
async function buildLogosQuestions({ count, usedKeys, difficulty, bytesCapWarn = null }) {
  const n = Math.max(1, Math.min(parseInt(count, 10) || 10, LOGOS_POOL.length - 4));
  const out = [];
  const claimed = new Set();
  const usage = loadUsage("logos");
  const order = weightedOrder(LOGOS_POOL, usage, "logos");
  for (const brand of order) {
    if (out.length >= n) break;
    const key = `logo:${_norm(brand.name)}`;
    if (usedKeys.has(key) || claimed.has(key)) continue;
    // 💡 decoys (owner brief §8): visually-similar logos when embeddings are
    // available (challenging, plausible options), else same-category brands.
    let others = visuallySimilarDecoys(brand, 3);
    if (others.length < 3) {
      others = _shuffle(LOGOS_POOL.filter((b) => b.cat === brand.cat && b.name !== brand.name)).slice(0, 3);
    }
    if (others.length < 3) {
      for (const b of _shuffle(LOGOS_POOL)) {
        if (others.length >= 3) break;
        if (b.name !== brand.name && !others.some((o) => o.name === b.name)) others.push(b);
      }
    }
    if (others.length < 3) continue;
    const q = await buildLogosQuestion(brand, others, difficulty).catch(() => null);
    if (!q) continue;
    claimed.add(key);
    if (usedKeys) usedKeys.add(key);
    bumpUsage(usage, "logos", brand); // selection counts toward fairness
    out.push(q);
  }
  if (out.length) saveUsage("logos", usage);
  if (bytesCapWarn) bytesCapWarn(out.length);
  return out;
}

// ════════════════════════════════════════════
// SPOT THE SONG POOL - globally famous tracks (1960s..2020s).
// song = title shown in options, artist = search + option label, era =
// decade bucket for fair same-era distractors.
// ════════════════════════════════════════════
// ── SPOT THE SONG POOL v2 (2026-09-27, owner brief §3) ──
// 280 globally recognizable tracks, 1960s-2020s: pop staples, rock classics,
// old-school icons, viral-era hits. Previously 109 entries.
const SONGS_POOL = songsPoolV2.SONGS;

// audio-search result quality gate: covers/karaoke/nightcore variants sound
// different from the real track and would make the question unfair.
// 2026-09-27: + regional-cover markers (JioSaavn pollution: albums like
// "Bohemian-Rhapsody-Haryanvi-2025" credit the original artist and pass the
// title-overlap gate; the Go service now rejects these at the source - this
// regex is the Node-side defense in depth).
const _SONG_VARIANT_RE = /(cover|karaoke|nightcore|slowed|sped\s*up|reverb|8d\s*audio|reaction|remix|instrumental|tribute|lullaby|birthday|ringtone|haryanvi|bhojpuri|desi\s*(version|mix|cover)?|hindi\s*(version|cover|mix)|whatsapp\s*status|tiktok|sad\s*(version|lofi))/i;

// One song question. goService = the shared Go audio service client.
// trimFn = optional (buf) => Promise<clipBuf|null> local ffmpeg trimmer for
// the legacy path (service did not pre-clip); without it, un-clipped hits
// are SKIPPED - a full-length track would over-reveal the answer.
async function buildSpotSongQuestion(entry, others, difficulty, goService, trimFn = null) {
  // 💡 OWNER SPEC §3 (2026-09-28): disk-cached verified clip -> zero external
  // calls for repeat quizzes; failure marks stop recently-dead candidates
  // from burning the retry budget again within 24h.
  const cacheKey = `song:${_norm(entry.song)}:${_norm(entry.artist)}`;
  const cachedClip = audioCache.get(cacheKey);
  if (cachedClip) return _finishSpotSong(entry, others, difficulty, cachedClip);
  if (audioCache.isFreshFail(cacheKey)) return null;
  if (!goService || typeof goService.getAudioInfo !== "function") return null;
  const info = await goService.getAudioInfo(`${entry.song} ${entry.artist}`, { clipSeconds: 25, clipBitrate: "96k", timeoutMs: 120000, noRetry: true }).catch(() => null);
  if (!info || info.error || !info.audioURL || !info.metadata) { audioCache.markFail(cacheKey); return null; }
  // P14-style verification: the hit must actually be this song/artist.
  const metaTitle = _norm(info.metadata.title);
  const songN = _norm(entry.song);
  const artistN = _norm(entry.artist);
  if (_SONG_VARIANT_RE.test(metaTitle)) { audioCache.markFail(cacheKey); return null; }
  const overlap = (songN.length >= 6 && metaTitle.includes(songN.slice(0, Math.max(6, Math.floor(songN.length * 0.6)))))
    || (songN.length >= 6 && metaTitle.includes(songN))
    || metaTitle.includes(artistN);
  if (!overlap) { audioCache.markFail(cacheKey); return null; }
  // byte gates mirror the theme-song pipeline exactly (clip > 20KB,
  // full-file >= 50KB when the server reports it)
  const fullOk = !Number.isFinite(info.fullBytes) || info.fullBytes >= 50 * 1024;
  let clip = null;
  if (info.clipped) {
    const dl = await axiosGetBuffer(info.audioURL, 60000).catch(() => null);
    if (fullOk && dl && dl.length > 20 * 1024) clip = dl;
  }
  if (!clip && trimFn) {
    // legacy path: full file download + local ffmpeg trim (older Go build or
    // server-side clip failed) - same shape as buildThemeSongQuestion
    const dl = await axiosGetBuffer(info.audioURL, 60000).catch(() => null);
    if (dl && dl.length >= 50 * 1024) clip = await trimFn(dl, 25).catch(() => null);
  }
  if (!clip) { audioCache.markFail(cacheKey); return null; }
  audioCache.put(cacheKey, clip);
  audioCache.clearFail(cacheKey);
  return _finishSpotSong(entry, others, difficulty, clip);
}

// clip -> question assembler for Spot the Song (cache hit and fresh path share it)
function _finishSpotSong(entry, others, difficulty, clip) {
  const label = (e) => `${e.song} - ${e.artist}`;
  const optionsPool = [label(entry), ...others.map(label)];
  const optOrder = _shuffle(optionsPool.map((_, i) => i)); // fair option order (Fisher-Yates)
  return {
    q: `🎵 Which song is this clip from?`,
    options: optOrder.map((i) => optionsPool[i]),
    correct: optOrder.indexOf(0),
    hideOptions: true, // OWNER SPEC §2: audio questions show no options
    difficulty: difficulty || "medium",
    topic: "Spot the Song",
    domain: "song",
    type: "theme", // reuses the audio-before-card post path
    assetKey: `song:${_norm(entry.song)}:${_norm(entry.artist)}`,
    asset: { kind: "audio", buf: clip, mime: "audio/mpeg", subject: entry.song, source: "go-audio" },
    song: entry.song,
    loreRef: { wiki: null, page: entry.song, section: "spot-the-song" },
  };
}

async function axiosGetBuffer(url, timeoutMs) {
  try {
    const axios = require("axios");
    const r = await axios.get(url, { responseType: "arraybuffer", timeout: timeoutMs, maxContentLength: 20 * 1024 * 1024 });
    return Buffer.from(r.data);
  } catch { return null; }
}

// build `count` verified song questions; retries across up to count*4
// candidates (availability varies per track).
async function buildSpotSongQuestions({ count, usedKeys, difficulty, goService, trimFn = null, deadlineMs = 0 }) {
  const n = Math.max(1, Math.min(parseInt(count, 10) || 10, SONGS_POOL.length - 4));
  const out = [];
  const claimed = new Set();
  const usage = loadUsage("song");
  const order = weightedOrder(SONGS_POOL, usage, "song");
  // candidate budget: retry-heavy (availability varies per track). Batched
  // concurrency 3 keeps the Go service warm without hammering it (the shared
  // mediaWorker additionally caps global concurrency).
  const budget = Math.min(order.length, Math.max(n * 8, 24));
  const candidates = order.slice(0, budget);
  const buildOne = async (entry) => {
    const key = `song:${_norm(entry.song)}`;
    if (out.length >= n || usedKeys.has(key) || claimed.has(key)) return;
    // 💡 OWNER SPEC §3: respect the section deadline - never start a fresh
    // retrieval we cannot finish inside the mediaWorker budget
    if (deadlineMs && Date.now() > deadlineMs) return;
    // distractors: same era first (fair), pad from the rest
    let others = _shuffle(SONGS_POOL.filter((s) => s.era === entry.era && s.song !== entry.song)).slice(0, 3);
    if (others.length < 3) {
      for (const s of _shuffle(SONGS_POOL)) {
        if (others.length >= 3) break;
        if (s.song !== entry.song && !others.some((o) => o.song === s.song)) others.push(s);
      }
    }
    if (others.length < 3) return;
    const q = await buildSpotSongQuestion(entry, others, difficulty, goService, trimFn).catch(() => null);
    if (!q) return;
    claimed.add(key);
    if (usedKeys) usedKeys.add(key);
    bumpUsage(usage, "song", entry);
    out.push(q);
  };
  // 💡 OWNER SPEC §3: waves of 3 (was pairs of 2) + deadline awareness -
  // keeps the Go service saturated without overshooting the section budget
  for (let i = 0; i < candidates.length && out.length < n; i += 3) {
    if (deadlineMs && Date.now() > deadlineMs) break;
    await Promise.all(candidates.slice(i, i + 3).map(buildOne));
  }
  // 💡 OWNER SPEC §3 fallback: when live retrieval came up short (service
  // degraded / rate-limited), fill the remaining slots from the DISK CACHE of
  // previously verified clips. Pass 2 pre-checks the cache so it NEVER
  // triggers a fresh retrieval - reliability beats variety mid-outage.
  if (out.length < n) {
    for (const entry of order) {
      if (out.length >= n) break;
      const key = `song:${_norm(entry.song)}`;
      if (usedKeys.has(key) || claimed.has(key)) continue;
      if (!audioCache.get(`song:${_norm(entry.song)}:${_norm(entry.artist)}`)) continue;
      let others = _shuffle(SONGS_POOL.filter((s) => s.era === entry.era && s.song !== entry.song)).slice(0, 3);
      if (others.length < 3) others = _shuffle(SONGS_POOL.filter((s) => s.song !== entry.song)).slice(0, 3);
      if (others.length < 3) continue;
      const q = await buildSpotSongQuestion(entry, others, difficulty, goService, trimFn).catch(() => null);
      if (!q) continue;
      claimed.add(key);
      if (usedKeys) usedKeys.add(key);
      bumpUsage(usage, "song", entry);
      out.push(q);
    }
  }
  if (out.length) saveUsage("song", usage);
  return out;
}

// ════════════════════════════════════════════
// THEME SONG MODE (2026-09-27, owner brief §2): ".j quiz audio 10" -
// theme songs from shows / movies / games ACROSS ALL OF FICTION. Same
// verification gates as Spot the Song (title overlap, variant filter, byte
// gates, server-side clip). Options = shows (same type preferred).
// ════════════════════════════════════════════
const THEMES_POOL = themesPool.THEMES;

async function buildThemeSongQuestionEntry(entry, others, difficulty, goService, trimFn = null) {
  // 💡 OWNER SPEC §3: disk cache + failure marks (same pattern as Spot the Song)
  const cacheKey = `theme:${_norm(entry.show)}`;
  const cachedClip = audioCache.get(cacheKey);
  if (cachedClip) return _finishThemeSong(entry, others, difficulty, cachedClip);
  if (audioCache.isFreshFail(cacheKey)) return null;
  if (!goService || typeof goService.getAudioInfo !== "function") return null;
  const info = await goService.getAudioInfo(entry.search, { clipSeconds: 25, clipBitrate: "96k", timeoutMs: 120000, noRetry: true }).catch(() => null);
  if (!info || info.error || !info.audioURL || !info.metadata) { audioCache.markFail(cacheKey); return null; }
  const metaTitle = _norm(info.metadata.title);
  const showN = _norm(entry.show);
  const searchN = _norm(entry.search);
  if (_SONG_VARIANT_RE.test(metaTitle)) { audioCache.markFail(cacheKey); return null; }
  // the hit must overlap the search phrase OR the show name
  const searchWords = searchN.split(" ").filter((w) => w.length > 3);
  const overlapWords = searchWords.filter((w) => metaTitle.includes(w)).length;
  const overlap = metaTitle.includes(showN) || (searchWords.length && overlapWords >= Math.min(2, searchWords.length));
  if (!overlap) { audioCache.markFail(cacheKey); return null; }
  const fullOk = !Number.isFinite(info.fullBytes) || info.fullBytes >= 50 * 1024;
  let clip = null;
  if (info.clipped) {
    const dl = await axiosGetBuffer(info.audioURL, 60000).catch(() => null);
    if (fullOk && dl && dl.length > 20 * 1024) clip = dl;
  }
  if (!clip && trimFn) {
    const dl = await axiosGetBuffer(info.audioURL, 60000).catch(() => null);
    if (dl && dl.length >= 50 * 1024) clip = await trimFn(dl, 25).catch(() => null);
  }
  if (!clip) { audioCache.markFail(cacheKey); return null; }
  audioCache.put(cacheKey, clip);
  audioCache.clearFail(cacheKey);
  return _finishThemeSong(entry, others, difficulty, clip);
}

// clip -> question assembler for Theme Song (cache hit and fresh path share it)
function _finishThemeSong(entry, others, difficulty, clip) {
  const optionsPool = [entry.show, ...others.map((o) => o.show)];
  const optOrder = _shuffle(optionsPool.map((_, i) => i));
  return {
    q: `🎵 Which show or movie is this theme song from?`,
    options: optOrder.map((i) => optionsPool[i]),
    correct: optOrder.indexOf(0),
    hideOptions: true, // OWNER SPEC §2: audio questions show no options
    difficulty: difficulty || "medium",
    topic: "Theme Song",
    domain: "audio",
    type: "theme",
    assetKey: `theme:${_norm(entry.show)}`,
    asset: { kind: "audio", buf: clip, mime: "audio/mpeg", subject: entry.show, source: "go-audio-theme" },
    song: entry.show,
    loreRef: { wiki: null, page: entry.show, section: "theme-song" },
  };
}

async function buildThemeSongQuestions({ count, usedKeys, difficulty, goService, trimFn = null, deadlineMs = 0 }) {
  const n = Math.max(1, Math.min(parseInt(count, 10) || 10, THEMES_POOL.length - 4));
  const out = [];
  const claimed = new Set();
  const usage = loadUsage("theme");
  const order = weightedOrder(THEMES_POOL, usage, "theme");
  const budget = Math.min(order.length, Math.max(n * 8, 24));
  const candidates = order.slice(0, budget);
  const buildOne = async (entry) => {
    const key = `theme:${_norm(entry.show)}`;
    if (out.length >= n || usedKeys.has(key) || claimed.has(key)) return;
    // 💡 OWNER SPEC §3: respect the section deadline
    if (deadlineMs && Date.now() > deadlineMs) return;
    // distractors: same type first (anime vs anime...), pad from the rest
    let others = _shuffle(THEMES_POOL.filter((t) => t.type === entry.type && t.show !== entry.show)).slice(0, 3);
    if (others.length < 3) {
      for (const t of _shuffle(THEMES_POOL)) {
        if (others.length >= 3) break;
        if (t.show !== entry.show && !others.some((o) => o.show === t.show)) others.push(t);
      }
    }
    if (others.length < 3) return;
    const q = await buildThemeSongQuestionEntry(entry, others, difficulty, goService, trimFn).catch(() => null);
    if (!q) return;
    claimed.add(key);
    if (usedKeys) usedKeys.add(key);
    bumpUsage(usage, "theme", entry);
    out.push(q);
  };
  // 💡 OWNER SPEC §3: waves of 3 (was pairs of 2) + deadline awareness
  for (let i = 0; i < candidates.length && out.length < n; i += 3) {
    if (deadlineMs && Date.now() > deadlineMs) break;
    await Promise.all(candidates.slice(i, i + 3).map(buildOne));
  }
  // 💡 OWNER SPEC §3 fallback: same cache-fill as Spot the Song - never
  // triggers retrievals, only serves already-verified clips.
  if (out.length < n) {
    for (const entry of order) {
      if (out.length >= n) break;
      const key = `theme:${_norm(entry.show)}`;
      if (usedKeys.has(key) || claimed.has(key)) continue;
      if (!audioCache.get(key)) continue;
      let others = _shuffle(THEMES_POOL.filter((t) => t.type === entry.type && t.show !== entry.show)).slice(0, 3);
      if (others.length < 3) others = _shuffle(THEMES_POOL.filter((t) => t.show !== entry.show)).slice(0, 3);
      if (others.length < 3) continue;
      const q = await buildThemeSongQuestionEntry(entry, others, difficulty, goService, trimFn).catch(() => null);
      if (!q) continue;
      claimed.add(key);
      if (usedKeys) usedKeys.add(key);
      bumpUsage(usage, "theme", entry);
      out.push(q);
    }
  }
  if (out.length) saveUsage("theme", usage);
  return out;
}

module.exports = {
  LOGOS_POOL,
  SONGS_POOL,
  logoDatasetInfo,
  buildLogosQuestions,
  buildLogosQuestion,
  buildSpotSongQuestions,
  buildSpotSongQuestion,
  buildThemeSongQuestions,
  buildThemeSongQuestionEntry,
  THEMES_POOL,
  _internal: {
    _norm, _sha, _shuffle, _SONG_VARIANT_RE,
    // usage-fairness internals (QA + opscheck)
    loadUsage, saveUsage, bumpUsage, weightOf, weightedOrder, _entryKey,
    USAGE_BENCH_USES, USAGE_KEY,
    visuallySimilarDecoys, embeddingsIndex,
  },
};
