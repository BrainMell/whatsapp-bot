// ============================================
// MURDER MYSTERY - CASE GENERATOR (Blackvale Manor)
// Owner 2026-10-12: "update with everything… we are expanding the
// murder mystery game" — implements the uploaded improvement MD §4/§5/§6/§8:
//   - the truth of the mystery exists BEFORE the first night:
//     killer motive, relationship web between the drawn cast,
//     per-character secrets, the evening timeline, alibis
//   - evidence is bound to that truth (never contradicts it),
//     tagged confirmed vs rumour, with public + finder-only layers
//   - every character has a fixed public account + one observation;
//     the killer's account is a lie (comparable against evidence)
//   - replay memory: recent killer/motive/web combinations are avoided
// Template-based (no LLM): every line is composed from curated fragment
// pools, validated before the round starts; on any validation failure the
// caller falls back to the legacy flavor-only round (case = null).
// ============================================

const system = require('../../utils/system');
const botConfig = require('../../../botConfig');

const HISTORY_KEY_BASE = 'murder_mm_case_history';
const HISTORY_MAX = 20;

// ---------- curated fragment pools ----------

// Why the killer kills at Blackvale at all (the case's motive).
const MOTIVES = [
  { id: 'inherit', title: 'the inheritance', detail: 'The manor passes to the last guest standing. The killer intends to be the last guest standing.' },
  { id: 'witness', title: 'the buried witness', detail: 'Years ago someone saw something they should not have. That someone is in this house tonight.' },
  { id: 'debt', title: 'the ruinous debt', detail: 'A debt the killer can never repay comes due at dawn - unless every creditor at the table stops breathing.' },
  { id: 'affair', title: 'the exposed affair', detail: 'Letters exist that would ruin two households. The killer means to outlive every reader.' },
  { id: 'rivalry', title: 'the life\u2019s-work rivalry', detail: 'One career, one reputation, one prize - and the killer has already decided who must not claim it.' },
  { id: 'blackmail', title: 'the blackmailer\u2019s ledger', detail: 'Someone at this table has been bleeding the killer dry for years. Tonight the payments stop - permanently.' },
  { id: 'legacy', title: 'the stolen legacy', detail: 'A name, a patent, a recipe, a title - the killer built a life on something that was never theirs, and the rightful heir just walked in.' },
  { id: 'madness', title: 'the old promise', detail: 'The killer made a vow at a graveside long ago. The manor\u2019s gathering was the appointed hour.' },
  { id: 'jealousy', title: 'the green-eyed hour', detail: 'The killer loved, was refused, and watched the refusal toast and laugh at this very table.' },
  { id: 'crime', title: 'the cover-up', detail: 'The killer\u2019s fortune rests on one awful night years ago. A guest has begun asking the right questions.' },
  // --- Wave 2c web expansion (owner 2026-10-13 16:34Z "expand the Web by alot") ---
  { id: 'vengeance', title: 'the turned-out family', detail: 'Twenty years ago the manor\u2019s gates closed on the killer\u2019s family for good. Tonight the house pays the toll - with interest.' },
  { id: 'will', title: 'the second will', detail: 'Two wills exist in this house and only one is real. The killer needs the other one read aloud before anyone thinks to check it.' },
  { id: 'policy', title: 'the insured life', detail: 'A policy signed last spring makes one death at Blackvale worth more than the killer has earned in a lifetime.' },
  { id: 'household', title: 'the other household', detail: 'The killer keeps a family no paper will admit to. Someone at this table can prove they exist - and has begun to enjoy proving it.' },
  { id: 'powders', title: 'the chemist\u2019s bag', detail: 'The killer\u2019s quiet comes from one guest\u2019s chemist bag - and the price has just changed to something the killer cannot pay.' },
  { id: 'landing', title: 'the landing route', detail: 'For years something has come ashore at Blackvale\u2019s old quay. One guest has been making the ledgers honest, and honesty is dangerous cargo.' },
  { id: 'duel', title: 'the ten paces', detail: 'A duel was fought on this lawn when the guests were young. One shot was never accounted for, and the wound it bought has finally turned.' },
  { id: 'testimony', title: 'the transported brother', detail: 'The killer\u2019s brother was transported for poaching the estate\u2019s land, on the word of one witness. That witness is pouring wine at this table.' },
];

const HALLOWEEN_MOTIVES = [
  { id: 'black_mirror', title: 'the black mirror', detail: 'The host staged a séance to expose a forgery. The killer knew a witness was hidden behind the mirror.' },
  { id: 'seventh_candle', title: 'the seventh candle', detail: 'A private ledger was hidden beneath the ritual table. The killer needed the final candle extinguished before anyone noticed the book was gone.' },
  { id: 'grave_contract', title: 'the grave contract', detail: 'The burial register proves a title was stolen. The killer has lived off that false inheritance, and the real heir has arrived.' },
  { id: 'borrowed_face', title: 'the borrowed face', detail: 'A guest used the masquerade to impersonate a dead relative and claim a fortune. The killer discovered the costume and papers.' },
  { id: 'false_seance', title: 'the false séance', detail: 'Blackvale’s hauntings were staged to frighten a witness into silence. One guest found the hidden equipment and payment ledger.' },
  { id: 'sealed_chapel', title: 'the sealed chapel', detail: 'A chapel key opens a wall safe containing proof of an old crime. The killer needs the key and everyone who knows what it opens silenced.' },
  { id: 'last_invitation', title: 'the last invitation', detail: 'The host invited the same witnesses to Blackvale every Halloween to learn who altered the original will. This year, one arrived with proof.' },
  { id: 'lantern_code', title: 'the lantern code', detail: 'A lantern sequence marked a secret route through the manor. The killer used the old code to reach a locked room without entering the guest book.' },
];

