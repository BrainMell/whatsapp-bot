// ============================================
// 🔭 SPACECARD — .j umap <object> universe cards (owner 2026-10-12 14:33Z:
// "make this but for the universe… open source service to find videos of
// planets, satellite images blah blah if available")
// Pure, offline-QAable helpers (network lives in engine.js, same split as mapCard):
//   - celestial catalog (55 bodies: planets, moons, dwarf planets, stars,
//     nebulae, galaxies, black holes, missions) with curated facts + aliases
//   - query resolution (exact alias -> prefix -> token overlap -> null)
//   - NASA Image & Video Library URL builders + response parsing
//     (images-api.nasa.gov — keyless open API; images AND videos)
//   - canvas card renderer (hero imagery + type badge + stat bar)
//   - text builder (facts + NASA library links)
// ============================================

// ── catalog ─────────────────────────────────────────────────────────────────
// stats = 3 short curated lines (diameter / distance / signature fact).
// q = best NASA-library imagery search term. Aliases lowercase.
const CATALOG = [
  // planets
  { id: "mercury", name: "Mercury", type: "planet", emoji: "☿", q: "Mercury planet MESSENGER",
    aliases: ["mercury"], stats: ["Diameter 4,879 km — smallest planet", "88-day year, 176-day day-night cycle", "MESSENGER + BepiColombo mapped it"] },
  { id: "venus", name: "Venus", type: "planet", emoji: "♀", q: "Venus planet surface Magellan",
    aliases: ["venus"], stats: ["Diameter 12,104 km — Earth's evil twin", "465°C surface, 92 bar CO₂ pressure", "Magellan radar pierced the clouds"] },
  { id: "earth", name: "Earth", type: "planet", emoji: "🌍", q: "Earth full disk from space",
    aliases: ["earth", "terra"], stats: ["Diameter 12,742 km — our pale blue dot", "Only known world with life", "Blue Marble, Apollo 17, 1972"] },
  { id: "mars", name: "Mars", type: "planet", emoji: "♂", q: "Mars planet surface rover",
    aliases: ["mars", "red planet"], stats: ["Diameter 6,779 km — the red desert", "Olympus Mons: 22 km, tallest volcano", "Perseverance + Curiosity rolling now"] },
  { id: "jupiter", name: "Jupiter", type: "planet", emoji: "🪐", q: "Jupiter planet Juno",
    aliases: ["jupiter"], stats: ["Diameter 139,820 km — the giant", "Great Red Spot: storm older than 190 years", "95 moons, Juno is orbiting now"] },
  { id: "saturn", name: "Saturn", type: "planet", emoji: "🪐", q: "Saturn planet rings Cassini",
    aliases: ["saturn"], stats: ["Diameter 116,460 km + vast ring system", "Rings mostly water ice, ~10 m to 1 km thick", "Cassini dived between the rings 22×"] },
  { id: "uranus", name: "Uranus", type: "planet", emoji: "🔵", q: "Uranus planet Voyager 2",
    aliases: ["uranus"], stats: ["Diameter 50,724 km — sideways ice giant", "Rotates tilted 98° — seasons of 21 years", "Visited once: Voyager 2, 1986"] },
  { id: "neptune", name: "Neptune", type: "planet", emoji: "🌀", q: "Neptune planet Voyager 2",
    aliases: ["neptune"], stats: ["Diameter 49,244 km — windiest world", "Supersonic winds up to 2,100 km/h", "One Neptune year = 165 Earth years"] },
  // sun
  { id: "sun", name: "The Sun", type: "star", emoji: "☀️", q: "Sun solar flare SDO",
    aliases: ["sun", "sol", "solar"], stats: ["Diameter 1.39 million km", "99.86% of the solar system's mass", "Parker Solar Probe flies through its corona"] },
  // dwarf planets
  { id: "pluto", name: "Pluto", type: "dwarf planet", emoji: "❄️", q: "Pluto New Horizons",
    aliases: ["pluto"], stats: ["Diameter 2,377 km — king of the Kuiper Belt", "Nitrogen glaciers flow on Sputnik Planitia", "New Horizons flew past 14 July 2015"] },
  { id: "ceres", name: "Ceres", type: "dwarf planet", emoji: "🌑", q: "Ceres dwarf planet Dawn",
    aliases: ["ceres"], stats: ["Diameter 940 km — largest asteroid belt body", "Bright salt deposits in Occator Crater", "Dawn orbited it 2015-2018"] },
  { id: "eris", name: "Eris", type: "dwarf planet", emoji: "🌑", q: "Eris dwarf planet",
    aliases: ["eris"], stats: ["Diameter 2,326 km — Pluto's heavier twin", "68 AU out: ~3× farther than Neptune", "Its discovery demoted Pluto in 2006"] },
  { id: "makemake", name: "Makemake", type: "dwarf planet", emoji: "🌑", q: "Makemake dwarf planet",
    aliases: ["makemake"], stats: ["Diameter ~1,430 km, Kuiper Belt", "Frozen methane surface, reddish", "Has a tiny dark moon, MK 2"] },
  { id: "haumea", name: "Haumea", type: "dwarf planet", emoji: "🥚", q: "Haumea dwarf planet",
    aliases: ["haumea"], stats: ["Egg-shaped — spins every 3.9 hours", "Diameter ~1,632 km along its long axis", "First KBO known to have a ring"] },
  // moons
  { id: "moon", name: "The Moon", type: "moon", emoji: "🌙", q: "Moon lunar surface Apollo",
    aliases: ["moon", "luna"], stats: ["Diameter 3,474 km — 384,400 km away", "12 humans walked it, 1969-1972", "Artemis is sending the next crew"] },
  { id: "io", name: "Io", type: "moon", emoji: "🌋", q: "Io moon volcano Jupiter",
    aliases: ["io"], stats: ["Jupiter's volcanic moon — 400+ volcanoes", "Tidally kneaded into a molten interior", "Most volcanically active world known"] },
  { id: "europa", name: "Europa", type: "moon", emoji: "🧊", q: "Europa moon Jupiter",
    aliases: ["europa"], stats: ["Ice shell over a global salt ocean", "Ocean holds 2× Earth's liquid water", "Europa Clipper arrives 2030"] },
  { id: "ganymede", name: "Ganymede", type: "moon", emoji: "🌕", q: "Ganymede moon Jupiter",
    aliases: ["ganymede"], stats: ["Largest moon in the solar system", "Bigger than Mercury: 5,268 km", "Has its own magnetic field"] },
  { id: "callisto", name: "Callisto", type: "moon", emoji: "🌕", q: "Callisto moon Jupiter",
    aliases: ["callisto"], stats: ["Most cratered world known", "Ancient, dead surface, 4.5 Gyr old", "Possible future human base site"] },
  { id: "titan", name: "Titan", type: "moon", emoji: "🟠", q: "Titan moon Saturn Huygens",
    aliases: ["titan"], stats: ["Thick nitrogen atmosphere + methane rain", "Rivers and seas of liquid hydrocarbons", "Huygens landed 2005; Dragonfly next"] },
  { id: "enceladus", name: "Enceladus", type: "moon", emoji: "✨", q: "Enceladus moon Saturn plumes",
    aliases: ["enceladus"], stats: ["Geysers jet its ocean into space", "Cassini flew through the plumes", "Hydrothermal chemistry: habitability magnet"] },
  { id: "triton", name: "Triton", type: "moon", emoji: "🌐", q: "Triton moon Neptune Voyager",
    aliases: ["triton"], stats: ["Neptune's big moon — orbits BACKWARDS", "Captured Kuiper Belt object", "Nitrogen geysers at -235°C"] },
  { id: "charon", name: "Charon", type: "moon", emoji: "🌑", q: "Charon moon Pluto New Horizons",
    aliases: ["charon"], stats: ["Half Pluto's size — a binary world", "Red polar cap: Mordor Macula", "They face each other forever"] },
  { id: "phobos", name: "Phobos", type: "moon", emoji: "🥔", q: "Phobos moon Mars",
    aliases: ["phobos"], stats: ["Mars' doomed inner moon, 22 km", "Orbits faster than Mars rotates", "Will crash or ring within 50 Myr"] },
  // stars
  { id: "betelgeuse", name: "Betelgeuse", type: "star", emoji: "🔴", q: "Betelgeuse star",
    aliases: ["betelgeuse", "betelgeuze"], stats: ["Red supergiant, ~700 ly away", "If placed at the Sun: past Mars orbit", "Will go supernova — someday"] },
  { id: "sirius", name: "Sirius", type: "star", emoji: "⭐", q: "Sirius star",
    aliases: ["sirius", "dog star"], stats: ["Brightest star in Earth's night sky", "8.6 ly away — binary with a white dwarf", "Ancient Egyptians timed floods by it"] },
  { id: "proxima", name: "Proxima Centauri", type: "star", emoji: "🔴", q: "Proxima Centauri star",
    aliases: ["proxima", "proxima centauri"], stats: ["Nearest star: 4.24 ly away", "Hosts planet Proxima b in habitable zone", "Red dwarf — will burn trillions of years"] },
  { id: "trappist1", name: "TRAPPIST-1", type: "star", emoji: "✴️", q: "TRAPPIST-1 system",
    aliases: ["trappist", "trappist-1", "trappist 1"], stats: ["Ultra-cool dwarf with 7 Earth-sized planets", "39 ly away, all 7 could hold water", "JWST is sniffing their atmospheres"] },
  { id: "vega", name: "Vega", type: "star", emoji: "⭐", q: "Vega star",
    aliases: ["vega"], stats: ["Former northern pole star, 25 ly", "First star ever photographed (1850)", "Cosmic distance yardstick"] },
  { id: "polaris", name: "Polaris", type: "star", emoji: "🧭", q: "Polaris north star",
    aliases: ["polaris", "north star"], stats: ["The North Star — nearly motionless sky anchor", "Cepheid variable, ~433 ly away", "Triple system with two companions"] },
  // nebulae
  { id: "orion", name: "Orion Nebula", type: "nebula", emoji: "🌌", q: "Orion Nebula Hubble",
    aliases: ["orion nebula", "m42", "orion"], stats: ["Stellar nursery, 1,344 ly away", "Visible to the naked eye in Orion's sword", "Hubble + JWST parade of protoplanetary disks"] },
  { id: "pillars", name: "Pillars of Creation", type: "nebula", emoji: "🗿", q: "Pillars of Creation Eagle Nebula",
    aliases: ["pillars of creation", "pillars", "eagle nebula", "m16"], stats: ["Eagle Nebula columns, 6,500 ly", "Light-years-tall gas towers", "JWST's infrared remake stunned 2022"] },
  // q fixes 2026-10-12: "Carina Nebula JWST" returned 0 results (suffix poisons
  // the query) — plain term hits the PIA03515 Hubble panorama. Same for helix
  // ("eye of god"), catseye (apostrophe %27 breaks the API) and sgra.
  { id: "carina", name: "Carina Nebula", type: "nebula", emoji: "🌈", q: "Carina Nebula",
    aliases: ["carina nebula", "carina"], stats: ["Massive star factory, 8,500 ly", "Home of Eta Carinae, doomed hypergiant", "JWST 'Cosmic Cliffs' backdrop"] },
  { id: "crab", name: "Crab Nebula", type: "nebula", emoji: "💥", q: "Crab Nebula supernova remnant",
    aliases: ["crab nebula", "m1", "crab"], stats: ["Supernova seen from Earth in 1054 AD", "Pulsar spins 30× per second inside", "Still expanding at 1,500 km/s"] },
  { id: "ring", name: "Ring Nebula", type: "nebula", emoji: "💿", q: "Ring Nebula",
    aliases: ["ring nebula", "m57", "ring"], stats: ["Dying sun-like star's shroud", "2,570 ly away in Lyra", "Preview of our Sun's far future"] },
  { id: "horsehead", name: "Horsehead Nebula", type: "nebula", emoji: "🐴", q: "Horsehead Nebula",
    aliases: ["horsehead nebula", "horsehead", "barnard 33"], stats: ["Dark dust silhouette in Orion", "Backlit by glowing hydrogen", "1,375 ly away, stellar nursery edge"] },
  { id: "helix", name: "Helix Nebula", type: "nebula", emoji: "👁️", q: "Helix Nebula",
    aliases: ["helix nebula", "helix", "eye of god"], stats: ["The 'Eye of God' planetary nebula", "695 ly — closest bright one", "Central white dwarf at ~120,000 K"] },
  { id: "catseye", name: "Cat's Eye Nebula", type: "nebula", emoji: "🐱", q: "NGC 6543",
    aliases: ["cat's eye nebula", "cats eye nebula", "ngc 6543", "cat eye"], stats: ["Nested shells, knots and jets", "Hubble's most complex planetary nebula", "3,262 ly away in Draco"] },
  { id: "lagoon", name: "Lagoon Nebula", type: "nebula", emoji: "🌊", q: "Lagoon Nebula",
    aliases: ["lagoon nebula", "m8", "lagoon"], stats: ["4,100 ly, naked-eye in Sagittarius", "Hourglass core carved by radiation", "Hubble 28th anniversary subject"] },
  // galaxies
  { id: "milkyway", name: "Milky Way", type: "galaxy", emoji: "🌠", q: "Milky Way galaxy center",
    aliases: ["milky way", "milkyway", "our galaxy"], stats: ["Our home: ~200 billion stars", "100,000 ly barred spiral disk", "We orbit the center every 230 Myr"] },
  { id: "andromeda", name: "Andromeda Galaxy", type: "galaxy", emoji: "🌌", q: "Andromeda galaxy M31",
    aliases: ["andromeda", "m31", "andromeda galaxy"], stats: ["Nearest big galaxy: 2.5 million ly", "A trillion stars, naked-eye smudge", "Collides with us in ~4.5 Gyr"] },
  { id: "whirlpool", name: "Whirlpool Galaxy", type: "galaxy", emoji: "🌀", q: "Whirlpool galaxy M51",
    aliases: ["whirlpool", "m51", "whirlpool galaxy"], stats: ["Grand-design spiral, 31 million ly", "Tidal arms fed by companion galaxy", "First recognized 'island universe' spiral"] },
  { id: "sombrero", name: "Sombrero Galaxy", type: "galaxy", emoji: "🎩", q: "Sombrero galaxy",
    aliases: ["sombrero", "m104", "sombrero galaxy"], stats: ["Edge-on disk with huge bulge", "29 million ly, ~2,000 globulars", "Its SMBH: a billion solar masses"] },
  { id: "magellanic", name: "Magellanic Clouds", type: "galaxy", emoji: "☁️", q: "Magellanic Clouds",
    aliases: ["magellanic clouds", "large magellanic cloud", "lmc", "smc"], stats: ["Two satellite dwarf galaxies", "163,000 / 200,000 ly away", "SN 1987A exploded in the LMC"] },
  // black holes
  { id: "sgra", name: "Sagittarius A*", type: "black hole", emoji: "🕳️", q: "Sagittarius A",
    aliases: ["sagittarius a", "sagittarius a*", "sgr a", "sgra", "black hole"], stats: ["Milky Way's central black hole", "4.3 million solar masses", "EHT imaged it, 12 May 2022"] },
  { id: "m87", name: "M87*", type: "black hole", emoji: "🕳️", q: "M87 black hole first image",
    aliases: ["m87", "m87*", "messier 87"], stats: ["First-ever black hole photo", "6.5 billion solar masses", "Relativistic jet 5,000 ly long"] },
  { id: "cygnusx1", name: "Cygnus X-1", type: "black hole", emoji: "🕳️", q: "Cygnus X-1 black hole",
    aliases: ["cygnus x-1", "cygnus x1", "cygnus"], stats: ["First black hole widely accepted", "21 solar masses, blue supergiant companion", "Hawking vs Thorne bet over it — lost"] },
  // missions
  { id: "voyager1", name: "Voyager 1", type: "mission", emoji: "🛰️", q: "Voyager 1 spacecraft",
    aliases: ["voyager 1", "voyager1", "voyager"], stats: ["Farthest human object: 24+ billion km", "Crossed into interstellar space 2012", "Still whispering home at 160 bits/s"] },
  { id: "voyager2", name: "Voyager 2", type: "mission", emoji: "🛰️", q: "Voyager 2 spacecraft",
    aliases: ["voyager 2", "voyager2"], stats: ["Only visitor to Uranus AND Neptune", "Interstellar space since Nov 2018", "Golden Record rides along"] },
  { id: "hubble", name: "Hubble Space Telescope", type: "mission", emoji: "🔭", q: "Hubble Space Telescope",
    aliases: ["hubble", "hst"], stats: ["34 years of deep-field portraits", "Orbits 515 km up, every 95 min", "Rewrote the age of the universe"] },
  { id: "jwst", name: "James Webb Telescope", type: "mission", emoji: "🔭", q: "James Webb Space Telescope",
    aliases: ["jwst", "james webb", "webb"], stats: ["6.5 m gold-coated infrared eye", "L2 orbit, 1.5 million km out", "Sees galaxies 13.5 Gyr back in time"] },
  { id: "cassini", name: "Cassini", type: "mission", emoji: "🛰️", q: "Cassini Saturn spacecraft",
    aliases: ["cassini", "cassini huygens"], stats: ["13 years orbiting Saturn", "Dived the ring gap 22×", "Ended in a deliberate Saturn plunge 2017"] },
  { id: "newhorizons", name: "New Horizons", type: "mission", emoji: "🚀", q: "New Horizons Pluto spacecraft",
    aliases: ["new horizons", "newhorizons"], stats: ["Flew past Pluto 14 July 2015", "Then Arrokoth: farthest flyby ever", "Carries Clyde Tombaugh's ashes"] },
  { id: "perseverance", name: "Perseverance Rover", type: "mission", emoji: "🤖", q: "Perseverance rover Mars",
    aliases: ["perseverance", "percy"], stats: ["Rolling Jezero Crater since Feb 2021", "Caching samples for Earth return", "Its helicopter Ingenuity flew 72×"] },
  { id: "apollo11", name: "Apollo 11", type: "mission", emoji: "🌕", q: "Apollo 11 moon landing",
    aliases: ["apollo 11", "apollo11", "apollo"], stats: ["First crewed Moon landing", "20 July 1969 — Armstrong + Aldrin", "21.5 kg of Moon rock home"] },
  { id: "parker", name: "Parker Solar Probe", type: "mission", emoji: "☀️", q: "Parker Solar Probe",
    aliases: ["parker solar probe", "parker"], stats: ["Fastest human object: 690,000 km/h", "Flies within 6.1 million km of the Sun", "Touched the solar corona — twice"] },
  { id: "iss", name: "International Space Station", type: "mission", emoji: "🛰️", q: "International Space Station",
    aliases: ["iss", "international space station", "space station"], stats: ["Crewed since Nov 2000, nonstop", "408 km up, 7.66 km/s", "Sunrise every 90 minutes"] },
];

