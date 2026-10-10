// ============================================
// LOGO EMBEDDINGS V2 (2026-10-09, dataset-driven)
// ============================================
// v1 (embed_logos.js) searched Wikipedia per pool brand — its files DIVERGED
// from the baked dataset (different artworks!) and the runtime dequant bug
// kept the whole feature dead anyway. v2 reads data/logoDataset.json
// directly: every embedding is computed from the EXACT artwork the quiz
// serves (brand.url @ width=480), 1:1 with the question pool.
//
// Usage (on Box2, in vision-worker so onnxruntime-node + sharp + model resolve):
//   cd ~/vision-worker && node embed_logos_v2.js /home/ubuntu/whatsapp-bot/data/logoDataset.json /home/ubuntu/whatsapp-bot/data/logoEmbeddings.json
// ============================================
const fs = require("fs");
const path = require("path");
const ort = require("onnxruntime-node");
const sharp = require("sharp");
const axios = require("axios");

const UA = { headers: { "User-Agent": "ZenithQuizBot/2.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function dl(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await axios.get(url, { responseType: "arraybuffer", timeout: 25000, maxRedirects: 5, headers: UA.headers });
      if (r.status === 200 && r.data && r.data.length > 800) return Buffer.from(r.data);
      lastErr = new Error(`status ${r.status}`);
    } catch (e) { lastErr = e; }
    await sleep(500 * (i + 1));
  }
  throw lastErr;
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
  return Array.from(t.data);
}

function quantize(vec) {
  let maxAbs = 0;
  for (const v of vec) maxAbs = Math.max(maxAbs, Math.abs(v));
  if (!maxAbs) return { b64: Buffer.alloc(vec.length).toString("base64"), scale: 1 };
  const q = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round((vec[i] / maxAbs) * 127)));
  return { b64: Buffer.from(q.buffer).toString("base64"), scale: maxAbs / 127 };
}

(async () => {
  const dsPath = process.argv[2];
  const outPath = process.argv[3] || "logoEmbeddings.json";
  if (!dsPath) { console.error("usage: node embed_logos_v2.js <logoDataset.json> [out.json]"); process.exit(1); }
  const ds = JSON.parse(fs.readFileSync(dsPath, "utf8"));
  const brands = (ds.brands || []).filter((b) => b.url && b.name);
  console.log(`[embedv2] ${brands.length} dataset brands`);

  const t0 = Date.now();
  const session = await ort.InferenceSession.create(path.join(__dirname, "mobilenetv2-features.onnx"), {
    executionProviders: ["cpu"], graphOptimizationLevel: "all",
  });
  console.log(`[embedv2] model loaded in ${Date.now() - t0}ms, rss=${(process.memoryUsage().rss / 1048576).toFixed(0)}MB`);

  const vectors = {};
  let ok = 0, miss = 0, err = 0;
  const CONC = 3;
  for (let i = 0; i < brands.length; i += CONC) {
    const batch = brands.slice(i, i + CONC);
    await Promise.all(batch.map(async (b) => {
      try {
        const buf = await dl(b.url);
        const vec = await embedBuffer(session, buf);
        const { b64, scale } = quantize(vec);
        vectors[b.name] = { q: b64, s: scale };
        ok++;
      } catch (e) {
        err++;
        if (err <= 5) console.log(`[embedv2] ${b.name}: ${String(e.message).slice(0, 70)}`);
      }
    }));
    if ((i / CONC) % 25 === 0) console.log(`[embedv2] ${i + batch.length}/${brands.length} (ok=${ok} err=${err})`);
    await sleep(200);
  }

  const out = {
    model: "mobilenetv2-7 (features: mobilenetv20_features_pool0_fwd)",
    dim: 1280,
    quant: "int8-per-vector",
    datasetVersion: ds.version || 1,
    generatedAt: new Date().toISOString(),
    count: ok,
    vectors,
  };
  fs.writeFileSync(outPath, JSON.stringify(out));
  const mb = (fs.statSync(outPath).size / 1048576).toFixed(2);
  console.log(`[embedv2] DONE ok=${ok} err=${err} -> ${outPath} (${mb}MB)`);
  process.exit(0);
})().catch((e) => { console.error("embedv2 crashed:", e.message); process.exit(1); });
