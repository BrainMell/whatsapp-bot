// ===============================================
// ANIMEQUIZSNIPER.JS — omniverse anime quiz auto-answerer
// ===============================================
// 🎯 Owner directive 2026-11-09 21:50Z: "hook subaru up, he sees the message
// instantly answers.... now ik the llm is might be dumb so idk look use the
// Google? Make it fast ... don't sent if there's an error just retry then
// send idk . GO NOW. Don't touch joker this is gonna be subaru working".
//
// Pipeline: engine.js messages.upsert (fire-and-forget like fxSniff) →
//   group subject matches /omniverse/i → text matches the strict
//   Q#. / A) B) C) D) quiz shape → web-search the question (DDG html →
//   DDG lite → Brave, reusing aiOverview's parsers + cache) → score every
//   option by full-phrase + keyword hits in the snippets → instantly send
//   "X) <option text>" with send-retries (owner: retry, then send).
//
// Gates: botId Subaru ONLY (joker/jake untouched), @g.us only, omniverse
// subject only, one answer per question number (Baileys replay-safe).
// Never throws into the command pipeline.

const axios = require("axios");
const aio = require("./utils/aiOverview");

const SUBJECT_RE = /omniverse/i;
const TARGET_BOT = "subaru";

// Q5. question text…\nA) …\nB) …\nC) …\nD) …  (tolerant separators, \r\n safe)
const QUIZ_RE =
  /Q\s?(\d{1,3})\s*[.):-]\s*([^\n]+)\n+\s*A\s*[).:-]\s*([^\n]+)\n+\s*B\s*[).:-]\s*([^\n]+)\n+\s*C\s*[).:-]\s*([^\n]+)\n+\s*D\s*[).:-]\s*([^\n]+)/i;

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const metaCache = new Map(); // jid -> subject string
const answered = new Set();  // "jid:qnum" — answered guard
const inflight = new Set();  // "jid:qnum" — in-flight guard

const STOP = new Set(
  ("who what when where why how which whose is are was were the a an of to in on " +
    "for with and or by at from that this it its as can will would used using name")
    .split(/\s+/),
);

function textOf(m) {
  const t = m && m.message;
  if (!t) return "";
  return String(
    t.conversation ||
      t.extendedTextMessage?.text ||
      t.imageMessage?.caption ||
      t.videoMessage?.caption ||
      "",
  ).trim();
}

async function subjectOf(sock, jid) {
  if (metaCache.has(jid)) return metaCache.get(jid);
  const meta = await sock.groupMetadata(jid);
  const subject = String((meta && meta.subject) || "");
  metaCache.set(jid, subject);
  if (metaCache.size > 500) metaCache.delete(metaCache.keys().next().value);
  return subject;
}

