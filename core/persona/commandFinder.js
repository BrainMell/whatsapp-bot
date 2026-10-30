'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  Command finder (owner 2026-10-30): lets Joker answer "is there a command
//  that does X" / "how do i do Y" from the REAL command list, without stuffing
//  the list into the prompt. Retrieval is 100% local (zero tokens):
//    tokenise -> light stem -> synonym expansion -> BM25 over name/alias/desc/
//    usage/category (name hits boosted) -> fuzzy name match (edit distance)
//    -> confidence gate. Only the top few hits (~80 tokens) ever reach the model.
// ═══════════════════════════════════════════════════════════════════════════
const REGISTRY = require('../utils/commandRegistry');

const STOP = new Set('a an the and or of to in on for with is are was be do does did can could would should i me my you your we us it its this that these those how what which where when who whom why any some there here please pls just like want need get give make let lets use using command commands cmd bot joker a im ur u so if then than too very really about into as at by from not no yes ok okay hey yo bro dude check see view show open go put tell about all something someone anyone somebody thing stuff way able'.split(' '));

// tiny thesaurus: user wording -> words the registry actually uses
const SYN = {
  delete: ['remove', 'revoke', 'erase', 'clear', 'purge'], remove: ['delete', 'kick', 'revoke'], kick: ['remove', 'ban'], ban: ['block', 'kick'],
  money: ['zeni', 'coins', 'cash', 'balance', 'wallet', 'economy'], cash: ['zeni', 'money', 'balance'], zeni: ['money', 'coins', 'balance'], coins: ['zeni', 'money'],
  balance: ['wallet', 'money', 'zeni', 'bank'], bank: ['deposit', 'withdraw', 'balance'], rich: ['money', 'leaderboard', 'balance'],
  fight: ['duel', 'pvp', 'battle', 'combat', 'attack'], battle: ['fight', 'duel', 'pvp', 'dungeon'], pvp: ['duel', 'fight', 'battle'], duel: ['pvp', 'fight', 'challenge'],
  monster: ['dungeon', 'boss', 'hunt', 'enemy', 'mob'], hunt: ['monster', 'dungeon', 'adventure'], dungeon: ['adventure', 'monster', 'boss', 'raid'],
  skill: ['ability', 'spell', 'move', 'ultimate', 'ult'], ability: ['skill', 'spell'], spell: ['skill', 'ability'], ultimate: ['ult', 'skill'],
  card: ['cards', 'collection', 'deck', 'gacha'], cards: ['card', 'collection', 'deck'], deck: ['card', 'cards'], shop: ['buy', 'store', 'market', 'eshop', 'purchase'],
  buy: ['shop', 'purchase', 'store'], sell: ['trade', 'market', 'shop', 'auction'], trade: ['swap', 'exchange', 'sell', 'give'], give: ['send', 'transfer', 'gift', 'pay'],
  gift: ['give', 'send', 'transfer'], pay: ['give', 'send', 'transfer'], send: ['give', 'transfer', 'gift'], transfer: ['give', 'send'],
  picture: ['image', 'img', 'photo', 'pic'], pic: ['image', 'img', 'photo'], photo: ['image', 'img', 'picture'], image: ['img', 'picture', 'photo', 'search'],
  sticker: ['s', 'stickers', 'toimg'], video: ['vid', 'tovid', 'clip', 'download'], song: ['audio', 'music', 'play'], music: ['audio', 'song', 'play'],
  search: ['google', 'find', 'lookup', 'look'], google: ['search', 'web', 'lookup'], lookup: ['search', 'google', 'find'], find: ['search', 'lookup', 'locate'],
  group: ['gc', 'chat'], admin: ['mod', 'moderator', 'staff'], mod: ['moderator', 'admin', 'staff'], mute: ['silence', 'timeout'],
  warn: ['warning', 'strike'], link: ['url', 'antilink'], spam: ['antispam', 'flood'], status: ['gstatus', 'story'],
  profile: ['me', 'whois', 'stats', 'info'], stats: ['profile', 'level', 'rank', 'info'], level: ['xp', 'rank', 'exp', 'progression'], xp: ['level', 'exp', 'rank'],
  rank: ['level', 'leaderboard', 'tier'], leaderboard: ['lb', 'top', 'rank', 'ranking'], top: ['leaderboard', 'lb', 'rank'],
  daily: ['reward', 'claim', 'streak'], reward: ['daily', 'claim', 'prize', 'bonus'], claim: ['daily', 'reward', 'collect'],
  guild: ['party', 'clan', 'team', 'guilds'], party: ['guild', 'team', 'group'], clan: ['guild'], summon: ['pet', 'familiar', 'companion', 'minion'], pet: ['summon', 'companion'],
  class: ['job', 'role', 'classes', 'setclass'], job: ['class', 'role'], inventory: ['inv', 'bag', 'items', 'backpack'], bag: ['inventory', 'inv', 'items'], item: ['inventory', 'items', 'equip', 'gear'],
  equip: ['gear', 'wear', 'item', 'armor', 'weapon'], weapon: ['sword', 'gear', 'equip'], gear: ['equip', 'armor', 'weapon', 'item'],
  gamble: ['bet', 'casino', 'slots', 'wager', 'gambling'], bet: ['gamble', 'wager', 'casino'], casino: ['gamble', 'slots', 'blackjack'], game: ['games', 'play', 'minigame'], play: ['game', 'games', 'start'],
  quiz: ['trivia', 'question', 'game'], help: ['menu', 'commands', 'list', 'guide'], menu: ['help', 'commands', 'list'], list: ['menu', 'show', 'commands'],
  nickname: ['name', 'rename', 'alias'], rename: ['nickname', 'name'], name: ['nickname', 'rename'], reset: ['clear', 'wipe', 'forget'], forget: ['reset', 'delete', 'clear'],
  anime: ['manga', 'waifu', 'character'], character: ['charprofile', 'anime', 'profile'], map: ['world', 'atlas', 'location'], travel: ['move', 'go', 'map', 'world'],
  repair: ['fix', 'durability', 'forge', 'blacksmith'], upgrade: ['enhance', 'levelup', 'forge', 'improve'], craft: ['forge', 'make', 'blacksmith'], mine: ['mining', 'ore', 'dig'], fish: ['fishing', 'catch'],
  revive: ['heal', 'respawn', 'resurrect'], heal: ['revive', 'potion', 'hp'], die: ['dead', 'revive', 'death'], afk: ['away', 'idle'], remind: ['reminder', 'timer', 'alarm'],
  translate: ['translation', 'language'], weather: ['forecast', 'temperature'], sound: ['audio', 'voice', 'tts'], voice: ['tts', 'audio', 'speak'],
};

