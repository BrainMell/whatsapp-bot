// ============================================
// QUIZ MEDIA MODES (2026-09-27): LOGOS + SPOT THE SONG
// ============================================
// Two standalone quiz modes requested by the owner. Both are LLM-FREE:
// questions are built deterministically from curated pools + real verified
// media, so preparation is fast (seconds) and cannot hallucinate.
//
//   LOGOS  - "Which brand does this logo belong to?"  Assets are real logos
//            from Wikipedia's file namespace (strict brand anchoring,
//            junk-filtered, magic-byte verified). Distractors come from the
//            SAME category so the question stays fair.
//   SONG   - "Which song is this clip from?"  Assets are real 25s clips via
//            the existing Go audio service (the .j audio infra - P11 rule:
//            no parallel fetch system), verified with the same P14-style
//            title-overlap gate + byte gates as theme songs.
//
// Both modes integrate through generateSectionQuestions (domain "logos" /
// "song") and reuse the whole live-session machinery: answers, timers,
// scoring, sections, banking (quizBank), dedup (usedKeys).
// ============================================

const crypto = require("crypto");
const quizLore = require("./quizLore");
const imageGate = require("../utils/imageGate"); // 2026-09-27: pixel gates on every logo/audio-cover image

const _norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const _sha = (s) => crypto.createHash("sha1").update(_norm(s)).digest("hex").slice(0, 16);

