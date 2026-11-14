// ============================================
// GAME NIGHT QUIZ PACKS
// ============================================
// Used by `.j quiz -preplanned event1` / `event2` (and by `.j gamenight`).
// Same machinery as the regular preplanned pack (pinned logos from the verified
// dataset, pinned typed/mc trivia, pinned theme songs) - only the content differs.
//
//   event1 = the preplanned pack's 30 logos (text-only logos swapped for text-free ones), a 16-portrait
//            "Name the Anime" picture round, 20 harder hand-written franchise questions, 6 theme songs.
//   event2 = finale: 10 video game questions + a 12-portrait "Which Game?" picture round + obscure
//            comic character / team picture rounds.
//
// 2026-11-14 (bake-time fetch round): the two portrait rounds ship BUNDLED art under assets/gn-quiz/
// (anime/<slug>.jpg, games/<slug>.jpg) - every file was visually verified at bake time, so the quiz
// never live-fetches these and can't ship a wrong image.
//
// Every logo name below exists in data/logoDataset.json (live + modern), so
// images come from the audited dataset path, not live search. Decoys are
// same-category names so the options stay fair.
// ============================================

const preplanned = require("./quizPreplanned");

// ---------- decoy pools (names only, never need images) ----------
const DECOYS = {
  Tech: ["Anker", "Belkin", "Corsair", "Sonos", "Fitbit", "Roku", "Twilio", "Datadog", "Okta", "Zoom", "Dropbox", "Asana"],
  Fintech: ["Square", "Revolut", "Klarna", "Wise", "Coinbase", "Venmo", "Plaid", "Payoneer"],
  Food: ["Doritos", "Lay's", "Pringles", "Fanta", "Sprite", "Lipton", "Kellogg's", "Oreo", "Haribo", "Toblerone", "Nando's", "KFC"],
  Fashion: ["Carhartt", "Patagonia", "Vans", "Converse", "Puma", "Reebok", "Levi's", "North Face", "Under Armour"],
  Cars: ["Bugatti", "Pagani", "Maserati", "Lotus", "Mini", "Jaguar", "Fisker", "Lucid", "Genesis"],
  Apps: ["Snapchat", "Pinterest", "Signal", "Tumblr", "Bumble", "Twitter", "Skype", "WeChat"],
  Gaming: ["Ubisoft", "Capcom", "Sega", "Konami", "Valve", "Blizzard", "Rockstar", "Square Enix", "Riot Games", "Activision"],
};

function mk(name, cat, pool) {
  return { name, wiki: name, cat, pool };
}

function withDecoys(list) {
  // 3 decoys per brand: same-category pack brands first (rotating), then the decoy pool.
  return list.map((b, i) => {
    const same = list.filter((x) => x.name !== b.name && x.pool === b.pool).map((x) => x.name);
    const extra = DECOYS[b.pool] || [];
    const picks = [];
    for (let k = 0; k < same.length && picks.length < 2; k++) picks.push(same[(i + k) % same.length]);
    for (let k = 0; picks.length < 3 && k < extra.length; k++) {
      const n = extra[(i * 3 + k) % extra.length];
      if (!picks.includes(n) && n.toLowerCase() !== b.name.toLowerCase()) picks.push(n);
    }
    return { ...b, decoys: picks.slice(0, 3) };
  });
}

// ---------- EVENT 1: Mega Quiz ----------
// Logos = the regular preplanned pack's 30 brands (same order / difficulty ramp), EXCEPT every logo whose
// picture is just the brand's name written out (wordmarks, or glyph + lettering). Those are swapped for a
// text-free glyph that ships in assets/gn-quiz/logos/ (Simple Icons glyphs, CC0; Microsoft's four squares
// drawn by hand) - either the same brand's symbol, or a different brand when the original has no symbol.
const POOL_OF = { "Apps & Social": "Apps", Tech: "Tech", "Entertainment & Gaming": "Gaming", Cars: "Cars", "Food & Drink": "Food", Fashion: "Fashion" };
const SWAPS = {
  // same brand, symbol only
  Twitch: { bundled: "twitch" }, Google: { bundled: "google" }, Microsoft: { bundled: "microsoft" },
  Nvidia: { bundled: "nvidia" }, Adidas: { bundled: "adidas" },
  // brand has no text-free logo -> different brand in the same slot
  Amazon: { name: "Pinterest", wiki: "Pinterest", cat: "Apps & Social", bundled: "pinterest" },
  Samsung: { name: "Snapchat", wiki: "Snapchat", cat: "Apps & Social", bundled: "snapchat" },
  Xbox: { name: "Duolingo", wiki: "Duolingo", cat: "Apps & Social", bundled: "duolingo" },
  "Epic Games": { name: "Roblox", wiki: "Roblox", cat: "Entertainment & Gaming", bundled: "roblox" },
  "Coca-Cola": { name: "Red Bull", wiki: "Red Bull", cat: "Food & Drink", bundled: "redbull" },
};
const E1_BRANDS = withDecoys(preplanned.PACK.brands.map((b) => {
  const sw = SWAPS[b.name] || {};
  const nb = { name: sw.name || b.name, wiki: sw.wiki || b.wiki, cat: sw.cat || b.cat, bundled: sw.bundled || null };
  return { ...nb, pool: POOL_OF[nb.cat] || "Tech" };
}));

