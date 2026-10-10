// ============================================
// QUIZ DATASET MODES (2026-10-10 owner overhaul)
// ============================================
// `.j quiz games / comics / movies / series` — LLM-FREE, SEARCH-FREE.
// Questions come from data/quizDataset.json (built by
// scripts/build_quiz_dataset.js: OpenTDB, the-trivia-api, SteamSpy, TVMaze,
// AniList, Wikidata + enwiki page images — every image verified by download
// at build time). No live franchise search, no AI generation: preparation is
// instant and cannot hallucinate or hang.
//
// Question shape matches the shared live-quiz machinery (see quizMedia.js):
// text questions post as plain cards; image questions carry
// asset {kind:"image", url} and resolve through resolveQuestionMedia
// (download -> pixel gate -> send) exactly like logo questions.
// Usage-fairness mirrors the logo mode: weight = 1/(1+uses)^2, benched at
// 4 uses, all counters reset when half the pool is benched.
// ============================================

const system = require("../utils/system");

let DS = null;
try { DS = require("../../data/quizDataset.json"); } catch { DS = null; }

const MODES = ["games", "comics", "movies", "series"];
const USAGE_KEY = (mode) => `quiz_usage:ds_${mode}`;
const BENCH_USES = 4;

function _norm(s) { return String(s || "").toLowerCase().trim(); }
function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const weightOf = (uses) => 1 / Math.pow(1 + (uses || 0), 2);

function loadUsage(mode) {
  try {
    const d = system.get(USAGE_KEY(mode), null);
    if (d && typeof d === "object" && d.counts) return { counts: { ...d.counts }, resets: d.resets | 0 };
  } catch { /* KV unavailable (tests) - in-memory only */ }
  return { counts: {}, resets: 0 };
}
function saveUsage(mode, usage) {
  try { system.set(USAGE_KEY(mode), usage).catch(() => {}); } catch { /* non-fatal */ }
}

// Weighted draw WITHOUT replacement (same algorithm as quizMedia.weightedOrder)
function weightedOrder(entries, usage) {
  const scored = entries.map((e) => ({ e, w: weightOf(usage.counts[String(e.id)]) }));
  const fresh = scored.filter((s) => s.w >= 1 / Math.pow(1 + BENCH_USES, 2));
  const benched = scored.filter((s) => s.w < 1 / Math.pow(1 + BENCH_USES, 2));
  if (benched.length >= Math.floor(entries.length / 2) && entries.length > 20) {
    usage.counts = {};
    usage.resets += 1;
    console.log(`[QuizDataset] usage fairness reset #${usage.resets} (${benched.length}/${entries.length} benched)`);
    return _shuffle(entries);
  }
  const pick = [];
  const rest = [...fresh];
  while (rest.length) {
    const total = rest.reduce((a, s) => a + s.w, 0);
    let roll = Math.random() * total;
    let idx = rest.length - 1;
    for (let i = 0; i < rest.length; i++) { roll -= rest[i].w; if (roll <= 0) { idx = i; break; } }
    pick.push(rest.splice(idx, 1)[0].e);
  }
  return [...pick, ..._shuffle(benched.map((s) => s.e))];
}

function datasetInfo() {
  if (!DS) return { available: false, counts: {} };
  const counts = {};
  for (const c of MODES) counts[c] = DS.categories && DS.categories[c] ? { text: (DS.categories[c].questions || []).length, images: (DS.categories[c].images || []).length } : { text: 0, images: 0 };
  return { available: true, generatedAt: DS.generatedAt || null, counts };
}

// Build `count` questions for a dataset mode. Mixes ~30% image questions
// (posters / covers / character art) with text MCQs. Difficulty is a
// PREFERENCE, not a filter - a category short on hard questions fills from
// the other bands rather than failing the quiz.
function buildDatasetQuestions({ mode, count, usedKeys, difficulty }) {
  if (!DS || !DS.categories || !DS.categories[mode]) return [];
  const cat = DS.categories[mode];
  const text = (cat.questions || []).filter(Boolean);
  const images = (cat.images || []).filter(Boolean);
  if (!text.length && !images.length) return [];

  const usage = loadUsage(mode);
  const used = usedKeys instanceof Set ? usedKeys : new Set();
  const freshText = text.filter((q) => !used.has(`ds:${mode}:t${q.id}`));
  const freshImg = images.filter((q) => !used.has(`ds:${mode}:i${q.id}`));
  let orderText = weightedOrder(freshText.length ? freshText : text, usage);
  let orderImg = weightedOrder(freshImg.length ? freshImg : images, usage);

  // difficulty preference: sort candidates so preferred band comes first
  const byDiff = (arr) => (difficulty
    ? [...arr].sort((a, b) => (a.difficulty === difficulty ? -1 : 0) - (b.difficulty === difficulty ? -1 : 0))
    : arr);
  orderText = byDiff(orderText);
  orderImg = byDiff(orderImg);

  const wantImages = Math.min(orderImg.length, Math.max(2, Math.round(count * 0.3)));
  const wantText = count - wantImages;
  const pickedImg = orderImg.slice(0, Math.max(0, Math.min(wantImages, count)));
  const pickedText = orderText.slice(0, Math.max(0, count - pickedImg.length));

  const out = [];
  const emit = (q, kind) => {
    // 💡 v8 (owner 2026-10-10: "make most of the questions type the answer
    // instead of the ABCD ... allow multiple answers"): dataset questions
    // marked fmt:"typed" post WITHOUT options - players type the answer.
    // Distractors are stripped entirely from typed questions so a wrong
    // option text can never false-match. q.alts carries alternative
    // accepted answers; quiz.js handleAnswer matches alts + typo tolerance.
    const isTyped = q.fmt === "typed";
    const alts = isTyped && Array.isArray(q.alts) ? q.alts.map(String).filter(Boolean).slice(0, 6) : [];
    return {
      q: q.q,
      options: isTyped ? [q.options[q.correct]] : q.options,
      correct: isTyped ? 0 : q.correct,
      alts,
      typed: isTyped,
      hideOptions: isTyped,
      difficulty: q.difficulty,
      topic: q.topic || mode,
      domain: mode,
      type: kind,
      loreRef: null,
      ...(kind === "image" ? {
        assetKey: q.img,
        asset: { kind: "image", url: q.img, mime: "image/jpeg", subject: q.subject || "", source: q.source || "dataset" },
      } : {}),
    };
  };
  for (const q of pickedText) {
    used.add(`ds:${mode}:t${q.id}`);
    usage.counts[String(q.id)] = (usage.counts[String(q.id)] || 0) + 1;
    out.push(emit(q, "text"));
  }
  for (const q of pickedImg) {
    used.add(`ds:${mode}:i${q.id}`);
    usage.counts[String(q.id)] = (usage.counts[String(q.id)] || 0) + 1;
    out.push(emit(q, "image"));
  }
  saveUsage(mode, usage);
  return _shuffle(out);
}

module.exports = {
  MODES,
  datasetInfo,
  buildDatasetQuestions,
  _internal: { loadUsage, saveUsage, weightedOrder, _norm },
};
