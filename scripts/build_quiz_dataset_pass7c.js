#!/usr/bin/env node
/* build_quiz_dataset_pass7c.js — compose dataset v7: >=90% lore, <=10% production.
 * Inputs: current data/quizDataset.json (v6), /tmp/lore_intake.json (pass7a),
 *         /tmp/fandom_lore.jsonl (pass7b).
 * Every text question gets {cls: lore|prod, source}. Images untouched.
 */
'use strict';
const fs = require("fs");
const OUT = "/home/ubuntu/whatsapp-bot/data/quizDataset.json";
const REPORT = "/home/ubuntu/whatsapp-bot/data/quizDataset.report.txt";
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

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
function classifyProd(q) { for (const [re, tag] of PROD_PATTERNS) if (re.test(q)) return tag; return null; }

const DS = JSON.parse(fs.readFileSync(OUT, "utf8"));
const seen = new Set();

// 1) legacy: split into lore/prod
const legacyLore = {}, legacyProd = {};
for (const cat of Object.keys(DS.categories)) {
  legacyLore[cat] = []; legacyProd[cat] = [];
  for (const x of (DS.categories[cat].questions || [])) {
    const tag = classifyProd(x.q);
    if (tag) legacyProd[cat].push({ ...x, cls: "prod", source: x.source || "legacy", prodTag: tag });
    else legacyLore[cat].push({ ...x, cls: "lore", source: x.source || "legacy" });
    seen.add(normKey(x.q));
  }
}

// 2) intake (pass7a) + fandom (pass7b)
const intake = fs.existsSync("/tmp/lore_intake.json") ? JSON.parse(fs.readFileSync("/tmp/lore_intake.json", "utf8")).items : [];
let fandom = [];
if (fs.existsSync("/tmp/fandom_lore.jsonl")) {
  fandom = fs.readFileSync("/tmp/fandom_lore.jsonl", "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const newLore = {};
for (const cat of Object.keys(DS.categories)) newLore[cat] = [];
let dupIntake = 0, dupFandom = 0;
for (const it of intake) {
  const stem = normKey(it.q);
  if (seen.has(stem)) { dupIntake++; continue; }
  seen.add(stem);
  newLore[it.cat].push({ q: it.q, options: it.options, correct: it.correct, difficulty: it.difficulty, topic: it.topic, cls: "lore", source: it.source });
}
for (const it of fandom) {
  const stem = normKey(it.q);
  if (seen.has(stem)) { dupFandom++; continue; }
  seen.add(stem);
  newLore[it.cat].push({ q: it.q, options: it.options, correct: it.correct, difficulty: it.difficulty, topic: it.topic, cls: "lore", source: it.source });
}

// 3) compose: lore + prod keepers (<=10%, tag-diverse round-robin)
const V7 = { generatedAt: new Date().toISOString(), version: 7, counts: {}, categories: {} };
const report = [];
for (const cat of Object.keys(DS.categories)) {
  const lore = [...legacyLore[cat], ...newLore[cat]];
  const prodByTag = {};
  for (const p of legacyProd[cat]) (prodByTag[p.prodTag] = prodByTag[p.prodTag] || []).push(p);
  const keepN = Math.min(Math.floor(lore.length / 9), 120);
  const keepers = [];
  const tagKeys = Object.keys(prodByTag).sort((a, b) => prodByTag[b].length - prodByTag[a].length);
  let gi = 0;
  while (keepers.length < keepN && tagKeys.length) {
    const tk = tagKeys[gi % tagKeys.length];
    const p = prodByTag[tk].shift();
    if (p) keepers.push(p);
    if (!prodByTag[tk].length) tagKeys.splice(gi % tagKeys.length, 1); else gi++;
    if (gi > 100000) break;
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const questions = [...shuffle(lore), ...shuffle(keepers)].map((x, i) => {
    const { prodTag, ...rest } = x;
    return { ...rest, id: i + 1 };
  });
  const images = DS.categories[cat].images || [];
  V7.categories[cat] = { questions, images };
  const prodPct = ((keepers.length / questions.length) * 100).toFixed(1);
  V7.counts[cat] = { text: questions.length, lore: lore.length, prod: keepers.length, prodPct: Number(prodPct), images: images.length };
  report.push(`${cat.padEnd(8)} text=${String(questions.length).padStart(5)} lore=${String(lore.length).padStart(5)} prod=${String(keepers.length).padStart(3)} (${prodPct}%) images=${images.length}`);
}

fs.writeFileSync(OUT, JSON.stringify(V7));
const totalText = Object.values(V7.counts).reduce((m, c) => m + c.text, 0);
const totalLore = Object.values(V7.counts).reduce((m, c) => m + c.lore, 0);
const totalImg = Object.values(V7.counts).reduce((m, c) => m + c.images, 0);
const summary = `\n=== v7 lore rebuild ${V7.generatedAt} ===\ntotal text=${totalText} lore=${totalLore} (${(100 * totalLore / totalText).toFixed(1)}%) prod=${totalText - totalLore} images=${totalImg}\n${report.join("\n")}\n`;
fs.appendFileSync(REPORT, summary);
console.log(summary);
console.log(`dupes skipped: intake=${dupIntake} fandom=${dupFandom}`);
const bad = Object.entries(V7.counts).filter(([c, n]) => n.prodPct > 10.5);
if (bad.length) { console.error("RATIO FAIL:", JSON.stringify(bad)); process.exit(2); }
console.log("OK: all categories within 10% production cap");