// Hand-written, canon-checked, one checkable fact each. fmt "typed" = type the answer (alts + typo tolerance).
const T = (id, franchise, difficulty, q, answer, alts = []) => ({ id, franchise, fmt: "typed", difficulty, topic: franchise, q, answer, alts });
const E1_TRIVIA = [
  // ---- Dragon Ball (5) ----
  T("e1-db-belmod", "Dragon Ball", "hard", "Which God of Destruction rules Universe 11, the home universe of Jiren and Toppo?", "Belmod"),
  T("e1-db-vegeta-broly", "Dragon Ball", "hard", "In Dragon Ball Super: Broly, which ruler orders baby Broly exiled to the planet Vampa?", "King Vegeta", ["Vegeta Sr", "Vegeta Senior"]),
  T("e1-db-nail", "Dragon Ball", "medium", "Which Namekian warrior fuses with Piccolo on Namek and gives him a huge power boost?", "Nail"),
  T("e1-db-cabba", "Dragon Ball", "hard", "Which Universe 6 Saiyan is taught to go Super Saiyan by Vegeta?", "Cabba", ["Kyabe"]),
  T("e1-db-heeters", "Dragon Ball", "hard", "In the Granolah the Survivor arc, which mercenary race wiped out Granolah's people, the Cerealians?", "Heeters", ["The Heeters", "Heeter"]),
  // ---- Solo Leveling (5) ----
  T("e1-sl-run", "Solo Leveling", "medium", "In the System's Daily Quest, how many kilometres must Jinwoo run?", "10", ["10 km", "10km", "ten", "ten km", "10 kilometres", "10 kilometers"]),
  T("e1-sl-gunhee", "Solo Leveling", "medium", "Who is the chairman of the Korean Hunters Association?", "Go Gunhee", ["Goh Gunhee", "Go Gun-Hee", "Goh Gun-Hee", "Gunhee"]),
  T("e1-sl-ashborn", "Solo Leveling", "hard", "What is the name of the original Shadow Monarch whose power Jinwoo inherits?", "Ashborn", ["Ashbourne"]),
  T("e1-sl-querehsha", "Solo Leveling", "hard", "Which Monarch of Plagues commanded the Ant King, Beru, before he joined Jinwoo?", "Querehsha"),
  T("e1-sl-baek", "Solo Leveling", "hard", "Which S-rank hunter leads the White Tiger Guild?", "Baek Yoonho", ["Baek Yun-ho", "Baek Yunho", "Yoonho", "Baek Yoon-ho"]),
  // ---- Devil May Cry (5) ----
  T("e1-dmc-agni", "Devil May Cry", "hard", "What are the names of the twin demon swords Dante takes in Devil May Cry 3?", "Agni and Rudra", ["Agni & Rudra", "Agni Rudra", "Agni, Rudra", "Agni"]),
  T("e1-dmc-nico", "Devil May Cry", "medium", "Who is the van-driving Devil Breaker engineer who works with Nero in Devil May Cry 5?", "Nico", ["Nicoletta", "Nicoletta Goldstein"]),
  T("e1-dmc-nightmare", "Devil May Cry", "hard", "V's three familiars are Griffon, Shadow and which golem?", "Nightmare"),
  T("e1-dmc-trish", "Devil May Cry", "medium", "Which demon, sent by Mundus, takes the appearance of Dante's mother Eva?", "Trish"),
  T("e1-dmc-nelo", "Devil May Cry", "hard", "In the original Devil May Cry, which armoured knight boss is revealed to be a controlled Vergil?", "Nelo Angelo", ["Nelo"]),
  // ---- God of War (5) ----
  T("e1-gow-huldra", "God of War", "medium", "Which two dwarven brothers, known as the Huldra Brothers, forge gear for Kratos in the Norse saga?", "Brok and Sindri", ["Brok & Sindri", "Sindri and Brok", "Brok", "Sindri", "Brok Sindri"]),
  T("e1-gow-jorm", "God of War", "medium", "What is the name of the World Serpent that Kratos and Atreus visit by boat?", "Jormungandr", ["Jörmungandr", "Jormungand", "Jormungander"]),
  T("e1-gow-calliope", "God of War", "hard", "What was the name of Kratos's daughter in the Greek saga?", "Calliope"),
  T("e1-gow-jotun", "God of War", "medium", "Which realm of giants holds the highest peak where Kratos and Atreus scatter Faye's ashes?", "Jotunheim", ["Jötunheim", "Jotunheimr", "Jotun"]),
  T("e1-gow-hercules", "God of War", "medium", "Which half-brother of Kratos does he beat to death in God of War III, taking the Nemean Cestus?", "Hercules", ["Heracles"]),
];

