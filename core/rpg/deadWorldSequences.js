// ═══════════════════════════════════════════════════════════════════════════
//  DEAD WORLD SEQUENCES — 30 unique six-thought variations
// ═══════════════════════════════════════════════════════════════════════════
//
//  Data for the Dead World dungeon encounter (2026-09-21 owner ticket):
//  when a regular dungeon encounter spawns nothing, the player's own thoughts
//  carry the scene across SIX SEPARATE message boxes. Each variation below is
//  one encounter's arc; the sender wraps every line in  _*「 」*_  and posts
//  them one message at a time.
//
//  House rules for this data (QA pins all of them):
//    1. exactly 30 variations, exactly 6 thoughts each, all distinct
//    2. NO em dashes, NO en dashes, NO hyphens anywhere (owner rule for the
//       generated encounter text) - qa_dead_world.js scans every character
//    3. lowercase, human, spontaneous; never narration, never exposition,
//       never system speak; the player never names the phenomenon
//    4. confusion develops across the six lines; realization arrives through
//       the situation, and every variation takes its own route there
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const DEAD_WORLD_SEQUENCES = [
  // 1. plain noticing
  [
    'huh... where is everything',
    'spawn point is empty. completely empty',
    'okay. maybe i walked past them',
    'i did not walk past them',
    'why does the air feel like that...',
    'something is very wrong with this floor',
  ],
  // 2. calling out
  [
    'hello...? anyone home',
    'no ambush. no mob. nothing',
    'this is the part where they jump out',
    '...any time now',
    'the silence is doing that thing again',
    'floors do not just sit empty. floors do not do that',
  ],
  // 3. cocky turns uneasy
  [
    'oh good. free loot floor',
    'wait. there is nothing to loot',
    'even the trash mobs skipped this place',
    'i do not like that i am relaxing',
    'my gut says walk. my feet agree',
    'whatever happened here happened to everything',
  ],
  // 4. sensory
  [
    'it is too quiet in here',
    'not calm quiet. held breath quiet',
    'even my steps sound wrong',
    'like the floor forgot we were coming',
    'nothing moved. nothing at all',
    'i want to leave. i want to know why i want to leave',
  ],
  // 5. analytical
  [
    'encounter count says three. i count zero',
    'so either the count is broken or the floor is',
    'no tracks. no marks. no dust even',
    'things that live here left in a hurry',
    'or were taken. or never came back',
    'i am not sticking around to find out which',
  ],
  // 6. gamer brain
  [
    'did i break it. did i speedrun too fast',
    'empty arena. no enemies. zero xp incoming',
    'honestly? i would take one bad fight over this',
    'the quiet is worse than a boss bar',
    'creepy empty floor achievement unlocked. hate it',
    'moving before something fills the void. metaphorically',
  ],
  // 7. scared
  [
    'they were supposed to be here',
    'hello...? that is not funny',
    'my hands are shaking and i do not know why',
    'the dark here is not empty. it is full of nothing',
    'i keep listening for breathing. any breathing',
    'i am leaving. i am leaving right now',
  ],
  // 8. denial
  [
    'nope. wrong turn. definitely the wrong turn',
    'i will just backtrack and find the real fight',
    'the real fight is behind me. it has to be',
    'that is fine. everything is fine',
    'laugh. laugh so you do not think',
    'okay universe. very funny. i get it',
  ],
  // 9. superstitious
  [
    'something ate this place before i got here',
    'not the mobs. the whole floor feels chewed',
    'old habit: knock on wood. there is no wood',
    'every dungeon hums a little. this one stopped',
    'if i am being fed to something, tell me now',
    'walking. fast. eyes up',
  ],
  // 10. time slips
  [
    'how long have i been standing here',
    'the light is not moving. is the light moving',
    'counting seconds helps. it does not help',
    'this floor feels older than the dungeon',
    'like i walked into a memory nobody finished',
    'step. step. do not look back',
  ],
  // 11. briefing memory
  [
    'the briefing said hostiles. plural',
    'plural means more than zero, right',
    'check the corners. check again',
    'maybe i am early. maybe they are late',
    'nothing is late in a dungeon. nothing is late',
    'i miss being scared of the wrong things',
  ],
  // 12. joking bravado
  [
    'great. i scared the monsters off',
    'me. scary. the rumors were true',
    '...they are not laughing. nothing is laughing',
    'when even the echoes quit, that is a sign',
    'i would hug a kobold right now. a kobold',
    'okay joke time is over. eyes forward',
  ],
  // 13. procedure as a lifeline
  [
    'step one: look around. done',
    'step two: find the mob. can not',
    'step three: do not panic. pending',
    'this is the part i skip in stories. the empty page',
    'nothing here wants to fight me. that is the problem',
    'keep the torch up and keep moving',
  ],
  // 14. body signals
  [
    'why are my ears ringing',
    'there is a taste in the air like old coins',
    'the hair on my arms will not settle',
    'everything here is waiting for something',
    'i am not staying to meet it',
    'move. just move',
  ],
  // 15. others
  [
    'did the others get a floor like this',
    'is this a solo thing. did it wait for me',
    'that thought felt worse than any mob',
    'the floor is not hostile. it is absent',
    'you can fight absent... right',
    'one way to find out. forward',
  ],
  // 16. reason hunting
  [
    'there is a reason. there is always a reason',
    'event? glitch? a maintenance break in reality',
    'pick one and walk',
    'the reason keeps not being here',
    'and the floor keeps being here',
    'bad math. the whole floor is bad math',
  ],
  // 17. hollow win
  [
    'so this counts as cleared... right',
    'survived a fight that never showed. easy',
    'my chest says it was not easy',
    'no loot. no scars. no explanation',
    'just a room where everything should be',
    'i will take the win. quietly. very quietly',
  ],
  // 18. cold observation
  [
    'no bodies. no blood. no battle',
    'a battlefield with no story left in it',
    'the props are here. the plot left',
    'somewhere between the door and here, everything ended',
    'or never started. worse. never started',
    'note to self: forget this floor existed',
  ],
  // 19. paranoid
  [
    'it is a trap. obviously a trap',
    'invisible enemy. phasing enemy. waiting enemy',
    'i swing at the air once. for science',
    'the air does not care. that is worse',
    'if this is a trick, it is an expensive one',
    'backing out the way i came. watching everything',
  ],
  // 20. misplaced calm
  [
    'weird... it is kind of peaceful',
    'no. peaceful is not the word',
    'peaceful has warmth in it. this does not',
    'it is a painting of a floor, not a floor',
    'i could stand here forever and nothing would care',
    'exactly. that is why i will not',
  ],
  // 21. stubborn
  [
    'fine. hide and seek it is',
    'i check every alcove. every shadow. twice',
    'you do not scare me by not existing',
    'show yourself and fight like a mob',
    'still nothing. still nothing',
    'the nothing is starting to feel deliberate',
  ],
  // 22. homesick
  [
    'the tavern noise would fix this. any noise',
    'i would trade my whole pouch for one goblin squeak',
    'quiet never scared me before today',
    'before today i had never heard a floor think',
    'it is thinking something about me',
    'nonsense. move along. move',
  ],
  // 23. urgent exit
  [
    'nope. nope. absolutely not',
    'an empty dungeon is not my problem to solve',
    'whatever drained this floor is still thirsty',
    'the exit is a memory i am fond of',
    'walk fast. apologize to my pride later',
    'pride can find its own way out',
  ],
  // 24. detached
  [
    'huh. i feel very far away right now',
    'like the dungeon is a memory i am watching',
    'the details are right. the life is gone',
    'dust hanging like it forgot to fall',
    'did i fall. is this falling',
    'keep moving. moving feels like proof',
  ],
  // 25. log keeper
  [
    'mob count: zero. chest count: zero',
    'xp forecast: bleak. mood: worse',
    'log it and move on. log it and move on',
    'my log entry says nothing. that is the entry',
    'a floor with no entry should not exist',
    'yet here i am, existing at it',
  ],
  // 26. challenge refused
  [
    'so the dungeon wants to play mind games',
    'cute. i have survived worse than empty',
    'empty is not worse than anything. that is the point',
    'i will clear it by leaving. that is the clear',
    'the door better appreciate this',
    'note the exit. note it twice',
  ],
  // 27. reverent fear
  [
    'places like this are not empty. they are kept',
    'kept like a room nobody is allowed in',
    'am i allowed. was i ever',
    'the silence is not ignoring me. it is holding me',
    'hmm. that is enough philosophy for one dungeon',
    'bow to nothing. walk toward the door',
  ],
  // 28. fragmented panic
  [
    'empty. empty empty empty',
    'okay. breathe. in. out. in',
    'count corners. count steps. count anything',
    'my voice sounds borrowed in here',
    'say something else. say anything else',
    'exit. now. words later',
  ],
  // 29. forced calm
  [
    'deep breath. this is fine',
    'the floor is empty and i am fine',
    'repeating it does not make it truer',
    'but my boots keep moving, so credit where due',
    'whatever this is, i am not its audience',
    'last look back. do not. do not look back',
  ],
  // 30. dawning
  [
    'first the mobs were missing',
    'then the noise was missing',
    'then, quietly, i stopped expecting either',
    'that is when it clicked. this place is not missing anything',
    'it is finished. everything here is finished',
    'walk. walk like the finished can not see you',
  ],
];

// Per-chat rotation so one chat rarely sees the same arc twice in a row.
const _recentByChat = new Map();

/**
 * Pick a variation index for a chat, avoiding the last few used ones.
 * @param {string} chatId
 * @returns {number} index into DEAD_WORLD_SEQUENCES
 */
function pickSequence(chatId) {
  const n = DEAD_WORLD_SEQUENCES.length;
  if (!n) return 0;
  const recent = _recentByChat.get(chatId) || [];
  const pool = [];
  for (let i = 0; i < n; i++) if (!recent.includes(i)) pool.push(i);
  const pickFrom = pool.length ? pool : Array.from({ length: n }, (_, i) => i);
  const idx = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  recent.push(idx);
  while (recent.length > Math.min(6, n - 1)) recent.shift();
  _recentByChat.set(chatId, recent);
  return idx;
}

/**
 * Wrap one thought in the encounter's message-box formatting.
 * @param {string} thought
 * @returns {string}
 */
function formatThought(thought) {
  return `_*「 ${String(thought).trim()} 」*_`;
}

module.exports = { DEAD_WORLD_SEQUENCES, pickSequence, formatThought };
