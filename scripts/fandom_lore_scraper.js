#!/usr/bin/env node
/* fandom_lore_scraper.js — pass7b: build lore MCQs from Fandom wiki infoboxes.
 * Owner-authorized scraper route (no API keys). For each franchise wiki:
 *   1. list character pages via MediaWiki categorymembers
 *   2. fetch raw wikitext, parse the first infobox template's params
 *   3. turn relatives/affiliation/species/powers/home/... into lore MCQs with
 *      same-franchise distractor pools + cross-franchise ID questions.
 * Checkpoint: /tmp/fandom_ckpt.json (per-wiki parsed char data)
 * Output:     /tmp/fandom_lore.jsonl (questions, cls=lore)
 */
'use strict';
const fs = require("fs");
const UA = "quiz-lore-builder/1.0 (whatsapp-bot maintenance; contact: bot ops)";
const CKPT = "/tmp/fandom_ckpt.json";
const OUT = "/tmp/fandom_lore.jsonl";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const WIKIS = [
  // comics (manga + western)
  { id: "onepiece", host: "onepiece.fandom.com", name: "One Piece", cat: "comics", topic: "Manga", cats: ["Category:Characters"] },
  { id: "dragonball", host: "dragonball.fandom.com", name: "Dragon Ball", cat: "comics", topic: "Manga", cats: ["Category:Characters"] },
  { id: "aot", host: "attackontitan.fandom.com", name: "Attack on Titan", cat: "comics", topic: "Manga", cats: ["Category:Characters"] },
  { id: "jojo", host: "jojo.fandom.com", name: "JoJo's Bizarre Adventure", cat: "comics", topic: "Manga", cats: ["Category:Characters"] },
  { id: "bleach", host: "bleach.fandom.com", name: "Bleach", cat: "comics", topic: "Manga", cats: ["Category:Characters"] },
  { id: "marvel", host: "marvel.fandom.com", name: "Marvel Comics", cat: "comics", topic: "Comics", cats: ["Category:Characters"] },
  { id: "dc", host: "dc.fandom.com", name: "DC Comics", cat: "comics", topic: "Comics", cats: ["Category:Characters"] },
  // series
  { id: "got", host: "gameofthrones.fandom.com", name: "Game of Thrones", cat: "series", topic: "TV Series", cats: ["Category:Characters"] },
  { id: "breakingbad", host: "breakingbad.fandom.com", name: "Breaking Bad", cat: "series", topic: "TV Series", cats: ["Category:Characters"] },
  { id: "strangerthings", host: "strangerthings.fandom.com", name: "Stranger Things", cat: "series", topic: "TV Series", cats: ["Category:Characters"] },
  { id: "twd", host: "walkingdead.fandom.com", name: "The Walking Dead", cat: "series", topic: "TV Series", cats: ["Category:Characters"] },
  { id: "avatar", host: "avatar.fandom.com", name: "Avatar: The Last Airbender", cat: "series", topic: "Cartoons", cats: ["Category:Characters"] },
  { id: "simpsons", host: "simpsons.fandom.com", name: "The Simpsons", cat: "series", topic: "Cartoons", cats: ["Category:Characters"] },
  // movies
  { id: "starwars", host: "starwars.fandom.com", name: "Star Wars", cat: "movies", topic: "Movies", cats: ["Category:Characters", "Category:Individuals"] },
  { id: "mcu", host: "marvelcinematicuniverse.fandom.com", name: "Marvel Cinematic Universe", cat: "movies", topic: "Movies", cats: ["Category:Characters"] },
  { id: "harrypotter", host: "harrypotter.fandom.com", name: "Harry Potter", cat: "movies", topic: "Movies", cats: ["Category:Individuals", "Category:Characters"] },
  { id: "lotr", host: "lotr.fandom.com", name: "The Lord of the Rings", cat: "movies", topic: "Movies", cats: ["Category:Characters", "Category:Individuals"] },
  { id: "pixar", host: "pixar.fandom.com", name: "Pixar", cat: "movies", topic: "Movies", cats: ["Category:Characters"] },
  { id: "jurassicpark", host: "jurassicpark.fandom.com", name: "Jurassic Park", cat: "movies", topic: "Movies", cats: ["Category:Characters"] },
  // games
  { id: "zelda", host: "zelda.fandom.com", name: "The Legend of Zelda", cat: "games", topic: "Video Games", cats: ["Category:Characters"] },
  { id: "minecraft", host: "minecraft.fandom.com", name: "Minecraft", cat: "games", topic: "Video Games", cats: ["Category:Characters", "Category:Mobs"] },
  { id: "gta", host: "gta.fandom.com", name: "Grand Theft Auto", cat: "games", topic: "Video Games", cats: ["Category:Characters"] },
  { id: "overwatch", host: "overwatch.fandom.com", name: "Overwatch", cat: "games", topic: "Video Games", cats: ["Category:Heroes", "Category:Characters"] },
  { id: "lol", host: "leagueoflegends.fandom.com", name: "League of Legends", cat: "games", topic: "Video Games", cats: ["Category:Champions", "Category:Characters"] },
  { id: "fallout", host: "fallout.fandom.com", name: "Fallout", cat: "games", topic: "Video Games", cats: ["Category:Characters"] },
];