// Relationship web types (MD §5) - public framing + tension line used in
// statements and clues. Composed between two drawn cast members.
const RELATIONSHIPS = [
  { id: 'lovers', label: 'former lovers', frame: (a, b) => `${a} and ${b} were once inseparable - and parted badly enough that neither says the other\u2019s name warmly.` },
  { id: 'partners', label: 'business partners', frame: (a, b) => `${a} and ${b} built a fortune together, and have spent years quietly disputing whose name belongs first on it.` },
  { id: 'family', label: 'family', frame: (a, b) => `${a} and ${b} share blood, an inheritance dispute, and an unsettling family resemblance in their tempers.` },
  { id: 'rivals', label: 'long-standing rivals', frame: (a, b) => `${a} and ${b} have competed for the same prize since their youth, and neither has ever conceded.` },
  { id: 'friends', label: 'former friends', frame: (a, b) => `${a} and ${b} were the closest of friends until one unforgivable autumn came between them.` },
  { id: 'secret', label: 'a shared secret', frame: (a, b) => `${a} and ${b} share a secret so heavy that they barely speak - and watch each other constantly.` },
  { id: 'accounts', label: 'conflicting accounts', frame: (a, b) => `${a} and ${b} tell irreconcilable versions of the same night years ago. Only one of them is lying.` },
  // --- Wave 2c web expansion: each entry MUST have a matching REL_SHORT ---
  { id: 'masterservant', label: 'master and servant', frame: (a, b) => `${a} has kept ${b} in service for years - a kindness at first, then an arrangement, then a grudge with wages.` },
  { id: 'godparent', label: 'a christening bond', frame: (a, b) => `${a} stands godparent to ${b}, and holds ${b}\u2019s inheritance in trust - a trust nobody has audited.` },
  { id: 'creditor', label: 'creditor and debtor', frame: (a, b) => `${a} holds ${b}\u2019s paper - a debt old enough that the interest has outgrown the principal.` },
  { id: 'neighbours', label: 'feuding neighbours', frame: (a, b) => `${a} and ${b} own adjoining land and half a lifetime of boundary disputes.` },
  { id: 'betrothed', label: 'the broken betrothal', frame: (a, b) => `${a} and ${b} were betrothed once; the match was broken by letter, and the letter was never explained.` },
  { id: 'war', label: 'the shared war', frame: (a, b) => `${a} and ${b} survived the same campaign - one of them came home with the other\u2019s discharge papers packed away.` },
  { id: 'tutor', label: 'teacher and pupil', frame: (a, b) => `${a} taught ${b} everything - and has watched ${b} take the credit for all of it.` },
];

// Innocent secrets (MD §12 "unrelated secrets"): reasons innocents lie,
// dodge and look guilty without being killers.
const SECRETS = [
  { id: 'gamble', text: 'is ruined by gambling debts and came to Blackvale to escape a creditor' },
  { id: 'affair', text: 'is carrying on an affair with a married guest - though not the one you might guess' },
  { id: 'forged', text: 'forged a signature once, and the document would still hang them if it surfaced' },
  { id: 'heirloom', text: 'pocketed a family heirloom from the manor\u2019s collection on the first evening' },
  { id: 'illness', text: 'is quietly, gravely ill, and has told no one - the trip to the manor is a last wish' },
  { id: 'column', text: 'writes a scandalous anonymous column that has mocked half of this guest list' },
  { id: 'asylum', text: 'escaped an arrangement - a sanatorium, a family, a contract - to be here tonight' },
  { id: 'debt2', text: 'borrowed heavily from the host and can never repay it' },
  { id: 'identity', text: 'is living under a name that is not the one they were born with' },
  { id: 'theft', text: 'once stole from the very family whose portrait gallery lines this hallway' },
  { id: 'letters', text: 'keeps a bundle of love letters that would detonate two engagements' },
  { id: 'witness', text: 'saw something in the corridor on the first night and has told absolutely no one' },
  // --- Wave 2c web expansion ---
  { id: 'closetmarriage', text: 'is hiding a marriage that was never legal, to a person nobody at this table has ever met' },
  { id: 'wrongman', text: 'served two years for a crime someone else confessed to, and the pardon was never properly signed' },
  { id: 'laudanum', text: 'keeps a bottle of laudanum in their luggage and lies about how quickly it empties' },
  { id: 'deadsign', text: 'signed a dead man\u2019s name to a document once, and the dead man\u2019s family has started asking questions' },
  { id: 'gamebook', text: 'appears in the gamekeeper\u2019s private ledger far more often than any honest dinner guest should' },
  { id: 'accent', text: 'speaks with the accent of a class they were not born into - and one person here finds it amusing' },
  { id: 'stipend', text: 'receives money every quarter from an account nobody will name, and the sums have doubled this year' },
  { id: 'churchyard', text: 'was seen in the churchyard at midnight last week, standing at one particular grave for an hour' },
  { id: 'portrait', text: 'paid to have a portrait removed from the gallery last year, and paid again to have it forgotten' },
  { id: 'deathbed', text: 'sat with the old master through his dying and heard things the will would have wanted said aloud' },
  { id: 'cardnight', text: 'lost the family savings in one night of cards and let a servant take the blame for the theft' },
  { id: 'keyring', text: 'has kept copies of every key in this house since the first winter they stayed - all of them, still working' },
];