// "Name the Anime" picture round - one iconic character portrait per franchise, bundled art
// (assets/gn-quiz/anime/<slug>.jpg), visually verified at bake time. Typed answers; the v8 matcher
// handles romaji/EN variants via alts.
const AN = (slug, answer, alts = []) => ({ id: `e1-an-${slug}`, file: `anime/${slug}.jpg`, fmt: "typed", q: "Which anime is this character from?", answer, alts, difficulty: "easy", topic: "Name the Anime" });
const E1_ANIME = [
  AN("naruto", "Naruto", ["Naruto Shippuden", "Naruto Shippuuden", "Naruto Shippūden"]),
  AN("onepiece", "One Piece"),
  AN("dragonball", "Dragon Ball", ["Dragon Ball Z", "Dragon Ball Super", "DBZ"]),
  AN("deathnote", "Death Note"),
  AN("demonslayer", "Demon Slayer", ["Kimetsu no Yaiba"]),
  AN("attackontitan", "Attack on Titan", ["Shingeki no Kyojin", "AoT"]),
  AN("jujutsukaisen", "Jujutsu Kaisen", ["JJK"]),
  AN("myheroacademia", "My Hero Academia", ["Boku no Hero Academia", "MHA", "BNHA"]),
  AN("fma", "Fullmetal Alchemist", ["FMA", "Fullmetal Alchemist Brotherhood", "FMAB"]),
  AN("bleach", "Bleach"),
  AN("hxh", "Hunter x Hunter", ["Hunter Hunter", "HunterxHunter", "HxH"]),
  AN("onepunchman", "One Punch Man", ["One-Punch Man", "OPM", "One Punch"]),
  AN("spyxfamily", "Spy x Family", ["Spy Family", "Spy×Family", "SPY x FAMILY"]),
  AN("chainsawman", "Chainsaw Man"),
  AN("sailormoon", "Sailor Moon", ["Sailor Moon Crystal", "Bishoujo Senshi Sailor Moon"]),
  AN("solo-leveling", "Solo Leveling", ["Na Honjaman Level Up", "Only I Level Up"]),
];

// 3 game + 3 anime theme songs (all six already proven in the regular pack) - audio unchanged
const E1_THEMES = () => {
  const all = preplanned.PACK.themes;
  const pick = (names) => names.map((n) => all.find((t) => t.show === n)).filter(Boolean);
  return {
    game: pick(["Devil May Cry", "Skyrim", "DOOM"]),
    anime: pick(["Attack on Titan", "Demon Slayer", "One Piece"]),
  };
};

// ---------- EVENT 2: finale = video games + comic picture rounds ----------
const E2_GAMES = [
  T("e2-g-dream", "Video Games", "medium", "In Bloodborne, what is the name of the hub where hunters level up and buy gear between hunts?", "The Hunter's Dream", ["Hunters Dream", "Hunter's Dream", "Hunter Dream"]),
  T("e2-g-majora", "Video Games", "medium", "In The Legend of Zelda: Majora's Mask, how many days does Link have before the moon crashes into Termina?", "3", ["three", "3 days", "three days"]),
  T("e2-g-wheatley", "Video Games", "medium", "In Portal 2, which bumbling personality core, voiced by Stephen Merchant, accompanies Chell?", "Wheatley"),
  T("e2-g-geo", "Video Games", "medium", "What is the currency called in Hollow Knight?", "Geo"),
  T("e2-g-firelink", "Video Games", "medium", "In the original Dark Souls, what is the name of the hub bonfire where the player returns between areas?", "Firelink Shrine", ["Firelink"]),
  T("e2-g-asriel", "Video Games", "hard", "In Undertale, what is Flowey's real name?", "Asriel", ["Asriel Dreemurr", "Azriel"]),
  T("e2-g-zebes", "Video Games", "medium", "On which planet is Samus Aran's first mission set, home of Mother Brain?", "Zebes", ["Planet Zebes"]),
  T("e2-g-nibel", "Video Games", "hard", "Which village, burned by Sephiroth, is Cloud's hometown in Final Fantasy VII?", "Nibelheim"),
  T("e2-g-blackmesa", "Video Games", "medium", "In Half-Life, at which research facility does the Resonance Cascade happen?", "Black Mesa"),
  T("e2-g-melina", "Video Games", "hard", "In Elden Ring, which mysterious maiden offers to accompany the Tarnished and lets them level up at Sites of Grace?", "Melina"),
];

