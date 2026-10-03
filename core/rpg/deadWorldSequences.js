// ═══════════════════════════════════════════════════════════════════════════
//  DEAD WORLD SEQUENCES — 30 unique ten-thought variations
// ═══════════════════════════════════════════════════════════════════════════
//
//  Data for the Dead World dungeon encounter (2026-09-21 owner ticket):
//  when a regular dungeon encounter spawns nothing, the player's own thoughts
//  carry the scene across TEN SEPARATE message boxes (owner 2026-09-21: "make
//  it 10 messages now"). Each variation below is one encounter's arc; the
//  sender wraps every line in  _*「 」*_  and posts them one message at a time.
//
//  House rules for this data (QA pins all of them):
//    1. exactly 30 variations, exactly 10 thoughts each, all distinct
//    2. NO em dashes, NO en dashes, NO hyphens anywhere (owner rule for the
//       generated encounter text) - qa_dead_world.js scans every character
//    3. lowercase, human, spontaneous; never narration, never exposition,
//       never system speak; the player never names the phenomenon
//    4. confusion develops across the ten lines; realization arrives through
//       the situation, and every variation takes its own route there
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const DEAD_WORLD_SEQUENCES = [
  // 1. plain noticing
  [
    'huh... where is everything',
    'spawn point is empty. completely empty',
    'okay. maybe i walked past them',
    'maybe the map is off. floors shift sometimes',
    'the map is not off. i checked it twice',
    'i backtracked to the stairs. nothing there either',
    'my torch sounds louder than it should',
    'i did not walk past them',
    'why does the air feel like that...',
    'something is very wrong with this floor',
  ],
  // 2. calling out
  [
    'hello...? anyone home',
    'no ambush. no mob. nothing',
    'this is the part where they jump out',
    'i yelled down the corridor. my own echo answered',
    'even the echo sounded unsure',
    'i rattled the gate chain. nothing moved',
    'there is always something. rats. bats. slimes. anything',
    '...any time now',
    'the silence is doing that thing again',
    'floors do not just sit empty. floors do not do that',
  ],
  // 3. cocky turns uneasy
  [
    'oh good. free loot floor',
    'wait. there is nothing to loot',
    'even the trash mobs skipped this place',
    'no dropped coins. no torn pouches. no signs of a fight',
    'if someone looted this floor they took the walls too',
    'i kicked a crate open. it was full of quiet',
    'i have cleared hundreds of floors. none felt like this',
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
    'i stopped. my ears started ringing in the quiet',
    'the warmth is gone. when did the warmth leave',
    'even the light looks tired. if that makes sense',
    'i can hear the torch eat its oil. that is how quiet',
    'nothing moved. nothing at all',
    'i want to leave. i want to know why i want to leave',
  ],
  // 5. analytical
  [
    'encounter count says three. i count zero',
    'so either the count is broken or the floor is',
    'no tracks. no marks. no dust even',
    'no claw gouges. no old blood. no molted shells',
    'the ledger in my head refuses to add up',
    'zero signs of life is still a sign. of something',
    'three encounters. three empty rooms. one of me',
    'things that live here left in a hurry',
    'or were taken. or never came back',
    'i am not sticking around to find out which',
  ],
  // 6. gamer brain
  [
    'did i break it. did i speedrun too fast',
    'empty arena. no enemies. zero xp incoming',
    'honestly? i would take one bad fight over this',
    'i tried relogging by blinking. did not work',
    'the minimap in my head is just beige now',
    'no spawn animation. no aggro sound. nothing',
    'this is where the tutorial would say something',
    'the quiet is worse than a boss bar',
    'creepy empty floor achievement unlocked. hate it',
    'moving before something fills the void. metaphorically',
  ],
  // 7. scared
  [
    'they were supposed to be here',
    'hello...? that is not funny',
    'my hands are shaking and i do not know why',
    'i keep checking behind me. there is never a behind',
    'i counted my arrows twice. like that would help',
    'every shadow looks like it is waiting for permission',
    'i whispered. i do not know who i was whispering for',
    'the dark here is not empty. it is full of nothing',
    'i keep listening for breathing. any breathing',
    'i am leaving. i am leaving right now',
  ],
  // 8. denial
  [
    'nope. wrong turn. definitely the wrong turn',
    'i will just backtrack and find the real fight',
    'the real fight is behind me. it has to be',
    'the corridor behind me is the same corridor. that is new',
    'wrong dungeon? no. the door had the right sigil',
    'maybe i am early. maybe they are all asleep. maybe',
    'i laughed out loud just now. it did not help',
    'that is fine. everything is fine',
    'laugh. laugh so you do not think',
    'okay universe. very funny. i get it',
  ],
  // 9. superstitious
  [
    'something ate this place before i got here',
    'not the mobs. the whole floor feels chewed',
    'old habit: knock on wood. there is no wood',
    'i knocked on the doorframe anyway. it sounded hollow',
    'i said the small prayer granny taught me. twice',
    'salt. i have no salt. why did i think salt',
    'the wards on my gear are quiet too. they are never quiet',
    'every dungeon hums a little. this one stopped',
    'if i am being fed to something, tell me now',
    'walking. fast. eyes up',
  ],
  // 10. time slips
  [
    'how long have i been standing here',
    'the light is not moving. is the light moving',
    'counting seconds helps. it does not help',
    'i counted to sixty. twice. it came out different',
    'my shadow has not moved in a while. neither has the flame',
    'it feels like the floor is holding its hour still',
    'time here is a door that was propped open',
    'this floor feels older than the dungeon',
    'like i walked into a memory nobody finished',
    'step. step. do not look back',
  ],
  // 11. briefing memory
  [
    'the briefing said hostiles. plural',
    'plural means more than zero, right',
    'check the corners. check again',
    'i reread the briefing in my head. it did not change',
    'hostiles. plural. i am filing a complaint with the guild',
    'maybe the hostiles read the same briefing and left',
    'nobody briefed me on empty. empty was not in the words',
    'maybe i am early. maybe they are late',
    'nothing is late in a dungeon. nothing is late',
    'i miss being scared of the wrong things',
  ],
  // 12. joking bravado
  [
    'great. i scared the monsters off',
    'me. scary. the rumors were true',
    '...they are not laughing. nothing is laughing',
    'i told the room a joke. the room did not blink',
    'tough crowd. the toughest. no crowd at all',
    'i would pay real coin for one lousy jump scare',
    'the quiet is not laughing with me. maybe at me',
    'when even the echoes quit, that is a sign',
    'i would hug a kobold right now. a kobold',
    'okay joke time is over. eyes forward',
  ],
  // 13. procedure as a lifeline
  [
    'step one: look around. done',
    'step two: find the mob. can not',
    'step three: do not panic. pending',
    'step four: mark the exit on the map. done twice',
    'step five: listen. hearing my own pulse counts. barely',
    'the procedure does not have a page for this',
    'i wrote a page for it anyway. it says run',
    'this is the part i skip in stories. the empty page',
    'nothing here wants to fight me. that is the problem',
    'keep the torch up and keep moving',
  ],
  // 14. body signals
  [
    'why are my ears ringing',
    'there is a taste in the air like old coins',
    'the hair on my arms will not settle',
    'my pulse is loud. too loud for walking pace',
    'the cold found my collar and stayed there',
    'i swallowed and the quiet swallowed louder',
    'my knuckles are white on the strap. since when',
    'everything here is waiting for something',
    'i am not staying to meet it',
    'move. just move',
  ],
  // 15. others
  [
    'did the others get a floor like this',
    'is this a solo thing. did it wait for me',
    'that thought felt worse than any mob',
    'if the party walked this floor, they left no footprints',
    'i called out for the guild. the guild did not answer',
    'it is my fight to skip. that is new. skipping',
    'i would share this floor with any mob alive. any',
    'the floor is not hostile. it is absent',
    'you can fight absent... right',
    'one way to find out. forward',
  ],
  // 16. reason hunting
  [
    'there is a reason. there is always a reason',
    'event? glitch? a maintenance break in reality',
    'pick one and walk',
    'i ran out of theories before i ran out of corridor',
    'every theory needs a witness. i am the only witness',
    'the empty is not explaining itself. rude',
    'whatever the reason is, it packed up and took the mobs',
    'the reason keeps not being here',
    'and the floor keeps being here',
    'bad math. the whole floor is bad math',
  ],
  // 17. hollow win
  [
    'so this counts as cleared... right',
    'survived a fight that never showed. easy',
    'my chest says it was not easy',
    'the victory feels borrowed. like i owe it back',
    'i did not win. i was dismissed. that is the feel',
    'surviving nothing should weigh nothing. it does not',
    'my trophy is a story with no middle',
    'no loot. no scars. no explanation',
    'just a room where everything should be',
    'i will take the win. quietly. very quietly',
  ],
  // 18. cold observation
  [
    'no bodies. no blood. no battle',
    'a battlefield with no story left in it',
    'the props are here. the plot left',
    'the stage is set for a play nobody performs',
    'i checked the script. all my lines are missing',
    'an audience of zero for a cast of zero',
    'the room is holding its breath between scenes',
    'somewhere between the door and here, everything ended',
    'or never started. worse. never started',
    'note to self: forget this floor existed',
  ],
  // 19. paranoid
  [
    'it is a trap. obviously a trap',
    'invisible enemy. phasing enemy. waiting enemy',
    'i swing at the air once. for science',
    'the air does not flinch. the walls do not flinch',
    'i checked for tripwires. for rune circles. for strings',
    'the only thing moving in here is my suspicion',
    'a trap needs a builder. where does a builder live',
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
    'nothing caring is the whole problem. write that down',
    'calm rooms fill back up. this one will not',
    'the stillness is not resting. it is spent',
    'stillness like this is a door held shut',
    'exactly. that is why i will not',
  ],
  // 21. stubborn
  [
    'fine. hide and seek it is',
    'i check every alcove. every shadow. twice',
    'you do not scare me by not existing',
    'show yourself and fight like a mob',
    'still nothing. still nothing',
    'i ran out of places to check. i am checking them anyway',
    'my stubbornness is winning. it does not feel like winning',
    'hiding from me is the smartest move any mob never made',
    'even stubborn runs out of floor eventually',
    'the nothing is starting to feel deliberate',
  ],
  // 22. homesick
  [
    'the tavern noise would fix this. any noise',
    'i would trade my whole pouch for one goblin squeak',
    'quiet never scared me before today',
    'before today i had never heard a floor think',
    'it is thinking something about me',
    'i miss the smell of spilled ale. i really do',
    'home is three floors up and a whole world away',
    'even a bad night at the inn beats a good night here',
    'the fireplace in my head will not light',
    'nonsense. move along. move',
  ],
  // 23. urgent exit
  [
    'nope. nope. absolutely not',
    'an empty dungeon is not my problem to solve',
    'whatever drained this floor is still thirsty',
    'the exit is a memory i am fond of',
    'i am leaving a tip for whatever lives here. my absence',
    'retrace. retrace. do not improvise',
    'my feet voted before i did. unanimous',
    'the door had better still be a door',
    'walk fast. apologize to my pride later',
    'pride can find its own way out',
  ],
  // 24. detached
  [
    'huh. i feel very far away right now',
    'like the dungeon is a memory i am watching',
    'the details are right. the life is gone',
    'dust hanging like it forgot to fall',
    'even my own footprints look like props',
    'i waved a hand in front of my own face. checking',
    'the world is behind a thin pane of glass',
    'if i speak, will the floor hear it. do i want it to',
    'did i fall. is this falling',
    'keep moving. moving feels like proof',
  ],
  // 25. log keeper
  [
    'mob count: zero. chest count: zero',
    'xp forecast: bleak. mood: worse',
    'log it and move on. log it and move on',
    'entry three: the torch still burns. noting that loudly',
    'entry four: counted my gear twice. all present. unlike the mobs',
    'entry five: asked the floor for a comment. no comment',
    'the log is the only thing talking. that is a bad sign',
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
    'you can not beat someone who will not show up. checkmate',
    'i refuse to be spooked by an empty room. refusing hard',
    'my surrender letter to the dungeon: dear no one',
    'the house always wins. this house will not even play',
    'the door better appreciate this',
    'note the exit. note it twice',
  ],
  // 27. reverent fear
  [
    'places like this are not empty. they are kept',
    'kept like a room nobody is allowed in',
    'am i allowed. was i ever',
    'somebody swept this place of every living thing. on purpose',
    'you do not clean a room unless someone is coming',
    'the dust is undisturbed. the dust is obeying',
    'keepers do not want seeing. i did not see any keeper',
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
    'the walls are too still. walls are always still. these are worse',
    'count to ten. one. two. three. where was i',
    'words are coming out in the wrong order now. fine. fine',
    'do not say that word again. which word. exactly',
    'say something else. say anything else',
    'exit. now. words later',
  ],
  // 29. forced calm
  [
    'deep breath. this is fine',
    'the floor is empty and i am fine',
    'repeating it does not make it truer',
    'but my boots keep moving, so credit where due',
    'i am fine. the floor is not. that is the difference',
    'whatever this is, i am not its audience',
    'i catalog what i can control. boots. direction. pace',
    'the rest of it is not mine to carry. leave it on the floor',
    'calm is a tool. i am using the tool. the tool is slipping',
    'last look back. do not. do not look back',
  ],
  // 30. dawning
  [
    'first the mobs were missing',
    'then the noise was missing',
    'then, quietly, i stopped expecting either',
    'that is when it clicked. this place is not missing anything',
    'it is finished. everything here is finished',
    'you can hear a room finish. it sounds like nothing at all',
    'i am walking through the last page of a book',
    'the ending happened before i arrived. i got the silence',
    'some floors die. this one died whole',
    'walk. walk like the finished can not see you',
  ],
];

