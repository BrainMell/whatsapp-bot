#!/usr/bin/env node
/* build_quiz_dataset_pass8b.js — Fandom lore fix-up for v8.
 * pass8's extracts stage yielded 0 (Fandom TextExtracts returns empty intros
 * on infobox-heavy pages). This pass parses the wikitext LEAD directly
 * (rvprop=content, the proven fandom_lore_scraper path) and fetches
 * character-art thumbnails via prop=pageimages (which works).
 * Appends typed lore questions + typed art image questions to the CURRENT
 * v8 dataset (run AFTER pass9 to avoid rewrite races). Dedupe + counts.
 */
'use strict';
const fs = require("fs");
const BOT = "/home/ubuntu/whatsapp-bot";
const OUT = `${BOT}/data/quizDataset.json`;
const REPORT = `${BOT}/data/quizDataset.report.txt`;
const UA = "quiz-dataset-builder/1.0 (whatsapp-bot maintenance)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const BAD_NAME_RE = /^(unknown|unnamed|tba|various|n\/?a|unidentified).*$/i;

function maskAll(text, variants) {
  let out = String(text || "");
  for (const v of variants) {
    if (!v || v.length < 3) continue;
    const esc = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s]+/g, "[\\s]+");
    out = out.replace(new RegExp(`(^|[^A-Za-z0-9])(${esc})(?=[^A-Za-z0-9]|$)`, "gi"), "$1____");
  }
  return out.replace(/\s+/g, " ").replace(/(\s*_{2,}\s*){2,}/g, " ____ ").trim();
}

