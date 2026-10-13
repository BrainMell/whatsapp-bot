// ============================================
// MURDER MYSTERY - CASE CONTENT
// Data-driven procedural flavor. No gameplay
// logic here - pure narrative variety so two
// cases never feel identical.
// ============================================

const MANOR_NAME = 'BLACKVALE MANOR';

// Rooms the artwork actually gives us (bg file -> display name).
// Every room listed here can host a body. Each game draws a
// random subset in random order (spec: rooms randomised every game).
// `hint` is the public trait line shown on the room list card.
const ROOMS = [
  { id: 'ballroom',   name: 'the Ballroom',         hint: 'gilded, open, a hundred hiding places for nothing' },
  { id: 'library',    name: 'the Library',          hint: 'tall shelves and darker gaps between them' },
  { id: 'dining',     name: 'the Dining Room',      hint: 'one long table, every chair pushed in but one' },
  { id: 'drawing',    name: 'the Drawing Room',     hint: 'velvet settees, curtained corners' },
  { id: 'entrance',   name: 'the Grand Hall',       hint: 'the first room every guest crosses - impossible to linger unseen' },
  { id: 'gallery',    name: 'the Portrait Gallery', hint: 'a corridor of painted eyes, long and dim' },
  { id: 'greatroom',  name: 'the Great Room',       hint: 'vaulted and echoing, nowhere to crouch' },
  { id: 'music',      name: 'the Music Room',       hint: 'the piano lid is open. the keys are silent' },
  { id: 'bedroom_a',  name: 'the Master Bedroom',   hint: 'a four-poster, a wardrobe, a lock that only pretends' },
  { id: 'bedroom_b',  name: 'the Guest Bedroom',   hint: 'narrow, quiet, and rarely entered twice' },
  { id: 'hallway_a',  name: 'the East Wing Hall',   hint: 'candlelit, well travelled, impossible to seal' },
  { id: 'hallway_b',  name: 'the West Wing Hall',   hint: 'the west wing is closed at night. supposedly' },
  { id: 'teatime',    name: 'the Morning Room',     hint: 'sunlit by day, black as a pocket by night' },
];

// Murder methods: title used on the body-found card, flavor is the discovery line.
const METHODS = [
  { title: 'poisoned claret',        flavor: 'A laced glass of claret, still warm on the sill.' },
  { title: 'a letter opener',        flavor: 'The letter opener never left the writing desk.' },
  { title: 'piano wire',             flavor: 'A length of piano wire, coiled like a snake.' },
  { title: 'a long fall',            flavor: 'The balcony rail was worn smooth. Now it is not.' },
  { title: 'a velvet pillow',        flavor: 'The velvet still holds the shape of a struggle.' },
  { title: 'a candlestick',          flavor: 'One candlestick is missing from the candelabra.' },
  { title: 'laudanum in the nightcap', flavor: 'The nightcap smelled of laudanum and roses.' },
  { title: 'the cellar stair',       flavor: 'The cellar stair is slick. The banister, slicker.' },
  { title: 'a bouquet of foxglove',  flavor: 'Foxglove, cut fresh from the conservatory.' },
];

// Atmospheric lines under the Night card
const NIGHT_LINES = [
  'The candles gutter, one by one.',
  'Something moves behind the wallpaper.',
  'The portraits watch you sleep.',
  'Footsteps in the west wing. Then none.',
  'The clock in the hall ticks out of time.',
  'Fog presses against every window.',
  'The dogs will not stop trembling.',
  'Midnight came and went without a sound.',
];

// Intro card subtitles
const OPENING_LINES = [
  'The guests have arrived. One of them lies.',
  'Dinner is served. So is suspicion.',
  'Old money. Older secrets.',
  'A toast was raised. A knife was sharpened.',
  'Every face is smiling. Not every smile is honest.',
];

// Morning outcome flavor (public morning card + caption)
const MORNING_MURDER_LINES = [
  'A scream woke the house. By the time candles were lit, the scream was already an echo.',
  'The staff found a door ajar and a chair still rocking. No one will say whose.',
  'The night took its due. The house pretends otherwise.',
];
const MORNING_SAVED_LINES = [
  'Death reached for someone last night - and something turned its hand away.',
  'The knife stopped. The household will never know how close it came.',
  'Someone woke screaming from a dream of fingers at their throat. They woke.',
];
const MORNING_QUIET_LINES = [
  'By some mercy - or some cowardice - everyone is still breathing.',
  'The house counts its guests twice and finds no one missing.',
];

// Discussion-phase prompts (public)
const DISCUSSION_PROMPTS = [
  'Someone among you poured the poison. Discuss. Accuse. Defend yourselves.',
  'The killer is at this table. Talk - and watch their hands.',
  'Grief looks different on a murderer. Compare notes.',
  'Everyone has an alibi. Not everyone is telling the truth.',
  'Ask your questions. Lies have a smell.',
];