const MEMBER_CAP = 170;          // per wiki
const PER_GROUP_CAP = 60;        // per franchise per field group
const PER_FRANCHISE_CAP = 380;   // field questions per franchise
const ID_PER_FRANCHISE = 45;     // cross-franchise ID questions

const GROUPS = [
  { key: "mother", re: /^(mother|mama)$/i, tpl: (c, f) => `In ${f}, who is ${c}'s mother?` },
  { key: "father", re: /^(father|papa)$/i, tpl: (c, f) => `In ${f}, who is ${c}'s father?` },
  { key: "parents", re: /^(parents?|guardian)s?$/i, tpl: (c, f) => `In ${f}, who is the parent or guardian of ${c}?` },
  { key: "sibling", re: /^(siblings?|brothers?|sisters?)$/i, tpl: (c, f) => `In ${f}, who is ${c}'s sibling?` },
  { key: "child", re: /^(children|kids|sons?|daughters?|issue)$/i, tpl: (c, f) => `In ${f}, who is ${c}'s child?` },
  { key: "family", re: /^(relatives?|family|relations?|family members)$/i, tpl: (c, f) => `In ${f}, which character is a family member of ${c}?` },
  { key: "spouse", re: /^(spouses?|partner|partners|significant other|love interests?|romantic interests?|wifes?|husbands?|consorts?)$/i, tpl: (c, f) => `In ${f}, who is the partner or love interest of ${c}?` },
  { key: "affiliation", re: /^(affiliations?|teams?|alliances?|organizations?|organisations?|groups?|guilds?|crew|crews|divisions?|factions?|affiliation\(s\)|houses?|allegiance|allegiances?|clans?|sects?|armies?)$/i, tpl: (c, f) => `In ${f}, ${c} is a member of which group or organization?` },
  { key: "species", re: /^(species|races?)$/i, tpl: (c, f) => `In ${f}, what is the species or race of ${c}?` },
  { key: "occupation", re: /^(occupations?|jobs?|roles?|positions?|ranks?)$/i, tpl: (c, f) => `In ${f}, what is the occupation or role of ${c}?` },
  { key: "weapon", re: /^(weapons?|signature weapons?|equipment|tools?|weapons of choice)$/i, tpl: (c, f) => `In ${f}, which weapon or equipment is ${c} known for?` },
  { key: "power", re: /^(abilities?|powers?|skills?|devil fruit|quirk|magics?|techniques?|fighting styles?|nature types?|kekkei genkai|jutsu|signature jutsu|bending element|bending styles?)$/i, tpl: (c, f) => `In ${f}, which power or ability does ${c} possess?` },
  { key: "home", re: /^(homes?|homeworlds?|residences?|origins?|birthplaces?|births?|born|hometowns?|villages?|kingdoms?|nationality|homelands?|regions?)$/i, tpl: (c, f) => `In ${f}, ${c} comes from which place?` },
  { key: "first", re: /^(first appearances?|debut|anime debut|manga debut|first episode|first seen|first)$/i, tpl: (c, f) => `Where does ${c} make its first appearance in ${f}?` },
];

