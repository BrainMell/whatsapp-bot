'use strict';
// 🀄 MAHJONG SOLITAIRE for the bot (2026-11-28).
//   .j mj                  start / show your board        .j mj 87 112   match two free tiles (by their gold number)
//   .j mj 87 112 3 9       several pairs in one message   plain "87 112" also works while you have a game running
//   .j mj hint | undo | shuffle | board | end | top | help
// One game per player per chat. Deals are always solvable; if you run out of moves the board reshuffles itself.
const T = require('./tiles');
const R = require('./render');
const system = require('../../utils/system');

const games = new Map();               // `${chat}|${jid}` -> game
const IDLE_MS = 60 * 60 * 1000;
const FREE_SHUFFLES = 3;
const norm = (j) => String(j || '').split('@')[0].split(':')[0];
const key = (chatId, jid) => `${chatId}|${norm(jid)}`;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function get(chatId, jid) {
  const k = key(chatId, jid); const g = games.get(k);
  if (g && Date.now() - g.touched > IDLE_MS) { games.delete(k); return null; }
  return g || null;
}
const alive = (g) => g.tiles.filter((t) => t.alive);
const secs = (g) => Math.floor((Date.now() - g.startedAt) / 1000);
const info = (g) => ({ sub: g.name, left: alive(g).length, score: g.score, moves: g.moves, time: fmt(secs(g)) });

function scoreOf(jid) { return system.get('mahjong_scores', {})[norm(jid)] || null; }
function record(g, jid, won) {
  try {
    const all = system.get('mahjong_scores', {}); const k = norm(jid);
    const r = all[k] || (all[k] = { name: g.name, played: 0, wins: 0, bestScore: 0, bestTime: 0 });
    r.name = g.name; r.played += 1;
    if (won) { r.wins += 1; r.bestScore = Math.max(r.bestScore, g.score); r.bestTime = r.bestTime ? Math.min(r.bestTime, secs(g)) : secs(g); }
    system.set('mahjong_scores', all);
  } catch (e) { /* stats are best-effort */ }
}

function applyMatch(g, a, b) {
  g.stack.push({ a: a.id, b: b.id, score: g.score, combo: g.combo, lastAt: g.lastAt });
  a.alive = false; b.alive = false;
  const now = Date.now(); g.combo = now - g.lastAt < 12000 ? g.combo + 1 : 1; g.lastAt = now;
  const gain = 100 + Math.min(g.combo - 1, 10) * 10;
  g.score += gain; g.moves += 1; g.hint = null;
  return gain;
}

const HELP = (p) => `🀄 *MAHJONG SOLITAIRE*\nClear all 144 tiles by matching pairs of *free* tiles (nothing on top, and an open left or right side). Free tiles have a gold number.\n\n` +
  `• \`${p} mj\` - start / show your board\n• \`${p} mj 87 112\` - match two tiles (or just send \`87 112\`)\n• \`${p} mj 87 112 3 9\` - several pairs at once\n` +
  `• \`${p} mj hint\` (-25) · \`undo\` (-50) · \`shuffle\` (-100) · \`board\` · \`end\` · \`top\`\n\n` +
  `🌸 any flower matches any flower, 🍂 any season matches any season.\n🔥 Chain matches within 12s for combo bonuses. Stuck? The board reshuffles itself (${FREE_SHUFFLES}x free).\n💰 Clearing the board pays Zeni.`;