// Search flavor (DM to a searcher whose room was empty)
const SEARCH_NOTHING_LINES = [
  'Dust, shadow, and the smell of last winter. Nothing.',
  'You disturb a mouse and a memory. Neither is the body.',
  'The room holds its breath and gives up nothing.',
  'Cold candle stubs. A shut window. No body here.',
  'You search until your candle burns your fingers. Nothing.',
];

// Ghost clue framing lines (the ghost of the victim speaks about their killer)
const GHOST_INTRO_LINES = [
  'The dead do not rest until the knife is named.',
  'A voice like a draft under the door:',
  'The ghost of the dead walks you back through the room:',
  'Cold breath at your ear. A whisper meant only for you:',
];
const GHOST_EXHAUSTED_LINES = [
  'The ghost has nothing left to give. It only points - and fades.',
  'The whisper is only wind now. The dead have said all they will say.',
];

// Investigator flavor lines
const INVEST_GUILTY = [
  'Mud on their boots - fresh, despite the dry night.',
  'Their smile never once reached their eyes.',
  'An alibi, rehearsed far too perfectly.',
  'Candle wax on their sleeve. Black, like the cellar candles.',
  'They flinched at the victim\u2019s name. Barely. But they flinched.',
];
const INVEST_CLEAN = [
  'Trembling hands, honest eyes.',
  'Their grief is the loud, ugly, genuine kind.',
  'Nothing. Not a thread out of place.',
  'They were weeping into their tea at the time. Two witnesses.',
  'An alibi that holds - for whatever that is worth.',
];

// Guardian Angel flavor pools
const GA_SAVE_PUBLIC = [
  'Someone in this house almost died last night. Dawn found them breathing.',
  'Death was cheated. Whoever it reached for woke with a racing heart - and a pulse.',
  'The knife was turned aside by no hand anyone saw. Someone almost died.',
];
const GA_SAVE_GA    = 'You kept the watch you promised. The knife came for {name} - and you turned it. Tell no one. Not even them.';
const GA_SAVED_DREAM = [
  'You dreamt of hands at your throat. You woke screaming - alive. You were meant to die tonight. Tell the group only if you dare.',
  'Something held you back from the dark, and you do not know what. You were meant to die tonight. Tell the group only if you dare.',
];
const GA_KILLER_BLOCKED = [
  'Your knife stopped mid-air tonight, as if the dark itself refused. Someone is watching over this house.',
  'You reached your victim - and found the way barred by something you could not name. The house has a guardian.',
];

// Endgame headline pools
const CIV_WIN_LINES = [
  'The manor is quiet again. For now.',
  'The knives are sheathed. The lie is out.',
  'Blackvale keeps its dead. All of them.',
];
const KILLER_WIN_LINES = [
  'Blackvale Manor belongs to the dead now.',
  'No one stopped them. No one ever will.',
  'The last candle goes out.',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Search difficulty tiers (concealment). Shown to everyone on the
// room list - the killer's choice of room is a real strategic trade:
// easy rooms get searched first; hard rooms hide the body longer,
// but a body found in a hard room has watched the killer longer
// (the ghost's clue comes out sharper - handled in index.js).
function concealLabel(c) {
  if (c <= 1) return 'easy to search';
  if (c === 2) return 'slow to search';
  return 'hard to search';
}

// Draw n rooms for a new game - random composition AND order every game.
function drawRooms(n = 6) {
  const pool = ROOMS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length)).map((r) => {
    // weighted concealment: 40% easy, 40% slow, 20% hard
    const roll = Math.random();
    const conceal = roll < 0.4 ? 1 : roll < 0.8 ? 2 : 3;
    return { ...r, conceal, concealLabel: concealLabel(conceal) };
  });
}

function roomName(id) {
  const r = ROOMS.find((x) => x.id === id);
  return r ? r.name : 'the Manor';
}

// ============================================
// WAVE 2c - THE HOUSE'S SEALS (owner 2026-10-13 "Go" on the seals pitch)
// Every room in the house owns one seal - a stopped clock, a veiled mirror,
// a music box wound too tight. Each case, 3 of the 6 drawn rooms carry an
// ACTIVE seal (one per tier when the draw allows). Answers are HOUSE LORE and
// never case truth: no guest names, no methods, nothing usable as an oracle.
// Puzzles pay - they never testify.
// ============================================
const SEAL_PAY = { 1: 30, 2: 70, 3: 150 }; // tiered Zeni on solve (tunable)

