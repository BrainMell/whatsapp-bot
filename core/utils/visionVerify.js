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
  return !!(process.env.VISION_ENDPOINT && _http);
}

async function verifySubject(buf, mime, subject, context = "") {
  if (!buf || !subject) return { decision: "unknown", reason: "bad-args" };
  if (!providerConfigured()) return { decision: "unknown", reason: "no-provider" };
  const endpoint = process.env.VISION_ENDPOINT;
  const key = process.env.VISION_KEY || "";
  const model = process.env.VISION_MODEL || "vision";
  const timeoutMs = Math.min(30000, parseInt(process.env.VISION_TIMEOUT_MS, 10) || 8000);
  const b64 = Buffer.from(buf).toString("base64");
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
          { type: "image_url", image_url: { url: `data:${mime || "image/jpeg"};base64,${b64}` } },
        ],
      }],
    }, { timeout: timeoutMs });
    const txt = String(r.data?.choices?.[0]?.message?.content || "");
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return { decision: "unknown", reason: "unparseable" };
    const j = JSON.parse(m[0]);
    if (j.nsfw === true) return { decision: "reject", reason: "nsfw" };
    const conf = Number(j.confidence);
    if (j.match === true && (Number.isFinite(conf) ? conf >= 0.5 : true)) return { decision: "accept", confidence: conf };
    if (j.match === false) return { decision: "reject", reason: "subject-mismatch", confidence: conf };
    return { decision: "unknown", reason: "ambiguous" };
  } catch (e) {
    return { decision: "unknown", reason: `error(${String(e.message).slice(0, 40)})` };
  }
}

module.exports = { verifySubject, providerConfigured };
