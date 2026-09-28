
// Permission matrix E2E on Box 1 - REAL engine deps, REAL shared KV.
process.chdir("/home/ubuntu/whatsapp-bot");
const engine = require("/home/ubuntu/whatsapp-bot/core/engine"); // top-level only: sets quiz deps, loads mod sets
const quiz = require("/home/ubuntu/whatsapp-bot/core/games/quiz");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c2, l) => { if (c2) { pass++; console.log("  ok -", l); } else { fail++; console.log("  FAIL -", l); } };
const MARK = "\u200b";
const sock = { sent: [], async sendMessage(j, c2) { this.sent.push({ j, c2 }); return { key: { id: "m" + this.sent.length } }; } };
const CHAT = "120369777777@g.us";
const OWNER = "233201487480@s.whatsapp.net";          // bot owner (BOT_OWNER_PHONES[0])
const RANDOM = "999555000@s.whatsapp.net";            // unauthorized member
const QUIZMOD = "777888999@s.whatsapp.net";           // will be added as quiz mod, then removed

(async () => {
  await wait(3000); // allow boot-time loaders to settle
  const isOwnerFn = engine.isBotOwner;
  ok(isOwnerFn(OWNER), "isBotOwner recognizes the owner jid");
  ok(!isOwnerFn(RANDOM), "isBotOwner rejects a random member");

  // add QUIZMOD through the real engine API (writes shared KV)
  try { await engine.addQuizMod(QUIZMOD); } catch (e) { console.log("  (addQuizMod signature differs:", e.message, ")"); }
  await wait(1500);
  const modNow = engine.isQuizMod(QUIZMOD);
  console.log("  (isQuizMod(QUIZMOD) =", modNow, ")");

  // ── start gate: startQuiz as RANDOM must DENY ──
  const deny = await quiz.startQuiz(sock, CHAT, RANDOM, MARK, { key: { id: "p1" } }, '"naruto" 2 easy', "Random", null);
  ok(deny.handled && deny.message && deny.message.includes("limited to"), "unauthorized user CANNOT start a quiz (denied with guidance)");
  ok(!quiz.hasActive(CHAT) && !quiz._internal.lifecycle.has(CHAT), "denied start left no session/lock");

  // ── start gate: owner CAN start ──
  const allow = await quiz.startQuiz(sock, CHAT, OWNER, MARK, { key: { id: "p2" } }, '"naruto" 2 easy', "Owner", null);
  ok(allow.handled && allow.silent, "bot owner CAN start a quiz");
  let parked = null;
  for (let i = 0; i < 240 && !parked; i++) { const c = quiz.getSession(CHAT); if (c && c.awaitingGo) parked = c; else await wait(250); }
  ok(!!parked, "owner's quiz parked at the ready gate");

  // ── go gate: RANDOM cannot fire someone else's go ──
  const denyGo = await quiz.confirmStart(sock, CHAT, RANDOM, MARK, false);
  ok(denyGo.handled && denyGo.message && denyGo.message.includes("can start this quiz"), "unauthorized user CANNOT .j quiz go someone else's quiz");
  ok(quiz.getSession(CHAT) && quiz.getSession(CHAT).awaitingGo === true, "denied go restored the ready gate (quiz still parked)");

  // ── go gate: owner fires it ──
  const goOk = await quiz.confirmStart(sock, CHAT, OWNER, MARK, false);
  ok(goOk.handled && goOk.silent, "starter/owner CAN .j quiz go");
  // ── end gate: RANDOM cannot end ──
  const denyEnd = await quiz.endQuiz(sock, CHAT, RANDOM, MARK, false);
  ok(denyEnd.handled && denyEnd.message && denyEnd.message.includes("can end it early"), "unauthorized user CANNOT end someone else's quiz");
  // ── end gate: owner ends ──
  const endOk = await quiz.endQuiz(sock, CHAT, OWNER, MARK, false);
  ok(endOk.handled, "owner CAN end the quiz");
  ok(!quiz.hasActive(CHAT), "chat freed after owner end");

  // cleanup quiz mod if we added one
  try { await engine.delQuizMod(QUIZMOD); } catch { }
  console.log(`\nPERM MATRIX: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("PERM HARNESS CRASH:", e); process.exit(2); });
