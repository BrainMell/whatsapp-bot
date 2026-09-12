// ============================================
// MURDER MYSTERY — CASE CONTENT
// Data-driven procedural flavor. No gameplay
// logic here — pure narrative variety so two
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
  { id: 'entrance',   name: 'the Grand Hall',       hint: 'the first room every guest crosses — impossible to linger unseen' },
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
  'Death reached for someone last night — and something turned its hand away.',
  'The knife stopped. The household will never know how close it came.',
  'Someone woke screaming from a dream of fingers at their throat. They woke.',
];
const MORNING_QUIET_LINES = [
  'By some mercy — or some cowardice — everyone is still breathing.',
  'The house counts its guests twice and finds no one missing.',
];

// Discussion-phase prompts (public)
const DISCUSSION_PROMPTS = [
  'Someone among you poured the poison. Discuss. Accuse. Defend yourselves.',
  'The killer is at this table. Talk — and watch their hands.',
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
  'The ghost has nothing left to give. It only points — and fades.',
  'The whisper is only wind now. The dead have said all they will say.',
];

// Investigator flavor lines
const INVEST_GUILTY = [
  'Mud on their boots — fresh, despite the dry night.',
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
  'An alibi that holds — for whatever that is worth.',
];

// Guardian Angel flavor pools
const GA_SAVE_PUBLIC = [
  'Someone in this house almost died last night. Dawn found them breathing.',
  'Death was cheated. Whoever it reached for woke with a racing heart — and a pulse.',
  'The knife was turned aside by no hand anyone saw. Someone almost died.',
];
const GA_SAVE_GA    = 'You kept the watch you promised. The knife came for {name} — and you turned it. Tell no one. Not even them.';
const GA_SAVED_DREAM = [
  'You dreamt of hands at your throat. You woke screaming — alive. You were meant to die tonight. Tell the group only if you dare.',
  'Something held you back from the dark, and you do not know what. You were meant to die tonight. Tell the group only if you dare.',
];
const GA_KILLER_BLOCKED = [
  'Your knife stopped mid-air tonight, as if the dark itself refused. Someone is watching over this house.',
  'You reached your victim — and found the way barred by something you could not name. The house has a guardian.',
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
// room list — the killer's choice of room is a real strategic trade:
// easy rooms get searched first; hard rooms hide the body longer,
// but a body found in a hard room has watched the killer longer
// (the ghost's clue comes out sharper — handled in index.js).
function concealLabel(c) {
  if (c <= 1) return 'easy to search';
  if (c === 2) return 'slow to search';
  return 'hard to search';
}

// Draw n rooms for a new game — random composition AND order every game.
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
};