// wikitext lead -> clean prose (mirrors fandom_lore_scraper cleanup)
function leadText(wikitext) {
  let s = String(wikitext || "");
  const h = s.search(/\n==[^=]/);
  if (h > 0) s = s.slice(0, h);
  s = s.replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1").replace(/\[\[([^\]]*)\]\]/g, "$1");
  for (let i = 0; i < 4; i++) s = s.replace(/\{\{[^{}]*\}\}/g, "");
  for (let i = 0; i < 3; i++) s = s.replace(/\([^()]*\)/g, " ");
  s = s.replace(/'{2,5}/g, "").replace(/&nbsp;|&amp;/g, " ").replace(/&#(\d+);/g, " ");
  s = s.replace(/\[[^\]]*\]/g, " ").replace(/[^A-Za-z0-9'’.,;:!?"()\- ]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // drop list/infobox residue: first real sentence burst must be prose-ish
  if (/^(week|month|day|name|image|caption|creator|artist|author)/i.test(s)) s = s.replace(/^\w+ = \S+\s*/, "");
  return s;
}

function magicOk(buf) {
  if (!buf || buf.length < 3000) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf.length > 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return true;
  return false;
}

const WIKIS = [
  { id: "onepiece", host: "onepiece.fandom.com", name: "One Piece", cat: "comics", topic: "Manga" },
  { id: "dragonball", host: "dragonball.fandom.com", name: "Dragon Ball", cat: "comics", topic: "Manga" },
  { id: "aot", host: "attackontitan.fandom.com", name: "Attack on Titan", cat: "comics", topic: "Manga" },
  { id: "jojo", host: "jojo.fandom.com", name: "JoJo's Bizarre Adventure", cat: "comics", topic: "Manga" },
  { id: "bleach", host: "bleach.fandom.com", name: "Bleach", cat: "comics", topic: "Manga" },
  { id: "naruto", host: "naruto.fandom.com", name: "Naruto", cat: "comics", topic: "Manga" },
  { id: "haikyu", host: "haikyuu.fandom.com", name: "Haikyu!!", cat: "comics", topic: "Manga" },
  { id: "marvel", host: "marvel.fandom.com", name: "Marvel Comics", cat: "comics", topic: "Comics" },
  { id: "dc", host: "dc.fandom.com", name: "DC Comics", cat: "comics", topic: "Comics" },
  { id: "got", host: "gameofthrones.fandom.com", name: "Game of Thrones", cat: "series", topic: "TV Series" },
  { id: "breakingbad", host: "breakingbad.fandom.com", name: "Breaking Bad", cat: "series", topic: "TV Series" },
  { id: "strangerthings", host: "strangerthings.fandom.com", name: "Stranger Things", cat: "series", topic: "TV Series" },
  { id: "twd", host: "walkingdead.fandom.com", name: "The Walking Dead", cat: "series", topic: "TV Series" },
  { id: "avatar", host: "avatar.fandom.com", name: "Avatar: The Last Airbender", cat: "series", topic: "Cartoons" },
  { id: "simpsons", host: "simpsons.fandom.com", name: "The Simpsons", cat: "series", topic: "Cartoons" },
  { id: "starwars", host: "starwars.fandom.com", name: "Star Wars", cat: "movies", topic: "Movies" },
  { id: "mcu", host: "marvelcinematicuniverse.fandom.com", name: "Marvel Cinematic Universe", cat: "movies", topic: "Movies" },
  { id: "harrypotter", host: "harrypotter.fandom.com", name: "Harry Potter", cat: "movies", topic: "Movies" },
  { id: "lotr", host: "lotr.fandom.com", name: "The Lord of the Rings", cat: "movies", topic: "Movies" },
  { id: "jurassicpark", host: "jurassicpark.fandom.com", name: "Jurassic Park", cat: "movies", topic: "Movies" },
  { id: "godzilla", host: "godzilla.fandom.com", name: "Godzilla", cat: "movies", topic: "Movies" },
  { id: "zelda", host: "zelda.fandom.com", name: "The Legend of Zelda", cat: "games", topic: "Video Games" },
  { id: "minecraft", host: "minecraft.fandom.com", name: "Minecraft", cat: "games", topic: "Video Games" },
  { id: "gta", host: "gta.fandom.com", name: "Grand Theft Auto", cat: "games", topic: "Video Games" },
  { id: "overwatch", host: "overwatch.fandom.com", name: "Overwatch", cat: "games", topic: "Video Games" },
  { id: "lol", host: "leagueoflegends.fandom.com", name: "League of Legends", cat: "games", topic: "Video Games" },
  { id: "fallout", host: "fallout.fandom.com", name: "Fallout", cat: "games", topic: "Video Games" },
  { id: "elderscrolls", host: "elderscrolls.fandom.com", name: "The Elder Scrolls", cat: "games", topic: "Video Games" },
  { id: "masseffect", host: "masseffect.fandom.com", name: "Mass Effect", cat: "games", topic: "Video Games" },
  { id: "witcher", host: "witcher.fandom.com", name: "The Witcher", cat: "games", topic: "Video Games" },
  { id: "residentevil", host: "residentevil.fandom.com", name: "Resident Evil", cat: "games", topic: "Video Games" },
];
const EXTRACT_CAP = 26;
const ART_CAP = 14;

let axios;
async function jget(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await axios.get(url, { timeout: 25000, headers: { "User-Agent": UA }, maxContentLength: 80 * 1024 * 1024 }); return r.data; }
    catch (e) {
      const st = e && e.response && e.response.status;
      if (i === tries - 1) throw e;
      await sleep(st === 429 ? 8000 : 1500 + i * 2500);
    }
  }
}
async function getBin(url) {
  try { const r = await axios.get(url, { timeout: 20000, responseType: "arraybuffer", headers: { "User-Agent": UA }, maxRedirects: 5, maxContentLength: 12 * 1024 * 1024 }); if (r.status === 200) return Buffer.from(r.data); return null; } catch { return null; }
}

async function catList(host, ct, type) {
  // proven fandom_lore_scraper logic: Fandom sometimes returns EMPTY member
  // lists as a throttle lookalike — retry before believing the empty result
  const out = [];
  for (let cont = null; ;) {
    const url = `https://${host}/api.php?action=query&list=categorymembers&cmtitle=${encodeURIComponent(ct)}&cmlimit=500&cmtype=${type}&format=json&formatversion=2${cont ? `&cmcontinue=${encodeURIComponent(cont)}` : ""}`;
    let data = await jget(url);
    if (data && data.error) { await sleep(5000); data = await jget(url); }
    let ms = (data && data.query && data.query.categorymembers) || [];
    if (!ms.length && !cont) { await sleep(5000); data = await jget(url); ms = (data && data.query && data.query.categorymembers) || []; }
    for (const m of ms) if (m.title) out.push(m.title);
    cont = data && data.continue && data.continue.cmcontinue;
    if (!cont) break;
  }
  return out;
}

