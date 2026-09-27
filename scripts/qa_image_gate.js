// QA: IMAGE GATE (2026-09-27) - pixel-level renderability checks
// Synthetic cases + REAL network images (AniList/Wikipedia) when reachable.
// Run: node scripts/qa_image_gate.js
const ig = require("../core/utils/imageGate");
const sharp = require("sharp");
const axios = require("axios");

function noiseBuf(w, h, opts = {}) {
  const ch = 3;
  const data = Buffer.alloc(w * h * ch);
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const base = opts.base ?? 128;
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, base + Math.floor(rnd() * (opts.spread ?? 80)) - (opts.spread ?? 80) / 2));
    data[i * ch] = v; data[i * ch + 1] = v; data[i * ch + 2] = v;
  }
  return { data, w, h, ch };
}
async function toJpeg(n) {
  return sharp(n.data, { raw: { width: n.w, height: n.h, channels: n.ch } }).jpeg({ quality: 90 }).toBuffer();
}

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log("  ok -", label); } else { fail++; console.log("  FAIL -", label); } }

(async () => {
  console.log("════ synthetic cases ════");
  const good = await toJpeg(noiseBuf(300, 300, { base: 128, spread: 120 }));
  const black = await toJpeg(noiseBuf(300, 300, { base: 4, spread: 10 }));
  const white = await toJpeg(noiseBuf(300, 300, { base: 250, spread: 8 }));
  const tiny = await toJpeg(noiseBuf(50, 50, { base: 128 }));
  const nT = (() => { const b = noiseBuf(300, 300, { base: 128 }); return b; })();
  const transp = await sharp(Buffer.alloc(300 * 300 * 4), { raw: { width: 300, height: 300, channels: 4 } }).png().toBuffer(); // all zeros incl alpha=0
  const corrupt = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.concat(Array(200).fill(Buffer.from("garbage!")))]);
  const gif = Buffer.from("GIF89a" + "x".repeat(2000));
  const cases = [
    ["mid-tone image passes", good, true],
    ["black frame rejected", black, false],
    ["flat white rejected", white, false],
    ["tiny 50px rejected", tiny, false],
    ["fully transparent rejected", transp, false],
    ["corrupt jpeg rejected", corrupt, false],
    ["gif rejected", gif, false],
  ];
  for (const [name, buf, expect] of cases) {
    const r = await ig.inspectImageBuffer(buf);
    ok(r.ok === expect, `${name} -> ${JSON.stringify(r)}`);
  }

  console.log("════ REAL network images ════");
  const _http = axios.create({ timeout: 15000, family: 4, headers: { "User-Agent": "Mozilla/5.0 WhatsAppQuizBot/1.0" } });
  const fetchB = async (url) => { const r = await _http.get(url, { responseType: "arraybuffer" }); return Buffer.from(r.data); };
  // AniList canonical character art (anime case)
  try {
    const sr = await _http.post("https://graphql.anilist.co", { query: 'query {Character(search:"Edward Elric"){name{full} image{large}}}' });
    const url = sr.data.data.Character.image.large;
    const buf = await fetchB(url);
    const r = await ig.inspectImageBuffer(buf, { label: "anilist" });
    ok(r.ok === true, `AniList canonical art accepted (${buf.length}B, ${r.width}x${r.height} ${r.format})`);
  } catch (e) { console.log("  SKIP - AniList unreachable:", e.message.slice(0, 50)); }
  // Wikipedia article thumb
  try {
    const d = await _http.get("https://en.wikipedia.org/w/api.php", { params: { action: "query", format: "json", formatversion: 2, generator: "search", gsrsearch: "Zelda Twilight Princess", gsrlimit: 2, gsrnamespace: 0, prop: "pageimages", piprop: "thumbnail", pithumbsize: 700 }, headers: { "User-Agent": "ZenithQuizBot/1.0 (WhatsApp trivia bot; contact: ops@zenithbot.dev) axios" } });
    const p = (d.data?.query?.pages || []).find((p) => p.thumbnail?.source);
    if (p) {
      const buf = await fetchB(p.thumbnail.source);
      const r = await ig.inspectImageBuffer(buf, { label: "wikipedia" });
      ok(r.ok === true, `Wikipedia thumb accepted (${buf.length}B ${r.width}x${r.height})`);
    } else console.log("  SKIP - no wikipedia thumb result");
  } catch (e) { console.log("  SKIP - wikipedia unreachable:", e.message.slice(0, 50)); }

  console.log(`\nIMAGE GATE QA: ${pass} ok, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("QA crashed:", e); process.exit(1); });
