// ============================================
// MURDER MYSTERY — CHARACTER POOL
// Blackvale Manor's staff and guests.
// A CHARACTER is a story person, NOT a role.
// Any character may be the Killer, the
// Investigator, or a Civilian in any game.
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

const byId = {};
for (const c of CHARACTERS) byId[c.id] = c;

function getCharacter(id) {
  return byId[id] || CHARACTERS[0];
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

module.exports = { CHARACTERS, getCharacter, drawCast, shuffle };
