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
//   POST /nsfw    { image_b64 }            -> { nsfw: 0..1, decision, tookMs }
//     (Falconsai ViT binary classifier, int8 ONNX - model loads LAZILY on
//      first /nsfw call so the default footprint stays at ~120MB)
//
// Deploy (Box 2): pm2 start vision-worker.js --name vision-worker
// Env: VISION_PORT (default 7870), VISION_THRESHOLD (default 0.50),
//      NSFW_DELETE_THRESHOLD (default 0.70 - calibrated: safe anime/memes/
//      swimsuits/classical art all scored <= 0.03)
// ============================================

const http = require("http");
const path = require("path");
const ort = require("onnxruntime-node");
const sharp = require("sharp");

const PORT = parseInt(process.env.VISION_PORT, 10) || 7870;
const THRESHOLD = parseFloat(process.env.VISION_THRESHOLD) || 0.5;
const NSFW_DELETE_THRESHOLD = parseFloat(process.env.NSFW_DELETE_THRESHOLD) || 0.7;
const MAX_BYTES = 8 * 1024 * 1024;

let session = null;      // mobilenet features (embeddings)
let nsfwSession = null;  // Falconsai ViT int8 (lazy)
let nudeSession = null;  // NudeNet 320n detector (lazy)
const startedAt = Date.now();

// NudeNet v3 class names (output0 = [1, 4+18, 2100], class order fixed by model)
const NUDE_CLASSES = [
  "FEMALE_GENITALIA_EXPOSED", "FEMALE_BREAST_EXPOSED", "FEMALE_GENITALIA_COVERED",
  "MALE_GENITALIA_EXPOSED", "ANUS_EXPOSED", "FEMALE_BREAST_COVERED",
  "BUTTOCKS_EXPOSED", "FACE_FEMALE", "MALE_BREAST_EXPOSED", "MALE_GENITALIA_COVERED",
  "BUTTOCKS_COVERED", "FACE_MALE", "BELLY_COVERED", "FEET_COVERED",
  "BELLY_EXPOSED", "ARMPITS_COVERED", "ARMPITS_EXPOSED", "FEET_EXPOSED",
];
// parts that constitute a nudity violation when exposed (score >= NUDE_PART_THRESHOLD)
const NUDE_VIOLATION_CLASSES = new Set([
  "FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED", "FEMALE_BREAST_EXPOSED",
  "BUTTOCKS_EXPOSED", "ANUS_EXPOSED",
]);
const NUDE_PART_THRESHOLD = parseFloat(process.env.NSFW_PART_THRESHOLD) || 0.45;

async function getNsfwSession() {
  if (!nsfwSession) {
    nsfwSession = await ort.InferenceSession.create(path.join(__dirname, "nsfw_int8.onnx"), {
      executionProviders: ["cpu"], graphOptimizationLevel: "all",
    });
    console.log("[vision-worker] nsfw model loaded");
  }
  return nsfwSession;
}

async function getNudeSession() {
  if (!nudeSession) {
    nudeSession = await ort.InferenceSession.create(path.join(__dirname, "nudenet_320n.onnx"), {
      executionProviders: ["cpu"], graphOptimizationLevel: "all",
    });
    console.log("[vision-worker] nudenet model loaded");
  }
  return nudeSession;
}