const BAD_VAL = /^(unknown|none|n\/?a|various|single|unnamed.*|tba|tbd|multiple|several|.*to be (added|determined).*)$/i;
const BAD_NAME = /^(unknown|unnamed.*|tba.*|various|n\/?a)$/i;

function decodeHtml(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return " "; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; } })
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function cleanVal(v) {
  if (!v) return null;
  let s = String(v);
  s = s.replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1").replace(/\[\[([^\]]*)\]\]/g, "$1");
  for (let i = 0; i < 3; i++) s = s.replace(/\{\{[^{}]*\}\}/g, "");       // strip remaining templates
  s = s.replace(/'''([^']*)'''/g, "$1").replace(/''([^']*)''/g, "$1");
  s = s.replace(/<br\s*\/?>/gi, ",").replace(/<[^>]+>/g, "");
  s = decodeHtml(s).replace(/\s*\([^)]*\)/g, "");
  s = s.split(/[,;/·]/)[0];                                               // take first list item
  s = s.split(/\band\b/i)[0];
  s = s.replace(/['"]/g, "").replace(/\s+/g, " ").trim();
  if (!s || s.length < 2 || s.length > 44) return null;
  if (/[<>{}|\[\]#*_]/.test(s)) return null;
  if (BAD_VAL.test(s.trim())) return null;
  if (/^\d+([.,]\d+)?$/.test(s)) return null;
  if (normKey(s) === normKey("the")) return null;
  return s;
}

const NON_INFOBOX = /^(looking for|translation|nihongo|quote|dialogue|main|seealso|see also|hatnote|about|for|reflist|scroll|clr|clear|DEFAULTSORT|toc|}\})$/i;

// extract the template body starting at offset of "{{" (brace matched); returns {name, body} or null
function extractTemplate(wt, start) {
  let depth = 0, end = -1;
  for (let i = start; i < wt.length - 1; i++) {
    if (wt[i] === "{" && wt[i + 1] === "{") { depth += 2; i++; }
    else if (wt[i] === "}" && wt[i + 1] === "}") { depth -= 2; i++; if (depth <= 0) { end = i; break; } }
  }
  if (end < 0) return null;
  const body = wt.slice(start + 2, end - 1);
  const name = body.split("|")[0].trim();
  return { name, body, end };
}

function splitParams(body) {
  const params = {}; let d = 0, cur = "", parts = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i], n = body[i + 1];
    if (c === "{" && n === "{") { d += 2; cur += "{{"; i++; continue; }
    if (c === "}" && n === "}") { d -= 2; cur += "}}"; i++; continue; }
    if (c === "[" && n === "[") { d += 2; cur += "[["; i++; continue; }
    if (c === "]" && n === "]") { d -= 2; cur += "]]"; i++; continue; }
    if (c === "|" && d === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur);
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]; const eq = p.indexOf("=");
    if (eq < 1) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    const v = p.slice(eq + 1).trim();
    if (k && !(k in params)) params[k] = v;
  }
  return params;
}

// scan the whole page for an infobox-like template
function parseInfobox(wikitext) {
  const cap = Math.min(wikitext.length, 400000);
  let i = 0, scanned = 0;
  while (i < cap - 1 && scanned < 200) {
    if (wikitext[i] === "{" && wikitext[i + 1] === "{") {
      const t = extractTemplate(wikitext, i);
      if (!t) break;
      scanned++;
      i = t.end + 1;
      if (!t.name || NON_INFOBOX.test(t.name)) continue;
      const params = splitParams(t.body);
      const hits = GROUPS.filter((g) => Object.keys(params).some((pk) => g.re.test(pk))).length;
      const nameish = /info ?box|char ?(acter)? ?box|box.*(character|char)|^character$|^(character|char) /i.test(t.name);
      if (nameish || hits >= 2) {
        const rec = {};
        for (const [pk, pv] of Object.entries(params)) {
          const g = GROUPS.find((gr) => gr.re.test(pk));
          if (!g) continue;
          const val = cleanVal(pv);
          if (val) (rec[g.key] = rec[g.key] || new Set()).add(val);
        }
        if (Object.keys(rec).length) return rec;
      }
    } else i++;
  }
  return null;
}

let axios;
async function jget(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await axios.get(url, { timeout: 30000, headers: { "User-Agent": UA }, maxContentLength: 40 * 1024 * 1024 });
      return r.data;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(2000 + i * 3000);
    }
  }
}
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function catList(host, ct, type) {
  const out = [];
  for (let cont = null; ;) {
    const url = `https://${host}/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(ct)}&cmlimit=500&cmtype=${type}&format=json&formatversion=2${cont ? `&cmcontinue=${encodeURIComponent(cont)}` : ""}`;
    let data = await jget(url);
    if (data && data.error) { await sleep(5000); data = await jget(url); }
    if (data && data.error) throw new Error(`mw:${(data.error && data.error.code) || "err"}`);
    let ms = (data.query && data.query.categorymembers) || [];
    if (!ms.length && !cont && type === "page") { await sleep(5000); data = await jget(url); ms = (data.query && data.query.categorymembers) || []; }  // retry empty (throttle lookalike)
    for (const m of ms) if (m.title) out.push(m.title);
    cont = data.continue && data.continue.cmcontinue;
    if (!cont) break;
  }
  return out;
}