const STEM = (w) => {
  if (w.length > 5 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
  if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && /es$/.test(w) && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
  return w;
};
const tok = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9+ ]+/g, ' ').split(/\s+/).filter(Boolean);
const terms = (s, keepStop) => tok(s).filter((w) => keepStop || (!STOP.has(w) && w.length > 1)).map(STEM);

// Hand-curated intents: the ~45 things people actually ask about. A matching phrase gives its
// commands a big boost, so the common questions are right even when the descriptions use other words.
// [phrase regex, [command names as they appear in the registry]]
const INTENTS = [
  [/\b(balance|how much (money|zeni|cash|gold|coins)|my (money|zeni|wallet|cash)|wallet)\b/, ['balance', 'bal']],
  [/\b(send|give|pay|transfer|gift)\b.*\b(money|zeni|coins|cash|gold|friend|someone|him|her|them|@)/, ['transfer', 'send']],
  [/\b(daily|every ?day|free (reward|money|zeni))/, ['daily']],
  [/\b(rob|steal|mug)\b/, ['rob', 'steal']],
  [/\b(richest|wealth(iest)?|top (money|zeni)|who.?s rich)/, ['rich']],
  [/\b(leaderboard|ranking|top players|who.?s (the )?(top|best|number one))/, ['leaderboard', 'lb']],
  [/\b(fight|duel|pvp|1v1|battle)\b.*\b(player|someone|friend|him|her|them|@|user|person)|\b(duel|pvp|1v1)\b/, ['duel', 'pvp']],
  [/\b(dungeon|quest|adventure|monsters?|boss(es)?|grind)\b/, ['quest', 'solo', 'abyss']],
  [/\b(solo|by myself|alone)\b.*\b(quest|dungeon|adventure)|\b(quest|dungeon|adventure)\b.*\b(solo|alone|by myself)/, ['solo']],
  [/\b(abyss|endless|floors?)\b/, ['abyss', 'abyss enter']],
  [/\b(skills?|abilit(y|ies)|learn (a )?skill|upgrade (my )?skills?)\b/, ['skill', 'skills']],
  [/\b(inventory|my (bag|items|stuff)|backpack)\b/, ['inventory']],
  [/\b(equip|wear|put on)\b|\b(sword|armor|armour|weapon|gear)\b/, ['equip']],
  [/(?<!event )(?<!e)(?<!e-)\b(shop|store)\b(?!.*\b(event|e-?shop)\b)/, ['shop', 'buy']],
  [/\b(event shop|e-?shop|event tokens?|tokens?)\b/, ['eshop', 'tokens', 'tokenlb']],
  [/\b(market|player market|list.*(for sale)|sell (my|an?) (item|rune|summon))/, ['market', 'market sell']],
  [/\b(collection|my cards|card list|cards? i (have|own))\b/, ['coll']],
  [/\b(deck)\b/, ['cdeck']],
  [/\b(auction|bid(ding)?)\b/, ['auction']],
  [/\b(summons?|pets?|companions?|familiars?|eggs?)\b/, ['summon']],
  [/\b(guild|clan)\b/, ['guild create', 'guild join', 'guild info']],
  [/\b(profile|my stats|who am i|my level|my info)\b/, ['profile', 'me']],
  [/\b(rank|adventurer rank)\b/, ['rank']],
  [/\b(sticker|make .*sticker|turn .*(picture|image|photo|video) into)\b/, ['s']],
  [/\b(sticker.*(to|into|back) (an? )?(image|picture|photo)|toimg)\b/, ['toimg']],
  [/\b(google|look ?up|search (the )?(web|internet|online))\b/, ['google']],
  [/\b(images?|pictures?|pics?|photos?)\b.*\b(search|find|get|download)|\b(search|find|get|download)\b.*\b(images?|pictures?|pics?)/, ['img']],
  [/\b(song|music|audio|mp3)\b/, ['audio']],
  [/\b(weather|forecast|temperature)\b/, ['weather']],
  [/\b(gstatus|group status)\b|\bpost .*status\b/, ['gstatus']],
  [/\b(kick|remove|throw out|boot)\b.*\b(member|someone|user|person|him|her|group|chat)\b/, ['kick']],
  [/\b(gamble|gambling|casino|bet|wager)\b/, ['bj', 'roulette', 'dice', 'flip']],
  [/\b(blackjack|21)\b/, ['bj']],
  [/\b(coin ?flip|flip a coin|heads or tails)\b/, ['flip', 'cf']],
  [/\b(fish(ing)?)\b/, ['fish']], [/\b(mine|mining|ores?)\b/, ['mine']], [/\b(hunt(ing)?|animals?)\b/, ['hunt']],
  [/\b(world map|atlas|realms?)\b/, ['world']],
  [/\bmod(erator)?s?\b.*\b(commands?|menu|terminal|panel|list|tools?)\b|\b(commands?|menu|panel)\b.*\b(for|of) (the )?(mods?|moderators?|admins?)\b/, ['mod']],
  [/\b(commands?|menu|help|what can you do|list of)\b/, ['menu', 'help']],
  [/\b(nick ?name|rename|change my name)\b/, ['nickname']],
  [/\b(how (do|to) (i )?(join)|join (a |the )?(quest|fight|dungeon))\b/, ['join']],
];

