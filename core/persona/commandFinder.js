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

const STOP = new Set('a an the and or of to in on for with is are was be do does did can could would should i me my you your we us it its this that these those how what which where when who whom why any some there here please pls just like want need get give make let lets use using command commands cmd bot joker a im ur u so if then than too very really about into as at by from not no yes ok okay hey yo bro dude'.split(' '));

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
      docs.push({ cmd: c.cmd, cat, desc: c.desc || '', usage: c.usage || '', aliases, tf, len: nameT.length * 4 + body.length + catT.length * 0.5, names: [c.cmd.toLowerCase(), ...aliases] });
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
function find(query, k = 3) {
  const ix = _idx || build();
  const base = terms(query);
  if (!base.length) return [];
  // query terms: originals weight 1, synonyms 0.45
  const q = new Map();
  for (const t of base) q.set(t, Math.max(q.get(t) || 0, 1));
  for (const t of tok(query)) for (const s of SYN[t] || []) { const st = STEM(s); if (!q.has(st)) q.set(st, 0.45); }
  const k1 = 1.4, b = 0.7;
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
    if (sc > 0) hits.push({ cmd: d.cmd, cat: d.cat, desc: d.desc, usage: d.usage, score: sc });
  }
  hits.sort((a, b2) => b2.score - a.score);
  const top = hits[0]?.score || 0;
  // confidence gate: drop weak tails and weak winners
  return top < 3.2 ? [] : hits.filter((h) => h.score >= top * (top < 8 ? 0.8 : 0.6)).slice(0, k);
}

// does the message sound like "help me find a command / how do i do X in this bot"?
const ASK_RE = /\b(is there (a|any)|any (command|way)|which command|what command|what'?s the command|whats the command|command (for|to|that)|how (do|can|would|to) (i|you|we|u)|how to|where (do|can) i|can (i|you|we|u) .*(with|using|in) (the )?(bot|joker)|what does .* do|how does .* work|what is .*\bcommand|is it possible to|how u|how do u|is there something)\b/i;
function looksLikeCommandQuestion(text) {
  const t = String(text || '');
  return ASK_RE.test(t) || /\b(command|commands|cmd)\b/i.test(t);
}

/** Compact block for the prompt, or '' when nothing confident. ~25 tokens/command. */
function promptBlock(query, prefix, k = 3) {
  const hits = find(query, k);
  if (!hits.length) return '';
  const p = prefix || '.j';
  const lines = hits.map((h) => `${p} ${String(h.usage || h.cmd).slice(0, 60)} - ${String(h.desc).replace(/\s*\((alias|aliases)[^)]*\)\s*/ig, ' ').slice(0, 140).trim()}`);
  return lines.join('\n');
}

module.exports = { find, promptBlock, looksLikeCommandQuestion, _rebuild: build };
