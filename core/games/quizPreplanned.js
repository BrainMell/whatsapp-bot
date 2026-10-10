// ============================================
// PREPLANNED QUIZ PACK (2026-10-10, owner: ".j quiz -preplanned")
// ============================================
// Owner brief: "follow the normal quiz formula but you are preselecting 30
// popular brands, remember their 2026 logo ... after that it's 20 questions:
// 5 Dragon Ball, 5 Solo Leveling, 5 Devil May Cry, 5 God of War ... then 10
// theme songs, 5 from games and 5 from anime, the first 30 seconds ...
// should look, feel and act as a regular quiz ... special timers: 30s
// response time, 45 for the music."
//
// FIXED curated pack - zero LLM, zero live search for trivia; logos ride the
// verified Wikipedia dataset (current/2026 logos, imageGate-audited); music
// rides the existing Go audio pipeline (.j audio infra, P11) with SPECIFIC
// song-name searches so the canonical track is found.
//
// Timers: every question carries q.timeLimit - 30s logos/trivia, 45s music
// (owner spec). The regular quiz config stays untouched for other modes.
//
// Content-policy note: the owner floated an adult-site brand for the logo
// section; it was swapped for mainstream picks (WhatsApp ToS + the bot's own
// media gates reject adult branding - the round would break mid-quiz).
// ============================================

// ── 30 brands - every entry verified present in data/logoDataset.json
// (baked, magic-byte verified, 2026-current files) AND quizLogosPool
// (wiki anchors + same-category decoys). Order = curated difficulty ramp:
// instantly recognizable first, trickier toward the end.
const BRANDS = [
  { name: "YouTube", wiki: "YouTube", cat: "Apps & Social" },
  { name: "Netflix", wiki: "Netflix", cat: "Apps & Social" },
  { name: "WhatsApp", wiki: "WhatsApp", cat: "Apps & Social" },
  { name: "Instagram", wiki: "Instagram", cat: "Apps & Social" },
  { name: "X", wiki: "X (social network)", cat: "Apps & Social" },
  { name: "TikTok", wiki: "TikTok", cat: "Apps & Social" },
  { name: "Spotify", wiki: "Spotify", cat: "Tech" },
  { name: "Discord", wiki: "Discord", cat: "Apps & Social" },
  { name: "Telegram", wiki: "Telegram (software)", cat: "Apps & Social" },
  { name: "Twitch", wiki: "Twitch (service)", cat: "Apps & Social" },
  { name: "Google", wiki: "Google", cat: "Tech" },
  { name: "Amazon", wiki: "Amazon (company)", cat: "Tech" },
  { name: "Microsoft", wiki: "Microsoft", cat: "Tech" },
  { name: "Apple", wiki: "Apple Inc.", cat: "Tech" },
  { name: "Samsung", wiki: "Samsung Electronics", cat: "Tech" },
  { name: "Nvidia", wiki: "Nvidia", cat: "Tech" },
  { name: "Visual Studio Code", wiki: "Visual Studio Code", cat: "Tech" },
  { name: "Reddit", wiki: "Reddit", cat: "Apps & Social" },
  { name: "Steam", wiki: "Steam (service)", cat: "Entertainment & Gaming" },
  { name: "PlayStation", wiki: "PlayStation", cat: "Entertainment & Gaming" },
  { name: "Xbox", wiki: "Xbox", cat: "Entertainment & Gaming" },
  { name: "Nintendo", wiki: "Nintendo", cat: "Entertainment & Gaming" },
  { name: "Epic Games", wiki: "Epic Games", cat: "Entertainment & Gaming" },
  { name: "OpenAI", wiki: "OpenAI", cat: "Tech" },
  { name: "Tesla", wiki: "Tesla, Inc.", cat: "Cars" },
  { name: "Coca-Cola", wiki: "Coca-Cola", cat: "Food & Drink" },
  { name: "Starbucks", wiki: "Starbucks", cat: "Food & Drink" },
  { name: "Nike", wiki: "Nike, Inc.", cat: "Fashion" },
  { name: "Adidas", wiki: "Adidas", cat: "Fashion" },
  { name: "Ferrari", wiki: "Ferrari", cat: "Cars" },
];