// ── shuffle helper (Fisher-Yates, no bias) ──
function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ════════════════════════════════════════════
// LOGOS POOL - famous brands / apps / companies.
// name = display name, wiki = exact Wikipedia article title (the logo file
// search anchors on it), cat = category for fair distractors.
// ════════════════════════════════════════════
const LOGOS_POOL = [
  // Tech
  { name: "Apple", wiki: "Apple Inc.", cat: "Tech" },
  { name: "Microsoft", wiki: "Microsoft", cat: "Tech" },
  { name: "Google", wiki: "Google", cat: "Tech" },
  { name: "Amazon", wiki: "Amazon (company)", cat: "Tech" },
  { name: "Meta", wiki: "Meta Platforms", cat: "Tech" },
  { name: "IBM", wiki: "IBM", cat: "Tech" },
  { name: "Intel", wiki: "Intel", cat: "Tech" },
  { name: "AMD", wiki: "AMD", cat: "Tech" },
  { name: "Nvidia", wiki: "Nvidia", cat: "Tech" },
  { name: "Samsung", wiki: "Samsung Electronics", cat: "Tech" },
  { name: "Sony", wiki: "Sony", cat: "Tech" },
  { name: "Panasonic", wiki: "Panasonic", cat: "Tech" },
  { name: "Lenovo", wiki: "Lenovo", cat: "Tech" },
  { name: "Dell", wiki: "Dell", cat: "Tech" },
  { name: "Adobe", wiki: "Adobe Inc.", cat: "Tech" },
  { name: "Oracle", wiki: "Oracle Corporation", cat: "Tech" },
  { name: "Cisco", wiki: "Cisco", cat: "Tech" },
  { name: "HP", wiki: "HP Inc.", cat: "Tech" },
  { name: "Xiaomi", wiki: "Xiaomi", cat: "Tech" },
  { name: "Huawei", wiki: "Huawei", cat: "Tech" },
  // Apps & Social
  { name: "Instagram", wiki: "Instagram", cat: "Apps & Social" },
  { name: "WhatsApp", wiki: "WhatsApp", cat: "Apps & Social" },
  { name: "TikTok", wiki: "TikTok", cat: "Apps & Social" },
  { name: "Snapchat", wiki: "Snapchat", cat: "Apps & Social" },
  { name: "Twitter", wiki: "Twitter", cat: "Apps & Social" },
  { name: "YouTube", wiki: "YouTube", cat: "Apps & Social" },
  { name: "Netflix", wiki: "Netflix", cat: "Apps & Social" },
  { name: "Spotify", wiki: "Spotify", cat: "Apps & Social" },
  { name: "Discord", wiki: "Discord", cat: "Apps & Social" },
  { name: "Twitch", wiki: "Twitch (service)", cat: "Apps & Social" },
  { name: "Telegram", wiki: "Telegram (software)", cat: "Apps & Social" },
  { name: "Pinterest", wiki: "Pinterest", cat: "Apps & Social" },
  { name: "LinkedIn", wiki: "LinkedIn", cat: "Apps & Social" },
  { name: "Reddit", wiki: "Reddit", cat: "Apps & Social" },
  { name: "Skype", wiki: "Skype", cat: "Apps & Social" },
  { name: "Shazam", wiki: "Shazam (application)", cat: "Apps & Social" },
  { name: "PayPal", wiki: "PayPal", cat: "Apps & Social" },
  { name: "eBay", wiki: "eBay", cat: "Apps & Social" },
  { name: "Duolingo", wiki: "Duolingo", cat: "Apps & Social" },
  { name: "Shopee", wiki: "Shopee", cat: "Apps & Social" },
  // Food & Drink
  { name: "McDonald's", wiki: "McDonald's", cat: "Food & Drink" },
  { name: "Burger King", wiki: "Burger King", cat: "Food & Drink" },
  { name: "KFC", wiki: "KFC", cat: "Food & Drink" },
  { name: "Subway", wiki: "Subway (restaurant)", cat: "Food & Drink" },
  { name: "Starbucks", wiki: "Starbucks", cat: "Food & Drink" },
  { name: "Coca-Cola", wiki: "Coca-Cola", cat: "Food & Drink" },
  { name: "Pepsi", wiki: "Pepsi", cat: "Food & Drink" },
  { name: "Red Bull", wiki: "Red Bull", cat: "Food & Drink" },
  { name: "Monster Energy", wiki: "Monster Energy", cat: "Food & Drink" },
  { name: "Heineken", wiki: "Heineken", cat: "Food & Drink" },
  { name: "Oreo", wiki: "Oreo", cat: "Food & Drink" },
  { name: "Pringles", wiki: "Pringles", cat: "Food & Drink" },
  { name: "Nutella", wiki: "Nutella", cat: "Food & Drink" },
  { name: "Pizza Hut", wiki: "Pizza Hut", cat: "Food & Drink" },
  { name: "Domino's", wiki: "Domino's Pizza", cat: "Food & Drink" },
  { name: "Krispy Kreme", wiki: "Krispy Kreme", cat: "Food & Drink" },
  { name: "Lay's", wiki: "Lay's", cat: "Food & Drink" },
  { name: "Kit Kat", wiki: "Kit Kat", cat: "Food & Drink" },
  { name: "Snickers", wiki: "Snickers (chocolate bar)", cat: "Food & Drink" },
  { name: "Nespresso", wiki: "Nespresso", cat: "Food & Drink" },
  // Cars
  { name: "Tesla", wiki: "Tesla, Inc.", cat: "Cars" },
  { name: "Toyota", wiki: "Toyota", cat: "Cars" },
  { name: "Honda", wiki: "Honda", cat: "Cars" },
  { name: "Ford", wiki: "Ford Motor Company", cat: "Cars" },
  { name: "BMW", wiki: "BMW", cat: "Cars" },
  { name: "Mercedes-Benz", wiki: "Mercedes-Benz", cat: "Cars" },
  { name: "Audi", wiki: "Audi", cat: "Cars" },
  { name: "Volkswagen", wiki: "Volkswagen", cat: "Cars" },
  { name: "Porsche", wiki: "Porsche", cat: "Cars" },
  { name: "Ferrari", wiki: "Ferrari", cat: "Cars" },
  { name: "Lamborghini", wiki: "Lamborghini", cat: "Cars" },
  { name: "Mazda", wiki: "Mazda", cat: "Cars" },
  { name: "Nissan", wiki: "Nissan", cat: "Cars" },
  { name: "Hyundai", wiki: "Hyundai Motor Company", cat: "Cars" },
  { name: "Kia", wiki: "Kia", cat: "Cars" },
  { name: "Chevrolet", wiki: "Chevrolet", cat: "Cars" },
  { name: "Jeep", wiki: "Jeep", cat: "Cars" },
  { name: "Bugatti", wiki: "Bugatti", cat: "Cars" },
  { name: "Rolls-Royce", wiki: "Rolls-Royce Motor Cars", cat: "Cars" },
  { name: "Volvo", wiki: "Volvo Cars", cat: "Cars" },
  // Fashion & Sportswear
  { name: "Nike", wiki: "Nike, Inc.", cat: "Fashion" },
  { name: "Adidas", wiki: "Adidas", cat: "Fashion" },
  { name: "Puma", wiki: "Puma (brand)", cat: "Fashion" },
  { name: "Reebok", wiki: "Reebok", cat: "Fashion" },
  { name: "New Balance", wiki: "New Balance", cat: "Fashion" },
  { name: "Under Armour", wiki: "Under Armour", cat: "Fashion" },
  { name: "Gucci", wiki: "Gucci", cat: "Fashion" },
  { name: "Louis Vuitton", wiki: "Louis Vuitton", cat: "Fashion" },
  { name: "Chanel", wiki: "Chanel", cat: "Fashion" },
  { name: "Prada", wiki: "Prada", cat: "Fashion" },
  { name: "Zara", wiki: "Zara (retailer)", cat: "Fashion" },
  { name: "H&M", wiki: "H&M", cat: "Fashion" },
  { name: "Uniqlo", wiki: "Uniqlo", cat: "Fashion" },
  { name: "Levi's", wiki: "Levi Strauss & Co.", cat: "Fashion" },
  { name: "Converse", wiki: "Converse (brand)", cat: "Fashion" },
  { name: "Vans", wiki: "Vans", cat: "Fashion" },
  { name: "The North Face", wiki: "The North Face", cat: "Fashion" },
  { name: "Lacoste", wiki: "Lacoste", cat: "Fashion" },
  { name: "Burberry", wiki: "Burberry", cat: "Fashion" },
  { name: "Tommy Hilfiger", wiki: "Tommy Hilfiger (brand)", cat: "Fashion" },
  // Sports & Clubs
  { name: "FIFA", wiki: "FIFA", cat: "Sports" },
  { name: "UEFA Champions League", wiki: "UEFA Champions League", cat: "Sports" },
  { name: "NBA", wiki: "National Basketball Association", cat: "Sports" },
  { name: "NFL", wiki: "National Football League", cat: "Sports" },
  { name: "Formula 1", wiki: "Formula One", cat: "Sports" },
  { name: "FC Barcelona", wiki: "FC Barcelona", cat: "Sports" },
  { name: "Real Madrid", wiki: "Real Madrid CF", cat: "Sports" },
  { name: "Manchester United", wiki: "Manchester United F.C.", cat: "Sports" },
  { name: "Liverpool FC", wiki: "Liverpool F.C.", cat: "Sports" },
  { name: "Arsenal", wiki: "Arsenal F.C.", cat: "Sports" },
  { name: "Chelsea FC", wiki: "Chelsea F.C.", cat: "Sports" },
  { name: "Bayern Munich", wiki: "FC Bayern Munich", cat: "Sports" },
  { name: "Juventus", wiki: "Juventus FC", cat: "Sports" },
  { name: "Paris Saint-Germain", wiki: "Paris Saint-Germain F.C.", cat: "Sports" },
  // Entertainment & Gaming
  { name: "Disney", wiki: "The Walt Disney Company", cat: "Entertainment & Gaming" },
  { name: "Pixar", wiki: "Pixar", cat: "Entertainment & Gaming" },
  { name: "Marvel", wiki: "Marvel Entertainment", cat: "Entertainment & Gaming" },
  { name: "DC Comics", wiki: "DC Comics", cat: "Entertainment & Gaming" },
  { name: "Warner Bros.", wiki: "Warner Bros.", cat: "Entertainment & Gaming" },
  { name: "Universal Pictures", wiki: "Universal Pictures", cat: "Entertainment & Gaming" },
  { name: "Paramount", wiki: "Paramount Pictures", cat: "Entertainment & Gaming" },
  { name: "HBO", wiki: "HBO", cat: "Entertainment & Gaming" },
  { name: "MTV", wiki: "MTV", cat: "Entertainment & Gaming" },
  { name: "Cartoon Network", wiki: "Cartoon Network", cat: "Entertainment & Gaming" },
  { name: "Nickelodeon", wiki: "Nickelodeon", cat: "Entertainment & Gaming" },
  { name: "Lego", wiki: "Lego", cat: "Entertainment & Gaming" },
  { name: "Nintendo", wiki: "Nintendo", cat: "Entertainment & Gaming" },
  { name: "PlayStation", wiki: "PlayStation", cat: "Entertainment & Gaming" },
  { name: "Xbox", wiki: "Xbox", cat: "Entertainment & Gaming" },
  { name: "Sega", wiki: "Sega", cat: "Entertainment & Gaming" },
  { name: "Atari", wiki: "Atari, Inc.", cat: "Entertainment & Gaming" },
  { name: "Rockstar Games", wiki: "Rockstar Games", cat: "Entertainment & Gaming" },
  { name: "Minecraft", wiki: "Minecraft", cat: "Entertainment & Gaming" },
  { name: "Roblox", wiki: "Roblox", cat: "Entertainment & Gaming" },
  { name: "Pokémon", wiki: "Pokémon", cat: "Entertainment & Gaming" },
  { name: "Ubisoft", wiki: "Ubisoft", cat: "Entertainment & Gaming" },
  // Airlines & Travel
  { name: "Emirates", wiki: "Emirates (airline)", cat: "Airlines & Travel" },
  { name: "Qatar Airways", wiki: "Qatar Airways", cat: "Airlines & Travel" },
  { name: "Lufthansa", wiki: "Lufthansa", cat: "Airlines & Travel" },
  { name: "British Airways", wiki: "British Airways", cat: "Airlines & Travel" },
  { name: "Ryanair", wiki: "Ryanair", cat: "Airlines & Travel" },
  { name: "Turkish Airlines", wiki: "Turkish Airlines", cat: "Airlines & Travel" },
  { name: "Singapore Airlines", wiki: "Singapore Airlines", cat: "Airlines & Travel" },
  // Retail & Banking
  { name: "Walmart", wiki: "Walmart", cat: "Retail & Banking" },
  { name: "IKEA", wiki: "IKEA", cat: "Retail & Banking" },
  { name: "Target", wiki: "Target Corporation", cat: "Retail & Banking" },
  { name: "Costco", wiki: "Costco", cat: "Retail & Banking" },
  { name: "Tesco", wiki: "Tesco", cat: "Retail & Banking" },
  { name: "7-Eleven", wiki: "7-Eleven", cat: "Retail & Banking" },
  { name: "Visa", wiki: "Visa Inc.", cat: "Retail & Banking" },
  { name: "Mastercard", wiki: "Mastercard", cat: "Retail & Banking" },
  { name: "American Express", wiki: "American Express", cat: "Retail & Banking" },
  { name: "HSBC", wiki: "HSBC", cat: "Retail & Banking" },
];