// "Which Game?" picture round - iconic video game characters, bundled art (assets/gn-quiz/games/<slug>.jpg),
// visually verified at bake time. Typed answer = the game (franchise-level alts accepted).
const GM = (slug, answer, alts = []) => ({ id: `e2-gm-${slug}`, file: `games/${slug}.jpg`, fmt: "typed", q: "Which game is this character from?", answer, alts, difficulty: "easy", topic: "Which Game?" });
const E2_GAMECHARS = [
  GM("godofwar", "God of War", ["God of War 2018", "God of War Ragnarok", "GoW"]),
  GM("zelda", "The Legend of Zelda", ["Zelda", "Breath of the Wild", "Tears of the Kingdom", "LoZ"]),
  GM("mario", "Super Mario", ["Mario", "Super Mario Bros", "Super Mario Brothers", "Super Mario Bros U"]),
  GM("sonic", "Sonic the Hedgehog", ["Sonic", "Sonic Mania"]),
  GM("halo", "Halo", ["Halo Infinite", "Halo Combat Evolved", "Halo 5"]),
  GM("finalfantasy", "Final Fantasy", ["Final Fantasy VII", "Final Fantasy 7", "FF7", "FFVII"]),
  GM("metroid", "Metroid", ["Metroid Prime", "Super Metroid"]),
  GM("tombraider", "Tomb Raider", ["Tomb Raider 2013", "Rise of the Tomb Raider"]),
  GM("witcher", "The Witcher", ["The Witcher 3", "Witcher 3", "The Witcher 3 Wild Hunt"]),
  GM("doom", "DOOM", ["Doom", "Doom Eternal", "Doom 2016", "Doomguy"]),
  GM("kirby", "Kirby", ["Kirby's Dream Land", "Kirby Star Allies"]),
  GM("nier", "NieR: Automata", ["Nier Automata", "NieR Automata", "NieR", "Nier"]),
];

// Obscure comic rounds - art from the open-source superhero-api dataset (github.com/akabab/superhero-api, MIT),
// bundled under assets/gn-quiz/comics/<id>.jpg. Characters picked on purpose to be obscure.
const CH = (id, pub, answer, alts = []) => ({ id: `e2-ch-${id}`, file: `comics/${id}.jpg`, fmt: "typed", q: `Name this comic book character (${pub}).`, answer, alts, difficulty: "hard", topic: "Comic Characters" });
const E2_CHARS = [
  CH(137, "DC", "Brainiac 5", ["Brainiac Five", "Brainiac V", "Querl Dox"]),
  CH(388, "DC", "Kilowog"),
  CH(79, "Marvel", "Beta Ray Bill", ["Beta-Ray Bill", "Bill"]),
  CH(350, "Marvel", "Jack of Hearts", ["Jack Hart"]),
  CH(12, "Marvel", "Air-Walker", ["Air Walker", "Airwalker", "Gabriel Lan"]),
  CH(428, "Marvel", "Man-Thing", ["Man Thing", "Manthing", "Ted Sallis"]),
  CH(188, "Marvel", "Cottonmouth", ["Cotton Mouth", "Burchell Clemens"]),
  CH(202, "Marvel", "Darkhawk", ["Dark Hawk", "Chris Powell"]),
];
const TM = (id, pub, correct, wrong, extraAlts) => ({ id: `e2-tm-${id}`, file: `comics/${id}.jpg`, fmt: "mc", q: `Which comic book team is this character a member of? (${pub})`, options: [correct, ...wrong], difficulty: "hard", topic: "Comic Teams" });
const E2_TEAMS = [
  TM(407, "DC", "Legion of Super-Heroes", ["Teen Titans", "Doom Patrol", "Justice League International"]),
  TM(177, "DC", "Justice Society of America", ["Justice League of America", "Infinity Inc.", "Outsiders"]),
  TM(56, "Marvel", "Alpha Flight", ["X-Factor", "Excalibur", "New Mutants"]),
  TM(146, "Marvel", "Morlocks", ["Hellfire Club", "Brotherhood of Mutants", "Acolytes"]),
  TM(41, "Marvel", "Marauders", ["Hellfire Club", "Freedom Force", "Acolytes"]),
  TM(338, "Marvel", "Squadron Supreme", ["Avengers", "Defenders", "Thunderbolts"]),
  TM(336, "Marvel", "New Warriors", ["Heroes for Hire", "Young Avengers", "Power Pack"]),
  TM(2, "Dark Horse", "B.P.R.D.", ["S.T.A.R. Labs", "S.H.I.E.L.D.", "Checkmate"]),
];
const E2_BRANDS = []; // gaming-logo round retired from the finale (kept as an empty export for the dry-run tooling)