// ── 20 trivia questions - answers hand-verified against canon (owner:
// "make sure you get the correct answer"). fmt "typed" = type the answer
// (alts + typo tolerance via the v8 matcher); fmt "mc" = ABCD options.
// Owner examples in the brief: Universe 2 God of Destruction + Granolah's AI
// companion (the answer is "Oatmeel" - spelled with TWO E's, "Oatmeal"
// accepted as an alias).
const TRIVIA = [
  // ---- Dragon Ball (5) ----
  {
    id: "db-u2-god", franchise: "Dragon Ball", fmt: "typed", difficulty: "medium", topic: "Dragon Ball",
    q: "In Dragon Ball Super, who is the God of Destruction of Universe 2?",
    answer: "Heles", alts: ["Heles", "Helles"],
  },
  {
    id: "db-granolah-ai", franchise: "Dragon Ball", fmt: "typed", difficulty: "hard", topic: "Dragon Ball",
    q: "In the Dragon Ball Super manga, what is the name of the little robot AI that accompanies Granolah?",
    answer: "Oatmeel", alts: ["Oatmeal"],
  },
  {
    id: "db-kakarot", franchise: "Dragon Ball", fmt: "typed", difficulty: "easy", topic: "Dragon Ball",
    q: "What name was Goku given at birth on Planet Vegeta?",
    answer: "Kakarot", alts: ["Kakarott", "Kakarotto"],
  },
  {
    id: "db-trunks-cold", franchise: "Dragon Ball", fmt: "typed", difficulty: "medium", topic: "Dragon Ball",
    q: "Who cuts down both Frieza and King Cold when they arrive on Earth after the Namek Saga?",
    answer: "Trunks", alts: ["Future Trunks", "Mirai Trunks", "Trunks Briefs"],
  },
  {
    id: "db-ssj2", franchise: "Dragon Ball", fmt: "mc", difficulty: "medium", topic: "Dragon Ball",
    q: "Which Saiyan first unlocked Super Saiyan 2 during the Cell Games?",
    options: ["Vegeta", "Goku", "Gohan", "Trunks"], correct: 2,
  },
  // ---- Solo Leveling (5) ----
  {
    id: "sl-protagonist", franchise: "Solo Leveling", fmt: "typed", difficulty: "easy", topic: "Solo Leveling",
    q: "What is the full name of Solo Leveling's protagonist?",
    answer: "Sung Jinwoo", alts: ["Jinwoo", "Sung Jin-Woo", "Jin-Woo", "Sung Jin Woo"],
  },
  {
    id: "sl-arise", franchise: "Solo Leveling", fmt: "typed", difficulty: "easy", topic: "Solo Leveling",
    q: "What single word does Jinwoo speak to raise his fallen enemies as shadow soldiers?",
    answer: "Arise", alts: ["Arise!", "Arise."],
  },
  {
    id: "sl-erank", franchise: "Solo Leveling", fmt: "mc", difficulty: "easy", topic: "Solo Leveling",
    q: "What rank was Jinwoo at the start of the series, before his awakening?",
    options: ["E-rank", "D-rank", "C-rank", "S-rank"], correct: 0,
  },
  {
    id: "sl-cha", franchise: "Solo Leveling", fmt: "typed", difficulty: "medium", topic: "Solo Leveling",
    q: "Who is Korea's only female S-rank hunter in Solo Leveling?",
    answer: "Cha Hae-in", alts: ["Cha Haein", "Hae-in", "Cha Hae In"],
  },
  {
    id: "sl-igris", franchise: "Solo Leveling", fmt: "typed", difficulty: "hard", topic: "Solo Leveling",
    q: "What is the name of the armored knight Jinwoo defeats in his Job Change Quest and rewrites into his most loyal shadow?",
    answer: "Igris", alts: ["Igris the Bloodred", "Knight Killer Igris"],
  },
  // ---- Devil May Cry (5) ----
  {
    id: "dmc-dante", franchise: "Devil May Cry", fmt: "typed", difficulty: "easy", topic: "Devil May Cry",
    q: "Who is the pizza-loving devil hunter at the center of Devil May Cry?",
    answer: "Dante",
  },
  {
    id: "dmc-vergil", franchise: "Devil May Cry", fmt: "typed", difficulty: "easy", topic: "Devil May Cry",
    q: "What is the name of Dante's twin brother - the cold, katana-wielding rival?",
    answer: "Vergil",
  },
  {
    id: "dmc-sparda", franchise: "Devil May Cry", fmt: "typed", difficulty: "medium", topic: "Devil May Cry",
    q: "Who is the legendary dark knight - father of Dante and Vergil - that rebelled against the demon army?",
    answer: "Sparda",
  },
  {
    id: "dmc-nero", franchise: "Devil May Cry", fmt: "mc", difficulty: "medium", topic: "Devil May Cry",
    q: "Which young devil hunter wields the demonic Devil Bringer arm in Devil May Cry 4?",
    options: ["Dante", "Nero", "Trish", "Lady"], correct: 1,
  },
  {
    id: "dmc-mundus", franchise: "Devil May Cry", fmt: "typed", difficulty: "hard", topic: "Devil May Cry",
    q: "What is the name of the demon king who ruled the Human World before Sparda sealed him away?",
    answer: "Mundus",
  },
  // ---- God of War (5) ----
  {
    id: "gow-kratos", franchise: "God of War", fmt: "typed", difficulty: "easy", topic: "God of War",
    q: "Who is the Ghost of Sparta - the main character of the God of War series?",
    answer: "Kratos",
  },
  {
    id: "gow-atreus", franchise: "God of War", fmt: "typed", difficulty: "easy", topic: "God of War",
    q: "What is the name of Kratos' young son, journeying with him through the Norse realms?",
    answer: "Atreus",
  },
  {
    id: "gow-blades", franchise: "God of War", fmt: "typed", difficulty: "medium", topic: "God of War",
    q: "What are the chained blades forged for Kratos by the God of War Ares called?",
    answer: "Blades of Chaos", alts: ["Chaos Blades", "Blade of Chaos"],
  },
  {
    id: "gow-baldur", franchise: "God of War", fmt: "mc", difficulty: "medium", topic: "God of War",
    q: "Which Norse god is the final boss Kratos and Atreus take down in God of War (2018)?",
    options: ["Thor", "Odin", "Heimdall", "Baldur"], correct: 3,
  },
  {
    id: "gow-mimir", franchise: "God of War", fmt: "typed", difficulty: "medium", topic: "God of War",
    q: "What is the name of the severed talking head that rides Kratos' belt through the Norse realms?",
    answer: "Mimir", alts: ["Mimir's Head", "Mimir Head"],
  },
];

