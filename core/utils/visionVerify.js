// ============================================
// VISION VERIFY (2026-09-27) - subject-match check for quiz images
// ============================================
// Owner brief section 4: "use vision capabilities to verify the retrieved
// image before sending it. If the question is asking for Zelda, the image
// should actually depict Zelda."
//
// PROVIDER CHAIN (first available wins):
//   1. VISION_ENDPOINT + VISION_KEY (env) - any OpenAI-compatible chat API
//      that accepts image_url content parts. This is how the Box 2 CLIP
//      verifier is wired in (core 2026-09-27 architecture: vision runs on
//      Box 2, the 1GB Box 1 never loads a model).
//   2. No provider -> { decision: "unknown" } - the pipeline falls back to
//      canonical source anchoring (AniList/TVMaze/page-anchored lookups),
//      which is the primary correctness lever; verification is additive.
//
// Contract (non-negotiable): this module NEVER throws, never blocks longer
// than VISION_TIMEOUT_MS (default 8000), and on ANY error returns
// { decision: "unknown" } so callers skip rather than reject on flake.
// ============================================

const _http = (() => {
  try { return require("axios").create({ timeout: 8000, family: 4 }); }
  catch { return null; }
})();

function providerConfigured() {
  return !!(process.env.VISION_ENDPOINT && _http) && Date.now() >= _breakerOpenUntil;
}

// 💡 CIRCUIT BREAKER (2026-09-28): the provider shares a per-minute token
// budget with the quiz LLM (Groq free tier). Three consecutive transport/
// rate-limit failures open the breaker for 5 minutes so verification fails
// FAST ("unknown" -> source anchoring decides) instead of stalling every
// image question against a doomed endpoint.
let _consecFails = 0;
let _breakerOpenUntil = 0;
function _noteResult(ok) {
  if (ok) { _consecFails = 0; return; }
  _consecFails++;
  if (_consecFails >= 3) {
    _breakerOpenUntil = Date.now() + 5 * 60 * 1000;
    _consecFails = 0;
    try { console.log("[VisionVerify] breaker OPEN for 5min after 3 consecutive provider failures"); } catch { }
  }
}

async function verifySubject(buf, mime, subject, context = "") {
  if (!buf || !subject) return { decision: "unknown", reason: "bad-args" };
  if (!providerConfigured()) return { decision: "unknown", reason: "no-provider" };
  const endpoint = process.env.VISION_ENDPOINT;
  const key = process.env.VISION_KEY || "";
  const model = process.env.VISION_MODEL || "vision";
  const timeoutMs = Math.min(30000, parseInt(process.env.VISION_TIMEOUT_MS, 10) || 8000);
  // 2026-09-28: downscale in the crash-isolated sharp worker before upload -
  // fewer vision tokens per call (960px ~13k -> 384px ~3k), protects TPM.
  let b64 = Buffer.from(buf).toString("base64");
  let sendMime = mime || "image/jpeg";
  try {
    const sh = require("./sharpChild");
    const shr = await sh.runJob("shrink", buf, { max: 384 }, 8000);
    if (shr && shr.buf && shr.buf.length) { b64 = Buffer.from(shr.buf).toString("base64"); sendMime = "image/jpeg"; }
  } catch { /* send original on any shrink failure */ }
  const prompt = [
    `You are verifying a quiz image. The question expects: "${subject}".`,
    context ? `Franchise/topic context: "${context}".` : "",
    `Does this image actually depict "${subject}" (or an unmistakable official depiction of them)?`,
    `Also flag inappropriate content (nudity, gore).`,
    `Reply ONLY with JSON: {"match":true|false,"confidence":0.0-1.0,"nsfw":true|false}`,
  ].filter(Boolean).join(" ");
  try {
    const r = await _http.post(endpoint, {
      model,
      max_tokens: 80,
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${sendMime};base64,${b64}` } },
        ],
      }],
    }, {
      timeout: timeoutMs,
      // 💡 2026-09-28: VISION_KEY was read but NEVER SENT - every provider
      // call 401'd (found live on Box 1 against Groq). Send it.
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
    });
    const txt = String(r.data?.choices?.[0]?.message?.content || "");
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) { _noteResult(false); return { decision: "unknown", reason: "unparseable" }; }
    const j = JSON.parse(m[0]);
    _noteResult(true);
    if (j.nsfw === true) return { decision: "reject", reason: "nsfw" };
    const conf = Number(j.confidence);
    if (j.match === true && (Number.isFinite(conf) ? conf >= 0.5 : true)) return { decision: "accept", confidence: conf };
    if (j.match === false) return { decision: "reject", reason: "subject-mismatch", confidence: conf };
    return { decision: "unknown", reason: "ambiguous" };
  } catch (e) {
    _noteResult(false);
    return { decision: "unknown", reason: `error(${String(e.message).slice(0, 40)})` };
  }
}

module.exports = { verifySubject, providerConfigured };
