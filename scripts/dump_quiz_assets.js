// Dump recently-banked image/logo question assets so a human can LOOK at them.
// Run on Box 1: node scripts/dump_quiz_assets.js
const path = require("path");
process.chdir("/home/ubuntu/whatsapp-bot");
const fs = require("fs");
for (const line of fs.readFileSync("/home/ubuntu/whatsapp-bot/.env", "utf8").split("\n")) {
  const mm = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (mm && !process.env[mm[1]]) process.env[mm[1]] = mm[2].trim().replace(/^"|"$/g, "");
}
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const col = mongoose.connection.collection("systems");
  const docs = await col.find({ key: { $regex: /^quiz_bank:/ } }).toArray();
  console.log("bank keys:", docs.length);
  const out = [];
  for (const d of docs) {
    const arr = Array.isArray(d.value) ? d.value : [];
    for (const q of arr) {
      const t = q.type || (q.asset && q.asset.kind) || "";
      const url = q.assetUrl || (q.asset && q.asset.url) || q.imageUrl || null;
      if (t === "image" || t === "logo" || url) {
        out.push({ key: d.key.replace("quiz_bank:", ""), type: t, url, subject: q.subject || (q.options && q.options[q.correct]) || "", q: String(q.q || "").slice(0, 100), opts: (q.options || []).length });
      }
    }
  }
  console.log("image-ish banked questions:", out.length);
  for (const o of out.slice(0, 60)) console.log(JSON.stringify(o));
  await mongoose.disconnect();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
