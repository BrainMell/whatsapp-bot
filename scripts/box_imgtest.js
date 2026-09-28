// LIVE image-pipeline test on Box 1 (run AFTER deploy of a4cd1c0d):
// AniList character art path + Wikipedia path + full buildImageQuestion.
process.chdir("/home/ubuntu/whatsapp-bot");
const fs = require("fs");
(async () => {
  const q = require("/home/ubuntu/whatsapp-bot/core/games/quiz.js");
  const ql = require("/home/ubuntu/whatsapp-bot/core/games/quizLore.js");

  // 1. AniList: media id 20 = Naruto. The module isn't exporting
  // anilistCharacterImage, so replicate the call through the exported
  // search instead? It IS reachable via require internals only - check export.
  console.log("anilistCharacterImage exported:", typeof q.anilistCharacterImage);
  if (typeof q.anilistCharacterImage === "function") {
    const img = await q.anilistCharacterImage(20, "Naruto Uzumaki").catch((e) => { console.log("anilist ERR", e.message.slice(0, 90)); return null; });
    console.log("anilist char img:", img ? img.url : "NONE");
    if (img) {
      const d = await ql.downloadMedia(img.url, "image");
      console.log("download:", d ? d.buf.length + "B " + d.mime : "FAILED");
      if (d) fs.writeFileSync("/home/ubuntu/vt_naruto_al.img", d.buf);
    }
  }

  // 2. Wikipedia article art (fixed pilicense=any)
  const wp = await ql.wikipediaImage("Naruto Uzumaki", 703, "article").catch(() => null);
  console.log("wikipedia article:", wp ? wp.page : "none");
  if (wp && wp.url) {
    const d = await ql.downloadMedia(wp.url, "image");
    console.log("wp download:", d ? d.buf.length + "B " + d.mime : "FAILED");
    if (d) fs.writeFileSync("/home/ubuntu/vt_naruto_wp.img", d.buf);
  }
  process.exit(0);
})().catch((e) => { console.error("SUITE ERR", e.message); process.exit(1); });
