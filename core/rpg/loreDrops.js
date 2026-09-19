// ═══════════════════════════════════════════════════════════════════════════
//  LORE DROPS — occasional plain-text worldbuilding lines
// ═══════════════════════════════════════════════════════════════════════════
//
//  IMPLEMENTATION of the owner-approved lore drop system (design package:
//  implementation/lore_drop_system.md + lore_drops/*.md, pass 2/3 rulings).
//
//  OWNER CONTRACT (do not break):
//    - Drops are PLAIN CHAT TEXT: `╒ *line* ╛` — framing glyphs are NOT
//      italicized, the text inside is (WhatsApp single-asterisk italics).
//    - NEVER baked into card images or card captions.
//    - NEVER attached to failure/error paths. Success paths only.
//    - NEVER two drops in one reply. One call site per flow.
//    - Never mechanical tells; never bot-persona voice; the word "Kosmion"
//      never appears in drops (map/doc-level name only).
//    - `.j lore` stays untouched — drops link to it, never duplicate it.
//
//  All state is IN-MEMORY (a Map of small strings, lazily pruned) — zero
//  Mongo writes, zero schema change, zero risk to the 450 MB RAM line.
//
//  Pool lines, subtlety pass (owner ruling 2026-09-19): real-RPG voice.
//    - short lines, implication over explanation, no mechanical tells
//    - no em-dashes in player-facing lines, every line <= MAX_LINE_LEN
//    - pool keys and weighting structure unchanged from the approved design
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ─── CONFIG (owner tuning knobs — see implementation/lore_drop_system.md §2) ──
const CONFIG = {
    BASE_CHANCE: 0.10,          // baseline 10% per qualifying interaction
    COOLDOWN_MS: 30 * 60 * 1000, // 30 min per user+chat — the anti-noise gate
    RECENT_RING: 10,            // per-chat ring of recently shown lines
    IMPORTANT_WEIGHT: 0.4,      // "occasionally important" lines land ~2.5x rarer
    MAX_LINE_LEN: 160,          // safety valve (pool lines are kept under this)
};