const LOGO_JPEG_FALLBACK_OK = true; // jpeg logos allowed only if nothing better exists (handled by mimeScore)

// One logo question. Returns null when no verified logo asset is found.
async function buildLogosQuestion(brand, others, difficulty) {
  const img = await quizLore.wikipediaLogoImage(brand.wiki, 480).catch(() => null);
  if (!img || !img.url) return null;
  const dl = await quizLore.downloadMedia(img.url, "image").catch(() => null);
  if (!dl || !dl.buf || dl.buf.length < 1500) return null; // tiny = placeholder/blank
  // 💡 2026-09-27 pixel gate: logos are 64px+ allowed (wordmarks are wide),
  // but blank/black/corrupt/undecodable bytes are rejected here - a broken
  // logo must never become the clue of a question.
  const gate = await imageGate.inspectImageBuffer(dl.buf, { minW: 64, minH: 40, label: `logo:${brand.name}`.slice(0, 50) }).catch(() => ({ ok: false, reason: "gate-crash" }));
  if (!gate.ok) return null;
  const optionsPool = [brand.name, ...others.map((o) => o.name)];
  const optOrder = _shuffle(optionsPool.map((_, i) => i)); // fair option order (Fisher-Yates)
  return {
    q: `Which brand or company does this logo belong to?`,
    options: optOrder.map((i) => optionsPool[i]),
    correct: optOrder.indexOf(0),
    difficulty: difficulty || "easy",
    topic: "Logo",
    domain: "logos",
    type: "image",
    assetKey: img.url,
    asset: { kind: "image", url: img.url, mime: dl.mime, subject: brand.name, source: "wikipedia-logo", bytesHash: crypto.createHash("sha1").update(dl.buf).digest("hex").slice(0, 16) },
    loreRef: { wiki: "wikipedia", page: brand.wiki, section: "logo" },
    _cachedAsset: { url: img.url, buf: dl.buf, mime: dl.mime, kind: "image" },
  };
}

