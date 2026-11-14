// ============================================
// GAME NIGHT QUIZ PACKS
// ============================================
// Used by `.j quiz -gn` (alias of `.j quiz -preplanned event1`) and
// `.j quiz -preplanned event2` (and by `.j gamenight`).
//
// 2026-11-14 REBUILD (client brief: "they only want the quiz"):
//   event1 = THE REMADE QUIZ, all typed answers, wait-then-reveal scoring:
//     1. 30 logos - every single one a TEXT-FREE glyph (wordmarks swapped for
//        bundled symbols: Rockstar R★ / Shell pecten / Tinder flame added this
//        round; Netflix's N, Nintendo's wordmark and Tesla's TESLA lettering are gone).
//     2. 40 hand-written anime/comics trivia - deliberately hard, owner's
//        examples: Superman's MIDDLE name, what happened to Kyle Rayner's
//        girlfriend. Every answer verified against canon/fandom sources.
//     3. 20 NAME THE CHARACTER portraits - obscure, deliberately NOT the
//        protagonist (art: superhero-api dataset + image search, visually verified).
//     4. 16 NAME THE ANIME portraits - re-baked from character art, top-band
//        crop on a solid white background, every file visually inspected.
//     5. 10 CARTOON MUSICALS - real song clips through the .j audio pipeline
//        (specific song titles, not just opening themes).
//   event2 = finale (unchanged): 10 video game questions + a 12-portrait
//            "Which Game?" picture round + obscure comic character / team rounds.
//
// All event1 sections are typed (fmt "typed", hideOptions) - no ABCD anywhere.
// Every image ships in the repo (assets/gn-quiz/), so nothing is live-fetched
// at quiz time except the audio clips, which are pre-baked to disk on boot.
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

// ---------- EVENT 1: the remade quiz ----------
// Logos = the preplanned pack's 30 slots, EVERY ONE a text-free glyph:
//   - 13 ship from assets/gn-quiz/logos/ (Simple Icons-style symbols, CC0;
//     Microsoft's four squares drawn by hand; Rockstar/Shell/Tinder fetched
//     and white-plated this round). Netflix (wordmark N is a letter), Nintendo
//     (NINTENDO SWITCH printed on the logo) and Tesla (TESLA lettering under
//     the T) all swapped out per the "none text logos" brief.
//   - the rest ride the audited dataset (each visually verified text-free).
const POOL_OF = { "Apps & Social": "Apps", Tech: "Tech", "Entertainment & Gaming": "Gaming", Cars: "Cars", "Food & Drink": "Food", Fashion: "Fashion" };
const SWAPS = {
  // same brand, symbol only
  Twitch: { bundled: "twitch" }, Google: { bundled: "google" }, Microsoft: { bundled: "microsoft" },
  Nvidia: { bundled: "nvidia" }, Adidas: { bundled: "adidas" },
  // brand has no text-free logo -> different brand in the same slot (2026-11-14: all glyph-only)
  Amazon: { name: "Pinterest", wiki: "Pinterest", cat: "Apps & Social", bundled: "pinterest" },
  Samsung: { name: "Snapchat", wiki: "Snapchat", cat: "Apps & Social", bundled: "snapchat" },
  Xbox: { name: "Duolingo", wiki: "Duolingo", cat: "Apps & Social", bundled: "duolingo" },
  "Epic Games": { name: "Roblox", wiki: "Roblox", cat: "Entertainment & Gaming", bundled: "roblox" },
  "Coca-Cola": { name: "Red Bull", wiki: "Red Bull", cat: "Food & Drink", bundled: "redbull" },
  Netflix: { name: "Tinder", wiki: "Tinder", cat: "Apps & Social", bundled: "tinder" },          // was the N wordmark
  Nintendo: { name: "Rockstar Games", wiki: "Rockstar Games", cat: "Entertainment & Gaming", bundled: "rockstar" }, // had NINTENDO SWITCH printed
  Tesla: { name: "Shell", wiki: "Shell", cat: "Cars", bundled: "shell" },                        // had TESLA lettering
};
const E1_BRANDS = withDecoys(preplanned.PACK.brands.map((b) => {
  const sw = SWAPS[b.name] || {};
  const nb = { name: sw.name || b.name, wiki: sw.wiki || b.wiki, cat: sw.cat || b.cat, bundled: sw.bundled || null };
  return { ...nb, pool: POOL_OF[nb.cat] || "Tech" };
}));

