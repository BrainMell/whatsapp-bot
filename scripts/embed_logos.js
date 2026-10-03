// ============================================
// LOGO EMBEDDINGS GENERATOR (owner brief §8)
// ============================================
// Runs on BOX 2 (has Wikipedia network + RAM headroom). For every logo in
// the curated pool: find the Wikipedia file-namespace logo, download it,
// embed with MobileNetV2 (1280-d pooled features), and write
// data/logoEmbeddings.json as per-vector int8-quantized base64
// (~1MB total for 627 logos - the live quiz path is pure float math).
//
// Usage (on box 2):
//   cd /home/ubuntu/vision-worker && node embed_logos.js /home/ubuntu/whatsapp-bot/core/games/quizLogosPool.js out.json
// Then the result is copied into the bot repo at data/logoEmbeddings.json.
// ============================================

const fs = require("fs");
const path = require("path");
const ort = require("onnxruntime-node");
const sharp = require("sharp");
const axios = require("axios");

const UA = { headers: { "User-Agent": "ZenithQuizBot/1.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" } };
const BROWSER_UA = { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gentleGet(url, opts = {}, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await axios.get(url, { timeout: 25000, ...opts });
    } catch (e) {
      lastErr = e;
      const status = e.response?.status;
      // Wikimedia rate-limits bursts: back off progressively
      await sleep(600 * (i + 1) + Math.random() * 400);
      if (i === 1 && status !== 404) {
        // try the browser UA once from attempt 2 on (some CDN edges 403 bot UAs)
        opts = { ...opts, headers: { ...(opts.headers || {}), ...BROWSER_UA.headers } };
      }
    }
  }
  throw lastErr;
}

async function findLogoFile(brand, altName, thumbwidth = 480) {
  // mirrors quizLore.wikipediaLogoImage anchoring: file title must start with
  // the brand string (wiki title OR display name), logo-ish word required
  const d = await gentleGet("https://en.wikipedia.org/w/api.php", {
    params: {
      action: "query", format: "json", formatversion: 2, redirects: 1,
      generator: "search", gsrsearch: `${brand} logo`, gsrlimit: 10, gsrnamespace: 6,
      prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: thumbwidth,
    }, headers: UA.headers,
  });
  const pages = d.data?.query?.pages || [];
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();
  const anchors = [brand];
  if (altName && norm(altName) !== norm(brand)) anchors.push(altName);
  const bNs = anchors.map((a) => norm(a));
  const bN = norm(brand);
  const candidates = pages
    .filter((p) => p.imageinfo && p.imageinfo[0])
    .map((p) => ({ title: p.title.replace(/^file:/i, ""), ii: p.imageinfo[0] }))
    .filter(({ title, ii }) => {
      const t = norm(title);
      if (!bNs.some((x) => t.startsWith(x))) return false;
      if (!/(logo|wordmark|symbol|icon)/.test(t)) return false;
      return !!(ii.thumburl || ii.url);
    })
    .map(({ title, ii }) => ({
      title, ii,
      mimeScore: /^image\/(svg\+xml|png|webp)$/.test(ii.mime || "") ? 2 : (/^image\/jpeg$/.test(ii.mime || "") ? 0 : 1),
      wordCount: norm(title).replace(bN, "").trim().split(/\s+/).filter(Boolean).length,
    }))
    .filter((c) => c.mimeScore > 0)
    .sort((a, b) => (b.mimeScore - a.mimeScore) || (a.wordCount - b.wordCount));
  return candidates.length ? (candidates[0].ii.thumburl || candidates[0].ii.url) : null;
}

async function embedBuffer(session, buf) {
  const raw = await sharp(buf)
    .removeAlpha()
    .resize(224, 224, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .raw().toBuffer();
  const float = new Float32Array(3 * 224 * 224);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < 224 * 224; i++) {
    for (let c = 0; c < 3; c++) {
      float[c * 224 * 224 + i] = (raw[i * 3 + c] / 255 - mean[c]) / std[c];
    }
  }
  const r = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", float, [1, 3, 224, 224]) });
  const t = r["mobilenetv20_features_pool0_fwd"];
  if (!t) throw new Error("no features output");
  return Array.from(t.data); // [1,1280,1,1] -> 1280 floats
}