// build `count` verified logo questions. Tries many brands (each candidate
// costs one API call + one download); stops at count or pool exhaustion.
// usedKeys: session-level Set (dedup across sections/retries).
async function buildLogosQuestions({ count, usedKeys, difficulty, bytesCapWarn = null }) {
  const n = Math.max(1, Math.min(parseInt(count, 10) || 10, LOGOS_POOL.length - 4));
  const out = [];
  const claimed = new Set();
  const order = _shuffle(LOGOS_POOL);
  for (const brand of order) {
    if (out.length >= n) break;
    const key = `logo:${_norm(brand.name)}`;
    if (usedKeys.has(key) || claimed.has(key)) continue;
    // distractors: same category first (fair), pad from other categories
    let others = _shuffle(LOGOS_POOL.filter((b) => b.cat === brand.cat && b.name !== brand.name)).slice(0, 3);
    if (others.length < 3) {
      for (const b of _shuffle(LOGOS_POOL)) {
        if (others.length >= 3) break;
        if (b.name !== brand.name && !others.some((o) => o.name === b.name)) others.push(b);
      }
    }
    if (others.length < 3) continue;
    const q = await buildLogosQuestion(brand, others, difficulty).catch(() => null);
    if (!q) continue;
    claimed.add(key);
    if (usedKeys) usedKeys.add(key);
    out.push(q);
  }
  if (bytesCapWarn) bytesCapWarn(out.length);
  return out;
}