const SEALS = [
  // ---- tier 1 (30 Zeni) ----
  {
    id: 'ballroom_clock', roomId: 'ballroom', tier: 1,
    name: 'the stopped clock',
    find: 'a grandfather clock stopped at nine minutes to midnight, its pendulum furred with dust',
    riddle: 'I counted the hours until that night. I have not moved since. What am I?',
    answer: 'clock', aliases: ['a clock', 'the clock', 'grandfather clock', 'watch', 'timepiece'],
    dawn: 'Somewhere in the house, a clock that had stood still began to tick.',
  },
  {
    id: 'dining_salt', roomId: 'dining', tier: 1,
    name: 'the salt line',
    find: 'a line of salt poured across the servants\' door, unswept since some older winter',
    riddle: 'I was poured in a straight line to keep something out - or in. Nobody has dared sweep me away. What am I?',
    answer: 'salt', aliases: ['the salt', 'salt line', 'a salt line', 'the salt line'],
    dawn: 'Somewhere in the house, a line of salt was quietly swept away.',
  },
  {
    id: 'library_book', roomId: 'library', tier: 1,
    name: 'the bound book',
    find: 'a book chained shut at the shelf\'s end, its title burned from the spine',
    riddle: 'I was written to be opened. Instead I was chained, and my name was burned away. What am I?',
    answer: 'book', aliases: ['a book', 'the book'],
    dawn: 'Somewhere in the house, a chained book fell open on its own.',
  },
  {
    id: 'east_candle', roomId: 'hallway_a', tier: 1,
    name: 'the everlit candle',
    find: 'a candle in the wall sconce that no servant admits to trimming, burning without end',
    riddle: 'I have burned every night for thirty years, and no hand trims me. What am I?',
    answer: 'candle', aliases: ['a candle', 'the candle', 'the everlit candle'],
    dawn: 'Somewhere in the east wing, a thirty-year flame finally guttered out.',
  },
  {
    id: 'west_door', roomId: 'hallway_b', tier: 1,
    name: 'the extra door',
    find: 'a door where the blueprints swear there is none, papered over but breathing cold',
    riddle: 'Count us and the house has one too many. Paper me over and I still breathe cold. What am I?',
    answer: 'door', aliases: ['a door', 'the door'],
    dawn: 'Somewhere in the west wing, a door that never was swung shut.',
  },
  // ---- tier 2 (70 Zeni) ----
  {
    id: 'drawing_mirror', roomId: 'drawing', tier: 2,
    name: 'the veiled mirror',
    find: 'a tall mirror draped in black crepe, though nobody living has died in this house',
    riddle: 'I was covered in black so the house would not see who wept - or who did not. What am I?',
    answer: 'mirror', aliases: ['a mirror', 'the mirror'],
    dawn: 'Somewhere in the house, black crepe slid from a mirror.',
  },
  {
    id: 'hall_ledger', roomId: 'entrance', tier: 2,
    name: 'the struck name',
    find: 'the guest ledger on its brass stand, one name inked out so hard the page tore',
    riddle: 'Every guest who ever crossed this house signed me. One name was struck so hard the page tore. What am I?',
    answer: 'ledger', aliases: ['a ledger', 'the ledger', 'guest book', 'the guest book', 'register', 'the register'],
    dawn: 'Somewhere in the house, a torn ledger page turned of its own accord.',
  },
  {
    id: 'great_flue', roomId: 'greatroom', tier: 2,
    name: 'the sealed flue',
    find: 'a hearth swept clean but mortar-sealed at the flue, the mortar newer than the stone around it',
    riddle: 'For forty years no fire has burned here. The week after the winter party, I was sealed with mortar. What am I?',
    answer: 'chimney', aliases: ['the chimney', 'a chimney', 'flue', 'the flue', 'hearth', 'the hearth', 'fireplace'],
    dawn: 'Somewhere in the house, forty years of silence went up a chimney.',
  },
  {
    id: 'guest_valise', roomId: 'bedroom_b', tier: 2,
    name: 'the locked valise',
    find: 'a leather valise at the foot of the guest bed, locked from the inside, its key long gone',
    riddle: 'I arrived with a guest who never checked out. I have been locked from the inside ever since. What am I?',
    answer: 'valise', aliases: ['a valise', 'the valise', 'suitcase', 'a suitcase', 'luggage', 'bag'],
    dawn: 'Somewhere in the house, a valise unlocked itself with a sigh.',
  },
  {
    id: 'gallery_plate', roomId: 'gallery', tier: 2,
    name: 'the missing nameplate',
    find: 'one frame among the painted eyes without its brass plate - the nail is bright, the hole recent',
    riddle: 'Every frame here wears a brass name but mine. The plate was never lost - it was carried upstairs and buried. What am I?',
    answer: 'nameplate', aliases: ['a nameplate', 'the nameplate', 'brass nameplate', 'plaque', 'the plaque'],
    dawn: 'Somewhere in the gallery, a nameless frame remembered its name.',
  },
  // ---- tier 3 (150 Zeni) ----
  {
    id: 'music_box', roomId: 'music', tier: 3,
    name: 'the wound music box',
    find: 'a rosewood music box under a glass dome, wound so tight the lid trembles',
    riddle: 'I was wound to play one song on one night, and that night never came. My spring is tight as a held breath. What am I?',
    answer: 'music box', aliases: ['a music box', 'the music box', 'musicbox', 'music'],
    dawn: 'Somewhere in the house, a music box began to play.',
  },
  {
    id: 'master_board', roomId: 'bedroom_a', tier: 3,
    name: 'the replaced floorboard',
    find: 'one floorboard beneath the four-poster newer than its neighbours, its grain stained dark',
    riddle: 'I was replaced the spring after the master\'s funeral - for what was buried beneath, and what was taken out. What am I?',
    answer: 'floorboard', aliases: ['a floorboard', 'the floorboard', 'floor board', 'the floor board'],
    dawn: 'Somewhere above the cellar, a floorboard settled back into place.',
  },
  {
    id: 'teatime_cup', roomId: 'teatime', tier: 3,
    name: 'the sixth cup',
    find: 'a tea service on the sideboard set for six, though the household was five',
    riddle: 'Six cups stand where five should. No one remembers inviting the sixth guest. What am I?',
    answer: 'tea set', aliases: ['a tea set', 'the tea set', 'teaset', 'teacups', 'tea cups', 'cups'],
    dawn: 'Somewhere in the morning room, a sixth cup was filled by nobody.',
  },
];