const HALLOWEEN_SECRETS = [
  { id: 'fake_medium', text: 'has been faking messages from the dead for money, and the host kept the receipts' },
  { id: 'mask_swap', text: 'swapped two masquerade masks before midnight and insists it was a joke' },
  { id: 'grave_record', text: 'has a copied page from the manor burial register that contradicts the family tree' },
  { id: 'candle_wax', text: 'hid a brass key inside a candle and cannot explain why its wax was found upstairs' },
  { id: 'staged_haunting', text: 'helped stage a famous haunting, but someone was injured and the report was buried' },
  { id: 'costume', text: 'arrived in a missing guest’s costume and cut the name from its lining' },
  { id: 'chapel_key', text: 'borrowed the chapel key and returned a copy made from softened wax' },
  { id: 'will_fragment', text: 'keeps a torn corner of a will showing a signature that should not exist' },
  { id: 'lantern_signal', text: 'used the old lantern code to summon someone to the west wing and refuses to name them' },
  { id: 'cordial', text: 'replaced a ceremonial cordial with an ordinary drink after discovering the host’s private plan' },
  { id: 'buried_letter', text: 'has a letter from the previous host and has never shown it to the family' },
  { id: 'mirror_crack', text: 'knows who cracked the black mirror, but that person paid for their silence before the party began' },
  { id: 'fake_identity', text: 'is using a dead relative’s name to claim a place at the table' },
  { id: 'locked_room', text: 'learned how to open one locked room without its key and demonstrated it only once' },
];

// Personal items: each cast member is assigned one distinct item. It becomes
// the ambiguous "points at a player without naming guilt" clue layer (MD §6).
const PERSONAL_ITEMS = [
  { id: 'perfume_vial', name: 'a crystal perfume vial', art: 'perfume_vial.jpg', hint: 'a trace of expensive perfume' },
  { id: 'pocket_watch', name: 'a cracked pocket watch', art: 'pocket_watch.jpg', hint: 'a watch ticking out of time' },
  { id: 'handkerchief', name: 'a knotted silk handkerchief', art: 'handkerchief.jpg', hint: 'a lace-edged handkerchief, knotted hurriedly' },
  { id: 'locket', name: 'an empty gold locket', art: 'locket.jpg', hint: 'a locket worn open, its portrait long gone' },
  { id: 'thread_spool', name: 'a spool of dark silk thread', art: 'thread_spool.jpg', hint: 'fine dark thread, like tailoring' },
  { id: 'muddy_boots', name: 'boot prints in fresh mud', art: 'muddy_boots.jpg', hint: 'mud drying on good leather' },
  { id: 'brass_key', name: 'a filed brass key', art: 'brass_key.jpg', hint: 'a key whose bit has been recently filed' },
  { id: 'torn_letter', name: 'a torn letter', art: 'torn_letter.jpg', hint: 'letter pieces, torn and re-torn' },
];

// Method -> its physical evidence item (confirmed tier - the weapon at the scene).
const METHOD_EVIDENCE = {
  'poisoned claret': { id: 'claret_goblet', name: 'the claret glass', art: 'claret_goblet.jpg', line: 'A laced glass of claret, still warm on the sill.' },
  'a letter opener': { id: 'letter_opener', name: 'the letter opener', art: 'letter_opener.jpg', line: 'The letter opener never left the writing desk - until tonight.' },
  'piano wire': { id: 'piano_wire', name: 'the piano wire', art: 'piano_wire.jpg', line: 'A length of piano wire, coiled like a snake and warm.' },
  'a long fall': { id: 'locket', name: 'a snagged locket', art: 'locket.jpg', line: 'The balcony rail was worn smooth. Something caught on it - something small and gold.' },
  'a velvet pillow': { id: 'handkerchief', name: 'a silken knot', art: 'handkerchief.jpg', line: 'The velvet still holds the shape of a struggle. A knotted handkerchief does not explain why.' },
  'a candlestick': { id: 'candlestick', name: 'the missing candlestick', art: 'candlestick.jpg', line: 'One candlestick is missing from the candelabra. It is here, and it is heavy.' },
  'laudanum in the nightcap': { id: 'nightcap_cup', name: 'the nightcap cup', art: 'nightcap_cup.jpg', line: 'The nightcap smelled of laudanum and roses. The cup is still half full.' },
  'the cellar stair': { id: 'brass_key', name: 'a filed key', art: 'brass_key.jpg', line: 'The cellar door was supposed to stay locked. Someone fixed that.' },
  'a bouquet of foxglove': { id: 'foxglove_bouquet', name: 'cut foxglove', art: 'foxglove_bouquet.jpg', line: 'Foxglove, cut fresh from the conservatory - and beautiful, and deadly.' },
};