// ---------- pack definitions ----------
const PACKS = {
  event1: {
    key: "event1",
    title: "Game Night Round 1: Mega Quiz",
    counts: { logos: 30, pictures: E1_ANIME.length, trivia: 20, music: 6 },
    plan() {
      const th = E1_THEMES();
      const by = (f) => E1_TRIVIA.filter((t) => t.franchise === f);
      return [
        { name: "Logo Round 1/3", domain: "logos", perSection: 10, pinnedBrands: E1_BRANDS.slice(0, 10) },
        { name: "Logo Round 2/3", domain: "logos", perSection: 10, pinnedBrands: E1_BRANDS.slice(10, 20) },
        { name: "Logo Round 3/3", domain: "logos", perSection: 10, pinnedBrands: E1_BRANDS.slice(20, 30) },
        { name: "Name the Anime", domain: "pictures", perSection: E1_ANIME.length, pinnedPictures: E1_ANIME, timeLimit: 30 },
        { name: "Dragon Ball", domain: "preplanned", perSection: 5, pinnedTrivia: by("Dragon Ball") },
        { name: "Solo Leveling", domain: "preplanned", perSection: 5, pinnedTrivia: by("Solo Leveling") },
        { name: "Devil May Cry", domain: "preplanned", perSection: 5, pinnedTrivia: by("Devil May Cry") },
        { name: "God of War", domain: "preplanned", perSection: 5, pinnedTrivia: by("God of War") },
        { name: "Theme Songs: Games", domain: "audio", perSection: th.game.length, pinnedThemes: th.game, clipSeconds: 30 },
        { name: "Theme Songs: Anime", domain: "audio", perSection: th.anime.length, pinnedThemes: th.anime, clipSeconds: 30 },
      ];
    },
    head(prefix) {
      return `🗺 4 acts • ${30 + E1_ANIME.length + 20 + 6} rounds:\n  🏢 30 brand logos (tougher set)\n  🎴 ${E1_ANIME.length} name-the-anime portraits\n  🧠 20 trivia - Dragon Ball / Solo Leveling / Devil May Cry / God of War\n  🎵 6 theme songs - 3 games + 3 anime\n`;
    },
    minBuilt: 45,
  },
  event2: {
    key: "event2",
    title: "Game Night Finale: Comics & Games",
    counts: { logos: 0, trivia: 10, pictures: E2_GAMECHARS.length + E2_CHARS.length + E2_TEAMS.length, music: 0 },
    plan() {
      return [
        { name: "Video Games", domain: "preplanned", perSection: E2_GAMES.length, pinnedTrivia: E2_GAMES },
        { name: "Which Game?", domain: "pictures", perSection: E2_GAMECHARS.length, pinnedPictures: E2_GAMECHARS, timeLimit: 30 },
        { name: "Comic Characters", domain: "pictures", perSection: E2_CHARS.length, pinnedPictures: E2_CHARS, timeLimit: 40 },
        { name: "Comic Teams", domain: "pictures", perSection: E2_TEAMS.length, pinnedPictures: E2_TEAMS, timeLimit: 40 },
      ];
    },
    head(prefix) {
      return `🗺 4 acts • ${10 + E2_GAMECHARS.length + E2_CHARS.length + E2_TEAMS.length} rounds:\n  🎮 10 video game questions\n  🕹 ${E2_GAMECHARS.length} which-game portraits\n  💥 8 obscure comic characters (name them)\n  🦸 8 obscure comic teams (pick the team)\n`;
    },
    minBuilt: 24,
  },
};

function get(key) {
  const k = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return PACKS[k] || null;
}

module.exports = { PACKS, get, E1_BRANDS, E1_TRIVIA, E1_ANIME, E2_GAMES, E2_GAMECHARS, E2_CHARS, E2_TEAMS, E2_BRANDS };
