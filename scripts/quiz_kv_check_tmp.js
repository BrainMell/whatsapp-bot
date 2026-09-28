// Box 1 KV inspection: quiz_cfg overrides + quiz_usage + quiz_seen sanity.
// Run on Box 1: node /tmp/quiz_kv_check.js
const mongoose = require("mongoose");
require("dotenv").config();
mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 }).then(async () => {
  const coll = mongoose.connection.db.collection("systems");
  const docs = await coll.find({ _id: { $regex: "^quiz_" } }).toArray();
  console.log("total quiz_* docs:", docs.length);
  for (const d of docs) {
    const v = JSON.stringify(d.value);
    if (d._id.startsWith("quiz_cfg:") || d._id.startsWith("quiz_usage:")) {
      console.log(String(d._id), v.slice(0, 400));
    }
  }
  // specifically look for suspicious numeric values
  for (const d of docs) {
    if (!String(d._id).startsWith("quiz_cfg:")) continue;
    const v = d.value || {};
    const bad = [];
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === "number" && (!Number.isFinite(val) || val <= 0) && k !== "voiceActorQuestionLimit" && k !== "imageQuestionLimit" && k !== "audioQuestionLimit" && k !== "themeSongQuestionLimit" && k !== "sectionBreakDuration") bad.push(`${k}=${val}`);
      if (typeof val === "string" && isNaN(parseInt(val, 10))) bad.push(`${k}="${val}"(str)`);
    }
    if (bad.length) console.log("SUSPECT", String(d._id), bad.join(", "));
  }
  await mongoose.disconnect();
  process.exit(0);
}).catch((e) => { console.error("DBERR", e.message); process.exit(1); });