// ── permission tiers: 'mod' (owner/global mods/staff) > 'admin' (group admin) > 'user'.
const MOD_NAME_RE = /(ban|mute|nuke|reload|mods?$|^addgtester|tester|issue|setrank|removerank|testmode|setmarket|questcap|addstat|resetstats|gcowner|baseadmin|pardon|listmods|setclass|modclass|^setpack|^setauthor|tokenreset|^src$|t2e|^mentor|^instances?$|opscheck|^commit$|^debug$|^diag$|quizmod)/i;
const MOD_DESC_RE = /\b(mods?\+|moderators?|owner|gmod|staff|testers?|card mods?|quiz mods?|rpg mods?|owner\/mod)\b/i;
function tierOf(cat, cmd, desc) {
  if (cat === 'MODERATOR') return 'mod';
  const name = String(cmd || '').toLowerCase().split(' ')[0];
  if (MOD_DESC_RE.test(desc || '') || MOD_NAME_RE.test(name)) return 'mod';
  if (cat === 'ADMIN') return 'admin';
  if (/\badmins?\b/i.test(desc || '') && /only|admins?\+|\(admins?\)/i.test(desc || '')) return 'admin';
  return 'user';
}
const RANK = { user: 0, admin: 1, mod: 2 };
const allowed = (need, level) => RANK[level || 'user'] >= RANK[need];