async function listMembers(host, cats) {
  for (const ct of cats) {
    let pages = (await catList(host, ct, "page")).filter((t) => !t.includes(":") && !/\/Gallery$/i.test(t));
    if (pages.length >= 25) return pages.slice(0, MEMBER_CAP);
    // container category: expand subcategories up to depth 2
    const merged = new Set(pages);
    const queue = (await catList(host, ct, "subcat")).filter((t) => !/Galleries|Gallery/i.test(t)).slice(0, 10);
    let depth = 0;
    while (queue.length && merged.size < MEMBER_CAP && depth < 2) {
      const level = queue.splice(0);
      for (const sc of level) {
        if (merged.size >= MEMBER_CAP) break;
        let sub = [];
        try { sub = await catList(host, sc, "page"); } catch { continue; }
        const clean = sub.filter((t) => !t.includes(":") && !/\/Gallery$/i.test(t));
        for (const t of clean) merged.add(t);
        if (clean.length < 25 && depth === 0) {
          try { for (const s2 of (await catList(host, sc, "subcat")).filter((t) => !/Galleries|Gallery/i.test(t)).slice(0, 8)) queue.push(s2); } catch {}
        }
        await sleep(200);
      }
      depth++;
    }
    const arr = [...merged];
    if (arr.length >= 25) return arr.slice(0, MEMBER_CAP);
  }
  return [];
}

