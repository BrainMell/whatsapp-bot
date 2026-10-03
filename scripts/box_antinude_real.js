// Real Box 2 service negative check: legit anime art must score SAFE.
process.chdir("/home/ubuntu/whatsapp-bot");
const a = require("/home/ubuntu/whatsapp-bot/core/utils/antinude.js");
const fs = require("fs");
a.analyzeMediaBuffer("image", fs.readFileSync("/home/ubuntu/vt_gaara.img")).then((r) => {
  console.log("REAL SERVICE Gaara art:", r ? (r.nsfw * 100).toFixed(1) + "% (thr 45%) -> " + (r.nsfw >= 0.45 ? "VIOLATION" : "safe") : "null (service error)");
  process.exit(r && r.nsfw < 0.45 ? 0 : 1);
}).catch((e) => { console.error("ERR", e.message); process.exit(1); });
