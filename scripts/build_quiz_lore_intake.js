#!/usr/bin/env node
/* build_quiz_lore_intake.js — pass7a: keyless LORE intake for quiz overhaul.
 * Owner directive: >=90% story/world/lore, <=10% production. This pulls
 * OpenTDB (full media categories) + the-trivia-api (film&tv, video games),
 * filters out production-style questions with an in-universe classifier,
 * dedupes against the existing dataset stems, writes /tmp/lore_intake.json.
 */
'use strict';
const fs = require("fs");
const UA = "quiz-dataset-builder/1.0 (whatsapp-bot maintenance)";
const OUT = "/tmp/lore_intake.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeHtml(s) {
  if (!s) return s;
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return " "; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; } })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'").replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"')
    .replace(/&eacute;/g, "é").replace(/&Eacute;/g, "É");
}
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// production classifier (mirrors scripts/quiz_content_audit.py incl. fixes)
const PROD_PATTERNS = [
  [/who (plays|played|voices|voiced|voicing) /i, "cast"],
  [/direct(ed|or|ing) /i, "director"],
  [/\bwhat year\b|\bin what year\b|\bwhich year\b/i, "year"],
  [/\breleased?\b|\bpremiered?\b|\bfirst published\b|\bfirst aired\b|\bcame out\b|\bair(ed|s)? date\b/i, "release/premiere"],
  [/\bhow many (copies|units|episodes|seasons|players|owners)\b/i, "counts"],
  [/\b(developed by|developer|published by|publisher|which (company|studio|corporation)|what company|who (developed|published))\b/i, "dev/pub"],
  [/\bwhich (console|platform|gaming system)\b|\bwhat (console|platform)\b/i, "platform"],
  [/\b(air(ed|s)? on|which network|what network|which channel|what channel)\b/i, "network"],
  [/\b(theme (song|tune)|soundtrack|opening theme|ending theme|composed by|composer|singer|songwriter|record label)\b/i, "music"],
  [/\b(oscar|academy award|emmy|golden globe|grammy|award|game awards)\b/i, "award"],
  [/\b(voice actor|voice of|voiced by)\b/i, "voice cast"],
  [/\bstudio\b/i, "studio"],
  [/\bwho (wrote|created)\b|\bcreated by\b|\bwritten by\b|\bscreenwriter\b|\bauthor\b/i, "creator"],
  [/\b(actor|actress)\b/i, "actor"],
  [/\bbased on (the )?(novel|book|manga|comic)\b/i, "adaptation"],
  [/\bmotion picture\b|\brated (r|pg|pg-13)\b/i, "rating"],
  [/\bnarrator|narrated\b/i, "narrator"],
  [/\bbox office\b|\bbudget\b|\bgross(ed|ing)?\b/i, "money"],
];
const JUNK = /\b(seen here|shown here|in this (clip|picture|image|photo|video)|audio clip|this excerpt|this episode of .* has)\b/i;

function classifyProd(q) {
  for (const [re, tag] of PROD_PATTERNS) if (re.test(q)) return tag;
  return null;
}

let axios;
async function jget(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await axios.get(url, { timeout: 25000, headers: { "User-Agent": UA }, maxContentLength: 60 * 1024 * 1024 });
      return r.data;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1500 + i * 2500);
    }
  }
}

// ── existing stems to dedupe against ──
const DS = JSON.parse(fs.readFileSync("/home/ubuntu/whatsapp-bot/data/quizDataset.json", "utf8"));
const seenStems = new Set();
for (const c of Object.values(DS.categories)) {
  for (const x of (c.questions || [])) seenStems.add(normKey(x.q));
  for (const x of (c.images || [])) seenStems.add(normKey(x.q + "|" + x.subject));
}