// ════════════════════════════════════════════
// SPOT THE SONG POOL - globally famous tracks (1960s..2020s).
// song = title shown in options, artist = search + option label, era =
// decade bucket for fair same-era distractors.
// ════════════════════════════════════════════
const SONGS_POOL = [
  { song: "Bohemian Rhapsody", artist: "Queen", era: "1970s" },
  { song: "We Will Rock You", artist: "Queen", era: "1970s" },
  { song: "Don't Stop Me Now", artist: "Queen", era: "1970s" },
  { song: "Hey Jude", artist: "The Beatles", era: "1960s" },
  { song: "Let It Be", artist: "The Beatles", era: "1960s" },
  { song: "Yesterday", artist: "The Beatles", era: "1960s" },
  { song: "Come Together", artist: "The Beatles", era: "1960s" },
  { song: "Imagine", artist: "John Lennon", era: "1970s" },
  { song: "Stairway to Heaven", artist: "Led Zeppelin", era: "1970s" },
  { song: "Hotel California", artist: "Eagles", era: "1970s" },
  { song: "Dancing Queen", artist: "ABBA", era: "1970s" },
  { song: "Mamma Mia", artist: "ABBA", era: "1970s" },
  { song: "Rocket Man", artist: "Elton John", era: "1970s" },
  { song: "Stayin' Alive", artist: "Bee Gees", era: "1970s" },
  { song: "Another Brick in the Wall", artist: "Pink Floyd", era: "1970s" },
  { song: "Back In Black", artist: "AC/DC", era: "1980s" },
  { song: "Billie Jean", artist: "Michael Jackson", era: "1980s" },
  { song: "Thriller", artist: "Michael Jackson", era: "1980s" },
  { song: "Beat It", artist: "Michael Jackson", era: "1980s" },
  { song: "Sweet Child O' Mine", artist: "Guns N' Roses", era: "1980s" },
  { song: "November Rain", artist: "Guns N' Roses", era: "1980s" },
  { song: "Livin' on a Prayer", artist: "Bon Jovi", era: "1980s" },
  { song: "Take On Me", artist: "a-ha", era: "1980s" },
  { song: "Like a Prayer", artist: "Madonna", era: "1980s" },
  { song: "I Wanna Dance with Somebody", artist: "Whitney Houston", era: "1980s" },
  { song: "Enter Sandman", artist: "Metallica", era: "1990s" },
  { song: "Smells Like Teen Spirit", artist: "Nirvana", era: "1990s" },
  { song: "Creep", artist: "Radiohead", era: "1990s" },
  { song: "Wonderwall", artist: "Oasis", era: "1990s" },
  { song: "Lose Yourself", artist: "Eminem", era: "2000s" },
  { song: "Without Me", artist: "Eminem", era: "2000s" },
  { song: "In Da Club", artist: "50 Cent", era: "2000s" },
  { song: "Hey Ya!", artist: "OutKast", era: "2000s" },
  { song: "Crazy in Love", artist: "Beyonce", era: "2000s" },
  { song: "Halo", artist: "Beyonce", era: "2000s" },
  { song: "Umbrella", artist: "Rihanna", era: "2000s" },
  { song: "I Gotta Feeling", artist: "Black Eyed Peas", era: "2000s" },
  { song: "Poker Face", artist: "Lady Gaga", era: "2000s" },
  { song: "Bad Romance", artist: "Lady Gaga", era: "2000s" },
  { song: "...Baby One More Time", artist: "Britney Spears", era: "2000s" },
  { song: "Wannabe", artist: "Spice Girls", era: "1990s" },
  { song: "No Scrubs", artist: "TLC", era: "1990s" },
  { song: "Say My Name", artist: "Destiny's Child", era: "1990s" },
  { song: "I Will Always Love You", artist: "Whitney Houston", era: "1990s" },
  { song: "Rolling in the Deep", artist: "Adele", era: "2010s" },
  { song: "Someone Like You", artist: "Adele", era: "2010s" },
  { song: "Set Fire to the Rain", artist: "Adele", era: "2010s" },
  { song: "Shape of You", artist: "Ed Sheeran", era: "2010s" },
  { song: "Perfect", artist: "Ed Sheeran", era: "2010s" },
  { song: "Thinking Out Loud", artist: "Ed Sheeran", era: "2010s" },
  { song: "Photograph", artist: "Ed Sheeran", era: "2010s" },
  { song: "Uptown Funk", artist: "Mark Ronson", era: "2010s" },
  { song: "Happy", artist: "Pharrell Williams", era: "2010s" },
  { song: "Get Lucky", artist: "Daft Punk", era: "2010s" },
  { song: "Viva la Vida", artist: "Coldplay", era: "2000s" },
  { song: "Clocks", artist: "Coldplay", era: "2000s" },
  { song: "Fix You", artist: "Coldplay", era: "2000s" },
  { song: "Counting Stars", artist: "OneRepublic", era: "2010s" },
  { song: "Believer", artist: "Imagine Dragons", era: "2010s" },
  { song: "Radioactive", artist: "Imagine Dragons", era: "2010s" },
  { song: "Demons", artist: "Imagine Dragons", era: "2010s" },
  { song: "Roar", artist: "Katy Perry", era: "2010s" },
  { song: "Firework", artist: "Katy Perry", era: "2010s" },
  { song: "Dark Horse", artist: "Katy Perry", era: "2010s" },
  { song: "Blank Space", artist: "Taylor Swift", era: "2010s" },
  { song: "Shake It Off", artist: "Taylor Swift", era: "2010s" },
  { song: "Love Story", artist: "Taylor Swift", era: "2000s" },
  { song: "You Belong With Me", artist: "Taylor Swift", era: "2000s" },
  { song: "All of Me", artist: "John Legend", era: "2010s" },
  { song: "Stay With Me", artist: "Sam Smith", era: "2010s" },
  { song: "Take Me to Church", artist: "Hozier", era: "2010s" },
  { song: "Pompeii", artist: "Bastille", era: "2010s" },
  { song: "Rather Be", artist: "Clean Bandit", era: "2010s" },
  { song: "Lean On", artist: "Major Lazer", era: "2010s" },
  { song: "Faded", artist: "Alan Walker", era: "2010s" },
  { song: "Wake Me Up", artist: "Avicii", era: "2010s" },
  { song: "Titanium", artist: "David Guetta", era: "2010s" },
  { song: "Despacito", artist: "Luis Fonsi", era: "2010s" },
  { song: "Gangnam Style", artist: "PSY", era: "2010s" },
  { song: "Sorry", artist: "Justin Bieber", era: "2010s" },
  { song: "Baby", artist: "Justin Bieber", era: "2010s" },
  { song: "See You Again", artist: "Wiz Khalifa", era: "2010s" },
  { song: "Attention", artist: "Charlie Puth", era: "2010s" },
  { song: "Sugar", artist: "Maroon 5", era: "2010s" },
  { song: "Memories", artist: "Maroon 5", era: "2010s" },
  { song: "Payphone", artist: "Maroon 5", era: "2010s" },
  { song: "Señorita", artist: "Shawn Mendes", era: "2010s" },
  { song: "Treat You Better", artist: "Shawn Mendes", era: "2010s" },
  { song: "Levitating", artist: "Dua Lipa", era: "2020s" },
  { song: "Don't Start Now", artist: "Dua Lipa", era: "2010s" },
  { song: "One Kiss", artist: "Dua Lipa", era: "2010s" },
  { song: "Blinding Lights", artist: "The Weeknd", era: "2020s" },
  { song: "Starboy", artist: "The Weeknd", era: "2010s" },
  { song: "Save Your Tears", artist: "The Weeknd", era: "2020s" },
  { song: "Bad Guy", artist: "Billie Eilish", era: "2010s" },
  { song: "Everything I Wanted", artist: "Billie Eilish", era: "2020s" },
  { song: "Old Town Road", artist: "Lil Nas X", era: "2010s" },
  { song: "Sweet but Psycho", artist: "Ava Max", era: "2010s" },
  { song: "Happier", artist: "Marshmello", era: "2010s" },
  { song: "God's Plan", artist: "Drake", era: "2010s" },
  { song: "Hotline Bling", artist: "Drake", era: "2010s" },
  { song: "Dynamite", artist: "BTS", era: "2020s" },
  { song: "Closer", artist: "The Chainsmokers", era: "2010s" },
  { song: "Stay", artist: "The Kid LAROI", era: "2020s" },
  { song: "Flowers", artist: "Miley Cyrus", era: "2020s" },
  { song: "As It Was", artist: "Harry Styles", era: "2020s" },
  { song: "Watermelon Sugar", artist: "Harry Styles", era: "2020s" },
  { song: "Drivers License", artist: "Olivia Rodrigo", era: "2020s" },
  { song: "Good 4 U", artist: "Olivia Rodrigo", era: "2020s" },
];