async function scrapeWiki(w, ckpt) {
  const members = await listMembers(w.host, w.cats);
  console.log(`[${w.id}] ${members.length} member pages`);
  const chars = {};
  let done = 0;
  for (const batch of chunk(members, 5)) {
    const url = `https://${w.host}/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&titles=${batch.map(encodeURIComponent).join("|")}&format=json&formatversion=2&redirects=1`;
    let data;
    try { data = await jget(url); } catch (e) { console.log(`[${w.id}] batch err ${String(e).slice(0, 80)}`); continue; }
    for (const page of (data.query && data.query.pages) || []) {
      if (!page || page.missing || !page.revisions || !page.revisions[0]) continue;
      const title = page.title.split("(")[0].trim();
      if (!title || title.length > 40 || BAD_NAME.test(title)) continue;
      const rv = page.revisions[0] || {};
      const wt = rv.content || (rv.slots && rv.slots.main && rv.slots.main.content) || rv["*"] || "";
      if (!wt) continue;
      const rec = parseInfobox(wt);
      if (!rec) continue;
      // drop values equal to the character name
      for (const k of Object.keys(rec)) rec[k] = [...rec[k]].filter((v) => normKey(v) !== normKey(title));
      for (const k of Object.keys(rec)) if (!rec[k].length) delete rec[k];
      if (Object.keys(rec).length) {
        chars[title] = {};
        for (const [k, set] of Object.entries(rec)) chars[title][k] = set;
      }
    }
    done += batch.length;
    if (done % 50 < 5) console.log(`[${w.id}] ${done}/${members.length}`);
    await sleep(450);
  }
  ckpt[w.id] = { name: w.name, cat: w.cat, topic: w.topic, chars };
  fs.writeFileSync(CKPT, JSON.stringify(ckpt));
  console.log(`[${w.id}] parsed ${Object.keys(chars).length} chars with infobox data`);
}

function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(20261010);
function pickN(pool, n, exclude) {
  const cands = pool.filter((x) => normKey(x) !== normKey(exclude));
  const out = [];
  const used = new Set();
  while (out.length < n && used.size < cands.length) {
    const c = cands[Math.floor(rnd() * cands.length)];
    const k = normKey(c);
    if (used.has(k)) continue;
    used.add(k); out.push(c);
  }
  return out;
}

