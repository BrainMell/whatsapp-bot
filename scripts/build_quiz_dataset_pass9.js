#!/usr/bin/env node
/* build_quiz_dataset_pass9.js — image backfill (owner 2026-10-10: "make sure
 * the images check out" + "get more questions"): games had 24 images, movies
 * 70. Keyless sources bypassing Wikimedia rate limits:
 *   games  : SteamSpy top list -> cdn.cloudflare.steamstatic.com header
 *            capsules (deterministic URL per appid, GET+magic verified)
 *   movies : IMDb suggestion API posters for a curated famous-film list
 *            (GET+magic verified)
 * New entries are TYPED image questions ("type the answer" directive) with
 * the title as subject. Backup + /tmp/pass9_*.json checkpoints.
 */
'use strict';
const fs = require("fs");
const BOT = "/home/ubuntu/whatsapp-bot";
const OUT = `${BOT}/data/quizDataset.json`;
const REPORT = `${BOT}/data/quizDataset.report.txt`;
const UA = "quiz-dataset-builder/1.0 (whatsapp-bot maintenance)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function magicOk(buf) {
  if (!buf || buf.length < 3000) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf.length > 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return true;
  return false;
}

let axios;
async function getBin(url) {
  for (let i = 0; i < 2; i++) {
    try { const r = await axios.get(url, { timeout: 20000, responseType: "arraybuffer", headers: { "User-Agent": UA }, maxRedirects: 5, maxContentLength: 12 * 1024 * 1024 }); if (r.status === 200) return Buffer.from(r.data); return null; }
    catch { await sleep(3000); }
  }
  return null;
}
async function jget(url) {
  try { const r = await axios.get(url, { timeout: 25000, headers: { "User-Agent": UA } }); return r.data; } catch { return null; }
}

// ~300 famous films spanning decades — poster ID is fair typed gameplay
const FILMS = `The Godfather,The Dark Knight,Pulp Fiction,Forrest Gump,The Matrix,Jurassic Park,Titanic,Avatar,The Lion King,Toy Story,
Star Wars,The Empire Strikes Back,Raiders of the Lost Ark,Back to the Future,E.T. the Extra-Terrestrial,The Silence of the Lambs,Schindler's List,Goodfellas,Se7en,The Usual Suspects,
Fight Club,Gladiator,The Lord of the Rings,Inception,Interstellar,The Departed,Joker,Mad Max Fury Road,Whiplash,Django Unchained,
The Shawshank Redemption,Green Book,Parasite,La La Land,Gravity,The Revenant,Aquaman,Wonder Woman,Black Panther,Iron Man,
The Avengers,Avengers Endgame,Guardians of the Galaxy,Captain America The Winter Soldier,Doctor Strange,Thor Ragnarok,Spider-Man Homecoming,Deadpool,X-Men,Logan,
Batman Begins,The Dark Knight Rises,Man of Steel,Suicide Squad,Justice League,Shazam,V for Vendetta,Watchmen,300,Sin City,
Harry Potter and the Philosopher's Stone,Harry Potter and the Goblet of Fire,The Hunger Games,The Maze Runner,Divergent,Twilight,Percy Jackson The Lightning Thief,The Chronicles of Narnia,The Hobbit,King Kong,
Godzilla,King of the Monsters,Kong Skull Island,Jurassic World,The Meg,Rampage,Pacific Rim,Transformers,Independence Day,War of the Worlds,
I Am Legend,World War Z,28 Days Later,Dawn of the Dead,Zombieland,Train to Busan,The Conjuring,Insidious,It,Annabelle,
The Exorcist,Halloween,A Nightmare on Elm Street,Friday the 13th,Scream,Candyman,Child's Play,The Ring,The Grudge,Sinister,
Home Alone,Mrs. Doubtfire,Jumanji,The Mask,Dumb and Dumber,Groundhog Day,Ferris Bueller's Day Off,The Truman Show,Liar Liar,Big,
Mean Girls,The Hangover,Superbad,Step Brothers,Anchorman,Elf,Napoleon Dynamite,Borat,Deadpool 2,Free Guy,
Finding Nemo,Monsters Inc,The Incredibles,Up,Inside Out,Coco,Frozen,Moana,Zootopia,Ratatouille,
Shrek,Madagascar,Kung Fu Panda,How to Train Your Dragon,Despicable Me,Sing,The Lego Movie,Trolls,Rio,Ice Age,
The Shining,Psycho,Alien,Aliens,The Thing,Blade Runner,2001 A Space Odyssey,A Clockwork Orange,Full Metal Jacket,Apocalypse Now,
Saving Private Ryan,Braveheart,The Last of the Mohicans,Glory,Black Hawk Down,American Sniper,Fury,1917,Dunkirk,Hacksaw Ridge,
The Wolf of Wall Street,Casino,Donnie Brasco,Heat,Scarface,The Godfather Part II,Once Upon a Time in Hollywood,Taxi Driver,Good Will Hunting,A Beautiful Mind,
Rocky,Rambo First Blood,Top Gun,Die Hard,The Terminator,Terminator 2 Judgment Day,Speed,The Fugitive,Face Off,Con Air,
John Wick,Mission Impossible,The Bourne Identity,Casino Royale,Skyfall,No Time to Die,Mission Impossible Fallout,Taken,Collateral,Man on Fire,
Get Out,Hereditary,The Babadook,A Quiet Place,Us,The Lighthouse,Midsommar,The Witch,Split,Gone Girl,
The Social Network,Moneyball,The Big Short,Babylon,Bohemian Rhapsody,Rocketman,A Star Is Born,The Greatest Showman,Greatest Showman Sing,Reservoir Dogs,
Slumdog Millionaire,Life of Pi,The Pianist,Amelie,City of God,Oldboy,Perfect Blue,Millennium Actress,Tokyo Godfathers,The Girl Who Leapt Through Time,
Demon Slayer Mugen Train,Suzume,Weathering With You,Howl's Moving Castle,Princess Mononoke,My Neighbor Totoro,Spirited Away,Ponyo,Akira,Ghost in the Shell,
The Sixth Sense,Unbreakable,Signs,Shutter Island,Memento,The Prestige,Tenet,Oppenheimer,Zero Day,Memento Mori Requiem for a Dream,
Barbie,Everything Everywhere All at Once,Dune,Dune Part Two,Blade Runner 2049,Arrival,Ex Machina,Annihilation,Your Name,A Silent Voice,
Mean Streets,Casino Royale 1967,The Good the Bad and the Ugly,For a Few Dollars More,Fistful of Dollars,Once Upon a Time in the West,Duck You Sucker,The Untouchables,Miller's Crossing,Barton Fink,
No Country for Old Men,Fargo,Burn After Reading,The Grand Budapest Hotel,Moonrise Kingdom,Isle of Dogs,The French Dispatch,Asteroid City,Rushmore,The Life Aquatic`;