// Hand-written trivia, one checkable fact each, VERIFIED 2026-11-14:
// comics answers vs DC/Marvel/fandom wikis (Superman middle name = Joseph per
// the post-Crisis legal name; Alex DeWitt found in a refrigerator, Green
// Lantern #54; Joan Williams; Arthur Curry Jr; Anthony Edward Stark; Stanley
// Martin Lieber; Timely Comics; Amazing Fantasy #15; Detective Comics #27),
// anime answers vs official/fandom sources (Gine - DB Minus; Dina Fritz the
// Smiling Titan; Liberio; Sakumo "Konoha's White Fang"; Mito Uzumaki first
// Nine-Tails jinchuriki; Portgas D. Rouge; Luffy 3,000,000,000 post-Wano
// ch.1053; Rem kills L; Kenjaku in Geto's corpse; Old Man Zangetsu = Ichigo's
// Quincy side; Truth takes Mustang's eyesight; Exploding Blood; Conjurer;
// Caped Baldy; Test Subject 007; Eternal Slumber; Ghost Devil).
// fmt "typed" everywhere - the client brief: "you should just name instead of
// the abcd sh*t we normally do".
const T = (id, franchise, difficulty, q, answer, alts = []) => ({ id, franchise, fmt: "typed", difficulty, topic: franchise, q, answer, alts });
const E1_TRIVIA = [
  // ---- anime (20) ----
  T("e1-db-gine", "Dragon Ball", "hard", "What is the name of Goku's biological mother, revealed in Dragon Ball Minus and Super: Broly?", "Gine"),
  T("e1-db-champa", "Dragon Ball", "hard", "Which God of Destruction is Beerus's twin brother, ruling Universe 6?", "Champa"),
  T("e1-aot-dina", "Attack on Titan", "hard", "The Titan that ate Eren's mother is revealed to be Grisha's first wife - name her.", "Dina Fritz", ["Dina Yeager", "Smiling Titan", "The Smiling Titan", "Dina"]),
  T("e1-aot-liberio", "Attack on Titan", "hard", "In which Marleyan internment city do Reiner, Annie and Bertholdt grow up?", "Liberio", ["Rebellio", "Rebelio", "Libelio"]),
  T("e1-naruto-whitefang", "Naruto", "hard", "What was the nickname of Kakashi's father Sakumo Hatake, who took his own life after a failed mission?", "Konoha's White Fang", ["White Fang", "White Fang of Konoha", "White Fang of the Leaf", "The White Fang", "Konoha White Fang"]),
  T("e1-naruto-mito", "Naruto", "hard", "Which wife of the First Hokage became the Nine-Tails' first jinchuriki?", "Mito Uzumaki", ["Mito", "Uzumaki Mito"]),
  T("e1-op-rouge", "One Piece", "hard", "Who is Gol D. Roger's partner and Ace's mother, who held her pregnancy for 20 months to hide her son?", "Portgas D. Rouge", ["Portgas D Rouge", "Portgas Rouge", "Rouge"]),
  T("e1-op-kaido", "One Piece", "hard", "Kaido's Devil Fruit is the Uo Uo no Mi - what mythical dragon does it transform him into?", "Azure Dragon", ["Seiryu", "Blue Dragon", "Fish-Fish Fruit Model Seiryu", "Fish Fish Fruit Model Seiryu", "Uo Uo no Mi Model Seiryu", "Dragon"]),
  T("e1-op-bounty", "One Piece", "medium", "What is Luffy's bounty after the Wano arc (chapter 1053)?", "3 billion", ["3000000000", "3 billion berries", "Three billion", "3,000,000,000", "3B", "Three billion berries", "3000000000 berries"]),
  T("e1-dn-rem", "Death Note", "hard", "Which shinigami sacrifices herself to kill L, writing his real name in her Death Note?", "Rem", ["Remu"]),
  T("e1-jjk-kenjaku", "Jujutsu Kaisen", "hard", "Which thousand-year-old body-hopping sorcerer is wearing Geto's corpse?", "Kenjaku", ["Noritoshi Kamo", "Kamo Noritoshi", "Kamu Noritoshi"]),
  T("e1-bleach-zangetsu", "Bleach", "hard", "In the Thousand-Year Blood War arc, what does 'Old Man Zangetsu' turn out to actually represent?", "Ichigo's Quincy powers", ["Quincy", "His Quincy powers", "Quincy powers", "Yhwach", "Yhwach's power", "The Quincy", "His Quincy heritage", "His Quincy side"]),
  T("e1-fma-mustang", "Fullmetal Alchemist", "medium", "As the toll for opening the Gate, what does Truth take from Roy Mustang?", "His eyesight", ["His eyes", "Eyesight", "His sight", "His vision", "Vision", "Eyes"]),
  T("e1-mha-yagi", "My Hero Academia", "medium", "What is All Might's civilian surname?", "Yagi", ["Toshinori Yagi", "Yagi Toshinori", "Toshinori"]),
  T("e1-ds-nezuko", "Demon Slayer", "hard", "What is the name of Nezuko's Blood Demon Art?", "Exploding Blood", ["Exploding blood", "Bakketsu", "Blood Burst", "Hekketsu"]),
  T("e1-hxh-kurapika", "Hunter x Hunter", "hard", "What Nen type does Kurapika's Water Divination reveal him to be?", "Conjurer", ["Conjuration", "Materialization", "A Conjurer", "Conjurer type"]),
  T("e1-opm-hero", "One Punch Man", "medium", "What is Saitama's official Hero Association hero name?", "Caped Baldy", ["Bald Cape", "Caped Baldy", "Baldy"]),
  T("e1-sf-anya", "Spy x Family", "hard", "What was Anya's designation as an experimental test subject before her adoption?", "Subject 007", ["Test Subject 007", "007", "Experiment 007", "Test Subject 7", "Subject 7", "Test Subject 007 (Anya)"]),
  T("e1-sl-slumber", "Solo Leveling", "hard", "Which incurable sleep disease put Jinwoo's mother into a decade-long coma?", "Eternal Slumber", ["Eternal Sleep", "Eternal Sleep Disease", "The Eternal Slumber", "Eternal slumber disease"]),
  T("e1-csm-ghost", "Chainsaw Man", "hard", "Which devil is Himeno contracted to, invoked with a hand signal?", "Ghost Devil", ["The Ghost Devil", "Ghost"]),
  // ---- comics (20) ----
  T("e1-superman-middle", "Superman", "hard", "What is Clark Kent's middle name in the post-Crisis comics (not his Kryptonian name)?", "Joseph", ["Joe", "Clark Joseph Kent"]),
  T("e1-gl-fridge", "Green Lantern", "hard", "Kyle Rayner's girlfriend Alex DeWitt was murdered and found stuffed inside which household appliance, coining a famous comics trope?", "Refrigerator", ["Fridge", "A refrigerator", "The refrigerator", "A fridge", "The fridge", "Refridgerator"]),
  T("e1-arkham-founder", "Batman", "hard", "Who founded Arkham Asylum, subject of the graphic novel 'Arkham Asylum: A Serious House on Serious Earth'?", "Amadeus Arkham", ["Amadeus", "Arkham"]),
  T("e1-rhino-name", "Spider-Man", "hard", "What is the real name of the Rhino, Spider-Man's horned powerhouse?", "Aleksei Sytsevich", ["Alexei Sytsevich", "Aleksei Mikhailovich Sytsevich", "Alexi Sytsevich", "Aleksei", "Alexei"]),
  T("e1-xmen-legion", "X-Men", "medium", "Which reality-warping villain, son of Professor X, is split across multiple personalities?", "Legion", ["David Haller", "David Charles Haller"]),
  T("e1-ff-franklin", "Fantastic Four", "medium", "What is the name of Reed Richards and Sue Storm's reality-warping son?", "Franklin", ["Franklin Richards", "Franklin Benjamin Richards", "Franklin Storm"]),
  T("e1-thor-betaray", "Thor", "medium", "Which cyborg alien from Korbinite proved worthy enough to lift Mjolnir, earning Thor's respect?", "Beta Ray Bill", ["Beta-Ray Bill", "Bill"]),
  T("e1-thanos-eros", "Marvel", "hard", "What is the name of Thanos's brother, the Avengers' Starfox?", "Eros", ["Starfox", "Eros of Titan", "Eros (Starfox)"]),
  T("e1-aquaman-son", "Aquaman", "hard", "What is the name of Aquaman and Mera's infant son, murdered by Black Manta in the classic comics?", "Arthur Curry Jr.", ["Aquababy", "Arthur Curry Junior", "Arthur Jr", "Arthur Curry Junior", "Arthur Jr."]),
  T("e1-stark-middle", "Iron Man", "hard", "What is Tony Stark's middle name?", "Edward", ["Anthony Edward Stark"]),
  T("e1-banner-first", "Hulk", "medium", "What is Bruce Banner's legal FIRST name in the Marvel comics?", "Robert", ["Robert Bruce Banner", "Robert"]),
  T("e1-wolverine-origin", "Wolverine", "medium", "What is Wolverine's birth name, revealed in the Origin miniseries?", "James Howlett", ["Jim Howlett", "James"]),
  T("e1-flash-joan", "The Flash", "hard", "Who is Jay Garrick, the Golden Age Flash's, longtime wife?", "Joan Williams", ["Joan Garrick", "Joan Williams Garrick", "Joan"]),
  T("e1-starsapphire", "Green Lantern", "medium", "The Star Sapphires wield which color of the emotional spectrum (the light of love)?", "Violet", ["Violet light", "Purple", "The violet light", "Love", "The violet light of love"]),
  T("e1-titans-garfield", "Teen Titans", "medium", "What is Beast Boy's real name?", "Garfield Logan", ["Garfield Mark Logan", "Garfield", "Gar", "Gar Logan"]),
  T("e1-penguin-oswald", "Batman", "medium", "What is the Penguin's real name?", "Oswald Cobblepot", ["Oswald Chesterfield Cobblepot", "Oswald", "Cobblepot"]),
  T("e1-stanlee-name", "Marvel", "hard", "What is Stan Lee's real birth name?", "Stanley Martin Lieber", ["Stanley Lieber", "Stan Lieber"]),
  T("e1-marvel-timely", "Marvel", "hard", "Marvel Comics launched in 1939 under what company name?", "Timely Comics", ["Timely Publications", "Timely"]),
  T("e1-spidey-firstapp", "Spider-Man", "medium", "In which comic did Spider-Man make his first appearance?", "Amazing Fantasy #15", ["Amazing Fantasy 15", "Amazing Fantasy", "Amazing Fantasy Fifteen"]),
  T("e1-batman-firstapp", "Batman", "medium", "In which comic did Batman make his first appearance?", "Detective Comics #27", ["Detective Comics 27", "Detective Comics", "Detective Comics Twenty-Seven"]),
];