// Timeline beats of the evening (public knowledge). Each case draws 5.
const TIMELINE_BEATS = [
  { hour: '8 pm', text: 'dinner was served in the Dining Room - every seat taken' },
  { hour: '9 pm', text: 'the host raised a toast in the Great Room; glasses were refilled twice' },
  { hour: '10 pm', text: 'the party scattered - cards in the Drawing Room, port in the Library' },
  { hour: '11 pm', text: 'a sheet of music was played in the Music Room; half the house stopped to listen' },
  { hour: 'midnight', text: 'the candles were trimmed; the west wing was locked, supposedly' },
  { hour: '1 am', text: 'the dogs barked once in the yard and then went silent' },
  { hour: '2 am', text: 'the night staff made one last circuit and saw no one in the halls' },
  // --- Wave 2c web expansion ---
  { hour: '7:30 pm', text: 'sherry was taken in the Morning Room before dinner; the rain kept everyone indoors' },
  { hour: '9:30 pm', text: 'the gun case in the Hall was checked and locked - the gamekeeper counts by habit' },
  { hour: '10:30 pm', text: 'one game of billiards was played alone, and badly, the marker says' },
  { hour: '11:30 pm', text: 'a light was seen moving in the cellar passage, though the cellar was locked' },
  { hour: '2:30 am', text: 'the scullery fire was found still burning, and was raked out quietly' },
  { hour: '3:30 am', text: 'the night watchman changed shifts and found the side gate unbolted' },
];

const HALLOWEEN_TIMELINE_BEATS = [
  { hour: '7:30 pm', text: 'the guests arrived in masks; the host checked every invitation against the old register' },
  { hour: '8 pm', text: 'the first candle was lit in the gallery, and the host announced the séance would begin after dinner' },
  { hour: '9 pm', text: 'a masked figure crossed the east gallery while the party watched the clock strike nine' },
  { hour: '9:30 pm', text: 'the host showed the black mirror to three guests, then covered it with a velvet cloth' },
  { hour: '10 pm', text: 'the lights failed briefly; when they returned, a chair had moved beside the chapel door' },
  { hour: '10:30 pm', text: 'someone rang the chapel bell once, although its rope had been cut before the guests arrived' },
  { hour: '11 pm', text: 'the final candle burned blue at its wick, and the host dismissed guests from the ritual room' },
  { hour: '11:30 pm', text: 'a lantern flashed twice in the courtyard, the signal recorded in the gamekeeper’s notebook' },
  { hour: 'midnight', text: 'the west wing was locked; the keeper signed the register, but the ink was still wet at dawn' },
  { hour: '12:30 am', text: 'a tray returned from the gallery with one untouched glass and wax that did not match the candles' },
];

// ---------- helpers ----------
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function historyKey() {
  let id = 'global';
  try { id = botConfig.getBotId() || 'global'; } catch (e) {}
  return `${HISTORY_KEY_BASE}_${id}`;
}

function loadHistory() {
  try { return system.get(historyKey(), []) || []; } catch (e) { return []; }
}

function saveHistory(history) {
  try { system.set(historyKey(), history.slice(-HISTORY_MAX)); } catch (e) {}
}

function minutesFromTime(label) {
  const value = String(label || '').trim().toLowerCase();
  if (value === 'midnight') return 1440;
  if (value === 'noon') return 720;
  const match = value.match(/^([0-9]{1,2})(?::([0-9]{2}))?[ ]*(am|pm)?$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]) % 12;
  if (match[3] === 'pm') hour += 12;
  let total = hour * 60 + Number(match[2] || 0);
  if (match[3] === 'am' && hour < 6) total += 1440;
  return total;
}

// ---------- statements (MD §8, template layer) ----------
// Every character gets a fixed public account (their alibi) and one
// observation of another guest. The killer's account is a lie; one further
// innocent may be genuinely mistaken. Players compare accounts + evidence.
function buildStatements({ cast, web, rooms, killerCharIds, victimsPool, timelineBeats }) {
  const roomNames = rooms.map((r) => r.name);
  const caseBeats = Array.isArray(timelineBeats) && timelineBeats.length ? timelineBeats : TIMELINE_BEATS;
  const statements = {};
  const usedRooms = new Set();
  const observed = new Set(); // a -> b only once

  for (const c of cast) {
    const isKiller = killerCharIds.includes(c.id);
    let room = pick(roomNames);
    let tries = 0;
    // killers avoid the truth by claiming a room far from their habits; innocents may collide
    while (usedRooms.has(room) && tries < 6) { room = pick(roomNames); tries++; }
    usedRooms.add(room);
    const hourPick = pick(caseBeats).hour;

    // one observation about another cast member (movement / behaviour)
    const linkedIds = web.filter((w) => w.a === c.id || w.b === c.id)
      .map((w) => w.a === c.id ? w.b : w.a);
    const linkedOthers = cast.filter((o) => o.id !== c.id && linkedIds.includes(o.id) && !observed.has(c.id + '->' + o.id));
    const others = linkedOthers.length ? linkedOthers : cast.filter((o) => o.id !== c.id && !observed.has(c.id + '->' + o.id));
    const target = others.length ? pick(others) : null;
    if (target) observed.add(`${c.id}->${target.id}`);
    const seeTemplates = [
      `I saw ${target ? target.name : 'someone'} near the stairs past ${hourPick}, though they pretended not to hear me.`,
      `${target ? target.name : 'Someone'} left the room twice that evening and came back pale.`,
      `I heard ${target ? target.name : 'someone'} arguing with the host about papers. Papers.`,
      `${target ? target.name : 'Someone'} was asking the staff which rooms locked from the outside.`,
      `Past ${hourPick} I passed ${target ? target.name : 'someone'} on the gallery stairs, heading the wrong way.`,
    ];
    const seeLine = seeTemplates[Math.floor(Math.random() * seeTemplates.length)];

    statements[c.id] = {
      account: isKiller
        ? `I was in ${room} from ${hourPick} until well after the dogs barked. Ask anyone. Ask no one.`
        : `I was in ${room} from ${hourPick} - the whole time, give or take a candle.`,
      truthful: !isKiller,
      observation: seeLine,
      observedId: target ? target.id : null,
      hour: hourPick,
      room,
    };
  }
  return statements;
}