// audio-search result quality gate: covers/karaoke/nightcore variants sound
// different from the real track and would make the question unfair.
const _SONG_VARIANT_RE = /(cover|karaoke|nightcore|slowed|sped\s*up|reverb|8d\s*audio|reaction|remix|instrumental|tribute|lullaby|birthday|ringtone)/i;

// One song question. goService = the shared Go audio service client.
// trimFn = optional (buf) => Promise<clipBuf|null> local ffmpeg trimmer for
// the legacy path (service did not pre-clip); without it, un-clipped hits
// are SKIPPED - a full-length track would over-reveal the answer.
async function buildSpotSongQuestion(entry, others, difficulty, goService, trimFn = null) {
  if (!goService || typeof goService.getAudioInfo !== "function") return null;
  const info = await goService.getAudioInfo(`${entry.song} ${entry.artist}`, { clipSeconds: 25, clipBitrate: "96k" }).catch(() => null);
  if (!info || info.error || !info.audioURL || !info.metadata) return null;
  // P14-style verification: the hit must actually be this song/artist.
  const metaTitle = _norm(info.metadata.title);
  const songN = _norm(entry.song);
  const artistN = _norm(entry.artist);
  if (_SONG_VARIANT_RE.test(metaTitle)) return null;
  const overlap = (songN.length >= 6 && metaTitle.includes(songN.slice(0, Math.max(6, Math.floor(songN.length * 0.6)))))
    || (songN.length >= 6 && metaTitle.includes(songN))
    || metaTitle.includes(artistN);
  if (!overlap) return null;
  // byte gates mirror the theme-song pipeline exactly (clip > 20KB,
  // full-file >= 50KB when the server reports it)
  const fullOk = !Number.isFinite(info.fullBytes) || info.fullBytes >= 50 * 1024;
  let clip = null;
  if (info.clipped) {
    const dl = await axiosGetBuffer(info.audioURL, 60000).catch(() => null);
    if (fullOk && dl && dl.length > 20 * 1024) clip = dl;
  }
  if (!clip && trimFn) {
    // legacy path: full file download + local ffmpeg trim (older Go build or
    // server-side clip failed) - same shape as buildThemeSongQuestion
    const dl = await axiosGetBuffer(info.audioURL, 60000).catch(() => null);
    if (dl && dl.length >= 50 * 1024) clip = await trimFn(dl, 25).catch(() => null);
  }
  if (!clip) return null;
  const label = (e) => `${e.song} - ${e.artist}`;
  const optionsPool = [label(entry), ...others.map(label)];
  const optOrder = _shuffle(optionsPool.map((_, i) => i)); // fair option order (Fisher-Yates)
  return {
    q: `🎵 Which song is this clip from?`,
    options: optOrder.map((i) => optionsPool[i]),
    correct: optOrder.indexOf(0),
    difficulty: difficulty || "medium",
    topic: "Spot the Song",
    domain: "song",
    type: "theme", // reuses the audio-before-card post path
    assetKey: `song:${_norm(entry.song)}:${_norm(entry.artist)}`,
    asset: { kind: "audio", buf: clip, mime: "audio/mpeg", subject: entry.song, source: "go-audio" },
    song: entry.song,
    loreRef: { wiki: null, page: entry.song, section: "spot-the-song" },
  };
}

