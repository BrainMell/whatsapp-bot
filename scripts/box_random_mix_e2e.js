// LIVE E2E: random mixed mode (owner brief "random mode mixing different
// things"). Real network. Asserts: planning announce shows the mix, quiz
// parks for go, Section 0 = Logo Round with real bytes, plan contains
// Spot the Song + Picture Round + lore sections totaling the ask.
process.chdir("/home/ubuntu/whatsapp-bot");
const quiz = require("/home/ubuntu/whatsapp-bot/core/games/quiz");
const goService = require("/home/ubuntu/whatsapp-bot/core/utils/goImageService").getShared();

quiz.setDeps({ goService, ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg" });

const MARK = "\u200B";
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log(`  ok - ${n}`); } else { fail++; console.log(`  FAIL - ${n}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSock() {
  const sends = [];
  return { sends, sendMessage: async (jid, content) => { sends.push({ jid, content }); return { key: { id: `s${sends.length}` } }; } };
}
const texts = (s) => s.sends.filter((x) => x.content.text).map((x) => x.content.text);
const captions = (s) => s.sends.filter((x) => x.content.caption).map((x) => x.content.caption);
const cards = (s) => [...texts(s), ...captions(s)];
const images = (s) => s.sends.filter((x) => x.content.image);

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = fn();
    if (v) return v;
    await sleep(300);
  }
  console.log(`  (timeout waiting for ${label})`);
  return null;
}

async function cleanup(chatId) {
  const s = quiz.getSession(chatId);
  if (s) { s.cancelled = true; if (s.readyTimerId) clearTimeout(s.readyTimerId); if (s.timerId) clearTimeout(s.timerId); if (s.nextTimerId) clearTimeout(s.nextTimerId); }
  quiz._internal.activeQuizzes.delete(chatId);
  quiz.releaseLifecycle(chatId);
}

(async () => {
  console.log("=== LIVE E2E: random mixed mode ===");
  const CHAT = "120369888888@g.us";
  await cleanup(CHAT);
  const sock = makeSock();
  const t0 = Date.now();
  quiz._internal.launchQuizAsync(
    sock, CHAT, "alice@s.whatsapp.net", MARK, { key: { id: "m1" } },
    quiz.parseQuizArgs("random 20"), "Alice", null,
  ).catch((e) => console.log("launch err:", e.message));

  const planning = await waitFor(() => texts(sock).find((t) => t.includes("QUIZ PLANNING") && t.includes("mixed quiz")), 30000, "planning announce");
  ok(!!planning, "planning announce says MIXED quiz");
  if (planning) {
    ok(/🏢 \d+ logos/.test(planning), `announce includes logo count ${(/🏢 (\d+)/.exec(planning) || [])[1] || "?"}`);
    ok(/🎵 \d+ song/.test(planning), `announce includes song count ${(/🎵 (\d+)/.exec(planning) || [])[1] || "?"}`);
    ok(/lore from different worlds/.test(planning), "announce includes multi-world lore");
  }

  const parked = await waitFor(() => quiz.getSession(CHAT) && quiz.getSession(CHAT).awaitingGo, 240000, "park");
  ok(!!parked, `random mixed quiz prepared and parked (prep ${(Date.now() - t0) / 1000 | 0}s)`);
  if (!parked) process.exit(1);

  const s = quiz.getSession(CHAT);
  const domains = s.sections.map((x) => `${x.domain}(${x.perSection})`).join(" + ");
  const total = s.sections.reduce((a, x) => a + x.perSection, 0);
  console.log(`  plan: ${domains} = ${total}`);
  ok(total === 20, "plan totals exactly 20 questions");
  ok(s.sections.some((x) => x.domain === "logos"), "plan has a Logo section");
  ok(s.sections.some((x) => x.domain === "song"), "plan has a Spot the Song section");
  ok(s.sections.some((x) => x.domain === "images"), "plan has a Picture section");
  ok(s.sections.some((x) => ["plot", "characters", "cosmology", "mixed"].includes(x.domain)), "plan has lore sections");
  ok(s.sections[0].domain === "logos", "Section 0 = Logo Round (fast start)");
  ok(!!s.sections.find((x) => ["plot", "characters", "cosmology", "mixed"].includes(x.domain)).franchise, "announced franchise attached to first LORE section");

  // go + play into the logo section
  const r = await quiz.confirmStart(sock, CHAT, "alice@s.whatsapp.net", MARK, false);
  ok(r.handled, "go accepted");
  const q1 = await waitFor(() => cards(sock).find((t) => t.includes("QUESTION 1/")), 30000, "Q1");
  ok(!!q1, "Q1 posted");
  const img = images(sock)[0];
  ok(!!img && Buffer.isBuffer(img.content.image) && img.content.image.length > 1500, `real logo bytes attached (${img ? img.content.image.length : 0}B)`);

  // clean end
  await quiz.endQuiz(sock, CHAT, "alice@s.whatsapp.net", MARK, false).catch(() => {});
  await cleanup(CHAT);
  console.log(`RANDOM MIX E2E: ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
})();