// ─── VICTORY CAPTIONS (the "different congratulations caption") ─────────────
// The victory card looks like the regular encounter victory card; only the
// congratulation changes. No kills implied, no fight referenced, dash-free.
const VICTORY_CAPTIONS = [
  { card: 'you made it through', text: '✅ *You made it through.*\n_nothing crossed your path... you walked out anyway. the run ends here._' },
  { card: 'still standing', text: '✅ *Still standing.*\n_the floor never showed you what it was. the run ends here._' },
  { card: 'you walked out alive', text: '✅ *You walked out alive.*\n_whatever this place was, it let you leave. the run ends here._' },
  { card: 'survived the quiet', text: '✅ *Survived.*\n_no fight, no spoils... just the way out. the run ends here._' },
  { card: 'the silence let you go', text: '✅ *You lived through it.*\n_the silence never got its answer. the run ends here._' },
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

/** Rotate the victory congratulation the same way (per chat). */
function pickVictory(chatId) {
  const n = VICTORY_CAPTIONS.length;
  if (!n) return VICTORY_CAPTIONS[0];
  const idx = pickSequence(`${chatId}|victory`);
  return VICTORY_CAPTIONS[idx % n];
}

/**
 * Wrap one thought in the encounter's message-box formatting.
 * @param {string} thought
 * @returns {string}
 */
function formatThought(thought) {
  return `_*「 ${String(thought).trim()} 」*_`;
}

module.exports = { DEAD_WORLD_SEQUENCES, VICTORY_CAPTIONS, pickSequence, pickVictory, formatThought };