// per-vector int8 quantization: cosine is scale-invariant, so per-vector
// max-abs scaling loses nothing for similarity ranking
function quantize(vec) {
  let maxAbs = 0;
  for (const v of vec) maxAbs = Math.max(maxAbs, Math.abs(v));
  if (!maxAbs) return { b64: Buffer.alloc(vec.length).toString("base64"), scale: 1 };
  const q = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round((vec[i] / maxAbs) * 127)));
  return { b64: Buffer.from(q.buffer).toString("base64"), scale: maxAbs / 127 };
}

(async () => {
  const poolPath = process.argv[2];
  const outPath = process.argv[3] || "logoEmbeddings.json";
  if (!poolPath) { console.error("usage: node embed_logos.js <quizLogosPool.js> [out.json]"); process.exit(1); }

  // load the pool by executing the module file directly
  const pools = require(path.resolve(poolPath));
  const all = [
    ...pools.TECH, ...pools.APPS, ...pools.FOOD, ...pools.CARS, ...pools.FASHION,
    ...pools.SPORTS, ...pools.GAMING, ...pools.RETAIL, ...pools.TRAVEL, ...pools.MEDIA,
    ...pools.FINTECH, ...pools.HEALTH, ...pools.INDUSTRY, ...pools.TELECOM,
  ];
  const seen = new Set();
  const brands = all.filter((b) => {
    const k = String(b.name || "").toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log(`[embed] ${brands.length} unique brands`);

  const t0 = Date.now();
  const session = await ort.InferenceSession.create(path.join(__dirname, "mobilenetv2-features.onnx"), {
    executionProviders: ["cpu"], graphOptimizationLevel: "all",
  });
  console.log(`[embed] model loaded in ${Date.now() - t0}ms, rss=${(process.memoryUsage().rss / 1048576).toFixed(0)}MB`);

  const vectors = {};
  let okCount = 0, missCount = 0, errCount = 0;
  const CONC = 2;
  for (let i = 0; i < brands.length; i += CONC) {
    const batch = brands.slice(i, i + CONC);
    await Promise.all(batch.map(async (brand) => {
      try {
        const url = await findLogoFile(brand.wiki || brand.name, brand.name);
        if (!url) { missCount++; return; }
        const dl = await gentleGet(url, { responseType: "arraybuffer", maxContentLength: 8 * 1024 * 1024, headers: UA.headers });
        const buf = Buffer.from(dl.data);
        if (buf.length < 1200) { missCount++; return; }
        const vec = await embedBuffer(session, buf);
        const { b64, scale } = quantize(vec);
        vectors[brand.name] = { q: b64, s: scale };
        okCount++;
      } catch (e) {
        errCount++;
        if (errCount <= 5) console.log(`[embed] ${brand.name}: ${String(e.message).slice(0, 70)}`);
      }
    }));
    if ((i / CONC) % 20 === 0) console.log(`[embed] ${i + batch.length}/${brands.length} (ok=${okCount} miss=${missCount} err=${errCount})`);
    await sleep(300); // pacing - never burst Wikimedia
  }

  const out = {
    model: "mobilenetv2-7 (features: mobilenetv20_features_pool0_fwd)",
    dim: 1280,
    quant: "int8-per-vector",
    generatedAt: new Date().toISOString(),
    count: okCount,
    vectors,
  };
  fs.writeFileSync(outPath, JSON.stringify(out));
  const mb = (fs.statSync(outPath).size / 1048576).toFixed(2);
  console.log(`[embed] DONE ok=${okCount} miss=${missCount} err=${errCount} -> ${outPath} (${mb}MB)`);
  process.exit(0);
})().catch((e) => { console.error("embed crashed:", e.message); process.exit(1); });