async function handle(c) {
  const { sock, chatId, m, lowerTxt, prefix, senderJid } = c;
  const mark = c.mark || '';
  const p = String(prefix || '').toLowerCase();
  if (!lowerTxt.startsWith(p + ' ')) return false;
  const rest = c.txt.slice(p.length).trim();
  const word = rest.split(/\s+/)[0].toLowerCase();
  if (!['mj', 'mahjong', 'mahjongg', 'mahjhong'].includes(word)) return false;
  const args = rest.slice(word.length).trim().toLowerCase();
  const name = m.pushName || 'Player';
  const say = (text) => sock.sendMessage(chatId, { text: mark + text }, { quoted: m });
  const react = (e) => sock.sendMessage(chatId, { react: { text: e, key: m.key } }).catch(() => {});

  if (args === 'help' || args === '?') { await say(HELP(prefix)); return true; }
  if (args === 'top' || args === 'lb' || args === 'leaderboard') { await say(leaderboard()); return true; }
  if (args === 'end' || args === 'quit' || args === 'stop') {
    const g = get(chatId, senderJid);
    if (!g) { await say('No Mahjong game running. Start one with `' + prefix + ' mj`.'); return true; }
    games.delete(key(chatId, senderJid)); record(g, senderJid, false);
    await say(`🀄 Game ended with ${alive(g).length} tiles left and ${g.score} pts.`); return true;
  }
  let g = get(chatId, senderJid);
  if (!g && (args === '' || args === 'start' || args === 'new')) { await start(c, name); return true; }
  if (!g) { await say('No Mahjong game running. Start one with `' + prefix + ' mj`.'); return true; }
  g.touched = Date.now(); g.name = name;

  if (args === '' || args === 'start' || args === 'board' || args === 'show') { await sendBoard(c, g, `🀄 ${alive(g).length} tiles left - match two numbered tiles: \`${prefix} mj 87 112\``); return true; }
  if (args === 'new') { games.delete(key(chatId, senderJid)); await start(c, name); return true; }

  if (args === 'hint' || args === 'h') {
    const mv = T.movesOf(alive(g));
    if (!mv.length) { await reshuffleIfStuck(c, g); return true; }
    // prefer a pair that frees the most tiles - cheap proxy: pick the one with the highest total z
    mv.sort((x, y) => (y[0].z + y[1].z) - (x[0].z + x[1].z)); const [a, b] = mv[0];
    g.score = Math.max(0, g.score - 25); g.hint = [a.id, b.id];
    await sock.sendMessage(chatId, { image: R.still(g.tiles, info(g), { hint: g.hint, pulse: 0 }), caption: mark + `💡 Try *${a.id}* and *${b.id}* (-25)` }, { quoted: m });
    return true;
  }
  if (args === 'undo' || args === 'u') {
    const s = g.stack.pop();
    if (!s) { await say('Nothing to undo.'); return true; }
    for (const t of g.tiles) if (t.id === s.a || t.id === s.b) t.alive = true;
    g.score = Math.max(0, s.score - 50); g.combo = 0; g.lastAt = 0; g.moves = Math.max(0, g.moves - 1);
    await sendBoard(c, g, '↩️ Undone (-50)'); return true;
  }
  if (args === 'shuffle' || args === 's') {
    g.score = Math.max(0, g.score - 100);
    await doShuffle(c, g, '🔀 Shuffled (-100)'); return true;
  }

  // ---- moves ----
  const nums = (args.match(/\d+/g) || []).map(Number);
  if (!nums.length || nums.length % 2) { await say(`Send two tile numbers per match, e.g. \`${prefix} mj 87 112\`. \`${prefix} mj help\` for the rules.`); return true; }
  await playPairs(c, g, nums);
  return true;
}

/** plain "87 112" (no prefix) while the player has a game running */
function wantsPlain(chatId, jid, txt) {
  if (!/^\s*\d{1,3}(?:\s*[ ,.\-+&]\s*\d{1,3})+\s*$/.test(String(txt || ''))) return false;
  const n = String(txt).match(/\d+/g); if (n.length % 2) return false;
  return !!get(chatId, jid);
}
async function handlePlain(c) {
  const g = get(c.chatId, c.senderJid); if (!g) return false;
  g.touched = Date.now(); g.name = c.m.pushName || g.name;
  await playPairs(c, g, String(c.txt).match(/\d+/g).map(Number));
  return true;
}

async function playPairs(c, g, nums) {
  const { sock, chatId, m } = c; const mark = c.mark || '';
  const say = (text) => sock.sendMessage(chatId, { text: mark + text }, { quoted: m });
  const done = []; let lastClip = null; let err = null;
  for (let i = 0; i < nums.length; i += 2) {
    const [x, y] = [nums[i], nums[i + 1]];
    const a = g.tiles.find((t) => t.id === x), b = g.tiles.find((t) => t.id === y);
    if (!a || !b || x === y) { err = `❌ ${x} and ${y} aren't two different tiles (numbers are 1-144).`; break; }
    if (!a.alive || !b.alive) { err = `❌ Tile ${!a.alive ? x : y} is already gone.`; break; }
    const al = alive(g);
    if (!T.isFree(a, al) || !T.isFree(b, al)) { err = `🔒 Tile ${!T.isFree(a, al) ? x : y} isn't free - it's covered or boxed in on both sides.`; break; }
    if (T.group(a.kind) !== T.group(b.kind)) { err = `❌ ${x} and ${y} don't match.`; break; }
    const before = g.tiles.map((t) => ({ ...t }));
    const bA = before.find((t) => t.id === a.id), bB = before.find((t) => t.id === b.id);
    const gain = applyMatch(g, a, b);
    done.push(gain);
    lastClip = { before, bA, bB, gain };
  }
  if (!done.length) { await sock.sendMessage(chatId, { react: { text: '❌', key: m.key } }).catch(() => {}); if (err) await say(err); return; }

  if (!alive(g).length) { await win(c, g); return; }
  const total = done.reduce((s, v) => s + v, 0);
  const cap = `${done.length > 1 ? `✅ ${done.length} pairs  ` : '✅ '}+${total}${g.combo > 1 ? `  🔥x${g.combo}` : ''}   🀄 ${alive(g).length} left${err ? `\n${err}` : ''}`;
  const stuck = !T.movesOf(alive(g)).length;
  if (stuck) { await reshuffleIfStuck(c, g, cap); return; }
  // one animated clip for single matches; a fresh still for multi-pair messages
  if (done.length === 1 && lastClip) {
    try {
      const mp4 = await R.matchClip(lastClip.before, lastClip.bA, lastClip.bB, info(g), lastClip.gain);
      await sock.sendMessage(chatId, { video: mp4, caption: mark + cap, gifPlayback: true, mimetype: 'video/mp4' }, { quoted: m }); return;
    } catch (e) { console.error('[mahjong] clip failed:', e && e.message); }
  }
  await sendBoard(c, g, cap);
}