let _idx = null;
function build() {
  const docs = [];
  for (const [cat, list] of Object.entries(REGISTRY)) {
    if (!Array.isArray(list)) continue;
    for (const c of list) {
      const aliasM = /\((?:alias(?:es)?|alt)[:\s]+([^)]*)\)/i.exec(c.desc || '');
      const aliases = aliasM ? aliasM[1].split(/[,/]|\bor\b/i).map((x) => x.replace(/^\.?j\s+/i, '').trim().toLowerCase()).filter(Boolean) : [];
      const nameT = terms(c.cmd + ' ' + aliases.join(' '), true);
      const body = terms((c.desc || '') + ' ' + (c.usage || ''));
      const catT = terms(cat);
      const tf = new Map();
      const bump = (t, w) => tf.set(t, (tf.get(t) || 0) + w);
      nameT.forEach((t) => bump(t, 4)); body.forEach((t) => bump(t, 1)); catT.forEach((t) => bump(t, 0.5));
      docs.push({ tier: tierOf(cat, c.cmd, c.desc), cmd: c.cmd, cat, desc: c.desc || '', usage: c.usage || '', aliases, tf, len: nameT.length * 4 + body.length + catT.length * 0.5, names: [c.cmd.toLowerCase(), ...aliases] });
    }
  }
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avg = docs.reduce((a, d) => a + d.len, 0) / (docs.length || 1);
  _idx = { docs, df, avg, N: docs.length };
  return _idx;
}

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** @returns {Array<{cmd,cat,desc,usage,score}>} best matches, best first */
function find(query, k = 3, level = 'mod') {
  const r = findRaw(query, k, level);
  return r.hits;
}
/** like find() but also reports when the best match was off-limits for this level */
function findRaw(query, k = 3, level = 'mod') {
  const ix = _idx || build();
  const base = terms(query);
  if (!base.length && !INTENTS.some(([re]) => re.test(String(query).toLowerCase()))) return [];
  // query terms: originals weight 1, synonyms 0.45
  const q = new Map();
  for (const t of base) q.set(t, Math.max(q.get(t) || 0, 1));
  for (const t of tok(query)) for (const s of SYN[t] || []) { const st = STEM(s); if (!q.has(st)) q.set(st, 0.45); }
  const k1 = 1.4, b = 0.7;
  const ql = String(query).toLowerCase();
  const hits = [];
  for (const d of ix.docs) {
    let sc = 0;
    for (const [t, w] of q) {
      const f = d.tf.get(t); if (!f) continue;
      const idf = Math.log(1 + (ix.N - (ix.df.get(t) || 0) + 0.5) / ((ix.df.get(t) || 0) + 0.5));
      sc += w * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / ix.avg));
    }
    // exact / fuzzy command-name bonus ("whats the daly command")
    for (const t of tok(query)) {
      if (t.length < 3 || STOP.has(t)) continue;
      for (const n of d.names) {
        if (n === t) sc += 6; else if (t.length > 4 && lev(n, t) === 1) sc += 3.5; else if (t.length > 5 && lev(n, t) === 2) sc += 1.5;
      }
    }
    // curated intents: big boost for the commands the phrase is known to mean
    for (const [re, names] of INTENTS) { if (re.test(ql) && d.names.some((n) => names.includes(n) || names.includes(n.replace(/\s*[\[<(].*$/, '')))) { sc += 9; break; } }
    if (sc > 0) hits.push({ tier: d.tier, cmd: d.cmd, cat: d.cat, desc: d.desc, usage: d.usage, score: sc });
  }
  hits.sort((a, b2) => b2.score - a.score);
  const top = hits[0]?.score || 0;
  // confidence gate: drop weak tails and weak winners
  if (top < 3.2) return { hits: [], blocked: false };
  const near = hits.filter((h) => h.score >= top * (top < 8 ? 0.8 : 0.6));
  // if the TOP match is off-limits, stop there - never fall through to weaker unrelated commands
  if (!allowed(hits[0].tier, level)) return { hits: [], blocked: true };
  const ok = near.filter((h) => allowed(h.tier, level)).slice(0, k);
  // the best match exists but this person may not know about it -> say so, dont leak it
  return { hits: ok, blocked: !ok.length && near.length > 0 };
}