// ── 10 theme songs (5 games / 5 anime) - SPECIFIC song names in the search
// strings so the Go audio service lands the canonical upload (owner: "find
// the specific names of the theme songs and search um up"). alts are accepted
// typed answers on top of the show/game name. cacheKey namespaces these away
// from the regular audio mode (this pack clips the FIRST 30 SECONDS, the
// standard mode clips 25s).
const THEMES = [
  // ---- games (5) ----
  {
    show: "Devil May Cry", search: "Devil Trigger Casey Edwards Devil May Cry 5 Nero theme song", type: "game",
    alts: ["Devil May Cry 5", "DMC", "DMC5", "Devil Trigger"], cacheKey: "preplan:devilmaycry",
  },
  {
    show: "God of War", search: "God of War main theme Bear McCreary soundtrack", type: "game",
    alts: ["God of War 2018", "God of War 4", "GoW", "God of War Ragnarok"], cacheKey: "preplan:godofwar",
  },
  {
    show: "Elden Ring", search: "Elden Ring main theme soundtrack OST", type: "game",
    alts: ["Elden Ring"], cacheKey: "preplan:eldenring",
  },
  {
    show: "DOOM", search: "BFG Division Mick Gordon DOOM 2016 soundtrack", type: "game",
    alts: ["Doom", "Doom 2016", "Doom Eternal"], cacheKey: "preplan:doom",
  },
  {
    show: "Minecraft", search: "Sweden C418 Minecraft soundtrack", type: "game",
    alts: ["Minecraft"], cacheKey: "preplan:minecraft",
  },
  // ---- anime (5) ----
  {
    show: "Solo Leveling", search: "LEveL SawanoHiroyuki nZk mizuki Solo Leveling opening theme", type: "anime",
    alts: ["Na Honjaman Level Up", "Only I Level Up", "Solo Leveling"], cacheKey: "preplan:soleoleveling",
  },
  {
    show: "Dragon Ball Z", search: "Cha-La Head-Cha-La Kageyama Dragon Ball Z opening theme", type: "anime",
    alts: ["DBZ", "Dragon Ball"], cacheKey: "preplan:dragonballz",
  },
  {
    show: "Attack on Titan", search: "Guren no Yumiya Linked Horizon Attack on Titan opening theme", type: "anime",
    alts: ["Shingeki no Kyojin", "AoT"], cacheKey: "preplan:attackontitan",
  },
  {
    show: "Demon Slayer", search: "Gurenge LiSA Demon Slayer opening theme", type: "anime",
    alts: ["Kimetsu no Yaiba"], cacheKey: "preplan:demonslayer",
  },
  {
    show: "One Piece", search: "We Are! Hiroshi Kitadani One Piece opening theme", type: "anime",
    alts: ["One Piece"], cacheKey: "preplan:onepiece",
  },
];

// pack -> live-session question object (same emit shape as the v8 dataset
// builder; typed questions carry [answer] + alts, MC questions keep 4 options
// with an explicit correct index). timeLimit rides per-question: 30s here,
// 45s is set on music by the section builder (owner timer spec).
const LOGO_TIME_S = 30;
const MUSIC_TIME_S = 45;

function toQuizQuestion(t) {
  const isTyped = t.fmt === "typed";
  return {
    q: t.q,
    options: isTyped ? [t.answer] : t.options,
    correct: isTyped ? 0 : t.correct,
    alts: isTyped ? (t.alts || []).slice(0, 6) : [],
    typed: isTyped,
    hideOptions: isTyped,
    difficulty: t.difficulty || "medium",
    topic: t.topic || t.franchise,
    domain: "preplanned",
    type: "text",
    loreRef: null,
    timeLimit: LOGO_TIME_S,
  };
}

module.exports = { PACK: { title: "Preplanned Mega Quiz", brands: BRANDS, trivia: TRIVIA, themes: THEMES }, toQuizQuestion, LOGO_TIME_S, MUSIC_TIME_S };
