// On-box diag 3: launch a real song quiz, park, go, then dump the question
// shapes + captured sends to find where the audio clip is lost.
process.chdir("/home/ubuntu/whatsapp-bot");
const quiz = require("/home/ubuntu/whatsapp-bot/core/games/quiz");

const MARK = "\u200B";
const CHAT = "120369777776@g.us";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function makeSock() {
  const sends = [];
  return { sends, sendMessage: async (jid, c) => { sends.push(c); return { key: { id: `s${sends.length}` } }; } };
}

(async () => {
  // cleanup fixture
  const s0 = quiz.getSession(CHAT);
  if (s0) { s0.cancelled = true; quiz._internal.activeQuizzes.delete(CHAT); quiz.releaseLifecycle(CHAT); }

  const sock = makeSock();
  const parsed = quiz.parseQuizArgs("song 2");
  console.log("parsed:", JSON.stringify(parsed));
  quiz._internal.launchQuizAsync(sock, CHAT, "d@s.whatsapp.net", MARK, { key: { id: "m" } }, parsed, "D", null).catch((e) => console.log("launch err:", e.message));
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const s = quiz.getSession(CHAT);
    if (s && s.awaitingGo) break;
    await sleep(1000);
  }
  const parked = quiz.getSession(CHAT);
  if (!parked || !parked.awaitingGo) { console.log("NEVER PARKED"); process.exit(1); }
  console.log(`parked in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (const [si, sec] of (parked.sections || []).entries()) {
    console.log(`section ${si}: name=${sec.name} questions=${(sec.questions || []).length}`);
    for (const [qi, q] of (sec.questions || []).entries()) {
      console.log(`  q${qi}: type=${q.type} topic=${q.topic} asset=${q.asset ? `${q.asset.kind}${q.asset.buf ? "+" + q.asset.buf.length + "B" : " NO-BUF"}${q.asset.url ? " url" : ""}` : "NONE"} answer=${JSON.stringify(q.options ? q.options[q.correct] : q.answer || "?").slice(0, 60)}`);
    }
  }
  await quiz.confirmStart(sock, CHAT, "d@s.whatsapp.net", MARK, false);
  await sleep(6000);
  const aud = sock.sends.filter((c) => c.audio);
  console.log(`\nsends total=${sock.sends.length} audio-sends=${aud.length} audio-bufs=${aud.map((a) => a.audio.length + "B").join(",") || "-"}`);
  const live = quiz.getSession(CHAT);
  if (live) {
    const sec = live.sections[live.activeSection];
    for (const [qi, q] of (sec.questions || []).slice(0, 3).entries()) {
      console.log(`  live q${qi}: type=${q.type} media=${q.media ? `${q.media.kind} ${q.media.buf ? q.media.buf.length + "B" : "NO-BUF"}` : "NULL"} asset=${q.asset ? (q.asset.buf ? q.asset.buf.length + "B" : "no-buf") : "NONE"}`);
    }
  }
  await quiz.endQuiz(sock, CHAT, "d@s.whatsapp.net", MARK, false);
  process.exit(0);
})().catch((e) => { console.error("DIAG CRASH:", e); process.exit(2); });