// ── NudeNet (YOLOv8n @ 320) ─────────────────────────────────────────
// Preprocess: letterbox to 320x320 (contain, gray-114 pad), /255.
// Postprocess: output [1, 4+18, 2100]; boxes are absolute 320-space xywh,
// class scores already sigmoided. Confidence filter + NMS (IoU 0.45).
async function detectNudeParts(buf) {
  const s = await getNudeSession();
  const raw = await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .resize(320, 320, { fit: "contain", background: { r: 114, g: 114, b: 114 } })
    .raw().toBuffer();
  const f = new Float32Array(3 * 320 * 320);
  for (let i = 0; i < 320 * 320; i++) {
    f[i] = raw[i * 3] / 255;                 // R
    f[320 * 320 + i] = raw[i * 3 + 1] / 255; // G
    f[2 * 320 * 320 + i] = raw[i * 3 + 2] / 255; // B
  }
  const r = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", f, [1, 3, 320, 320]) });
  const out = r[s.outputNames[0]].data; // [1, 22, 2100]
  const N_ANCHORS = 2100, N_CLS = NUDE_CLASSES.length;
  const cands = [];
  for (let a = 0; a < N_ANCHORS; a++) {
    let best = 0, bestIdx = -1;
    for (let c = 0; c < N_CLS; c++) {
      const v = out[(4 + c) * N_ANCHORS + a];
      if (v > best) { best = v; bestIdx = c; }
    }
    if (best >= 0.25) {
      const cx = out[0 * N_ANCHORS + a], cy = out[1 * N_ANCHORS + a];
      const w = out[2 * N_ANCHORS + a], h = out[3 * N_ANCHORS + a];
      cands.push({ cls: bestIdx, score: best,
        x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 });
    }
  }
  cands.sort((p, q) => q.score - p.score);
  const kept = [];
  for (const c of cands) {
    let ok = true;
    for (const k of kept) {
      const ix = Math.max(0, Math.min(c.x2, k.x2) - Math.max(c.x1, k.x1));
      const iy = Math.max(0, Math.min(c.y2, k.y2) - Math.max(c.y1, k.y1));
      const inter = ix * iy;
      const union = (c.x2 - c.x1) * (c.y2 - c.y1) + (k.x2 - k.x1) * (k.y2 - k.y1) - inter;
      if (inter / (union || 1) > 0.45) { ok = false; break; }
    }
    if (ok) kept.push(c);
  }
  return kept.map((c) => ({ label: NUDE_CLASSES[c.cls], score: Number(c.score.toFixed(3)) }));
}

// Falconsai ViT preprocessing: resize 224x224 (bilinear), /255, normalize 0.5/0.5
async function classifyNsfw(buf) {
  const s = await getNsfwSession();
  const raw = await sharp(buf, { failOn: "none" })
    .removeAlpha()
    .resize(224, 224, { fit: "cover" })
    .raw().toBuffer();
  const f = new Float32Array(3 * 224 * 224);
  for (let i = 0; i < 224 * 224; i++) {
    for (let c = 0; c < 3; c++) f[c * 224 * 224 + i] = ((raw[i * 3 + c] / 255) - 0.5) / 0.5;
  }
  const r = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", f, [1, 3, 224, 224]) });
  const d = r[s.outputNames[0]].data;
  const m = Math.max(d[0], d[1]);
  const e0 = Math.exp(d[0] - m), e1 = Math.exp(d[1] - m);
  return e1 / (e0 + e1); // P(nsfw)
}

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
    if (req.method === "POST" && req.url === "/nsfw") {
      if (!body.image_b64) return send(400, { error: "image_b64 required" });
      const imgBuf = Buffer.from(body.image_b64, "base64");
      if (imgBuf.length < 500) return send(400, { error: "image too small" });
      const t0 = Date.now();
      try {
        // PRIMARY: NudeNet part detector (calibrated 2026-09-27: real public-nudity
        // photos 0.44-0.9 exposed parts, safe/borderline matrix empty; the old
        // Falconsai-only path scored real nudity 0.000-0.003 and was blind).
        // SECONDARY: Falconsai whole-image classifier (catches pose/softcore
        // signals the part detector may miss).
        const [parts, falconsai] = await Promise.all([
          detectNudeParts(imgBuf).catch((e) => { console.error("[vision-worker] nudenet failed:", String(e.message).slice(0, 80)); return []; }),
          classifyNsfw(imgBuf).catch(() => 0),
        ]);
        const violations = parts.filter((p) => NUDE_VIOLATION_CLASSES.has(p.label) && p.score >= NUDE_PART_THRESHOLD);
        const partScore = violations.reduce((m, p) => Math.max(m, p.score), 0);
        const nsfw = Math.max(partScore, falconsai);
        return send(200, {
          nsfw: Number(nsfw.toFixed(4)),
          decision: nsfw >= NSFW_DELETE_THRESHOLD ? "delete" : nsfw >= 0.35 ? "review" : "ok",
          threshold: NSFW_DELETE_THRESHOLD,
          parts: parts.filter((p) => NUDE_VIOLATION_CLASSES.has(p.label) || p.score >= 0.45).slice(0, 6),
          falconsai: Number(falconsai.toFixed(4)),
          tookMs: Date.now() - t0,
        });
      } catch (e) {
        return send(500, { error: String(e.message || e).slice(0, 120) });
      }
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