// ── query resolution ────────────────────────────────────────────────────────
function normalize(s) {
  return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}
/** Resolve free text to a catalog entry, or null (engine then falls back to
 *  a free-form NASA library search with the raw query). */
function resolveBody(raw) {
  const q = normalize(raw);
  if (!q) return null;
  // 1) exact id / alias
  for (const b of CATALOG) {
    if (b.id === q.replace(/\s+/g, "") || b.aliases.includes(q) || normalize(b.name) === q) return b;
  }
  // 2) alias prefix (e.g. "sagittarius" -> sagittarius a*)
  for (const b of CATALOG) {
    if (b.aliases.some((a) => q.startsWith(a) || a.startsWith(q) && q.length >= 4)) return b;
  }
  // 3) name token overlap
  const qt = new Set(q.split(" ").filter((t) => t.length > 2));
  let best = null, bestN = 0;
  for (const b of CATALOG) {
    const toks = normalize(b.name + " " + b.aliases.join(" ")).split(" ");
    const n = toks.filter((t) => qt.has(t)).length;
    if (n > bestN) { best = b; bestN = n; }
  }
  return bestN > 0 ? best : null;
}

// ── NASA Image & Video Library (images-api.nasa.gov, keyless) ───────────────
const NASA_BASE = "https://images-api.nasa.gov";
const UA = "wa-jake-umap/1.0 (WhatsApp community bot; +https://github.com/BrainMell/whatsapp-bot)";

