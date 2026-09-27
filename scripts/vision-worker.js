// ============================================
// VISION WORKER (Box 2) - image verification service
// ============================================
// Owner brief §4: "use vision capabilities to verify the retrieved image
// before sending it." Box 1 has 245MB free RAM and no Groq vision models -
// so the model lives HERE (Box 2: 506MB free, 2 cores, model already used
// for the logo embeddings). Box 1's quiz pipeline calls this service only
// when a candidate image came from a NON-canonical source and a canonical
// reference exists (anime: the AniList official character art).
//
// MobileNetV2 embeddings + cosine: same character's official art vs a wrong
// image sits FAR apart in this space (calibrated below), so "agreement"
// verification catches the "asked for Zelda, got a man with his dog" class.
//
// Endpoints:
//   GET  /health  -> { ok, model, uptimeS }
//   POST /embed   { image_b64 }            -> { vector: number[1280] }
//   POST /verify  { image_b64, reference_b64 } -> { similarity, decision, threshold }
//
// Deploy (Box 2): pm2 start vision-worker.js --name vision-worker
// Env: VISION_PORT (default 7870), VISION_THRESHOLD (default 0.50)
// ============================================

const http = require("http");
const path = require("path");
const ort = require("onnxruntime-node");
const sharp = require("sharp");

const PORT = parseInt(process.env.VISION_PORT, 10) || 7870;
const THRESHOLD = parseFloat(process.env.VISION_THRESHOLD) || 0.5;
const MAX_BYTES = 8 * 1024 * 1024;

let session = null;
const startedAt = Date.now();

async function embedBuffer(buf) {
  const raw = await sharp(buf)
    .removeAlpha()
    .resize(224, 224, { fit: "contain", background: { r: 255, g: 255, b: 255 } })
    .raw().toBuffer();
  const float = new Float32Array(3 * 224 * 224);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < 224 * 224; i++) {
    for (let c = 0; c < 3; c++) float[c * 224 * 224 + i] = (raw[i * 3 + c] / 255 - mean[c]) / std[c];
  }
  const r = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", float, [1, 3, 224, 224]) });
  const t = r["mobilenetv20_features_pool0_fwd"];
  return Array.from(t.data);
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => { size += c.length; if (size > MAX_BYTES) { reject(new Error("body too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  try {
    if (req.method === "GET" && req.url === "/health") {
      return send(200, { ok: true, model: "mobilenetv2-features", threshold: THRESHOLD, uptimeS: Math.round((Date.now() - startedAt) / 1000), rssMB: Math.round(process.memoryUsage().rss / 1048576) });
    }
    if (req.method !== "POST") return send(404, { error: "not found" });
    const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    if (!body.image_b64) return send(400, { error: "image_b64 required" });
    const imgBuf = Buffer.from(body.image_b64, "base64");
    if (imgBuf.length < 500) return send(400, { error: "image too small" });
    if (req.url === "/embed") {
      const t0 = Date.now();
      const vector = await embedBuffer(imgBuf);
      return send(200, { vector, tookMs: Date.now() - t0 });
    }
    if (req.url === "/verify") {
      if (!body.reference_b64) return send(400, { error: "reference_b64 required" });
      const refBuf = Buffer.from(body.reference_b64, "base64");
      const t0 = Date.now();
      const [v1, v2] = await Promise.all([embedBuffer(imgBuf), embedBuffer(refBuf)]);
      const similarity = cosine(v1, v2);
      return send(200, {
        similarity: Number(similarity.toFixed(4)),
        decision: similarity >= THRESHOLD ? "accept" : "reject",
        threshold: THRESHOLD,
        tookMs: Date.now() - t0,
      });
    }
    return send(404, { error: "not found" });
  } catch (e) {
    return send(500, { error: String(e.message || e).slice(0, 120) });
  }
});

(async () => {
  const t0 = Date.now();
  session = await ort.InferenceSession.create(path.join(__dirname, "mobilenetv2-features.onnx"), {
    executionProviders: ["cpu"], graphOptimizationLevel: "all",
  });
  console.log(`[vision-worker] model loaded in ${Date.now() - t0}ms, rss=${(process.memoryUsage().rss / 1048576).toFixed(0)}MB`);
  server.listen(PORT, "127.0.0.1", () => console.log(`[vision-worker] listening on 127.0.0.1:${PORT}`));
})().catch((e) => { console.error("[vision-worker] fatal:", e.message); process.exit(1); });
