// Live E2E for the baked logo dataset path (2026-09-28)
process.env.QUIZ_NO_MONGO = "1";
const quizMedia = require("../core/games/quizMedia");

(async () => {
  const info = quizMedia.logoDatasetInfo();
  console.log("dataset:", JSON.stringify(info));
  if (!info.available || info.count < 300) { console.log("FAIL: dataset not loaded"); process.exit(1); }

  // 1. single question for a few dataset brands (real bytes)
  const pool = quizMedia.LOGOS_POOL;
  const names = ["Apple", "Nike", "Samsung", "Adidas", "Netflix", "Ikea"];
  let pass = 0, fail = 0;
  for (const n of names) {
    const brand = pool.find((b) => b.name.toLowerCase() === n.toLowerCase());
    if (!brand) { console.log(`  SKIP ${n} (not in pool)`); continue; }
    const others = pool.filter((b) => b.cat === brand.cat && b.name !== brand.name).slice(0, 3);
    const q = await quizMedia.buildLogosQuestion(brand, others, "easy").catch((e) => { console.log("  ERR", n, e.message); return null; });
    if (q && q._cachedAsset && q._cachedAsset.buf && q._cachedAsset.buf.length > 1500) {
      const src = q.asset.source;
      const bytes = q._cachedAsset.buf.length;
      console.log(`  ok ${n}: ${bytes}B via ${src} correct="${q.options[q.correct]}"`);
      pass++;
    } else {
      console.log(`  FAIL ${n}: no verified media`);
      fail++;
    }
  }

  // 2. batch build (the real quiz path): 12 questions
  const batch = await quizMedia.buildLogosQuestions({ count: 12, usedKeys: new Set(), difficulty: "easy" });
  console.log(`batch: ${batch.length}/12 built`);
  const fromDataset = batch.filter((q) => String(q.asset.source).startsWith("logo-dataset")).length;
  console.log(`from dataset: ${fromDataset}/${batch.length} (rest via live fallback)`);
  const magicOk = batch.every((q) => {
    const b = q._cachedAsset.buf;
    const png = b.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
    const jpg = b.slice(0, 3).toString("hex") === "ffd8ff";
    const webp = b.slice(8, 12).toString("ascii") === "WEBP";
    return png || jpg || webp;
  });
  console.log("magic bytes all valid:", magicOk);
  const optionsOk = batch.every((q) => q.options.length === 4 && new Set(q.options).size === 4 && q.correct >= 0 && q.correct <= 3);
  console.log("options well-formed:", optionsOk);
  const matchOk = batch.every((q) => q.options[q.correct] === q.asset.subject);
  console.log("correct option == asked brand:", matchOk);

  const ok = pass >= 5 && batch.length >= 10 && magicOk && optionsOk && matchOk;
  console.log(ok ? "\nLOGO DATASET LIVE: ALL OK" : "\nLOGO DATASET LIVE: FAILURES PRESENT");
  process.exit(ok ? 0 : 1);
})();