/** true when the best match for this query is a command this level isnt allowed to know about */
function isRestricted(query, level) { return findRaw(query, 3, level).blocked; }

// does the message sound like "help me find a command / how do i do X in this bot"?
const ASK_RE = /\b(is there (a|any)|any (command|way)|which command|what command|what'?s the command|whats the command|command (for|to|that)|how (do|can|would|to) (i|you|we|u)|how to|where (do|can) i|can (i|you|we|u) .*(with|using|in) (the )?(bot|joker)|what does .* do|how does .* work|what is .*\bcommand|is it possible to|how u|how do u|is there something)\b/i;
function looksLikeCommandQuestion(text) {
  const t = String(text || '');
  return ASK_RE.test(t) || /\b(command|commands|cmd)\b/i.test(t);
}
/** Strong signal even without ASK wording: an intent phrase matched AND it reads like a question. */
function looksLikeBotQuestion(text) {  // (level-agnostic: only decides whether to look)
  const t = String(text || '');
  return /\?|\b(how|where|what|which|can i|is there)\b/i.test(t) && find(t, 1).length > 0 && find(t, 1)[0].score >= 9;
}

/** Compact block for the prompt, or '' when nothing confident. ~25 tokens/command. */
function promptBlock(query, prefix, k = 3, level = 'mod') {
  const hits = find(query, k, level);
  if (!hits.length) return '';
  const p = prefix || '.j';
  const lines = hits.map((h) => `${p} ${String(h.usage || h.cmd).slice(0, 60)} - ${String(h.desc).replace(/\s*\((alias|aliases)[^)]*\)\s*/ig, ' ').slice(0, 140).trim()}`);
  return lines.join('\n');
}

// ── validator: every command name that really exists (registry names + aliases + scanned extras)
let _valid = null;
function tierByName(w) {
  const ix = _idx || build();
  const d = ix.docs.find((x) => x.names.includes(w) || x.names.some((n) => n.split(' ')[0] === w));
  if (d) return d.tier;
  return MOD_NAME_RE.test(w) ? 'mod' : 'user';
}
function validNames() {
  if (_valid) return _valid;
  const ix = _idx || build();
  _valid = new Set();
  for (const d of ix.docs) for (const n of d.names) { _valid.add(n); _valid.add(n.split(' ')[0]); }
  try { for (const x of require('./extraCommands.json')) _valid.add(x); } catch (_) {}
  return _valid;
}

/**
 * Check command mentions in a reply, e.g. ".j daily", ".j rob @x". Returns
 * { bad: [names that dont exist], fixed: reply with near-miss typos corrected }.
 */
function checkReply(text, prefix, level = 'mod') {
  const p = String(prefix || '.j').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[\\s(\"'\`])(${p})\\s+([a-z0-9+]{2,20})`, 'gi');
  const valid = validNames(); const bad = []; let fixed = String(text);
  let m;
  while ((m = re.exec(text)) !== null) {
    const w = m[3].toLowerCase();
    if (valid.has(w)) {
      // exists, but is it off-limits for this person? never repeat it to them
      if (!allowed(tierByName(w), level)) bad.push(w);
      continue;
    }
    let best = null, bd = 3;
    for (const v of valid) { if (v.length < 3) continue; const d = lev(v, w); if (d < bd) { bd = d; best = v; } }
    if (best && bd <= 1 && w.length >= 4) fixed = fixed.replace(new RegExp(`(${p}\\s+)${w}\\b`, 'i'), `$1${best}`);
    else bad.push(w);
  }
  return { bad, fixed };
}

module.exports = { isRestricted, tierOf, looksLikeBotQuestion, checkReply, validNames, find, promptBlock, looksLikeCommandQuestion, _rebuild: build };