async function steamGames(cap) {
  const ck = "/tmp/pass9_steam.json";
  if (fs.existsSync(ck)) return JSON.parse(fs.readFileSync(ck, "utf8")).items || [];
  const DS = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const have = new Set((DS.categories.games.images || []).map((x) => normKey(x.subject)));
  const items = [];
  for (let page = 0; page < 5 && items.length < cap; page++) {
    const list = await jget(`https://steamspy.com/api.php?request=all&page=${page}`);
    if (!list || typeof list !== "object") break;
    const ids = Object.keys(list);
    console.log(`[steam] page ${page}: ${ids.length} apps`);
    for (const appid of ids) {
      if (items.length >= cap) break;
      const g = list[appid];
      const name = String(g.name || "").trim();
      if (!name || name.length > 44) continue;
      if (have.has(normKey(name))) continue;
      const url = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
      const buf = await getBin(url);
      if (!buf || !magicOk(buf)) { await sleep(120); continue; }
      have.add(normKey(name));
      items.push({ cat: "games", topic: "Video Games", q: "Which video game is this cover art from?", options: [name], correct: 0, alts: [], fmt: "typed", img: url, subject: name, cls: "lore", difficulty: "easy", source: "steam-capsule", id: null });
      await sleep(120);
    }
    await sleep(600);
  }
  fs.writeFileSync(ck, JSON.stringify({ generatedAt: new Date().toISOString(), items }));
  return items;
}

async function imdbPosters(cap) {
  const ck = "/tmp/pass9_imdb.json";
  if (fs.existsSync(ck)) return JSON.parse(fs.readFileSync(ck, "utf8")).items || [];
  const DS = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const have = new Set((DS.categories.movies.images || []).map((x) => normKey(x.subject)));
  const titles = [...new Set(FILMS.split(",").map((s) => s.trim()).filter(Boolean))];
  const items = [];
  for (const t of titles) {
    if (items.length >= cap) break;
    if (have.has(normKey(t))) continue;
    const q0 = t.replace(/[^a-z0-9]/gi, " ").trim().split(/\s+/)[0] || "x";
    const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const data = await jget(`https://v2.sg.media-imdb.com/suggestion/${q0[0]}/${slug}.json`);
    if (!data || !Array.isArray(data.d)) continue;
    const hit = data.d.find((x) => normKey(x.l) === normKey(t) && /^(movie|tv movie|video)$/i.test(String(x.q || ""))) || data.d.find((x) => normKey(x.l) === normKey(t));
    const img = hit && hit.i && hit.i.imageUrl;
    if (!hit || !img) continue;
    const buf = await getBin(img);
    if (!buf || !magicOk(buf)) continue;
    have.add(normKey(t));
    items.push({ cat: "movies", topic: "Movies", q: "Which movie is this poster from?", options: [String(hit.l)], correct: 0, alts: [], fmt: "typed", img, subject: String(hit.l), cls: "lore", difficulty: "easy", source: "imdb-poster", id: null });
    await sleep(200);
  }
  fs.writeFileSync(ck, JSON.stringify({ generatedAt: new Date().toISOString(), items }));
  return items;
}

(async () => {
  axios = require("axios");
  const DS = JSON.parse(fs.readFileSync(OUT, "utf8"));
  fs.copyFileSync(OUT, `${OUT}.bak-v9`);
  console.log("backfilling games (steam capsules)...");
  const gm = await steamGames(420);
  console.log("backfilling movies (imdb posters)...");
  const mv = await imdbPosters(300);
  const add = { games: gm, movies: mv };
  const lines = [];
  for (const [cat, items] of Object.entries(add)) {
    const pool = DS.categories[cat].images || [];
    const urls = new Set(pool.map((x) => x.img));
    let n = 0;
    for (const it of items) {
      if (urls.has(it.img)) continue;
      urls.add(it.img);
      pool.push(it);
      n++;
    }
    if (DS.counts[cat]) DS.counts[cat].images = pool.length;
    lines.push(`${cat}: +${n} verified images (pool ${pool.length})`);
  }
  DS.generatedAt = new Date().toISOString();
  DS.version = 8.1;
  fs.writeFileSync(OUT, JSON.stringify(DS));
  const summary = `\n=== v8.1 image backfill ${DS.generatedAt} ===\nsteam=${gm.length} imdb=${mv.length}\n${lines.join("\n")}\n`;
  fs.appendFileSync(REPORT, summary);
  console.log(summary);
})().catch((e) => { console.error("FATAL", e && e.stack || e); process.exit(1); });