function searchUrl(query, mediaType) {
  return `${NASA_BASE}/search?q=${encodeURIComponent(query)}&media_type=${mediaType}&page_size=8`;
}
function assetUrl(nasaId) {
  return `${NASA_BASE}/asset/${encodeURIComponent(nasaId)}`;
}
/** Rank image items from a /search JSON (media_type=image). Curated-source
 *  boost: PIA* ids are the Photo Journal press picks (visually reliable);
 *  GSFC_* archive entries are frequently near-black IR plates. Telescope
 *  mentions (Hubble/JWST/Spitzer) also boost. Returns ranked array. */
function pickImageItems(searchJson, preferTerms = [], limit = 3) {
  const items = (searchJson?.collection?.items || []).filter((it) => it?.data?.[0]?.nasa_id);
  if (!items.length) return [];
  const score = (it) => {
    const d = it.data[0];
    const id = String(d.nasa_id || "");
    const hay = `${d.title || ""} ${d.description || ""} ${(d.keywords || []).join(" ")}`.toLowerCase();
    let s = 0;
    for (const t of preferTerms) if (t && hay.includes(t.toLowerCase())) s += 2;
    if ((d.title || "").toLowerCase().includes(preferTerms[0]?.toLowerCase() || "")) s += 3;
    if (d.center && String(d.center).toUpperCase() !== "NONE") s += 1;
    if (/^pia/i.test(id)) s += 4; // Photo Journal press images — curated, vivid
    if (/hubble|jwst|webb|spitzer|telescope/.test(hay)) s += 2;
    if (/^gsfc_.*archive/i.test(id)) s -= 3; // GSFC daily-archive: hit-or-miss exposure
    return s;
  };
  return items.map((it) => ({ it, s: score(it) })).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.it);
}
function pickImageItem(searchJson, preferTerms = []) {
  return pickImageItems(searchJson, preferTerms, 1)[0] || null;
}
/** Average luminance 0-255 of an image buffer (tiny 24×24 sample). Guards
 *  against near-black archive plates reaching the card. */
