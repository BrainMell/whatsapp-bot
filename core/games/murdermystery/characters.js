// ============================================
// MURDER MYSTERY — CHARACTER POOL
// Blackvale Manor's staff and guests.
// A CHARACTER is a story person, NOT a role.
// Any character may be the Killer, the
// Investigator, the Guardian or a Civilian.
// ============================================

// sprite file lives at ./assets/char/<sprite>.png
const CHARACTERS = [
  { id: 'butler2',       sprite: 'butler2.png',       name: 'Mr. Crowley',   title: 'the Butler' },
  { id: 'boy',           sprite: 'boy.png',           name: 'Oliver Pike',   title: 'the Errand Boy' },
  { id: 'chef_girl',     sprite: 'chef_girl.png',     name: 'Marthe',        title: 'the Cook' },
  { id: 'girl1',         sprite: 'girl1.png',         name: 'Lady Vivienne', title: 'the Heiress' },
  { id: 'girl10',        sprite: 'girl10.png',        name: 'Lady Beatrice', title: 'the Botanist' },
  { id: 'girl13',        sprite: 'girl13.png',        name: 'Lady Rosalind', title: 'the Seamstress' },
  { id: 'girl5',         sprite: 'girl5.png',         name: 'Lady Morgana',  title: 'the Occultist' },
  { id: 'investigator',  sprite: 'investigator.png',  name: 'Mr. Marlowe',   title: 'the Detective' },
  { id: 'maid1',         sprite: 'maid1.png',         name: 'Gwen',          title: 'the Parlour Maid' },
  { id: 'nurse1',        sprite: 'nurse1.png',        name: 'Sister Agnes',  title: 'the Nurse' },
  { id: 'chef',          sprite: 'chef.png',          name: 'Antoine',       title: 'the Chef' },
];

// ============================================
// GHOST CLUES — predetermined, NOT random.
// When a body is found, the victim's ghost
// whispers a clue about THEIR KILLER'S
// character. Clues are indexed by the
// killer's character id, and are progressive:
// tier I is vague, tier IV all but names them.
// (0 = first clue given, 3 = last.)
// ============================================
const CLUES = {
  butler2: [
    'The hands that did this knew the house. Every door, every hour.',
    'A faint smell of silver polish hung over the body.',
    'White gloves, pressed and folded. The ghost saw them gleam in the dark.',
    'The master keys. The livery. The bowed head. It was the Butler.',
  ],
  boy: [
    'Whoever came and went was small. Quick. Easy to overlook.',
    'Muddy boots, too big for the wearer — borrowed, like the errands.',
    'The ghost heard a whistle. The tune the boy sings with the morning post.',
    'Satchel straps and freckles. The Errand Boy ran more than messages that night.',
  ],
  chef_girl: [
    'The kitchen knew. The kitchen always knows.',
    'The ghost smelled onions — and something sweeter underneath. Bitter almond.',
    'Flour footprints, half-erased, leading away from the pantry.',
    'An apron stained past saving. The Cook fed someone their last meal.',
  ],
  girl1: [
    'Perfume reached the body before the killer\u2019s hands did.',
    'Rose and myrrh. Expensive. The kind of scent money leaves behind.',
    'A pearl button, torn loose. The ghost watched it roll under the chaise.',
    'Silk that whispers when it moves. The Heiress inherited more than a fortune.',
  ],
  girl10: [
    'Something grew in this room that no gardener planted.',
    'Petal fragments. Foxglove, the ghost thinks. Or nightshade.',
    'Soil under fine fingernails. A cutting taken from the conservatory after dark.',
    'A pruning knife, wiped clean on a lace hem. The Botanist knows her poisons.',
  ],
  girl13: [
    'Thread. The ghost keeps seeing thread.',
    'A stitch of dark silk caught on the door latch.',
    'Someone sat with the body a long while, needlework by candlelight.',
    'A thimble gleams in the ghost\u2019s memory. The Seamstress measured them for a shroud.',
  ],
  girl5: [
    'The candles behaved strangely that night. The flames bent.',
    'Chalk dust. A half-scrubbed circle. Words the ghost refuses to repeat.',
    'The room was already cold before the deed was done. The ghost is sure of it.',
    'Tarot cards spread on the floor, and the last card was death. The Occultist dealt it.',
  ],
  investigator: [
    'Whoever it was, they studied the room the way a hunter studies tracks.',
    'The clues had been tidied. Too neatly. Someone read the scene like a book.',
    'The ghost watched them pocket one piece of evidence and replace another.',
    'A magnifier. A notepad. The quiet certainty of a professional. The Detective was on the case.',
  ],
  maid1: [
    'The body had been tended. Straightened. Cared for, almost.',
    'A dusting cloth, folded wrong. The ghost notices these things.',
    'Every footprint had been swept away — all but one, small and quick.',
    'The hearth was warm where no fire was laid. The Maid dusted over her sins.',
  ],
  nurse1: [
    'The end was gentle, the ghost admits. Almost kind.',
    'The smell of carbolic soap, sharp under the candle smoke.',
    'A pulse counted down by practiced fingers. The ghost felt them letting go.',
    'A satchel of vials, one missing. The Nurse swore to do no harm. Mostly.',
  ],
  chef: [
    'A knife from the kitchen is missing. One of the good ones.',
    'The ghost smells rich sauces and something scorched. Temper, maybe.',
    'Heavy footsteps in the pantry. A cleaver test-swung. Twice.',
    'They carved the roast at dinner with hands that never shook. The Chef\u2019s knives are always sharp.',
  ],
};

const byId = {};
for (const c of CHARACTERS) byId[c.id] = c;

function getCharacter(id) {
  return byId[id] || CHARACTERS[0];
}

// Progressive clue for a killer's character. tier is clamped to the pool;
// exhausted pools return null (caller falls back to GHOST_EXHAUSTED_LINES).
function clueFor(killerCharId, tier) {
  const pool = CLUES[killerCharId];
  if (!pool || tier >= pool.length) return null;
  return pool[Math.max(0, tier)];
}

// Fisher–Yates on a copy
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Draw n distinct characters for n players
function drawCast(n) {
  return shuffle(CHARACTERS).slice(0, Math.min(n, CHARACTERS.length));
}

module.exports = { CHARACTERS, CLUES, getCharacter, clueFor, drawCast, shuffle };