async function axiosGetBuffer(url, timeoutMs) {
  try {
    const axios = require("axios");
    const r = await axios.get(url, { responseType: "arraybuffer", timeout: timeoutMs, maxContentLength: 20 * 1024 * 1024 });
    return Buffer.from(r.data);
  } catch { return null; }
}

// build `count` verified song questions; retries across up to count*4
// candidates (availability varies per track).
async function buildSpotSongQuestions({ count, usedKeys, difficulty, goService, trimFn = null }) {
  const n = Math.max(1, Math.min(parseInt(count, 10) || 10, SONGS_POOL.length - 4));
  const out = [];
  const claimed = new Set();
  const order = _shuffle(SONGS_POOL);
  const budget = Math.min(order.length, n * 4);
  for (const entry of order.slice(0, budget)) {
    if (out.length >= n) break;
    const key = `song:${_norm(entry.song)}`;
    if (usedKeys.has(key) || claimed.has(key)) continue;
    // distractors: same era first (fair), pad from the rest
    let others = _shuffle(SONGS_POOL.filter((s) => s.era === entry.era && s.song !== entry.song)).slice(0, 3);
    if (others.length < 3) {
      for (const s of _shuffle(SONGS_POOL)) {
        if (others.length >= 3) break;
        if (s.song !== entry.song && !others.some((o) => o.song === s.song)) others.push(s);
      }
    }
    if (others.length < 3) continue;
    const q = await buildSpotSongQuestion(entry, others, difficulty, goService, trimFn).catch(() => null);
    if (!q) continue;
    claimed.add(key);
    if (usedKeys) usedKeys.add(key);
    out.push(q);
  }
  return out;
}

module.exports = {
  LOGOS_POOL,
  SONGS_POOL,
  buildLogosQuestions,
  buildLogosQuestion,
  buildSpotSongQuestions,
  buildSpotSongQuestion,
  _internal: { _norm, _sha, _shuffle, _SONG_VARIANT_RE },
};