async function sampleLuma(imageBuf, { createCanvas, loadImage }) {
  if (typeof createCanvas !== "function" || typeof loadImage !== "function") return 255;
  try {
    const img = await loadImage(imageBuf);
    const c = createCanvas(24, 24);
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0, 24, 24);
    const d = cx.getImageData(0, 0, 24, 24).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4);
  } catch (e) { return 255; /* unreadable -> let the renderer decide */ }
}
/** From an /asset manifest, pick the best jpg href (large > orig > any). */
function pickImageHref(assetJson) {
  const hrefs = (assetJson?.collection?.items || []).map((x) => (typeof x === "string" ? x : x?.href)).filter(Boolean);
  const jpgs = hrefs.filter((h) => /\.(jpg|jpeg)$/i.test(h));
  if (!jpgs.length) return null;
  const rank = (h) => (/large\.jpg$/i.test(h) ? 4 : /orig\.jpg$/i.test(h) ? 3 : /small\.jpg$/i.test(h) ? 2 : /thumb/i.test(h) ? 1 : 2);
  return jpgs.sort((a, b) => rank(b) - rank(a))[0];
}
/** From an /asset manifest of a VIDEO item, pick a sendable mp4 (small first). */
function pickVideoHref(assetJson) {
  const hrefs = (assetJson?.collection?.items || []).map((x) => (typeof x === "string" ? x : x?.href)).filter(Boolean);
  const mp4s = hrefs.filter((h) => /\.mp4$/i.test(h));
  if (!mp4s.length) return null;
  const rank = (h) => (/~mobile\.mp4$/i.test(h) ? 5 : /~preset\.mp4$/i.test(h) ? 4 : /~small\.mp4$/i.test(h) ? 3 : /~orig\.mp4$/i.test(h) ? 1 : 2);
  return mp4s.sort((a, b) => rank(b) - rank(a))[0];
}
function libraryLink(query, mediaType) {
  return `https://images.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=${mediaType}`;
}