// ---------- public intro caption (MD §5+§7) ----------
// Composed from the selected web + a secret TEASE. Never reveals roles.
// Works from PERSISTED case state (shortLines map, not closures).
function introCaptionFor(charId, nameMap, kase, charTitle) {
  const name = (nameMap && nameMap[charId]) || 'A guest';
  const w = ((kase && kase.web) || []).find((x) => x.a === charId || x.b === charId);
  if (!w) {
    return `${name}, ${charTitle}, arrived with the first carriages and said less than any guest should.`;
  }
  const otherId = w.a === charId ? w.b : w.a;
  const other = (nameMap && nameMap[otherId]) || 'another guest';
  const short = ((kase && kase.shortLines) || {})[`${w.a}|${w.b}`] || w.frame || '';
  return `${short} ${name} is ${charTitle}.`;
}

// short per-perspective relation lines (used by intros + statements)
const REL_SHORT = {
  lovers: (me, other) => `${other} was once the love of ${me}\u2019s life - the engagement ended, the ring came back, the temper did not.`,
  partners: (me, other) => `${me} and ${other} split a business once and have argued over the remainder ever since.`,
  family: (me, other) => `${other} is family to ${me} - the kind one cannot disown, only endure.`,
  rivals: (me, other) => `${me} has competed against ${other} for most of a lifetime, and lost more of it than they admit.`,
  friends: (me, other) => `${me} and ${other} were inseparable once. One unforgivable autumn ended that.`,
  secret: (me, other) => `${me} and ${other} share a history neither will discuss - and both keep watch over.`,
  accounts: (me, other) => `${me} and ${other} still argue over what really happened that night years ago.`,
  masterservant: (me, other) => `${me} and ${other} are bound in service - one keeps the keys, the other keeps the accounts, and neither trusts the other\u2019s ledger.`,
  godparent: (me, other) => `${me} and ${other} were bound at a christening long ago - an inheritance sits in trust between them, unaudited.`,
  creditor: (me, other) => `${me} and ${other} both know the true size of a certain debt - and count it very differently.`,
  neighbours: (me, other) => `${me} has spent half a lifetime fighting ${other} over a fence line, a stream, and one particular tree.`,
  betrothed: (me, other) => `${me} and ${other} were promised to each other once; the unmaking arrived by letter, unsigned.`,
  war: (me, other) => `${me} and ${other} walked out of the same war - and only one of them walked out clean.`,
  tutor: (me, other) => `${me} and ${other} share a teacher\u2019s debt - everything one of them knows was learned from the other, and the credit never settled.`,
};

// ---------- generation ----------
function generateCase({ cast, killers, rooms, methodTitles, theme = 'classic' }) {
  if (!cast || cast.length < 4 || !killers || !killers.length) return null;
  const isHalloween = theme === 'halloween';
  const history = loadHistory();
  const castIds = cast.map((c) => c.id);

  // 1) motive - avoid repeating the exact recent signature (killer chars + motive)
  const recentSigs = new Set(history.map((h) => h.sig));
  let motive = null;
  let sig = '';
  const motivePool = shuffle(isHalloween ? HALLOWEEN_MOTIVES : MOTIVES);
  for (const m of motivePool) {
    sig = `${castIds.slice().sort().join('|')}#${m.id}`;
    if (!recentSigs.has(sig)) { motive = m; break; }
  }
  if (!motive) motive = motivePool[0]; // history exhausted - reuse least-recent

  // 2) Connected relationship web: no isolated pairs that never link to clues.
  const web = [];
  const pool = shuffle(castIds);
  const relTypes = shuffle(RELATIONSHIPS);
  const pairCount = pool.length;
  for (let i = 0; i < pairCount; i++) {
    const a = pool[i], b = pool[(i + 1) % pool.length];
    const type = relTypes[i % relTypes.length];
    const nameOf = (id) => (cast.find((c) => c.id === id) || {}).name || id;
    web.push({
      a, b, type: type.id, label: type.label,
      frame: type.frame(nameOf(a), nameOf(b)),
      shortFor: (selfId, otherName) => REL_SHORT[type.id](selfId === a ? nameOf(a) : nameOf(b), otherName),
      aName: nameOf(a), bName: nameOf(b),
    });
  }

  // 3) secrets - every character gets one (innocents especially; the killer's
  //    secret must NOT be the motive - the motive is the reason to kill)
  const secretPool = shuffle(isHalloween ? HALLOWEEN_SECRETS : SECRETS);
  const secrets = {};
  castIds.forEach((id, i) => { secrets[id] = secretPool[i % secretPool.length]; });

  // 4) personal items - one distinct item per cast member
  const items = shuffle(PERSONAL_ITEMS);
  const personalItems = {};
  castIds.forEach((id, i) => { personalItems[id] = items[i % items.length]; });

  // 5) timeline + statements (killer accounts are lies)
  const timelinePool = isHalloween ? HALLOWEEN_TIMELINE_BEATS : TIMELINE_BEATS;
  const timeline = shuffle(timelinePool).slice(0, 5).sort((x, y) => minutesFromTime(x.hour) - minutesFromTime(y.hour));
  const killerCharIds = killers.map((k) => k.id);
  const statements = buildStatements({ cast, web, rooms, killerCharIds, timelineBeats: timeline });

  // 6) method plan - the murder will use one of the killer's planned methods
  const planned = (methodTitles || []).filter((t) => METHOD_EVIDENCE[t]);
  const methodPlan = shuffle(planned.length ? planned : Object.keys(METHOD_EVIDENCE)).slice(0, 3);

  const kase = {
    version: 1,
    theme: isHalloween ? 'halloween' : 'classic',
    motifId: motive.id,
    motive,
    web: web.map((w) => ({ ...w, shortFor: undefined })), // functions never persist
    shortLines: web.reduce((acc, w) => {
      acc[`${w.a}|${w.b}`] = REL_SHORT[w.type](w.aName, w.bName);
      acc[`${w.b}|${w.a}`] = REL_SHORT[w.type](w.bName, w.aName);
      return acc;
    }, {}),
    secrets,
    personalItems,
    timeline,
    statements,
    methodPlan,
    evidence: [],       // bound per murder
    introDone: false,   // intro scheduler state (persists; never replayed)
    sig,
  };

  // 7) validation (MD §4: never start an incoherent chapter)
  const ok = validateCase(kase, cast, rooms);
  if (!ok) return null;
  return kase;
}

