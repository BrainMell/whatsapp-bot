// LIVE POISON E2E (runs ON Box 1): the exact inputs that SIGSEGV'd the bot
// process on 2026-09-27 now must be REJECTED by the deployed imageGate
// without killing THIS process (which stands in for the bot).
process.chdir("/home/ubuntu/whatsapp-bot");
const ig = require("/home/ubuntu/whatsapp-bot/core/utils/imageGate");
const sharpChild = require("/home/ubuntu/whatsapp-bot/core/utils/sharpChild");
const zlib = require("zlib");

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`  ok - ${n}`); } else { fail++; console.log(`  FAIL - ${n}`); } };
const pid = process.pid;

const svgBody = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#777"/><text x="10" y="150">ACME wordmark</text></svg>';
const pad1k = Buffer.alloc(3000, 0x20);
const padTo1_2k = (b) => Buffer.concat([b, Buffer.alloc(1500, 0x41)]);

const cases = [
  ["plain svg", padTo1_2k(Buffer.from(svgBody))],
  ["bom+svg", padTo1_2k(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(svgBody)]))],
  ["comment svg", padTo1_2k(Buffer.from("<!-- editor -->\n" + svgBody))],
  ["doctype svg", padTo1_2k(Buffer.from('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN">' + svgBody))],
  ["padded svg", padTo1_2k(Buffer.concat([Buffer.from("<!-- "), pad1k, Buffer.from(" -->" + svgBody)]))],
  ["svgz", padTo1_2k(zlib.gzipSync(Buffer.from(svgBody)))],
];

(async () => {
  console.log("════ poison SVG battery vs deployed imageGate ════");
  for (const [name, buf] of cases) {
    const r = await ig.inspectImageBuffer(buf);
    ok(r && r.ok === false, `${name} -> ${r ? r.reason : "no-result"}`);
  }
  ok(process.pid === pid, "PROCESS SURVIVED (the 09-27 failure killed the whole bot here)");

  // real webp sticker path (antinude op) still fine through the worker
  const nData = Buffer.alloc(120 * 120 * 3);
  let seed = 7;
  for (let i = 0; i < 120 * 120; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = 100 + (seed % 120);
    nData[i * 3] = v; nData[i * 3 + 1] = v; nData[i * 3 + 2] = v;
  }
  const png = await require("sharp")(nData, { raw: { width: 120, height: 120, channels: 3 } }).png().toBuffer();
  const webp = await require("sharp")(png).webp({ effort: 0 }).toBuffer();
  const frames = await sharpChild.runJob("asticker-frames", webp);
  ok(Array.isArray(frames) && frames.length === 1, `asticker op works on box (${Array.isArray(frames) ? frames.length : 0} frame)`);

  const st = sharpChild.stats();
  console.log("  stats:", JSON.stringify(st));
  ok(st.up === true, "worker is up after the battery");

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("E2E crashed:", e.message); process.exit(1); });