// ─── POOLS ────────────────────────────────────────────────────────────────────
// Strings = weight 1. { t: 'line', w: 0.4 } = occasionally-important line.
const POOLS = {

    // ── BLACKSMITH (repairCommands, forge-family crafts) ────────────────────
    blacksmith: [
        'Mind the edge. That one bites back. I keep a bandage behind the counter for a reason.',
        'You adventurers bring me more work than a rockslide brings a quarry. Don\'t stop.',
        'My grandfather forged door hinges. I forge things that kill monsters. Progress, I suppose.',
        'That scuff is from a cave floor. I know my cave floors. Deep ones, too.',
        'Everyone wants a legendary blade. Nobody wants to pay for a legendary whetstone.',
        'Don\'t apologize for the blood on the grip. It rinses.',
        'Come back when it\'s raining. The quench sings nicer in the rain.',
        'Third one today with frost damage on the scabbard. Going somewhere cold, are we?',
        'A dull blade is an insult to whoever swings it. Glad you came before it insulted you.',
        'This steel came from below the sixth stratum. Don\'t ask how I know. Don\'t lose it.',
        'Void-touched metal hums if you hold it to your ear at night. Yours is quiet. Be glad.',
        'There was old writing under this guard. I ground it out. Some letters are better off unread.',
        'The good ore vanished from the shallows decades ago. Everything left is deeper than anyone I\'ve mended for has ever been.',
        'I don\'t engrave names on blades anymore. Had a customer pay double to have his scraped off. Wouldn\'t say why.',
        'Apprentice! The bellows! …Forgive him. The lad\'s from the surface. Loud places frighten him.',
        { t: 'The Abyss spits back metal changed. If your edge ever smells like rain in a dry room, you bring it to me first. Not to a shrine. To me.', w: 0.4 },
        { t: 'My cousin went down chasing ore and came up wrong. Some doors open both ways.', w: 0.4 },
        { t: 'A blade that\'s drunk enough monster blood starts remembering. Watch the edge near the fire. If it throws a shadow on its own, retire it.', w: 0.4 },
        { t: 'They say the Divine Spark burns brightest in the hand that works. That\'s why adventurers always find a forge. Some part of you knows.', w: 0.4 },
    ],

    // ── BREWING / COOKING (.j brew, .j cook) ─────────────────────────────────
    brewing: [
        'Stir it widdershins for courage, deosil for sleep. You looked like you needed the sleep.',
        'Don\'t sniff it before you drink it. You\'ll talk yourself out of a cure.',
        'Honey from the high meadows, where nothing blooms that shouldn\'t. Worth the climb.',
        'The secret isn\'t the mushroom. Everyone asks about the mushroom. The secret is patience.',
        'Cooked on apple wood. Iron pots make soup taste like apologies.',
        'One cup for the ache, two for the memory. Don\'t ask which memory. It picks.',
        'I water the herbs with graveyard rain. Best in the county. Nothing grows weeds back there.',
        'You get used to brewing for people who might not come back for the second batch. Mostly.',
        'My cousin tried to ferment cave slime once. The jar is still hissing. We don\'t open that cupboard.',
        'Yes, it smells like wet dog in a thunderstorm. Healing is not a perfume contest.',
        'If you see colors that aren\'t there, they\'re friendly. If you see colors that ARE there, that\'s the ceiling, and you\'ve had enough.',
        'Moon sugar from a world with two moons tastes like Sunday morning. I get one sack a year. One.',
        'There\'s a mushroom down the deep that tastes like your mother\'s kitchen. It\'s a lie. It\'s delicious, and it\'s a lie.',
        'I once brewed for a party of five. Four cups. Nobody ever asked about the fifth.',
        'Elves brewed wine here before your histories had letters. The cellar is older than the road.',
        { t: 'Souls settle in soup, the old texts say. Nonsense, probably. Still, I always set an extra bowl. Costs me nothing.', w: 0.4 },
        { t: 'If your brew ever glows violet instead of gold, pour it on the ground and walk. It isn\'t spoiled. It\'s listening.', w: 0.4 },
        { t: 'Time behaves strangely in the deep kitchens of the world. That\'s all I\'ll say about the honey. Drink your tea.', w: 0.4 },
    ],

    // ── CRAFTING (.j craft, non-forge families) ──────────────────────────────
    crafting: [
        'Careful with the straps the first week. Leather remembers your shoulders. Not kindly.',
        'Made a hundred of these. Still hold my breath on the last stitch.',
        'Good oak, straight grain, no excuses. That\'s all craftsmanship ever was.',
        'Don\'t brag about it in town. Bragging gets it stolen, and I don\'t do reunions.',
        'The glue sets by moonrise. Until then, treat it like a rumor.',
        'Bring it back if the joint creaks in winter. Wood complains honestly. Metal lies.',
        'Measure twice, cut once, swear in between. That\'s the whole guild handbook.',
        'The customer wanted it menacing but approachable. I gave up and added a ribbon.',
        'It\'s not a flaw, it\'s a signature.',
        'You want it enchanted too? Talk to the witch. I make the thing. She makes the thing complicated.',
        'This timber grew over an old battleground. The rings are full of iron flecks. It sings a little when it swings.',
        'The Infection got into the old forests first. Wood from those groves, we don\'t cut. We harvest what falls. Respectfully.',
        'I buy my thread from a peddler who trades between the realms. Don\'t ask which. The thread doesn\'t like being named.',
        'Every workshop keeps one tool it doesn\'t talk about. Mine is the small hammer on the top shelf. It\'s not for using.',
        { t: 'You find things in dungeon rubble that no kingdom minted and no language claims. I fit them into hilts anyway. They hold.', w: 0.4 },
        { t: 'There\'s a rumor the old powers still sit in raw ore. Rubbish, mostly. But I\'ve held ore that sat too still in the fire.', w: 0.4 },
        { t: 'A crafter I knew made one perfect thing and quit the same day. Said his hands knew something the rest of him shouldn\'t.', w: 0.4 },
    ],

    // ── ENCHANTING / RUNES (.j rune socket/fuse/remove/destroy) ──────────────
    enchanting: [
        'Hold still. Runes settle easier on the brave. Fidget and it costs you a week of luck.',
        'Nice clean socket. Whoever drilled this cared. Rare, that.',
        'The glyph likes you. They don\'t always. I\'ve been bitten by a perfectly good protection rune twice.',
        'Two of the same fused make one stronger. Three make something else. We don\'t do threes in this shop.',
        'Warm your hands first. Cold palms make skittish enchantments.',
        'Don\'t polish over it. The shine isn\'t decoration. It\'s the seal breathing.',
        'It hums. No, you can\'t turn it off. It hums loudest when you\'re lying, so watch yourself.',
        'Every rune is a word from before the words. We remember them badly and carve the result.',
        'Runes this deep-cut were made before the Infection. The old cuts don\'t fade.',
        'Some glyphs repeat across every realm. Same mark, worlds that never traded a cup of salt. Don\'t think about it too long.',
        'A removed rune doesn\'t die. It waits in the tray, and it sulks. The tray is lined with felt for a reason.',
        'My master said enchanting is asking politely with fire. Then he asked something impolitely, once. We don\'t keep his chair anymore.',
        { t: 'That glyph isn\'t from any alphabet I stock. It walked in on the item. If it starts to glow near mirrors, come back.', w: 0.4 },
        { t: 'The deep runes answer to a rhythm. You\'ll hear it in your sleep the first week. A ticking, like water. It passes. Usually.', w: 0.4 },
        { t: 'They say the old powers broke into pieces, and the pieces still hold their shapes. I don\'t carve sets. Never carve a set.', w: 0.4 },
    ],

    // ── HEALING (.j heal / hospital / potion use) ────────────────────────────
    healing: [
        'Breathe in. Hold. Out. …Good. Whatever you fought, you outlived it. That\'s the whole treatment today.',
        'Third time this month. I\'m starting to recognize your boots in the hall.',
        'The body wants to live. My job is mostly to stop interrupting it.',
        'You\'ll bruise spectacular colors for a week. Pick a story you like.',
        'Eat something. Healing on an empty stomach is like sailing on an empty river.',
        'The temple pays for adventurers\' bandages from a fund older than the temple. It never runs out. We\'ve stopped asking.',
        'Rest. Not the tavern kind. The kind where the ceiling stays where you left it.',
        'You have exactly the injuries of a man who kicked something that clearly said not to.',
        'No, the potion is not supposed to fizz like that. …It\'s fine. Probably the batch.',
        'Half my patients are adventurers. The other half are adventurers who didn\'t need a healer.',
        'Wounds from below heal slower if you keep looking at them. Not superstition. Charts show it. We don\'t ask why out loud.',
        'Abyss bites close at the same hour they opened, the second night. Plan to be awake that night.',
        'The Infected don\'t come here. Doors open fine, feet just prefer the other way.',
        'Bring me the arrowheads you\'re pulled out with. The drawer is nearly full. I don\'t know what I\'m collecting. Yet.',
        { t: 'You were speaking a language on the table. Not yours. The nurse wrote it down phonetically. If it happens again, ask for me.', w: 0.4 },
        { t: 'A patient from a run below floor ninety healed overnight. Every wound closed at the same heartbeat. Mine beat with his.', w: 0.4 },
        { t: 'Sometimes the dead are brought in breathing. Cold, quiet, breathing. We keep them warm and we don\'t ask.', w: 0.4 },
    ],

    // ── TRADING / MONEY (balance/transfer/deposit/withdraw/buy/sell) ─────────
    trading: [
        'The vault doesn\'t sleep, but the clerks do. Your Zeni kept better watch than we would anyway.',
        'Spend a little on bread, adventurer. Heroes have collapsed in my shop more than bandits have robbed it.',
        'Counted twice, sealed once. It\'s the house that trusts nobody.',
        'Coin\'s heavier when you\'ve earned it slow. That\'s arithmetic, somewhere.',
        'Everything\'s for sale except the scale. The scale is honest. One honest thing per shop is the legal maximum.',
        'Your bank box has a scratch inside the lid. Looks like a tally. We keep it.',
        'Come on market day. Prices are the same but the complaining is free.',
        'You send money faster than the couriers can walk. We\'ve stopped telling them where it\'s going.',
        'No, the mint doesn\'t take trade-ins on regrets. We asked. The answer was a form.',
        'Zeni from the deep dungeons spends fine. The bank just asks that you let the older pieces rest a night before counting.',
        'A merchant paid in coin from a kingdom I\'ve never heard of, and I\'ve heard of all of them. We don\'t keep it overnight.',
        'Bank ledgers here go back six hundred years. Every few decades a page shows a name that was never a customer. The name always has money.',
        'Old coins come up from below with faces worn clean. Collectors pay extra. The faces went somewhere, I say.',
        { t: 'A buyer came through offering triple for dungeon-touched steel. Paid in advance, waited a month, gone. Someone is cataloguing.', w: 0.4 },
        { t: 'There\'s a ledger of who owes whom, beyond money. Debts of rescue, of blood, of last words carried. Same shelf, different clerks.', w: 0.4 },
        { t: 'If anyone ever pays you exactly thirteen coins, count them again. I count everything.', w: 0.4 },
    ],

    // ── GENERAL WORLD (menus tips slot, treasure/event floors) ───────────────
    general_world: [
        'Mind the east road after dusk. The lanterns there gutter in pairs now. Used to be one at a time.',
        'A child drew a map of everywhere today. Nice thing about children\'s maps, the unknown parts look friendly.',
        'The pigeons came back to the bell tower. First time since the bad year. Nobody\'s told the bell ringer. He\'s happy.',
        'Prices on candles again. Everyone\'s burning them at both ends this season.',
        'A traveler paid for his soup with a coin bearing a moon that isn\'t ours. The coin is on the shelf now.',
        'Grandmother says the stars used to be closer. Grandmother also says the stars are holes. Both stories end with knock for luck.',
        'They\'ve repainted the guild hall doors. Third shade of red this year. The paint keeps going somewhere.',
        'The well water tastes of iron on odd days. The well keeper logs it. The log has a column for dreams.',
        'An adventurer\'s map has three colors. Where you\'ve been, where you\'re told not to go, and where you\'re going anyway.',
        'The veterans leave their old boots by the guild door. Nobody\'s counted them. Nobody wants the number.',
        'Rule one of the road, the dungeon doesn\'t chase you. Rule two, everything in it already knows you\'re coming.',
        'You can tell a fresh adventurer by the polished boots. You can tell a survivor by the polished scabbard.',
        'Party rules, posted. Share the loot, share the food, share the watch. The last line is scratched out. It says share the stories.',
        'Old shrines stand at every crossroads. Older, unmarked stones stand just past them. Nobody remembers what the second ones are for.',
        'My grandfather traded with a village that isn\'t there now. Not destroyed. Isn\'t there. He\'s stopped mentioning it. Mostly.',
        'Birds fly around the deep woods like there\'s glass in the sky above it. Feathers land at the edge, all pointing in.',
        'There\'s a night each season when every dog in town watches the same corner of the sky. By morning, nothing.',
        'Cartographers argue whether the far coast curves away or down. The ones who\'ve sailed it just redraw it lower each year.',
        'The old powers broke, the priests say. The mountains disagree politely. Certain peaks have kept a shape no weather explains.',
        { t: 'The sky over the far wastes flickered last week. Not lightning. Flickered. Like a lamp deciding. The astronomers called it nothing.', w: 0.4 },
        { t: 'A star went out and came back dimmer, and every oracle in the city spoke at once. They all said not yet.', w: 0.4 },
        { t: 'The wardens count the dungeons every solstice. The count came back one higher this year. Nobody built one.', w: 0.4 },
    ],

    // ── ABYSS ENCOUNTER POOLS (victory / encounter text, keyed by category) ──
    // Voice rule: the line is spoken by a party-member/fellow adventurer who
    // SAW the encounter. Never the bot persona, never the monster.
    abyss_unknown_creature: [
        'I\'ve never seen a creature like this before. And I\'ve seen the deep bestiaries. Twice.',
        'That\'s not from any world I\'ve walked. Look at the joints. They bend like it\'s apologizing to a different sky.',
        'Whatever that is, it isn\'t infected. This is what it looks like when something is exactly what it\'s supposed to be. Somewhere else.',
        'Don\'t name it. Things from down here answer to their names, and we don\'t know which words are names.',
        'It has a spine like writing. I can\'t read it. I don\'t want to be able to.',
        'The bestiary has a blank page for this one. The blank page has a note. It says: ask the old worlds.',
        'Six legs, three lungs, and eyes like it\'s grading us.',
        'It came out of a tunnel that isn\'t on any map, in a wall that doesn\'t have tunnels. It looked surprised too.',
        'Its shadow moves a half-second late. I\'ve seen that once before, on a thing we never fought. It watched back for an hour.',
        'The lanterns hate it. All four went out politely, like ushers. When they came back, it was closer.',
        'I\'ve fought infected, constructs, void-touched. This is none of those. This is a citizen of somewhere, and we are the intruders.',
        'It hums when it hunts. A tune. A children\'s tune. From a world I\'ve never been to, I hope.',
    ],
    abyss_player: [
        'This isn\'t a monster. It\'s a person.',
        'Why does it have a player\'s build? Boots, pack straps, sword calluses. That\'s not a costume.',
        'It fights like an adventurer. Guard, breathe, riposte. Somebody trained it.',
        'Its gear is real. Mended, patched, worn in. Nothing down here mends.',
        'It had a guild badge. I didn\'t recognize the guild.',
        'I searched the body. Rations. A whetstone. A letter it never sent. I burned the letter.',
        'It said one word before it fell. Sounded like a name. Sounded like it was answering to it.',
        'Don\'t loot the person-shaped ones. The veterans don\'t. Ask them why and they\'ll buy you a drink instead of answering.',
        'It was smiling when we found it. Not mad. Relieved. That\'s worse.',
        'The thing walked like me. Not similar. Like me. Same tired left knee.',
    ],
    abyss_distorted_player: [
        'That looks human. It doesn\'t feel human. Count the fingers. Count them twice.',
        'It wore its helmet like it had never seen a mirror. Everything backwards. The buckle, the gait, the blade hand.',
        'It smiled the whole fight. The way you smile for a portrait you\'ve held too long.',
        'The face was fine. The face was fine. I keep saying it so I stop checking the face.',
        'It talked, mid-swing. Full sentences. Wrong order. Like a memory of a conversation.',
        'Its armor fit. Perfectly. Things down here wear rags and bark. This was tailored.',
        'When it fell, it fell like laundry. No weight. I\'ve killed a hundred things and none of them fell like laundry.',
        'It had a shadow for everyone except itself. I looked away. Professional instinct.',
        'The voice at the end was almost a person\'s. It said finally, the way you\'d say it at the end of a long shift.',
        'It kept getting our names wrong in a way that felt older than a mistake.',
    ],
    abyss_timeline_person: [
        'He wore the guild colors. The old ones, from before the second banner. He called the fortress by its old name too.',
        'She mentioned a war I\'ve never heard of, then mentioned a peace I have. Same names. Different years.',
        'He recognized my sword. Not the make. The scratches. His were different, but he knew where mine would be.',
        'She said the city burned the first time. Nobody corrected her. Nobody wanted to open that door.',
        'His scars were my captain\'s scars, mapped wrong. Same battles, other outcomes.',
        'She was looking for someone. Described them down to the laugh. The name was half a heartbeat off.',
        'He asked how long since the sky flickered. We told him it hasn\'t. He said yet, like a man checking the weather.',
        'The coin she paid me with was our mint. Our face on it. A year that hasn\'t happened.',
        'He thanked me for a kindness I\'ve never done. I said you\'re welcome. What else do you say?',
        'They travel in small groups, the ones from elsewhere. You can tell by how they apologize. For things that haven\'t gone wrong yet.',
    ],
    abyss_self_variant: [
        '…Why does that person have my face?',
        'It had my scar. My scar, from my first dungeon. I got that scar here.',
        'It fought exactly like me. Same openings, same lazy left guard. I\'ve never been parried by my own bad habits before.',
        'We stared at each other a full minute. Then it nodded, like we\'d planned this. We did not plan this.',
        'Mine was kinder. Smiled more. Better with people. I hated it instantly.',
        'It said: you took the left tunnel. That\'s all. It died on that sentence. I take the right tunnels now.',
        'Its kit was mine but older. Better kept. It kept its gear together.',
        'When it fell, I felt it. Not like a wound. Like a page turning somewhere I couldn\'t look.',
        'There were two of me once before, in a nightmare that didn\'t stay a nightmare. I told no one. I\'m telling you.',
        'I checked my own hands after. Left, right, left. All mine. For now.',
    ],

    // ── ENCOUNTER BEATS (pass 3 pool: lore_drops/encounters.md) ──────────────
    // Pool A — fight-openers ("the fight is about to begin" beat)
    encounters_opener: [
        'the fight is about to begin. you can feel it in the floor',
        'something on the other side is done waiting',
        'it steps into the light like it owns the hour',
        'you get one breath before it closes the distance',
        'the air goes flat. here it comes',
        'it was already looking at you before you saw it',
        'dust settles on its shoulders. it has been standing there a while',
        'it stretches, slowly. a courtesy, or an insult',
        'you hear it exhale. then nothing else',
        'it taps its weapon twice. that is the whole speech',
        'the ground remembers fights. this spot is well remembered',
        'it grins like it has already read the ending',
        'no warning. no roar. just intent',
        'the shadows give it up reluctantly',
    ],
    // Pool B — enemy barks (humanoid variants only; deniable, never confirming)
    encounters_bark: [
        '"you again? …no. no, you\'re someone else."',
        '"wrong world. you\'re from the wrong world."',
        '"i had a face like yours. once. maybe."',
        '"keep the spark warm, traveler."',
        '"i remember your footsteps. that\'s all i remember."',
        '"don\'t say my name. i haven\'t picked one yet."',
        '"the deep folds hours like laundry. mind your evenings."',
        '"you\'ll do. you always do."',
        '"one of us walks out of here. the world barely notices which."',
        '"i sold my map years ago. best trade i ever made."',
        '"your banner\'s shade is wrong for this season."',
        '"fight well. someone is probably watching. there usually is."',
    ],
    // Pool C — environmental observations (floor-cleared attach point)
    encounters_env: [
        'the walls here are scarred by something wider than a blade',
        'someone scratched a tally into the stone. it stops mid-stroke',
        'the torches burn a shade colder the deeper you breathe',
        'a single boot, laced, upright. the foot inside it was patient',
        'the dust settles in rings, like something circles here at night',
        'you pass a doorway bricked shut from the other side',
        'the stone hums. five soft notes, then silence, then five again',
        'banners hang here, rank after rank, all cut from the same cloth',
        'the puddle reflects the corridor a heartbeat late',
        'scratch-marks on the ceiling. something walked up there on business',
        'a merchant\'s ledger, water-warped. every price is crossed out twice',
        'the air tastes like the hour before rain. no rain was ever invented here',
        'someone planted a garden down here once. the rows are still straight',
        'the corridor agrees to be a corridor. that feels temporary',
    ],
    // Pool D — NPC-at-peace lines (friendly random NPCs using player sprites)
    encounters_npc: [
        '"mind the third step. it lies."',
        '"i trade in stories. yours isn\'t ripe yet."',
        '"you walk like someone i trained. he was stubborn too."',
        '"the benches here were warmer last cycle. ask the smith."',
        '"i\'m resting. resting is a whole profession down here."',
        '"if you meet me again and i don\'t know you, walk on. it happens."',
        '"the guild sends letters. the abyss sends drafts."',
        '"bottles, bottles. everything is bottles if you look long enough."',
        '"i charted the roads once. the roads objected."',
        '"keep your steel and your kindness close. one of them rusts."',
    ],
};