async function sendBoard(c, g, caption) {
  const { sock, chatId, m } = c;
  await sock.sendMessage(chatId, { image: R.still(g.tiles, info(g)), caption: (c.mark || '') + caption }, { quoted: m });
}

async function start(c, name) {
  const { sock, chatId, m, senderJid, prefix } = c; const mark = c.mark || '';
  const g = { tiles: T.newDeal(), name, score: 0, moves: 0, combo: 0, lastAt: 0, stack: [], shuffles: 0, startedAt: Date.now(), touched: Date.now(), hint: null };
  games.set(key(chatId, senderJid), g);
  const cap = `🀄 *Mahjong Solitaire* - ${name}\nMatch two *free* tiles (gold number). Send the numbers: \`${prefix} mj 87 112\` or just \`87 112\`.\n\`${prefix} mj help\` for hints, undo & rules.`;
  try { const mp4 = await R.dealClip(g.tiles, info(g)); g.startedAt = Date.now(); await sock.sendMessage(chatId, { video: mp4, caption: mark + cap, gifPlayback: true, mimetype: 'video/mp4' }, { quoted: m }); }
  catch (e) { console.error('[mahjong] deal clip failed:', e && e.message); await sendBoard(c, g, cap); }
}

async function doShuffle(c, g, caption) {
  const { sock, chatId, m } = c; const mark = c.mark || '';
  const before = g.tiles.map((t) => ({ ...t }));
  if (!T.reshuffleAlive(g.tiles)) { await sock.sendMessage(chatId, { text: mark + '⚠️ Could not reshuffle.' }, { quoted: m }); return; }
  g.shuffles += 1; g.stack = []; g.hint = null;
  try { const mp4 = await R.shuffleClip(before, g.tiles, info(g)); await sock.sendMessage(chatId, { video: mp4, caption: mark + caption, gifPlayback: true, mimetype: 'video/mp4' }, { quoted: m }); }
  catch (e) { await sendBoard(c, g, caption); }
}
async function reshuffleIfStuck(c, g, lead = '') {
  const { sock, chatId, m } = c; const mark = c.mark || '';
  if (g.shuffles >= FREE_SHUFFLES + 2) {
    games.delete(key(chatId, c.senderJid)); record(g, c.senderJid, false);
    await sock.sendMessage(chatId, { text: mark + `💀 No more moves and no shuffles left. ${alive(g).length} tiles remained, ${g.score} pts.` }, { quoted: m }); return;
  }
  await doShuffle(c, g, (lead ? lead + '\n' : '') + '🔀 No moves left - reshuffled!');
}

async function win(c, g) {
  const { sock, chatId, m, senderJid, prefix } = c; const mark = c.mark || '';
  const s = secs(g); const bonus = Math.max(0, 1500 - s);
  g.score += bonus;
  const prev = scoreOf(senderJid); const pb = !prev || !prev.bestTime || s < prev.bestTime;
  record(g, senderJid, true); games.delete(key(chatId, senderJid));
  let zeni = Math.min(1500, 400 + Math.floor(g.score / 10));
  try { const economy = require('../rpg/systems/economy/economy'); economy.addMoney(senderJid, zeni, 'Mahjong clear'); } catch (e) { zeni = 0; }
  const lines = [`${g.name}  -  ${fmt(s)}  -  ${g.moves} moves`, `Score ${g.score}  (time bonus +${bonus})${pb ? '  - new best time!' : ''}`];
  const cap = `🏆 *BOARD CLEARED!* ${g.name}\n⏱ ${fmt(s)} · 🎯 ${g.moves} moves · ⭐ ${g.score} pts${zeni ? `\n💰 +${zeni} Zeni` : ''}${pb ? '\n🥇 New personal best time!' : ''}\n\`${prefix} mj\` to play again · \`${prefix} mj top\``;
  try { const mp4 = await R.winClip({ sub: g.name, left: 0, score: g.score, moves: g.moves, time: fmt(s) }, lines); await sock.sendMessage(chatId, { video: mp4, caption: mark + cap, gifPlayback: true, mimetype: 'video/mp4' }, { quoted: m }); }
  catch (e) { await sock.sendMessage(chatId, { text: mark + cap }, { quoted: m }); }
}

function leaderboard() {
  const rows = Object.values(system.get('mahjong_scores', {})).filter((r) => r.wins > 0);
  if (!rows.length) return '🀄 No cleared boards yet. Be the first!';
  rows.sort((a, b) => b.bestScore - a.bestScore);
  return '🀄 *MAHJONG LEADERBOARD*\n' + rows.slice(0, 10).map((r, i) => `${['🥇', '🥈', '🥉'][i] || `${i + 1}.`} ${r.name} - ${r.bestScore} pts · best ${fmt(r.bestTime)} · ${r.wins} clears`).join('\n');
}

module.exports = { handle, handlePlain, wantsPlain, _games: games };