// "Name the Character" picture round - 20 deliberately OBSCURE comic characters
// (owner: "not just protagonist"). Art: superhero-api dataset + image search,
// bundled under assets/gn-quiz/chars/<slug>.jpg, visually verified at bake time.
// Typed answers with real-name aliases via the v8 matcher.
const C1 = (slug, pub, answer, alts = []) => ({ id: `e1-ch-${slug}`, file: `chars/${slug}.jpg`, fmt: "typed", q: `Name this comic book character (${pub}).`, answer, alts, difficulty: "hard", topic: "Name the Character" });
const E1_CHARS = [
  C1("blade", "Marvel", "Blade", ["Blade the Vampire Hunter"]),
  C1("cable", "Marvel", "Cable", ["Nathan Summers"]),
  C1("colossus", "Marvel", "Colossus", ["Piotr Rasputin", "Peter Rasputin"]),
  C1("darkseid", "DC", "Darkseid", ["Uxas"]),
  C1("deathstroke", "DC", "Deathstroke", ["Slade Wilson", "Slade"]),
  C1("drax", "Marvel", "Drax the Destroyer", ["Drax", "Arthur Douglas"]),
  C1("firestorm", "DC", "Firestorm", ["Fire Storm"]),
  C1("gambit", "Marvel", "Gambit", ["Remy LeBeau", "Remy Etienne LeBeau"]),
  C1("hellboy", "Dark Horse", "Hellboy", ["Anung Un Rama"]),
  C1("jubilee", "Marvel", "Jubilee", ["Jubilation Lee"]),
  C1("lobo", "DC", "Lobo"),
  C1("namor", "Marvel", "Namor", ["Sub-Mariner", "The Sub-Mariner", "Namor McKenzie"]),
  C1("nightcrawler", "Marvel", "Nightcrawler", ["Kurt Wagner"]),
  C1("nova", "Marvel", "Nova", ["Richard Rider", "Nova Prime"]),
  C1("psylocke", "Marvel", "Psylocke", ["Elizabeth Braddock", "Betsy Braddock"]),
  C1("raven", "DC", "Raven", ["Rachel Roth"]),
  C1("sinestro", "DC", "Sinestro", ["Thaal Sinestro"]),
  C1("spawn", "Image", "Spawn", ["Al Simmons"]),
  C1("starfire", "DC", "Starfire", ["Koriand'r", "Korianders", "Kory Anders"]),
  C1("vision", "Marvel", "Vision", ["The Vision", "Victor Shade"]),
];

