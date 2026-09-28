// FULL production image-question build, live on Box 1.
// Exercises: Fandom pageimage (download currently CF-blocked) -> AniList
// character art (fixed query) -> Wikipedia (fixed pilicense + anchors).
process.chdir("/home/ubuntu/whatsapp-bot");
const fs = require("fs");
(async () => {
  const q = require("/home/ubuntu/whatsapp-bot/core/games/quiz.js");
  const buckets = {
    easy: ["Naruto Uzumaki", "Sasuke Uchiha", "Sakura Haruno", "Kakashi Hatake", "Gaara", "Hinata Hyuga"],
    medium: ["Jiraiya", "Orochimaru", "Might Guy", "Tsunade"],
    hard: ["Shino Aburame", "Kiba Inuzuka"],
  };
  const t0 = Date.now();
  const question = await q.buildImageQuestion("naruto", "Naruto", buckets, new Set(), "easy", { franchise: { anime: { id: 20 }, mediaType: "anime" }, mediaType: "anime" }).catch((e) => { console.log("ERR", e.message); return null; });
  console.log(`built in ${Date.now() - t0}ms`);
  if (!question) { console.log("NO QUESTION BUILT"); process.exit(1); }
  console.log("q:", question.q);
  console.log("options:", question.options.join(" | "), "| correct idx:", question.correct);
  console.log("subject:", question.asset.subject, "| source:", question.asset.source);
  console.log("url:", question.asset.url);
  process.exit(0);
})().catch((e) => { console.error("SUITE ERR", e.message); process.exit(1); });