// ─── RUNTIME STATE (in-memory only) ──────────────────────────────────────────
// cooldowns: Map<"${chatId}:${userId}", lastDropTs>
// recentRing: Map<chatId, string[]> — last RECENT_RING lines shown in that chat
const _cooldowns = new Map();
const _recentRing = new Map();

// Lazy prune: drop cooldown entries older than 2x cooldown when the map
// grows past 512 keys (cheap housekeeping, no timers).
function _pruneCooldowns(now) {
    if (_cooldowns.size < 512) return;
    for (const [k, ts] of _cooldowns) {
        if (now - ts > CONFIG.COOLDOWN_MS * 2) _cooldowns.delete(k);
    }
}

function _pickWeighted(candidates) {
    // candidates: array of {t, w}
    let total = 0;
    for (const c of candidates) total += (c.w || 1);
    let roll = Math.random() * total;
    for (const c of candidates) {
        roll -= (c.w || 1);
        if (roll <= 0) return c;
    }
    return candidates[candidates.length - 1];
}

function formatDrop(line) {
    // Framing glyphs are NOT italicized; the text inside is (WhatsApp italics).
    return `╒ *${line}* ╛`;
}

/**
 * Maybe produce a lore drop for `category`.
 *
 * @param {string} category   pool name (POOLS key)
 * @param {object} [opts]
 * @param {string} [opts.userId]   user jid (cooldown key part)
 * @param {string} [opts.chatId]   chat jid (cooldown key + recent ring)
 * @param {number} [opts.chance]   override probability (default BASE_CHANCE)
 * @param {boolean} [opts.force]   bypass chance gate (cooldown STILL applies;
 *                                 used for one-shot story beats, if ever needed)
 * @returns {string|null} formatted `╒ *line* ╛` or null (no drop this time)
 *
 * Contract: synchronous, never throws, never returns a drop on error.
 */