function validateCase(kase, cast, rooms) {
  try {
    const castIds = new Set(cast.map((c) => c.id));
    const roomIds = new Set(rooms.map((r) => r.id));
    if (!kase.motive || !kase.motive.id) return false;
    if (!kase.web.every((w) => castIds.has(w.a) && castIds.has(w.b) && w.a !== w.b)) return false;
    if (!Object.keys(kase.secrets).every((id) => castIds.has(id))) return false;
    if (!Object.keys(kase.personalItems).every((id) => castIds.has(id))) return false;
    const itemIds = new Set(PERSONAL_ITEMS.map((p) => p.id));
    if (!Object.values(kase.personalItems).every((it) => itemIds.has(it.id))) return false;
    if (!kase.timeline.length || !kase.timeline.every((t) => t.hour && t.text)) return false;
    if (!Object.keys(kase.statements).every((id) => castIds.has(id) && kase.statements[id].account)) return false;
    if (!kase.methodPlan.length || !kase.methodPlan.every((m) => METHOD_EVIDENCE[m])) return false;
    const reached = new Set([cast[0].id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const w of kase.web) {
        if (reached.has(w.a) && !reached.has(w.b)) { reached.add(w.b); changed = true; }
        if (reached.has(w.b) && !reached.has(w.a)) { reached.add(w.a); changed = true; }
      }
    }
    if (reached.size !== castIds.size) return false;
    const caseHours = new Set(kase.timeline.map((t) => t.hour));
    if (!Object.values(kase.statements).every((st) => caseHours.has(st.hour))) return false;
    return true;
  } catch (e) { return false; }
}

// ---------- evidence binding (per murder, from the established truth) ----------
// Public layer = ambiguous; finder layer = sharper, sent privately (MD §6).
// The method item is CONFIRMED; the personal item is RUMOUR and may point at
// an innocent (suspicion is never guilt).
function bindEvidence({ kase, cast, killerCharIds, livingCharIds, room, method, hour }) {
  if (!kase) return null;
  const out = { public: [], finder: null };
  try {
    const methodEv = METHOD_EVIDENCE[method] || null;
    if (methodEv) {
      out.public.push({
        itemId: methodEv.id,
        art: methodEv.art,
        name: methodEv.name,
        tag: 'confirmed',
        line: methodEv.line,
      });
    }
    // personal item of one living character: prefer the killer half the time
    const living = livingCharIds.filter((id) => !killerCharIds.includes(id) || Math.random() < 0.5);
    const pool = (Math.random() < 0.5 && killerCharIds.some((id) => livingCharIds.includes(id)))
      ? killerCharIds.filter((id) => livingCharIds.includes(id))
      : living;
    const chosen = pool.length ? pick(pool) : (livingCharIds[0] || null);
    if (chosen) {
      const item = kase.personalItems[chosen] || pick(PERSONAL_ITEMS);
      const ownerName = (cast.find((c) => c.id === chosen) || {}).name || 'a guest';
      const publicLines = [
        `Near the ${room === 'hallway_a' || room === 'hallway_b' ? 'wainscot' : 'skirting'} lies ${item.name} - dropped, or placed. ${item.hint.charAt(0).toUpperCase() + item.hint.slice(1)}.`,
        `Something was left behind in the hurry: ${item.name}. ${item.hint.charAt(0).toUpperCase() + item.hint.slice(1)}.`,
        `${item.hint.charAt(0).toUpperCase() + item.hint.slice(1)} - and it does not belong to the room.`,
      ];
      const finderLines = [
        `You know this ${item.name.replace(/^a /, '')}. It belongs to ${ownerName}\u2019s world - you have seen it on them. Whether they dropped it, or were meant to be seen dropping it, is the real question.`,
        `You have seen this ${item.name.replace(/^a /, '')} before - with ${ownerName}. You alone noticed. Say it aloud and you accuse them; keep it and you carry it alone.`,
      ];
      out.public.push({
        itemId: item.id,
        art: item.art,
        name: item.name,
        tag: 'rumour',
        line: pick(publicLines),
        linkedCharId: chosen,
      });
      out.finder = {
        itemId: item.id,
        art: item.art,
        name: item.name,
        tag: 'rumour',
        linkedCharId: chosen,
        linkedName: ownerName,
        line: pick(finderLines),
        hour,
      };
    }
  } catch (e) { return out; }
  return out;
}

