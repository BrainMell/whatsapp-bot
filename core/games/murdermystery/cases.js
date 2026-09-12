// ============================================
// MURDER MYSTERY — CASE CONTENT
// Data-driven procedural flavor. No gameplay
// logic here — pure narrative variety so two
// cases never feel identical.
// ============================================

const MANOR_NAME = 'BLACKVALE MANOR';

// Rooms the artwork actually gives us (bg file -> display name).
// 'murder: true' rooms can host a body.
const ROOMS = [
  { id: 'ballroom',   name: 'the Ballroom',         murder: true },
  { id: 'library',    name: 'the Library',          murder: true },
  { id: 'dining',     name: 'the Dining Room',      murder: true },
  { id: 'drawing',    name: 'the Drawing Room',     murder: true },
  { id: 'entrance',   name: 'the Grand Hall',       murder: true },
  { id: 'gallery',    name: 'the Portrait Gallery', murder: true },
  { id: 'greatroom',  name: 'the Great Room',       murder: true },
  { id: 'music',      name: 'the Music Room',       murder: true },
  { id: 'bedroom_a',  name: 'the Master Bedroom',   murder: true },
  { id: 'bedroom_b',  name: 'the Guest Bedroom',    murder: true },
  { id: 'hallway_a',  name: 'the East Wing Hall',   murder: true },
  { id: 'hallway_b',  name: 'the West Wing Hall',   murder: true },
  { id: 'teatime',    name: 'the Morning Room',     murder: true },
];

// Murder methods: title used on the death card, flavor is the discovery line.
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

// Discussion-phase prompts (public)
const DISCUSSION_PROMPTS = [
  'Someone among you poured the poison. Discuss. Accuse. Defend yourselves.',
  'The killer is at this table. Talk — and watch their hands.',
  'Grief looks different on a murderer. Compare notes.',
  'Everyone has an alibi. Not everyone is telling the truth.',
  'Ask your questions. Lies have a smell.',
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

function pickRoom() {
  const murders = ROOMS.filter((r) => r.murder);
  return pick(murders);
}

function roomName(id) {
  const r = ROOMS.find((x) => x.id === id);
  return r ? r.name : 'the Manor';
}

function buildNightScene() {
  const room = pickRoom();
  const method = pick(METHODS);
  const hour = 1 + Math.floor(Math.random() * 4); // 1-4 o'clock
  return { room, method, hour };
}

// Scene list for a whole game — each night gets a distinct room while possible
function buildCaseScenes(maxNights) {
  const rooms = ROOMS.filter((r) => r.murder);
  const shuffled = rooms.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const scenes = [];
  for (let i = 0; i < maxNights; i++) {
    const room = shuffled[i % shuffled.length];
    scenes.push({ room, method: pick(METHODS), hour: 1 + Math.floor(Math.random() * 4) });
  }
  return scenes;
}

module.exports = {
  MANOR_NAME,
  ROOMS,
  METHODS,
  NIGHT_LINES,
  OPENING_LINES,
  DISCUSSION_PROMPTS,
  INVEST_GUILTY,
  INVEST_CLEAN,
  CIV_WIN_LINES,
  KILLER_WIN_LINES,
  pick,
  pickRoom,
  roomName,
  buildNightScene,
  buildCaseScenes,
};