function maybeDrop(category, opts = {}) {
    try {
        const pool = POOLS[category];
        if (!pool || pool.length === 0) return null;

        const userId = String(opts.userId || 'anon');
        const chatId = String(opts.chatId || 'dm');
        const key = `${chatId}:${userId}`;
        const now = Date.now();

        // 1. Cooldown gate (per user+chat)
        const last = _cooldowns.get(key) || 0;
        if (now - last < CONFIG.COOLDOWN_MS) return null;

        // 2. Chance gate
        const chance = Number.isFinite(opts.chance) ? opts.chance : CONFIG.BASE_CHANCE;
        if (!opts.force && Math.random() >= chance) return null;

        // 3. Build candidates: pool minus recent ring for this chat
        const ring = _recentRing.get(chatId) || [];
        let candidates = [];
        for (const entry of pool) {
            const item = typeof entry === 'string' ? { t: entry, w: 1 } : entry;
            if (!item || typeof item.t !== 'string') continue;
            if (item.t.length > CONFIG.MAX_LINE_LEN) continue;
            if (ring.includes(item.t)) continue;
            // "occasionally important" lines keep their reduced weight
            candidates.push({ t: item.t, w: item.w || 1 });
        }
        if (candidates.length === 0) {
            // Ring exhausted the pool (tiny pool + bad luck): fall back to the
            // full pool so the surface never silently starves.
            for (const entry of pool) {
                const item = typeof entry === 'string' ? { t: entry, w: 1 } : entry;
                if (item && typeof item.t === 'string' && item.t.length <= CONFIG.MAX_LINE_LEN) {
                    candidates.push({ t: item.t, w: item.w || 1 });
                }
            }
            if (candidates.length === 0) return null;
        }

        // 4. Weighted pick (important lines w=0.4 land rarer)
        const picked = _pickWeighted(candidates);

        // 5. Stamp cooldown + ring, return formatted
        _cooldowns.set(key, now);
        _pruneCooldowns(now);
        ring.push(picked.t);
        while (ring.length > CONFIG.RECENT_RING) ring.shift();
        _recentRing.set(chatId, ring);

        return formatDrop(picked.t);
    } catch (e) {
        // Never let flavor break a command.
        try { console.error('[loreDrop] error:', e.message); } catch (_) {}
        return null;
    }
}