async function searchWeb(query) {
  const cached = aio.cacheGet(query);
  if (cached && cached.results && cached.results.length) return cached.results;
  // 1) DDG html (POST) — the classic result cards
  try {
    const r = await axios.post(
      "https://html.duckduckgo.com/html/",
      new URLSearchParams({ q: query }).toString(),
      { timeout: 7000, headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" } },
    );
    const res = aio.dedupeAndCap(aio.parseDdgHtml(r.data) || [], 8);
    if (res.length) { aio.cacheSet(query, res, "ddg-html"); return res; }
  } catch (e) { /* next backend */ }
  // 2) DDG lite (GET)
  try {
    const r = await axios.get("https://lite.duckduckgo.com/lite/", {
      params: { q: query }, timeout: 7000, headers: UA,
    });
    const res = aio.dedupeAndCap(aio.parseDdgLite(r.data) || [], 8);
    if (res.length) { aio.cacheSet(query, res, "ddg-lite"); return res; }
  } catch (e) { /* next backend */ }
  // 3) Brave organic
  try {
    const r = await axios.get("https://search.brave.com/search", {
      params: { q: query }, timeout: 7000, headers: UA,
    });
    const res = aio.dedupeAndCap(aio.parseBraveHtml(r.data) || [], 8);
    if (res.length) { aio.cacheSet(query, res, "brave"); return res; }
  } catch (e) { /* give up below */ }
  return [];
}

function normOption(s) {
  return String(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")        // drop parentheticals: "(Jinton)"
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Evidence-based picker (calibrated on live omniverse Q5/Q6):
// The search result whose text best matches the QUESTION's own words is the
// one ANSWERING the question — tails are pollution (e.g. "later becomes a
// Crimson Red Nichirin" for a question about the FIRST draw). So:
//   stage A — score options against ONLY that best-matching snippet;
//             if exactly ONE option shows up there, that's the answer.
//   stage B — fallback: position-weighted presence across all snippets,
//             unique dominant option only; ambiguous → stay silent
//             (a wrong answer costs the quiz, silence costs nothing).
function answerIndex(question, opts, results) {
  const qWords = aio.significantWords(question);
  const texts = (results || []).map((r) =>
    `${r.title || ""} ${r.snippet || ""}`.toLowerCase(),
  );
  if (!texts.length) return -1;
  const qov = texts.map((t) => qWords.filter((w) => t.includes(w)).length);
  let bi = 0;
  for (let i = 1; i < texts.length; i++) if (qov[i] > qov[bi]) bi = i;

  const pres = opts.map((o) => {
    const core = normOption(o);
    const phrase = core.length > 2 && texts[bi].includes(core);
    const words = core
      .split(" ")
      .filter((w) => w.length >= 3 && !STOP.has(w) && texts[bi].includes(w));
    return { phrase, score: (phrase ? 10 : 0) + words.length * 2 };
  });
  const pScores = pres.map((p) => p.score);
  const pMax = Math.max(...pScores);
  const nHit = pScores.filter((s) => s > 0).length;
  if (nHit === 1 && pMax >= 2) return pScores.indexOf(pMax);            // unique support
  if (pMax >= 10 && pScores.filter((s) => s >= 10).length === 1) return pScores.indexOf(pMax); // unique phrase hit

  // stage B: position-weighted presence across all snippets
  const scores = opts.map((o) => {
    const core = normOption(o);
    const words = core.split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
    let s = 0;
    texts.forEach((t, i) => {
      const wgt = Math.max(1, 6 - i);
      if (core.length > 2 && t.includes(core)) s += 10 * wgt;
      for (const w of words) if (t.includes(w)) s += 2 * wgt;
    });
    return s;
  });
  const sMax = Math.max(...scores);
  if (sMax >= 12) {
    const top = scores.filter((s) => s >= sMax * 0.85).length;
    if (top === 1) return scores.indexOf(sMax);
  }
  return -1;
}

async function sendAnswer(sock, jid, letter, opt) {
  const text = `${letter}) ${String(opt).trim()}`;
  for (let i = 0; i < 5; i++) {
    try { await sock.sendMessage(jid, { text }); return true; }
    catch (e) { await new Promise((r) => setTimeout(r, 300 + i * 300)); }
  }
  return false;
}

async function snipe(m, sock, botId) {
  let key = null;
  try {
    if (String(botId || "").toLowerCase() !== TARGET_BOT) return;   // 🔒 subaru only
    const jid = (m && m.key && m.key.remoteJid) || "";
    if (!jid.endsWith("@g.us")) return;
    const text = textOf(m);
    const qm = text.match(QUIZ_RE);
    if (!qm) return;
    const subject = await subjectOf(sock, jid).catch(() => "");
    if (!SUBJECT_RE.test(subject)) {
      // (gate diagnostics: a quiz-shaped message blocked here is a silent
      // miss unless we LOG it — then it's a one-line regex fix away)
      console.log(`🎯 [quiz-sniper] quiz-shaped msg in ${jid} subject="${subject}" — GATE BLOCKED (subject not /omniverse/i)`);
      return;                                                         // omniverse only
    }
    key = `${jid}:${qm[1]}`;
    if (answered.has(key) || inflight.has(key)) return;
    inflight.add(key);

    const t0 = Date.now();
    const qnum = qm[1];
    const question = qm[2].trim();
    const opts = [qm[3], qm[4], qm[5], qm[6]].map((s) => String(s).trim());

    const results = await searchWeb(question.slice(0, 300));

    let letter = null, opt = null;
    const ai = answerIndex(question, opts, results);
    if (ai >= 0) {
      letter = "ABCD"[ai];
      opt = opts[ai];
    }

    if (letter) {
      answered.add(key);
      if (answered.size > 300) answered.delete(answered.keys().next().value);
      const ok = await sendAnswer(sock, jid, letter, opt);
      console.log(`🎯 [quiz-sniper] Q${qnum} -> ${letter} ${ok ? "SENT" : "SEND-FAILED-after-retries"} in ${Date.now() - t0}ms (${results.length} results)`);
    } else {
      console.log(`🎯 [quiz-sniper] Q${qnum} -> no confident answer (${results.length} results) — staying silent`);
    }
  } catch (e) {
    console.log(`🎯 [quiz-sniper] skipped: ${(e && e.message) || e}`);
  } finally {
    if (key) inflight.delete(key);
  }
}

module.exports = { snipe };
