// ============================================
// GAME NIGHT QUIZ PACKS
// ============================================
// Used by `.j quiz -preplanned event1` / `event2` (and by `.j gamenight`).
// Same machinery as the regular preplanned pack (pinned logos from the verified
// dataset, pinned typed/mc trivia, pinned theme songs) - only the content differs.
//
//   event1 = harder remix of the preplanned pack: 30 tougher logos, 20 tougher
//            franchise questions, 6 theme songs.
//   event2 = finale: obscure comic-book + video-game trivia and a gaming logo round.
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

// ---------- EVENT 1: harder preplanned remix ----------
// order = difficulty ramp inside each round
const E1_BRANDS = withDecoys([
  // round 1 (tech / apps / money)
  mk("Viber", "Apps & Social", "Apps"), mk("Threads", "Apps & Social", "Apps"), mk("Vimeo", "Apps & Social", "Apps"),
  mk("Stripe", "Fintech & Crypto", "Fintech"), mk("GoPro", "Tech", "Tech"), mk("Logitech", "Tech", "Tech"),
  mk("Razer", "Tech", "Tech"), mk("Garmin", "Tech", "Tech"), mk("DJI", "Tech", "Tech"), mk("Cloudflare", "Tech", "Tech"),
  // round 2 (food & drink)
  mk("Gatorade", "Food & Drink", "Food"), mk("Cheetos", "Food & Drink", "Food"), mk("Popeyes", "Food & Drink", "Food"),
  mk("Tim Hortons", "Food & Drink", "Food"), mk("Krispy Kreme", "Food & Drink", "Food"), mk("Stella Artois", "Food & Drink", "Food"),
  mk("Chupa Chups", "Food & Drink", "Food"), mk("Ferrero Rocher", "Food & Drink", "Food"), mk("Dairy Queen", "Food & Drink", "Food"),
  mk("Hennessy", "Food & Drink", "Food"),
  // round 3 (fashion / cars / the hard ones)
  mk("Dr. Martens", "Fashion", "Fashion"), mk("Supreme", "Fashion", "Fashion"), mk("Salomon", "Fashion", "Fashion"),
  mk("Rivian", "Cars", "Cars"), mk("Polestar", "Cars", "Cars"), mk("Koenigsegg", "Cars", "Cars"),
  mk("Shazam", "Apps & Social", "Apps"), mk("Robinhood", "Fintech & Crypto", "Fintech"),
  mk("Palantir", "Tech", "Tech"), mk("Funko", "Entertainment & Gaming", "Gaming"),
]);