/**
 * Route an Abyss victory drop category by encounter reality.
 *
 * V1 heuristic (implementation/abyss.md §3) + V2 variant tags when present:
 *   - enemy.variantTag === 'self'      → abyss_self_variant
 *   - enemy.variantTag === 'distorted' → abyss_distorted_player
 *   - enemy.variantTag === 'timeline'  → abyss_timeline_person
 *   - enemy.variantTag === 'player'    → abyss_player
 *   - no tag (creature) → depth escalation:
 *       floors 1-30   → abyss_unknown_creature only
 *       floors 31-89  → creature (70%) or abyss_timeline_person (30%)
 *       floors 90+/GOD→ creature (55%) / timeline (30%) / self_variant (15%)
 *
 * @returns {string} pool category name (never null — creature pool always legal)
 */
function routeAbyssCategory(enemy, floor) {
    const tag = enemy && enemy.variantTag;
    if (tag === 'self') return 'abyss_self_variant';
    if (tag === 'distorted') return 'abyss_distorted_player';
    if (tag === 'timeline') return 'abyss_timeline_person';
    if (tag === 'player') return 'abyss_player';
    if (tag === 'npc') return 'abyss_player';

    const f = Math.floor(Number(floor) || 1);
    const roll = Math.random();
    if (f >= 90) {
        if (roll < 0.15) return 'abyss_self_variant';
        if (roll < 0.45) return 'abyss_timeline_person';
        return 'abyss_unknown_creature';
    }
    if (f >= 31) {
        if (roll < 0.30) return 'abyss_timeline_person';
        return 'abyss_unknown_creature';
    }
    return 'abyss_unknown_creature';
}

/** Test/debug helper: pool sizes. */
function poolStats() {
    const out = {};
    for (const [k, v] of Object.entries(POOLS)) out[k] = v.length;
    return out;
}

module.exports = {
    CONFIG,
    POOLS,
    maybeDrop,
    routeAbyssCategory,
    formatDrop,
    poolStats,
};