// "Name the Anime" picture round - one iconic character portrait per franchise,
// re-baked 2026-11-14: character art cropped to its top band on a solid white
// background (assets/gn-quiz/anime/<slug>.jpg), every file visually inspected.
// Typed answers; the v8 matcher handles romaji/EN variants via alts.
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

// "Cartoon Musicals" - REAL SONGS with specific titles (owner brief: "look up
// specific song titles for different cartoons and use those"), not just opening
// themes. Same .j audio retrieval as the theme rounds (Go audio service, 30 s
// clips, pre-baked to disk). mustTitleAny pins the canonical upload; kindLabel
// switches the question to "Which show is this song from?".
const MU = (show, search, mustTitleAny, alts = []) => ({ show, search, mustTitleAny, alts, type: "toon", kindLabel: "show", topic: "Cartoon Musicals", cacheKey: `gnmusic:${String(show).toLowerCase().replace(/[^a-z0-9]+/g, "")}` });
const E1_MUSICAL = [
  MU("SpongeBob SquarePants", "Sweet Victory SpongeBob band geeks song", ["sweet victory"], ["Spongebob", "Sponge Bob", "SpongeBob"]),
  MU("Phineas and Ferb", "Gitchee Gitchee Goo Phineas and Ferb song", ["gitchee", "gitchie", "gitchi"], ["Phineas & Ferb"]),
  MU("Steven Universe", "We Are the Crystal Gems Steven Universe song", ["crystal gems"], ["Steven Universe"]),
  MU("Adventure Time", "Everything Stays Adventure Time song Rebecca Sugar", ["everything stays"], ["Adventure Time"]),
  MU("Avatar: The Last Airbender", "Leaves from the Vine Avatar Iroh little soldier boy", ["leaves from the vine", "little soldier boy"], ["Avatar", "ATLA", "Avatar The Last Airbender", "The Last Airbender"]),
  MU("Rick and Morty", "Evil Morty theme For the Damaged Coda Rick and Morty", ["damaged coda", "evil morty"], ["Rick & Morty"]),
  MU("Gravity Falls", "Gravity Falls opening theme song", ["gravity falls"]),
  MU("DuckTales", "DuckTales theme song original", ["ducktales"], ["Duck Tales"]),
  MU("Kim Possible", "Call Me Beep Me Kim Possible theme song", ["beep me", "kim possible"]),
  MU("X-Men: The Animated Series", "X-Men animated series opening theme", ["x-men", "x men"], ["X-Men", "XMen", "X Men", "Xmen"]),
];