// Answers are written from canon and each one is a single, checkable fact.
// fmt "typed" = type the answer (alts accepted + typo tolerance), "mc" = ABCD.
const E1_TRIVIA = [
  // ---- Dragon Ball (5) ----
  { id: "e1-db-whis", franchise: "Dragon Ball", fmt: "typed", difficulty: "medium", topic: "Dragon Ball",
    q: "What is the name of Beerus's angel attendant and martial arts tutor?", answer: "Whis", alts: ["Wiz"] },
  { id: "e1-db-porunga", franchise: "Dragon Ball", fmt: "typed", difficulty: "medium", topic: "Dragon Ball",
    q: "What is the name of the Eternal Dragon summoned by the Namekian Dragon Balls?", answer: "Porunga", alts: [] },
  { id: "e1-db-17", franchise: "Dragon Ball", fmt: "typed", difficulty: "medium", topic: "Dragon Ball",
    q: "What number is Android 18's twin brother?", answer: "17", alts: ["Android 17", "Seventeen", "Lapis"] },
  { id: "e1-db-champa", franchise: "Dragon Ball", fmt: "typed", difficulty: "hard", topic: "Dragon Ball",
    q: "Who is the God of Destruction of Universe 6?", answer: "Champa", alts: [] },
  { id: "e1-db-jiren", franchise: "Dragon Ball", fmt: "typed", difficulty: "hard", topic: "Dragon Ball",
    q: "Which Pride Trooper from Universe 11 is widely regarded as the strongest mortal in the Tournament of Power?", answer: "Jiren", alts: ["Jiren the Gray"] },
  // ---- Solo Leveling (5) ----
  { id: "e1-sl-jinah", franchise: "Solo Leveling", fmt: "typed", difficulty: "medium", topic: "Solo Leveling",
    q: "What is the name of Sung Jinwoo's younger sister?", answer: "Jinah", alts: ["Sung Jinah", "Sung Jin-Ah", "Jin-Ah", "Jin Ah"] },
  { id: "e1-sl-double", franchise: "Solo Leveling", fmt: "typed", difficulty: "medium", topic: "Solo Leveling",
    q: "Which special dungeon type nearly kills Jinwoo and leads to him receiving the System?", answer: "Double Dungeon", alts: ["The Double Dungeon"] },
  { id: "e1-sl-extract", franchise: "Solo Leveling", fmt: "typed", difficulty: "medium", topic: "Solo Leveling",
    q: "What is the name of the ability that lets Jinwoo turn defeated enemies into shadow soldiers?", answer: "Shadow Extraction", alts: ["Extraction"] },
  { id: "e1-sl-beru", franchise: "Solo Leveling", fmt: "typed", difficulty: "hard", topic: "Solo Leveling",
    q: "Which fearsome Ant King later becomes one of Jinwoo's strongest shadow soldiers?", answer: "Beru", alts: ["Baruka"] },
  { id: "e1-sl-antares", franchise: "Solo Leveling", fmt: "typed", difficulty: "hard", topic: "Solo Leveling",
    q: "Which Monarch of Destruction rules over the dragons in Solo Leveling?", answer: "Antares", alts: ["Antares the Dragon Monarch", "King of Dragons"] },
  // ---- Devil May Cry (5) ----
  { id: "e1-dmc-rebellion", franchise: "Devil May Cry", fmt: "typed", difficulty: "medium", topic: "Devil May Cry",
    q: "What is the name of Dante's signature broadsword, once owned by his father Sparda?", answer: "Rebellion", alts: [] },
  { id: "e1-dmc-v", franchise: "Devil May Cry", fmt: "typed", difficulty: "medium", topic: "Devil May Cry",
    q: "In Devil May Cry 5, the mysterious V is revealed to be the human half of which character?", answer: "Vergil", alts: [] },
  { id: "e1-dmc-tower", franchise: "Devil May Cry", fmt: "typed", difficulty: "hard", topic: "Devil May Cry",
    q: "What is the name of the demonic tower at the centre of Devil May Cry 3?", answer: "Temen-ni-gru", alts: ["Temen ni gru", "Temenigru", "Temen-ni-Gru"] },
  { id: "e1-dmc-lady", franchise: "Devil May Cry", fmt: "typed", difficulty: "hard", topic: "Devil May Cry",
    q: "What is Lady's real first name?", answer: "Mary", alts: [] },
  { id: "e1-dmc-prequel", franchise: "Devil May Cry", fmt: "mc", difficulty: "medium", topic: "Devil May Cry",
    q: "Which numbered Devil May Cry game is the earliest in the series' chronology?",
    options: ["Devil May Cry", "Devil May Cry 2", "Devil May Cry 3", "Devil May Cry 4"], correct: 2 },
  // ---- God of War (5) ----
  { id: "e1-gow-lysandra", franchise: "God of War", fmt: "typed", difficulty: "medium", topic: "God of War",
    q: "What was the name of Kratos's first wife, killed in the tragedy that haunts him?", answer: "Lysandra", alts: [] },
  { id: "e1-gow-axe", franchise: "God of War", fmt: "typed", difficulty: "medium", topic: "God of War",
    q: "What is the name of the frost-imbued axe Kratos wields in the Norse games?", answer: "Leviathan Axe", alts: ["Leviathan", "The Leviathan Axe"] },
  { id: "e1-gow-freya", franchise: "God of War", fmt: "typed", difficulty: "medium", topic: "God of War",
    q: "Which Norse goddess lives as the 'Witch of the Woods' in God of War (2018)?", answer: "Freya", alts: [] },
  { id: "e1-gow-deimos", franchise: "God of War", fmt: "typed", difficulty: "hard", topic: "God of War",
    q: "What is the name of Kratos's younger brother?", answer: "Deimos", alts: [] },
  { id: "e1-gow-loki", franchise: "God of War", fmt: "typed", difficulty: "hard", topic: "God of War",
    q: "What other name is Atreus revealed to carry, which Faye wrote in the ashes?", answer: "Loki", alts: [] },
];