async function memberPages(host, cat) {
  // category can be a container of subcats (onepiece "Category:Characters")
  // — depth-2 subcat expansion, mirrors fandom_lore_scraper.listMembers
  let pages = (await catList(host, cat, "page")).filter((t) => !t.includes(":") && !/\/Gallery$/i.test(t));
  if (pages.length >= 25) return pages;
  const merged = new Set(pages);
  const queue = (await catList(host, cat, "subcat")).filter((t) => !/Galler/i.test(t)).slice(0, 10);
  let depth = 0;
  while (queue.length && merged.size < 220 && depth < 2) {
    const level = queue.splice(0);
    for (const sc of level) {
      if (merged.size >= 220) break;
      let sub = [];
      try { sub = await catList(host, sc, "page"); } catch { continue; }
      for (const t of sub.filter((t) => !t.includes(":") && !/\/Gallery$/i.test(t))) merged.add(t);
      if (sub.filter((t) => !t.includes(":")).length < 25 && depth === 0) {
        try { for (const s2 of (await catList(host, sc, "subcat")).filter((t) => !/Galler/i.test(t)).slice(0, 6)) queue.push(s2); } catch {}
      }
      await sleep(250);
    }
    depth++;
  }
  return [...merged];
}

(async () => {
  axios = require("axios");
  const DS = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const ck = "/tmp/pass8b_fandom.json";
  let items;
  if (fs.existsSync(ck)) items = JSON.parse(fs.readFileSync(ck, "utf8")).items || [];
  else {
    items = [];
    for (const w of WIKIS) {
      let titles;
      try { titles = shuffle(await memberPages(w.host, "Category:Characters")); }
      catch { console.log(`[fandom] ${w.id}: members fail`); continue; }
      if (!titles.length) { console.log(`[fandom] ${w.id}: no members`); continue; }
      let ex = 0, art = 0;
      for (let i = 0; i < titles.length && (ex < EXTRACT_CAP || art < ART_CAP); i += 10) {
        const batch = titles.slice(i, i + 10);
        let data;
        try { data = await jget(`https://${w.host}/api.php?action=query&prop=revisions%7Cpageimages&rvprop=content&rvslots=main&piprop=thumbnail&pithumbsize=400&titles=${batch.map((t) => encodeURIComponent(t.replace(/ /g, "_"))).join("%7C")}&redirects=1&format=json&formatversion=2`); }
        catch { await sleep(3000); continue; }
        const pages = ((data || {}).query || {}).pages || [];
        for (const p of pages) {
          const fullTitle = String(p.title || "").trim();
          const title = fullTitle.replace(/\s*\([^)]*\)\s*$/, "").trim();
          if (!title || title.length > 40 || BAD_NAME_RE.test(title)) continue;
          // ── art (GET-verified thumbnail) ──
          const thumb = p.thumbnail && p.thumbnail.source;
          if (art < ART_CAP && thumb) {
            const buf = await getBin(thumb);
            if (buf && magicOk(buf)) {
              const q = `In ${w.name}, who or what is this?`;
              const dkey = normKey(q + "|" + title);
              if (!items.some((x) => normKey(x.q + "|" + x.subject) === dkey)) {
                items.push({ cat: w.cat, topic: w.topic, q, options: [title], correct: 0, alts: [], fmt: "typed", img: thumb, subject: title, cls: "lore", difficulty: "medium", source: `fandom-art:${w.id}`, id: null });
                art++;
              }
            }
            await sleep(120);
          }
          // ── lead-paragraph lore question ──
          if (ex < EXTRACT_CAP) {
            const rev = p.revisions && p.revisions[0];
            // formatversion=2 stores content at .content; v1 used ["*"] — accept both
            const wt = rev && rev.slots && rev.slots.main && (rev.slots.main.content || rev.slots.main["*"]);
            if (!wt) continue;
            const lead = leadText(wt);
            if (lead.length < 160 || lead.length > 2200) continue;
            const masked = maskAll(lead, [title, title.replace(/\s+/g, "")]);
            if (masked.includes(title)) continue;
            if ((masked.match(/____/g) || []).length > 3) continue;
            const snip = masked.length > 300 ? masked.slice(0, 300).replace(/[,;:.!?\s]+\S*$/, "") + "…" : masked;
            if (snip.length < 140) continue;
            const q = `In ${w.name}: "${snip}" — who or what is being described?`;
            if (items.some((x) => normKey(x.q) === normKey(q))) continue;
            items.push({ cat: w.cat, topic: w.topic, q, options: [title], correct: 0, alts: [], fmt: "typed", cls: "lore", difficulty: "medium", source: `fandom-lead:${w.id}`, id: null });
            ex++;
          }
        }
        await sleep(450);
      }
      console.log(`[fandom] ${w.id}: +${ex} leads, +${art} art`);
      fs.writeFileSync(ck, JSON.stringify({ generatedAt: new Date().toISOString(), items })); // incremental ckpt
    }
    fs.writeFileSync(ck, JSON.stringify({ generatedAt: new Date().toISOString(), items }));
  }

  // ── merge into current dataset (dedupe by stem / img url) ──
  const stems = new Set(), imgs = new Set();
  for (const c of Object.values(DS.categories)) {
    for (const x of (c.questions || [])) stems.add(normKey(x.q));
    for (const x of (c.images || [])) { imgs.add(x.img); stems.add(normKey(x.q + "|" + (x.subject || ""))); }
  }
  const added = { games: 0, comics: 0, movies: 0, series: 0 };
  const addedImg = { games: 0, comics: 0, movies: 0, series: 0 };
  for (const it of items) {
    if (stems.has(normKey(it.q)) || stems.has(normKey(it.q + "|" + (it.subject || "")))) continue;
    stems.add(normKey(it.q));
    if (it.img) {
      if (imgs.has(it.img)) continue;
      imgs.add(it.img);
      DS.categories[it.cat].images.push(it);
      addedImg[it.cat]++;
    } else {
      DS.categories[it.cat].questions.push(it);
      added[it.cat]++;
    }
  }
  // renumber ids + update counts
  for (const [cat, c] of Object.entries(DS.categories)) {
    c.questions = c.questions.map((x, i) => ({ ...x, id: i + 1 }));
    if (DS.counts[cat]) {
      const lore = c.questions.filter((x) => x.cls !== "prod").length;
      DS.counts[cat].text = c.questions.length;
      DS.counts[cat].lore = lore;
      DS.counts[cat].prod = c.questions.length - lore;
      DS.counts[cat].prodPct = Number((((c.questions.length - lore) / c.questions.length) * 100).toFixed(1));
      DS.counts[cat].images = c.images.length;
      DS.counts[cat].typedImg = c.images.filter((x) => x.fmt === "typed").length;
      const typedN = c.questions.filter((x) => x.fmt === "typed").length;
      DS.counts[cat].typedPct = Number(((typedN / c.questions.length) * 100).toFixed(1));
    }
  }
  DS.generatedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(DS));
  const totQ = Object.values(DS.categories).reduce((m, c) => m + c.questions.length, 0);
  const totLore = Object.values(DS.categories).reduce((m, c) => m + c.questions.filter((x) => x.cls !== "prod").length, 0);
  const summary = `\n=== v8.2 fandom lead fix-up ${DS.generatedAt} ===\nfandom items=${items.length} text+=${Object.values(added).reduce((a, b) => a + b, 0)} art+=${Object.values(addedImg).reduce((a, b) => a + b, 0)}\nper-cat text: ${JSON.stringify(added)} art: ${JSON.stringify(addedImg)}\ntotal text=${totQ} lore=${totLore} (${((totLore / totQ) * 100).toFixed(1)}%)\n`;
  fs.appendFileSync(REPORT, summary);
  console.log(summary);
})().catch((e) => { console.error("FATAL", e && e.stack || e); process.exit(1); });