// ---------- night traces (owner 2026-10-12 22:05Z) ----------
// "Killers must still be able to leave clues even if a guardian saves their
// target or they don't perform an action that turn... the search should still
// lead to clues even if the killer or killers did nothing" + "Increase the
// number of clues that spawn in rooms. Even if nothing happened the night
// before." Every dawn seeds 2-3 case-tied traces across the rooms:
//   saved   -> the interrupted scene lives in the killer's chosen room
//   murder  -> the killer's passage + ambient movement elsewhere
//   quiet   -> the house moved anyway (ambient movement of the living cast)
// Public lines stay ambiguous (item + hint, never the owner's name); a
// sharper finderLine is stored for the searcher's occasional private edge.
const TRACE_LINES = {
  interrupted: [
    (item) => `The visit was interrupted - ${item.name} lies where it was dropped. ${capHint(item.hint)}.`,
    (item) => `Someone was disturbed here in the dark and left in haste: ${item.name}. ${capHint(item.hint)}.`,
    (item) => `A scuffle that never finished - the rug is rucked, a chair still rocks, and ${item.name} was left behind. ${capHint(item.hint)}.`,
    (item) => `The window does not quite latch anymore. On the sill: ${item.name}. ${capHint(item.hint)}.`,
  ],
  passage: [
    (item) => `Whoever came this way in the dark left ${item.name} behind. ${capHint(item.hint)}.`,
    (item) => `${capHint(item.hint)} - found where no guest admits to walking after midnight.`,
    (item) => `The route the household does not walk after dark held a surprise this morning: ${item.name}.`,
  ],
  ambient: [
    (item) => `Overnight, ${item.name} surfaced where it does not belong. ${capHint(item.hint)}.`,
    (item) => `The night staff swept at 2 am - yet here is ${item.name}, fresh-placed. ${capHint(item.hint)}.`,
    (item) => `Past midnight someone passed through. ${capHint(item.hint)} - and the door will not explain itself.`,
    (item) => `${capHint(item.hint)} - and every guest swears the room was empty when they left it.`,
  ],
};
const TRACE_FINDER = [
  (item, owner) => `You know ${item.name} - it belongs to ${owner}\u2019s world. Whether it was dropped, or meant to be found, is the real question.`,
  (item, owner) => `You have seen ${item.name} before - with ${owner}. Say it aloud and you accuse them; keep it and you carry it alone.`,
];

function capHint(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function seedNightTraces({ kase, cast, livingCharIds, killerCharIds, rooms, outcome, killerRoomIdx, bodyRoomIdx, usedItemIds }) {
  if (!kase || !rooms || !rooms.length || !livingCharIds || !livingCharIds.length) return [];
  const nRooms = rooms.length;
  const usedRooms = new Set();
  if (bodyRoomIdx != null && bodyRoomIdx >= 0) usedRooms.add(bodyRoomIdx);
  const usedItems = new Set(Array.isArray(usedItemIds) ? usedItemIds : []);

  const living = livingCharIds.slice();
  const killers = (killerCharIds || []).filter((id) => living.includes(id));

  // pick a living guest's personal item not already spent tonight; the killer's
  // item surfaces more often when their visit was interrupted (still never a
  // guarantee - half the interrupted traces belong to innocents)
  const takeItem = (preferKiller) => {
    for (let tries = 0; tries < 14; tries++) {
      let pool;
      if (preferKiller && killers.length && Math.random() < 0.55) pool = killers.slice();
      else pool = living.filter((id) => !killers.includes(id));
      if (!pool.length) pool = living.slice();
      const id = pick(pool);
      const item = kase.personalItems[id] || pick(PERSONAL_ITEMS);
      if (!usedItems.has(item.id)) {
        usedItems.add(item.id);
        const owner = (cast.find((c) => c.id === id) || {}).name || 'a guest';
        return { item, linkedCharId: id, linkedName: owner };
      }
    }
    return null; // every living personal item already used tonight
  };
  const takeRoom = (force) => {
    if (force != null && force >= 0 && force < nRooms && !usedRooms.has(force)) {
      usedRooms.add(force);
      return force;
    }
    for (let tries = 0; tries < 24; tries++) {
      const r = Math.floor(Math.random() * nRooms);
      if (!usedRooms.has(r)) { usedRooms.add(r); return r; }
    }
    return null; // every room already holds something tonight
  };
  const build = (kind, roomIdx, t) => {
    if (roomIdx == null || !t) return null;
    return {
      roomIdx,
      itemId: t.item.id,
      art: t.item.art,
      name: t.item.name,
      tag: 'rumour',
      line: pick(TRACE_LINES[kind])(t.item),
      linkedCharId: t.linkedCharId,
      linkedName: t.linkedName,
      finderLine: pick(TRACE_FINDER)(t.item, t.linkedName),
      found: false,
    };
  };

  const items = [];
  if (outcome === 'saved' && killerRoomIdx != null && killerRoomIdx >= 0) {
    // the guardian turned the knife - the killer still walked those halls:
    // their interrupted scene keeps two traces in the chosen room
    const t1 = takeItem(true);
    const b1 = build('interrupted', takeRoom(killerRoomIdx), t1);
    if (b1) items.push(b1);
    const t2 = takeItem(false);
    const b2 = build('interrupted', killerRoomIdx, t2);
    if (b2) items.push(b2);
    const t3 = takeItem(false);
    const b3 = build('ambient', takeRoom(null), t3);
    if (b3) items.push(b3);
  } else if (outcome === 'murder') {
    // the body's room already carries its own evidence - the killer's passage
    // and the house's movement seed the OTHER rooms
    const t1 = takeItem(Math.random() < 0.35);
    const b1 = build('passage', takeRoom(null), t1);
    if (b1) items.push(b1);
    const t2 = takeItem(false);
    const b2 = build('ambient', takeRoom(null), t2);
    if (b2) items.push(b2);
  } else {
    // a quiet night - the killer stayed in bed, the house did not
    const count = Math.random() < 0.5 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const t = takeItem(false);
      const b = build('ambient', takeRoom(null), t);
      if (b) items.push(b);
    }
  }
  return items.filter(Boolean);
}

