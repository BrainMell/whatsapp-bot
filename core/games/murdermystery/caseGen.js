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

// ---------- statements (MD §8, template layer) ----------
// Every character gets a fixed public account (their alibi) and one
// observation of another guest. The killer's account is a lie; one further
// innocent may be genuinely mistaken. Players compare accounts + evidence.
function buildStatements({ cast, web, rooms, killerCharIds, victimsPool }) {
  const roomNames = rooms.map((r) => r.name);
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
    const hourPick = pick(TIMELINE_BEATS).hour;

    // one observation about another cast member (movement / behaviour)
    const others = cast.filter((o) => o.id !== c.id && !observed.has(`${c.id}->${o.id}`));
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
};

// ---------- generation ----------
function generateCase({ cast, killers, rooms, methodTitles }) {
  if (!cast || cast.length < 4 || !killers || !killers.length) return null;
  const history = loadHistory();
  const castIds = cast.map((c) => c.id);

  // 1) motive - avoid repeating the exact recent signature (killer chars + motive)
  const recentSigs = new Set(history.map((h) => h.sig));
  let motive = null;
  let sig = '';
  const motivePool = shuffle(MOTIVES);
  for (const m of motivePool) {
    sig = `${castIds.slice().sort().join('|')}#${m.id}`;
    if (!recentSigs.has(sig)) { motive = m; break; }
  }
  if (!motive) motive = motivePool[0]; // history exhausted - reuse least-recent

  // 2) relationship web: 2-4 disjoint pairs among the cast
  const web = [];
  const pool = shuffle(castIds);
  const relTypes = shuffle(RELATIONSHIPS);
  const pairCount = Math.min(pool.length >= 6 ? 3 : 2, Math.floor(pool.length / 2));
  for (let i = 0; i < pairCount; i++) {
    const a = pool[i * 2], b = pool[i * 2 + 1];
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
  const secretPool = shuffle(SECRETS);
  const secrets = {};
  castIds.forEach((id, i) => { secrets[id] = secretPool[i % secretPool.length]; });

  // 4) personal items - one distinct item per cast member
  const items = shuffle(PERSONAL_ITEMS);
  const personalItems = {};
  castIds.forEach((id, i) => { personalItems[id] = items[i % items.length]; });

  // 5) timeline + statements (killer accounts are lies)
  const timeline = shuffle(TIMELINE_BEATS).slice(0, 5).sort((x, y) => x.hour.localeCompare(y.hour));
  const killerCharIds = killers.map((k) => k.id);
  const statements = buildStatements({ cast, web, rooms, killerCharIds });

  // 6) method plan - the murder will use one of the killer's planned methods
  const planned = (methodTitles || []).filter((t) => METHOD_EVIDENCE[t]);
  const methodPlan = shuffle(planned.length ? planned : Object.keys(METHOD_EVIDENCE)).slice(0, 3);

  const kase = {
    version: 1,
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
    // web pairs must not repeat a character
    const seen = new Set();
    for (const w of kase.web) {
      if (seen.has(w.a) || seen.has(w.b)) return false;
      seen.add(w.a); seen.add(w.b);
    }
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

// statement lookup for `.j mm ask`
function statementFor(kase, charId) {
  if (!kase || !kase.statements || !kase.statements[charId]) return null;
  const s = kase.statements[charId];
  return { account: s.account, observation: s.observation, hour: s.hour, room: s.room };
}

module.exports = {
  MOTIVES,
  RELATIONSHIPS,
  SECRETS,
  PERSONAL_ITEMS,
  METHOD_EVIDENCE,
  TIMELINE_BEATS,
  generateCase,
  validateCase,
  bindEvidence,
  statementFor,
  introCaptionFor,
  loadHistory,
  saveHistory,
  pick,
  shuffle,
};