const items = [];
function addText(cat, topic, q, options, correct, difficulty, source) {
  q = decodeHtml(q).replace(/\s+/g, " ").trim();
  if (q.length < 25 || q.length > 170) return false;
  if (JUNK.test(q)) return false;
  if (classifyProd(q)) return false;
  if (!Array.isArray(options) || options.length !== 4) return false;
  options = options.map((o) => decodeHtml(String(o)).replace(/\s+/g, " ").trim());
  const opts = [...new Set(options.map(normKey))];
  if (opts.length !== 4 || opts.includes("")) return false;
  const stem = normKey(q);
  if (seenStems.has(stem)) return false;
  seenStems.add(stem);
  items.push({ cat, topic, q, options, correct, difficulty: difficulty || "medium", source, cls: "lore" });
  return true;
}

async function opentdb() {
  // category -> [dataset cat, topic]
  const CATS = { 15: ["games", "Video Games"], 11: ["movies", "Movies"], 14: ["series", "TV Series"], 31: ["comics", "Manga"], 32: ["series", "Cartoons"], 29: ["comics", "Comics"], 13: ["movies", "Musicals"] };
  let token = null;
  try { token = (await jget("https://opentdb.com/api_token.php?command=request")).token; } catch {}
  const stats = {};
  for (const [cid, [cat, topic]] of Object.entries(CATS)) {
    let n = 0, empty = 0;
    for (let page = 0; page < 40 && empty < 3; page++) {
      let data;
      try {
        data = await jget(`https://opentdb.com/api.php?amount=50&category=${cid}&type=multiple${token ? `&token=${token}` : ""}&page=${page + 1}`);
      } catch { break; }
      if (!data || data.response_code !== 0 || !Array.isArray(data.results) || !data.results.length) { empty++; await sleep(400); continue; }
      empty = 0;
      for (const r of data.results) {
        const opts = [...r.incorrect_answers.map(String), String(r.correct_answer)];
        // shuffle deterministically-ish
        for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
        const correct = opts.findIndex((o) => normKey(o) === normKey(r.correct_answer));
        if (addText(cat, topic, r.question, opts, correct, r.difficulty, "opentdb")) n++;
      }
      await sleep(350);
    }
    stats[cid] = n;
    console.log(`[opentdb] cat ${cid} (${topic}) +${n} lore`);
  }
  return stats;
}

async function triviaApi() {
  const CATS = { film_and_tv: "auto", video_games: ["games", "Video Games"], music: null };
  const stats = {};
  for (const [c, route] of Object.entries(CATS)) {
    if (!route) continue;
    const [defCat, defTopic] = Array.isArray(route) ? route : ["movies", "Movies"];
    let n = 0;
    for (let page = 1; page <= 15; page++) {
      let data;
      try { data = await jget(`https://the-trivia-api.com/v2/questions?limit=100&page=${page}&categories=${c}`); } catch { break; }
      if (!Array.isArray(data) || !data.length) break;
      for (const r of data) {
        const text = typeof r.question === "object" ? r.question.text : r.question;
        const opts = [...(r.incorrectAnswers || []).map(String), String(r.correctAnswer)];
        for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
        const correct = opts.findIndex((o) => normKey(o) === normKey(r.correctAnswer));
        let dst = defCat, topic = defTopic;
        if (route === "auto") {
          const tags = r.tags || [];
          if (tags.includes("television") || tags.includes("tv")) { dst = "series"; topic = "TV Series"; }
          else if (tags.includes("movies") || tags.includes("film")) { dst = "movies"; topic = "Movies"; }
          else { dst = "movies"; topic = "Movies"; }
        }
        if (addText(dst, topic, text, opts, correct, r.difficulty, "trivia-api")) n++;
      }
      await sleep(300);
    }
    stats[c] = n;
    console.log(`[trivia-api] ${c} +${n} lore`);
  }
  return stats;
}

(async () => {
  axios = require("axios");
  const ot = await opentdb();
  const tv = await triviaApi();
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), stats: { opentdb: ot, triviaApi: tv }, items }, null, 1));
  const byCat = items.reduce((m, x) => { m[x.cat] = (m[x.cat] || 0) + 1; return m; }, {});
  console.log(`DONE intake: ${items.length} lore questions -> ${OUT}`, JSON.stringify(byCat));
})().catch((e) => { console.error("FATAL", e && e.stack || e); process.exit(1); });