// 3 game + 3 anime theme songs (all six already proven in the regular pack)
const E1_THEMES = () => {
  const all = preplanned.PACK.themes;
  const pick = (names) => names.map((n) => all.find((t) => t.show === n)).filter(Boolean);
  return {
    game: pick(["Devil May Cry", "Skyrim", "DOOM"]),
    anime: pick(["Attack on Titan", "Demon Slayer", "One Piece"]),
  };
};

// ---------- EVENT 2: comics + video games finale ----------
const E2_COMICS = [
  { id: "e2-c-sentry", franchise: "Comics", fmt: "typed", difficulty: "hard", topic: "Comic Books",
    q: "What is the real name of Marvel's The Sentry?", answer: "Robert Reynolds", alts: ["Bob Reynolds", "Reynolds"] },
  { id: "e2-c-garrick", franchise: "Comics", fmt: "typed", difficulty: "hard", topic: "Comic Books",
    q: "Who was the original Golden Age Flash?", answer: "Jay Garrick", alts: ["Garrick"] },
  { id: "e2-c-hellboy", franchise: "Comics", fmt: "typed", difficulty: "hard", topic: "Comic Books",
    q: "Which professor found and raised Hellboy, and founded the B.P.R.D.?", answer: "Trevor Bruttenholm", alts: ["Bruttenholm", "Professor Bruttenholm", "Trevor Broom", "Professor Broom", "Broom"] },
  { id: "e2-c-spawn", franchise: "Comics", fmt: "typed", difficulty: "hard", topic: "Comic Books",
    q: "Which demon lord makes the deal that turns Al Simmons into Spawn?", answer: "Malebolgia", alts: [] },
  { id: "e2-c-swamp", franchise: "Comics", fmt: "typed", difficulty: "hard", topic: "Comic Books",
    q: "What is the human name of DC's Swamp Thing in his original 1970s origin?", answer: "Alec Holland", alts: ["Holland"] },
  { id: "e2-c-xandar", franchise: "Comics", fmt: "typed", difficulty: "hard", topic: "Comic Books",
    q: "What is the home planet of the Nova Corps?", answer: "Xandar", alts: [] },
  { id: "e2-c-surfer", franchise: "Comics", fmt: "typed", difficulty: "hard", topic: "Comic Books",
    q: "What was the Silver Surfer's name before he became Galactus's herald?", answer: "Norrin Radd", alts: ["Norrin", "Radd"] },
  { id: "e2-c-dredd", franchise: "Comics", fmt: "typed", difficulty: "medium", topic: "Comic Books",
    q: "What is the name of Judge Dredd's home city?", answer: "Mega-City One", alts: ["Mega City One", "Megacity One", "Mega-City 1"] },
  { id: "e2-c-beetle", franchise: "Comics", fmt: "typed", difficulty: "hard", topic: "Comic Books",
    q: "Ted Kord took up which hero mantle after Dan Garrett?", answer: "Blue Beetle", alts: ["The Blue Beetle"] },
  { id: "e2-c-mirage", franchise: "Comics", fmt: "typed", difficulty: "hard", topic: "Comic Books",
    q: "Which small studio published the original 1984 black-and-white Teenage Mutant Ninja Turtles comic?", answer: "Mirage Studios", alts: ["Mirage", "Mirage Publishing"] },
  { id: "e2-c-usagi", franchise: "Comics", fmt: "mc", difficulty: "medium", topic: "Comic Books",
    q: "What kind of animal is the samurai hero Miyamoto Usagi in Usagi Yojimbo?",
    options: ["A cat", "A rabbit", "A fox", "A dog"], correct: 1 },
  { id: "e2-c-constantine", franchise: "Comics", fmt: "typed", difficulty: "hard", topic: "Comic Books",
    q: "John Constantine hails from which English city?", answer: "Liverpool", alts: [] },
  { id: "e2-c-rorschach", franchise: "Comics", fmt: "typed", difficulty: "medium", topic: "Comic Books",
    q: "What is Rorschach's real name in Watchmen?", answer: "Walter Kovacs", alts: ["Kovacs"] },
  { id: "e2-c-osterman", franchise: "Comics", fmt: "typed", difficulty: "hard", topic: "Comic Books",
    q: "What was Doctor Manhattan's name before his accident?", answer: "Jon Osterman", alts: ["Osterman", "Jonathan Osterman"] },
];