// normalize a seal answer: lowercase, drop punctuation, drop leading articles,
// collapse whitespace - "  The  Clock! " and "clock" are the same word.
function normSealAnswer(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// draw the case's active seals: 3 of the drawn rooms carry one, one per tier
// when the draw allows (5 tier-1 / 5 tier-2 / 3 tier-3 in the bank; a 6-room
// draw can miss a tier, so a largest-bucket fallback fills the gap - the case
// always ships exactly 3 active seals, never a duplicate room and never two
// seals in one room).
function sealsForRooms(rooms) {
  const active = [];
  const byId = {};
  for (const s of SEALS) byId[s.roomId] = s;
  const drawn = (rooms || []).map((r) => ({ room: r, seal: byId[r.id] })).filter((x) => x.seal);
  const buckets = { 1: [], 2: [], 3: [] };
  for (const x of drawn) buckets[x.seal.tier].push(x);
  for (const t of [1, 2, 3]) buckets[t].sort(() => Math.random() - 0.5);
  const takeFrom = (tier) => {
    if (buckets[tier].length) return buckets[tier].shift();
    // fallback: largest remaining bucket
    let best = null;
    for (const t of [1, 2, 3]) {
      if (buckets[t].length && (!best || buckets[t].length > buckets[best].length)) best = t;
    }
    return best != null ? buckets[best].shift() : null;
  };
  for (const t of [1, 2, 3]) {
    const x = takeFrom(t);
    if (!x) break;
    active.push({
      sealId: x.seal.id,
      roomIdx: (rooms || []).indexOf(x.room),
      tier: x.seal.tier,
      found: false,
      foundBy: [],     // normalized jids who have met this seal (riddle DM once each)
      attempts: 0,     // wrong answers this night (SEAL_MAX_TRIES then jam)
      jammedNight: 0,  // night the mechanism jammed (resets with the new night)
      solved: false,
      solvedBy: null,
      byCoin: false,
      solvedNight: null,
    });
  }
  return { active };
}

module.exports = {
  MANOR_NAME,
  ROOMS,
  METHODS,
  NIGHT_LINES,
  OPENING_LINES,
  MORNING_MURDER_LINES,
  MORNING_SAVED_LINES,
  MORNING_QUIET_LINES,
  DISCUSSION_PROMPTS,
  SEARCH_NOTHING_LINES,
  GHOST_INTRO_LINES,
  GHOST_EXHAUSTED_LINES,
  INVEST_GUILTY,
  INVEST_CLEAN,
  GA_SAVE_PUBLIC,
  GA_SAVE_GA,
  GA_SAVED_DREAM,
  GA_KILLER_BLOCKED,
  CIV_WIN_LINES,
  KILLER_WIN_LINES,
  pick,
  concealLabel,
  drawRooms,
  roomName,
  // Wave 2c - the house's seals
  SEAL_PAY,
  SEALS,
  normSealAnswer,
  sealsForRooms,
};