// ---------- the manor's letters (Wave 2b, owner 2026-10-13 09:59Z) ----------
// "during night time, everyone gets the chance to search different rooms for
// rewards and letters that more or less explain the context of why everyone
// is there that night" - a per-case thread of numbered fragments, woven from
// the SAME case truth (motive, web, secrets, timeline, rooms) so the letters
// corroborate the evidence instead of decorating it. Never names the killer.
function buildLetterPool({ kase, cast, rooms }) {
  const out = [];
  try {
    if (!kase || !Array.isArray(rooms) || !rooms.length) return out;
    const names = (cast || []).map((c) => c && c.name).filter(Boolean);
    const nm = (i) => names[i % Math.max(1, names.length)] || 'a guest';
    const room = (i) => rooms[i % rooms.length].name;
    const beats = Array.isArray(kase.timeline) ? kase.timeline.slice() : [];
    const webPairs = Array.isArray(kase.web) ? kase.web.slice() : [];
    const secretTexts = (cast || []).map((c) => (kase.secrets && kase.secrets[c.id] || {}).text).filter(Boolean);

    // 1 - the invitation
    out.push('You were invited. So was everyone else at this table. Funny thing - nobody remembers writing the reply.');
    // 2 - the reason the manor gathers you (the case's own motive, no name attached)
    if (kase.motive && kase.motive.detail) {
      out.push(`So the invitations said, in the host's own hand: "${kase.motive.detail}" Every word of it was true. That is the trouble with this house.`);
    }
    // 3 - the host
    out.push('The host never came down. The staff swear the chair at the head of the table has stood empty for years. Then who poured the wine?');
    // 4-5 - two drawn timeline beats, pinned to rooms
    if (beats.length) {
      const b1 = beats[0];
      out.push(`${b1.hour} - ${b1.text}. Remember that hour. Somebody's story will need it.`);
    }
    if (beats.length > 1) {
      const b2 = beats[1];
      out.push(`${b2.hour} - ${b2.text}. I watched from the landing. Two faces were missing from the room where they should have been.`);
    }
    // 6 - one web pair (public texture, drawn from the case truth)
    if (webPairs.length) {
      const w = webPairs[Math.floor(Math.random() * webPairs.length)];
      out.push(`${w.frame || `${w.aName || nm(0)} and ${w.bName || nm(1)} are bound to each other somehow.`} The house has watched it strain for years.`);
    }
    // 7 - a secret tease (never attributed)
    if (secretTexts.length) {
      const s = secretTexts[Math.floor(Math.random() * secretTexts.length)];
      out.push(`Someone under this roof ${s}. Count the liars before you count the corpses.`);
    }
    // 8 - the rooms keep the rest
    out.push(`The ${room(1)} was locked from the inside for twenty years. Yesterday the key was found in the ${room(2)}. The manor is tidying up. So should you.`);
    // 9 - the closer
    out.push('Why are YOU here? Everyone at this table was chosen. Ask yourself what for - then ask who did the choosing.');
  } catch (e) { /* letters must never break a case */ }
  return out;
}

// statement lookup for `.j mm ask`
function statementFor(kase, charId) {
  if (!kase || !kase.statements || !kase.statements[charId]) return null;
  const s = kase.statements[charId];
  return { account: s.account, observation: s.observation, hour: s.hour, room: s.room };
}

module.exports = {
  MOTIVES,
  HALLOWEEN_MOTIVES,
  HALLOWEEN_SECRETS,
  HALLOWEEN_TIMELINE_BEATS,
  RELATIONSHIPS,
  SECRETS,
  PERSONAL_ITEMS,
  METHOD_EVIDENCE,
  TIMELINE_BEATS,
  generateCase,
  validateCase,
  bindEvidence,
  buildLetterPool,
  seedNightTraces,
  statementFor,
  introCaptionFor,
  loadHistory,
  saveHistory,
  pick,
  shuffle,
};
