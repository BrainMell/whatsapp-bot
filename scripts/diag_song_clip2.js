// On-box diag 2: call the REAL buildSpotSongQuestions and see what comes back.
process.chdir("/home/ubuntu/whatsapp-bot");
const goService = require("/home/ubuntu/whatsapp-bot/core/utils/goImageService").getShared();
const quizMedia = require("/home/ubuntu/whatsapp-bot/core/games/quizMedia");
const { loadUsage, saveUsage } = quizMedia._internal;

(async () => {
  const orig = quizMedia._internal;
  // wrap getAudioInfo to trace calls
  const q = await quizMedia.buildSpotSongQuestions({ count: 2, usedKeys: new Set(), difficulty: "easy", goService, trimFn: null });
  console.log("built:", q.length);
  for (const item of q) {
    console.log(`- "${item.q}" | media: ${item.media ? `${item.media.kind} ${item.media.buf ? item.media.buf.length + "B" : "NO BUF"}` : "NULL"} | options: ${item.options ? item.options.length : "?"} | correct: ${item.correct}`);
  }
  process.exit(0);
})();
