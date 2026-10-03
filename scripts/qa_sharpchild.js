// QA: SHARP CHILD (2026-09-28) - crash-isolated sharp worker
// Verifies: gate parity with the old in-process gate, SVG variants (BOM /
// comment / DOCTYPE / svgz) rejected WITHOUT crashing the parent, animated
// sticker frames, poison quarantine after a forced timeout, worker respawn,
// and circuit-breaker arithmetic.
// Run: node scripts/qa_sharpchild.js
const sharpChild = require("../core/utils/sharpChild");
const ig = require("../core/utils/imageGate");
const sharp = require("sharp");

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log("  ok -", label); } else { fail++; console.log("  FAIL -", label); } }

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
const zlib = require("zlib");

(async () => {
  console.log("════ gate parity (via isolated worker) ════");
  const good = await toJpeg(noiseBuf(300, 300, { base: 128, spread: 120 }));
  const black = await toJpeg(noiseBuf(300, 300, { base: 4, spread: 10 }));
  const white = await toJpeg(noiseBuf(300, 300, { base: 250, spread: 8 }));
  const tiny = await toJpeg(noiseBuf(50, 50, { base: 128 }));
  ok((await ig.inspectImageBuffer(good)).ok === true, "good jpeg passes through worker");
  ok((await ig.inspectImageBuffer(black)).ok === false, "black frame rejected");
  ok((await ig.inspectImageBuffer(white)).ok === false, "blank white rejected");
  ok((await ig.inspectImageBuffer(tiny)).ok === false, "tiny image rejected");
  ok((await ig.inspectImageBuffer(null)).ok === false, "null buffer rejected");

  console.log("════ SVG variants must be rejected, never crash the parent ════");
  const svgBody = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="red"/><text x="10" y="150">wordmark</text></svg>';
  const pad = Buffer.alloc(3000, 0x20); // big leading-comment padding so <svg> sits past the parent sniff
  const svgs = [
    ["plain svg", Buffer.from(svgBody)],
    ["bom+svg", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(svgBody)])],
    ["comment-prefixed svg", Buffer.from("<!-- made by some editor -->\n" + svgBody)],
    ["doctype svg", Buffer.from('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' + svgBody)],
    ["padded svg (past 1KB sniff)", Buffer.concat([Buffer.from("<!-- "), pad, Buffer.from(" -->" + svgBody)])],
    ["svgz (gzipped svg)", zlib.gzipSync(Buffer.from(svgBody))],
    ["xhtml-embedded svg", Buffer.from('<?xml version="1.0"?><html><body>' + svgBody + "</body></html>")],
  ];
  const parentPid = process.pid;
  for (const [name, buf] of svgs) {
    const r = await ig.inspectImageBuffer(Buffer.concat([buf, Buffer.alloc(1500, 0x41)])); // pad past 1.2KB floor
    ok(r.ok === false, `${name} rejected -> ${r.reason}`);
  }
  ok(process.pid === parentPid, "parent survived every SVG variant (no in-process sharp)");

  console.log("════ animated sticker frames ════");
  const page = await sharp(noiseBuf(120, 120, { base: 150, spread: 100 }).data, { raw: { width: 120, height: 120, channels: 3 } }).png().toBuffer();
  const webpAnim = await sharp(page, { animated: true }).webp({ effort: 0 }).toBuffer(); // 1-page animated webp
  const frames = await sharpChild.runJob("asticker-frames", webpAnim);
  ok(Array.isArray(frames) && frames.length >= 1 && frames.every((f) => f.buf && f.buf.length > 500), `asticker frames extracted (${Array.isArray(frames) ? frames.length : 0} page(s))`);

  console.log("════ poison quarantine (forced timeout path) ════");
  // force a 1ms timeout on the good jpeg -> job times out -> input poisoned
  let timedOut = false;
  try { await sharpChild.runJob("gate", good, {}, 1); } catch (e) { timedOut = /timed out/.test(e.message); }
  ok(timedOut, "forced-timeout job rejects with timeout");
  let poisoned = false;
  try { await sharpChild.runJob("gate", good); } catch (e) { poisoned = /poison-input/.test(e.message); }
  ok(poisoned, "same buffer now rejected instantly as poison-input (no worker respawn loop)");

  console.log("════ worker respawn + circuit breaker ════");
  const other = await toJpeg(noiseBuf(300, 300, { base: 100, spread: 100 }));
  const r2 = await ig.inspectImageBuffer(other);
  ok(r2.ok === true, `fresh (non-poisoned) job succeeds after respawn -> ${JSON.stringify(r2)}`);
  const st = sharpChild.stats();
  ok(st.respawns >= 2, `worker respawned (${st.respawns}x) and came back up (up=${st.up})`);
  ok(st.poisoned >= 1, `poison quarantine recorded (${st.poisoned})`);
  console.log("  stats:", JSON.stringify(st));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("QA crashed:", e); process.exit(1); });