const E2_GAMES = [
  { id: "e2-g-nameless", franchise: "Video Games", fmt: "typed", difficulty: "hard", topic: "Video Games",
    q: "What is the protagonist of Planescape: Torment commonly called?", answer: "The Nameless One", alts: ["Nameless One", "Nameless"] },
  { id: "e2-g-zaum", franchise: "Video Games", fmt: "typed", difficulty: "hard", topic: "Video Games",
    q: "Which studio developed Disco Elysium?", answer: "ZA/UM", alts: ["ZAUM", "ZA UM", "Za/Um"] },
  { id: "e2-g-giygas", franchise: "Video Games", fmt: "typed", difficulty: "hard", topic: "Video Games",
    q: "Who is the cosmic final boss of EarthBound?", answer: "Giygas", alts: ["Giegue", "Gyiyg"] },
  { id: "e2-g-grayfox", franchise: "Video Games", fmt: "typed", difficulty: "hard", topic: "Video Games",
    q: "What is the codename of the cyborg ninja in the original Metal Gear Solid?", answer: "Gray Fox", alts: ["Grey Fox", "Frank Jaeger"] },
  { id: "e2-g-sunderland", franchise: "Video Games", fmt: "typed", difficulty: "hard", topic: "Video Games",
    q: "Who is the protagonist of Silent Hill 2?", answer: "James Sunderland", alts: ["James", "Sunderland"] },
  { id: "e2-g-agro", franchise: "Video Games", fmt: "typed", difficulty: "medium", topic: "Video Games",
    q: "What is the name of Wander's horse in Shadow of the Colossus?", answer: "Agro", alts: [] },
  { id: "e2-g-ammy", franchise: "Video Games", fmt: "typed", difficulty: "medium", topic: "Video Games",
    q: "Which sun goddess do you play as, in wolf form, in Okami?", answer: "Amaterasu", alts: ["Ammy"] },
  { id: "e2-g-hallownest", franchise: "Video Games", fmt: "typed", difficulty: "medium", topic: "Video Games",
    q: "What is the name of the ruined underground kingdom in Hollow Knight?", answer: "Hallownest", alts: [] },
  { id: "e2-g-house", franchise: "Video Games", fmt: "typed", difficulty: "hard", topic: "Video Games",
    q: "Who owns the Lucky 38 casino in Fallout: New Vegas?", answer: "Mr. House", alts: ["Mr House", "House", "Robert House", "Robert Edwin House"] },
  { id: "e2-g-yharnam", franchise: "Video Games", fmt: "typed", difficulty: "medium", topic: "Video Games",
    q: "What is the name of the gothic city in Bloodborne?", answer: "Yharnam", alts: [] },
  { id: "e2-g-raz", franchise: "Video Games", fmt: "typed", difficulty: "hard", topic: "Video Games",
    q: "Who is the young psychic acrobat protagonist of Psychonauts?", answer: "Razputin", alts: ["Raz", "Razputin Aquato"] },
  { id: "e2-g-shodan", franchise: "Video Games", fmt: "typed", difficulty: "hard", topic: "Video Games",
    q: "Which rogue AI antagonist stars in System Shock?", answer: "SHODAN", alts: ["Shodan"] },
  { id: "e2-g-denton", franchise: "Video Games", fmt: "typed", difficulty: "hard", topic: "Video Games",
    q: "Who is the nano-augmented protagonist of the original Deus Ex (2000)?", answer: "JC Denton", alts: ["J.C. Denton", "J C Denton", "Denton"] },
  { id: "e2-g-amaya", franchise: "Video Games", fmt: "typed", difficulty: "hard", topic: "Video Games",
    q: "Who developed Cave Story almost entirely alone?", answer: "Daisuke Amaya", alts: ["Amaya", "Pixel", "Studio Pixel"] },
  { id: "e2-g-lavos", franchise: "Video Games", fmt: "typed", difficulty: "medium", topic: "Video Games",
    q: "What is the name of the parasitic alien that is the final threat in Chrono Trigger?", answer: "Lavos", alts: [] },
];