// ---------- EVENT 2: finale (unchanged content, same wiring) ----------
// 10 video game trivia
const T2 = (id, franchise, difficulty, q, answer, alts = []) => ({ id, franchise, fmt: "typed", difficulty, topic: franchise, q, answer, alts });
const E2_GAMES = [
  T2("e2-g-midgar", "Video Games", "medium", "In Final Fantasy VII, what is the name of Shinra's sprawling capital city, built on stacked plates?", "Midgar"),
  T2("e2-g-geralt-school", "The Witcher", "hard", "Which school of witchers, with its wolf medallion, trained Geralt of Rivia?", "School of the Wolf", ["Wolf School", "School of the Wolf"]),
  T2("e2-g-masterchief", "Halo", "medium", "What is Master Chief's service number, stitched into every Spartan's legend?", "117", ["John 117", "SPARTAN 117", "Spartan 117", "117"]),
  T2("e2-g-zoras", "Zelda", "hard", "Which aquatic race, allies of Link, live in Zora's Domain and guard the Zora Sapphire?", "Zoras", ["Zora", "The Zoras", "The Zora"]),
  T2("e2-g-melina", "Elden Ring", "hard", "In Elden Ring, which mysterious maiden offers to accompany the Tarnished and lets them level up at Sites of Grace?", "Melina"),
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
    title: "Game Night Mega Quiz",
    counts: { logos: 30, trivia: E1_TRIVIA.length, pictures: E1_CHARS.length + E1_ANIME.length, music: E1_MUSICAL.length },
    plan() {
      const ANIME_IDS = ["e1-db-gine", "e1-db-champa", "e1-aot-dina", "e1-aot-liberio", "e1-naruto-whitefang", "e1-naruto-mito", "e1-op-rouge", "e1-op-kaido", "e1-op-bounty", "e1-dn-rem", "e1-jjk-kenjaku", "e1-bleach-zangetsu", "e1-fma-mustang", "e1-mha-yagi", "e1-ds-nezuko", "e1-hxh-kurapika", "e1-opm-hero", "e1-sf-anya", "e1-sl-slumber", "e1-csm-ghost"];
      const animeQ = ANIME_IDS.map((id) => E1_TRIVIA.find((t) => t.id === id)).filter(Boolean);
      const comicsQ = E1_TRIVIA.filter((t) => !ANIME_IDS.includes(t.id));
      return [
        { name: "Logo Round 1/3", domain: "logos", perSection: 10, pinnedBrands: E1_BRANDS.slice(0, 10) },
        { name: "Logo Round 2/3", domain: "logos", perSection: 10, pinnedBrands: E1_BRANDS.slice(10, 20) },
        { name: "Logo Round 3/3", domain: "logos", perSection: 10, pinnedBrands: E1_BRANDS.slice(20, 30) },
        { name: "Anime Trivia 1/2", domain: "preplanned", perSection: 10, pinnedTrivia: animeQ.slice(0, 10) },
        { name: "Anime Trivia 2/2", domain: "preplanned", perSection: 10, pinnedTrivia: animeQ.slice(10, 20) },
        { name: "Comics Trivia 1/2", domain: "preplanned", perSection: 10, pinnedTrivia: comicsQ.slice(0, 10) },
        { name: "Comics Trivia 2/2", domain: "preplanned", perSection: 10, pinnedTrivia: comicsQ.slice(10, 20) },
        { name: "Name the Character", domain: "pictures", perSection: E1_CHARS.length, pinnedPictures: E1_CHARS, timeLimit: 40 },
        { name: "Name the Anime", domain: "pictures", perSection: E1_ANIME.length, pinnedPictures: E1_ANIME, timeLimit: 30 },
        { name: "Cartoon Musicals", domain: "audio", perSection: E1_MUSICAL.length, pinnedThemes: E1_MUSICAL, clipSeconds: 30 },
      ];
    },
    head(prefix) {
      const tot = 30 + E1_TRIVIA.length + E1_CHARS.length + E1_ANIME.length + E1_MUSICAL.length;
      return `🗺 5 acts • ${tot} rounds - all typed, no ABCD:\n  🏢 30 brand logos (every one a text-free glyph)\n  🧠 40 hard anime + comics trivia\n  💥 20 obscure comic characters - name them\n  🎴 16 anime portraits - name the show\n  🎵 10 cartoon songs - name the show\n`;
    },
    minBuilt: 106,
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
  const k = key === "gn" ? "event1" : key;
  return PACKS[k] || null;
}

module.exports = { PACKS, get, E1_BRANDS, E1_TRIVIA, E1_CHARS, E1_ANIME, E1_MUSICAL, E2_GAMES, E2_GAMECHARS, E2_CHARS, E2_TEAMS, E2_BRANDS };