function generate(ckpt) {
  const lines = [];
  // existing stems for dedupe
  const seen = new Set();
  try {
    const DS = JSON.parse(fs.readFileSync("/home/ubuntu/whatsapp-bot/data/quizDataset.json", "utf8"));
    for (const c of Object.values(DS.categories)) for (const x of (c.questions || [])) seen.add(normKey(x.q));
    if (fs.existsSync("/tmp/lore_intake.json")) for (const it of JSON.parse(fs.readFileSync("/tmp/lore_intake.json", "utf8")).items) seen.add(normKey(it.q));
  } catch {}
  const addQ = (cat, topic, q, options, correct, difficulty, source) => {
    const stem = normKey(q);
    if (seen.has(stem)) return false;
    seen.add(stem);
    lines.push(JSON.stringify({ cat, topic, q, options, correct, difficulty, source, cls: "lore" }));
    return true;
  };
  // group question generators: template(char, franchiseName, answer)
  const GENS = {
    mother: (c, f, v) => `In ${f}, who is ${c}'s mother?`,
    father: (c, f, v) => `In ${f}, who is ${c}'s father?`,
    parents: (c, f, v) => `In ${f}, who is the parent or guardian of ${c}?`,
    sibling: (c, f, v) => `In ${f}, who is ${c}'s sibling?`,
    child: (c, f, v) => `In ${f}, who is ${c}'s child?`,
    family: (c, f, v) => `In ${f}, which character is a family member of ${c}?`,
    spouse: (c, f, v) => `In ${f}, who is the partner or love interest of ${c}?`,
    affiliation: (c, f, v) => `In ${f}, ${c} is a member of which group or organization?`,
    species: (c, f, v) => `In ${f}, what is the species or race of ${c}?`,
    occupation: (c, f, v) => `In ${f}, what is the occupation or role of ${c}?`,
    weapon: (c, f, v) => `In ${f}, which weapon or equipment is ${c} known for?`,
    power: (c, f, v) => `In ${f}, which power or ability does ${c} possess?`,
    home: (c, f, v) => `In ${f}, ${c} comes from which place?`,
    first: (c, f, v) => `Where does ${c} make its first appearance in ${f}?`,
  };
  const wikiById = Object.fromEntries(WIKIS.map((w) => [w.id, w]));
  const byCat = {};
  for (const [wid, data] of Object.entries(ckpt)) {
    const w = wikiById[wid]; if (!w) continue;
    (byCat[w.cat] = byCat[w.cat] || []).push({ wid, w, data });
  }
  const stats = {};
  for (const [cat, wikis] of Object.entries(byCat)) {
    // field questions
    for (const { wid, w, data } of wikis) {
      const names = Object.keys(data.chars);
      if (!names.length) continue;
      // build pools per group
      const pools = {};
      for (const n of names) for (const [g, vals] of Object.entries(data.chars[n])) for (const v of vals) (pools[g] = pools[g] || new Set()).add(v);
      pools.first = pools.first || new Set();
      let count = 0; const perGroup = {};
      for (const n of names.sort(() => rnd() - 0.5)) {
        if (count >= PER_FRANCHISE_CAP) break;
        const groups = Object.keys(data.chars[n]).sort(() => rnd() - 0.5);
        for (const g of groups) {
          if ((perGroup[g] || 0) >= PER_GROUP_CAP) continue;
          const poolArr = [...(pools[g] || [])];
          if (poolArr.length < 4) continue;
          const val = data.chars[n][g][0];
          if (poolArr.filter((x) => normKey(x) !== normKey(val)).length < 3) continue;
          const ds = pickN(poolArr, 3, val);
          if (ds.length < 3) continue;
          const options = [val, ...ds];
          for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
          const correct = options.findIndex((o) => normKey(o) === normKey(val));
          const diff = count < names.length / 3 ? "easy" : count < (2 * names.length) / 3 ? "medium" : "hard";
          const tpl = GENS[g];
          const q = `${tpl(n, w.name, val)}`;
          if (q.length > 165) continue;
          if (addQ(cat, w.topic, q, options, correct, diff, `fandom:${wid}`)) { count++; perGroup[g] = (perGroup[g] || 0) + 1; }
        }
      }
      stats[wid] = count;
      console.log(`[${wid}] +${count} field lore questions`);
    }
    // cross-franchise ID questions
    if (wikis.length >= 4) {
      for (const { wid, w, data } of wikis) {
        const names = Object.keys(data.chars);
        const others = wikis.filter((x) => x.wid !== wid).map((x) => x.w.name);
        if (others.length < 3) continue;
        let n = 0;
        for (const cname of names.sort(() => rnd() - 0.5)) {
          if (n >= ID_PER_FRANCHISE) break;
          if (Object.keys(data.chars[cname]).length < 2) continue;   // prominent chars only
          const ds = pickN(others, 3, w.name);
          if (ds.length < 3) continue;
          const options = [w.name, ...ds];
          for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
          const correct = options.findIndex((o) => o === w.name);
          const q = `The character "${cname}" appears in which of these franchises?`;
          if (addQ(cat, w.topic, q, options, correct, "easy", `fandom:${wid}`)) n++;
        }
        console.log(`[${wid}] +${n} ID questions`);
      }
    }
  }
  return { lines, stats };
}

(async () => {
  axios = require("axios");
  const ckpt = fs.existsSync(CKPT) ? JSON.parse(fs.readFileSync(CKPT, "utf8")) : {};
  const todo = WIKIS.filter((w) => !ckpt[w.id]);
  console.log(`wikis: ${WIKIS.length}, done: ${WIKIS.length - todo.length}, todo: ${todo.length}`);
  for (const w of todo) {
    try { await scrapeWiki(w, ckpt); } catch (e) { console.error(`[${w.id}] SCRAPE ERR`, String(e).slice(0, 200)); }
    await sleep(500);
  }
  const { lines, stats } = generate(ckpt);
  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  const byCat = lines.map((l) => JSON.parse(l)).reduce((m, x) => { m[x.cat] = (m[x.cat] || 0) + 1; return m; }, {});
  console.log(`DONE fandom: ${lines.length} lore questions -> ${OUT}`, JSON.stringify(byCat));
  console.log("per-wiki:", JSON.stringify(stats));
})().catch((e) => { console.error("FATAL", e && e.stack || e); process.exit(1); });