const E2_BRANDS = withDecoys([
  mk("Atari", "Entertainment & Gaming", "Gaming"), mk("Space Invaders", "Entertainment & Gaming", "Gaming"),
  mk("Bethesda", "Entertainment & Gaming", "Gaming"), mk("Bandai Namco", "Entertainment & Gaming", "Gaming"),
  mk("Mojang Studios", "Entertainment & Gaming", "Gaming"), mk("Supercell", "Entertainment & Gaming", "Gaming"),
  mk("Age of Empires", "Entertainment & Gaming", "Gaming"), mk("Apex Legends", "Entertainment & Gaming", "Gaming"),
]);

// ---------- pack definitions ----------
const PACKS = {
  event1: {
    key: "event1",
    title: "Game Night Round 1: Mega Quiz",
    counts: { logos: 30, trivia: 20, music: 6 },
    plan() {
      const th = E1_THEMES();
      const by = (f) => E1_TRIVIA.filter((t) => t.franchise === f);
      return [
        { name: "Logo Round 1/3", domain: "logos", perSection: 10, pinnedBrands: E1_BRANDS.slice(0, 10) },
        { name: "Logo Round 2/3", domain: "logos", perSection: 10, pinnedBrands: E1_BRANDS.slice(10, 20) },
        { name: "Logo Round 3/3", domain: "logos", perSection: 10, pinnedBrands: E1_BRANDS.slice(20, 30) },
        { name: "Dragon Ball", domain: "preplanned", perSection: 5, pinnedTrivia: by("Dragon Ball") },
        { name: "Solo Leveling", domain: "preplanned", perSection: 5, pinnedTrivia: by("Solo Leveling") },
        { name: "Devil May Cry", domain: "preplanned", perSection: 5, pinnedTrivia: by("Devil May Cry") },
        { name: "God of War", domain: "preplanned", perSection: 5, pinnedTrivia: by("God of War") },
        { name: "Theme Songs: Games", domain: "audio", perSection: th.game.length, pinnedThemes: th.game, clipSeconds: 30 },
        { name: "Theme Songs: Anime", domain: "audio", perSection: th.anime.length, pinnedThemes: th.anime, clipSeconds: 30 },
      ];
    },
    head(prefix) {
      return `🗺 3 acts • 56 rounds:\n  🏢 30 brand logos (tougher set)\n  🧠 20 trivia - Dragon Ball / Solo Leveling / Devil May Cry / God of War\n  🎵 6 theme songs - 3 games + 3 anime\n`;
    },
    minBuilt: 40,
  },
  event2: {
    key: "event2",
    title: "Game Night Finale: Comics & Games",
    counts: { logos: 8, trivia: 29, music: 0 },
    plan() {
      return [
        { name: "Comic Books", domain: "preplanned", perSection: E2_COMICS.length, pinnedTrivia: E2_COMICS },
        { name: "Video Games", domain: "preplanned", perSection: E2_GAMES.length, pinnedTrivia: E2_GAMES },
        { name: "Gaming Logos", domain: "logos", perSection: E2_BRANDS.length, pinnedBrands: E2_BRANDS },
      ];
    },
    head(prefix) {
      return `🗺 3 acts • 37 rounds:\n  📚 14 obscure comic book questions\n  🎮 15 obscure video game questions\n  🕹 8 gaming logos\n`;
    },
    minBuilt: 30,
  },
};

function get(key) {
  const k = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return PACKS[k] || null;
}

module.exports = { PACKS, get, E1_BRANDS, E1_TRIVIA, E2_COMICS, E2_GAMES, E2_BRANDS };