// ── text builder ────────────────────────────────────────────────────────────
function buildSpaceText(body, opts = {}) {
  const lines = [];
  lines.push(`${body.emoji || "🔭"} *${body.name}* — _${body.type}_`);
  lines.push("");
  for (const s of body.stats) lines.push(`• ${s}`);
  lines.push("");
  lines.push(`🔗 More imagery: ${libraryLink(body.q, "image")}`);
  if (opts.videoNote) lines.push(`🎬 Video: ${opts.videoNote}`);
  return lines.join("\n");
}

// ── canvas renderer (hero image + badge + stat bar; wmap visual language) ───
const W = 900, H = 760, BAR = 150;
async function renderSpaceCard({ imageBuf, body, attribution, createCanvas, loadImage }) {
  if (typeof createCanvas !== "function" || typeof loadImage !== "function") {
    throw new Error("renderSpaceCard requires createCanvas/loadImage (canvas API injected)");
  }
  const canvas = createCanvas(W, H + BAR);
  const ctx = canvas.getContext("2d");

  // deep-space base (always painted first)
  ctx.fillStyle = "#050810";
  ctx.fillRect(0, 0, W, H + BAR);

  // hero image: cover-fit into the art window
  let drew = false;
  if (imageBuf && imageBuf.length > 500) {
    try {
      const img = await loadImage(imageBuf);
      const scale = Math.max(W / img.width, H / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      drew = true;
    } catch (e) { /* placeholder below */ }
  }
  if (!drew) {
    // procedural starfield fallback (card still renders if the API is down)
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 240; i++) {
      const r = rnd() * 1.6 + 0.3;
      ctx.globalAlpha = 0.25 + rnd() * 0.75;
      ctx.fillStyle = rnd() > 0.85 ? "#9fc4ff" : "#ffffff";
      ctx.beginPath();
      ctx.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // vignette so the bar + badge read on any imagery
  const vg = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.35, W / 2, H * 0.42, H * 0.95);
  vg.addColorStop(0, "rgba(3,6,14,0)");
  vg.addColorStop(1, "rgba(3,6,14,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // type badge (top-left pill)
  const badge = `${body.emoji || "🔭"} ${String(body.type).toUpperCase()}`;
  ctx.font = "600 22px sans-serif";
  const bw = ctx.measureText(badge).width + 30;
  ctx.fillStyle = "rgba(8,14,26,0.82)";
  ctx.strokeStyle = "rgba(140,180,255,0.5)";
  ctx.lineWidth = 2;
  _pill(ctx, 18, 18, bw, 40, 20);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#cfe0ff";
  ctx.fillText(badge, 33, 45);

  // bottom caption bar (same gradient language as the wmap card)
  const by = H;
  const grad = ctx.createLinearGradient(0, by - 40, 0, by + BAR);
  grad.addColorStop(0, "rgba(4,8,16,0)");
  grad.addColorStop(0.22, "rgba(4,8,16,0.9)");
  grad.addColorStop(1, "rgba(4,8,16,0.97)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, by - 40, W, BAR + 40);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 38px sans-serif";
  let name = body.name || "Deep Sky";
  while (ctx.measureText(name).width > W - 40 && name.length > 8) name = name.slice(0, -2);
  ctx.fillText(name, 20, by + 48);

  ctx.fillStyle = "#9fb4d8";
  ctx.font = "24px sans-serif";
  const stats = body.stats || [];
  const l1 = (stats[0] || "").slice(0, 78);
  const l2 = (stats[1] || "").slice(0, 78);
  ctx.fillText(l1, 20, by + 86);
  ctx.fillText(l2, 20, by + 120);

  ctx.textAlign = "right";
  ctx.fillStyle = "#6d82a6";
  ctx.font = "19px sans-serif";
  ctx.fillText(attribution || "imagery: NASA Image & Video Library", W - 20, by + 120);
  ctx.textAlign = "left";

  return canvas;
}
function _pill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

module.exports = {
  CATALOG, NASA_BASE, UA,
  normalize, resolveBody,
  searchUrl, assetUrl, pickImageItem, pickImageItems, sampleLuma, pickImageHref, pickVideoHref, libraryLink,
  buildSpaceText, renderSpaceCard,
};
