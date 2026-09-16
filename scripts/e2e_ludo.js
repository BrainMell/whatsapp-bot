#!/usr/bin/env node
/**
 * Ludo forfeit E2E harness - drives the real module on Box1 against real Mongo
 * with a fake sock. Tests every abandonment path. Run: node scripts/e2e_ludo.js
 */
process.env.E2E = '1';
try { require('dotenv').config(); } catch (e) {}

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} :: ${name}${detail ? ' :: ' + String(detail).slice(0, 200) : ''}`);
}
process.on('uncaughtException', (e) => console.log(`UNCAUGHT (continues): ${e.message}`));

const P1 = '19997880000001@s.whatsapp.net';
const P2 = '19997880000002@s.whatsapp.net';
const P3 = '19997880000003@s.whatsapp.net';
const CHAT = '12039997880000001@g.us';
const BOT_MARKER = '*JokerBot*\n\n';

function fakeSock() {
  const sent = [];
  return {
    sent,
    sendMessage: async (jid, content) => {
      sent.push({ jid, text: content.text || content.caption || '' });
      return { key: { id: 'LUDOE2E' + Date.now() } };
    },
    profilePictureUrl: async () => null,
  };
}

async function main() {
  await require('../db')();
  const ludo = require('../core/games/ludo');
  const economy = require('../core/rpg/economy');
  const { activeGames, LudoGame } = ludo._internals;

  // cleanup any leftovers from prior runs
  for (const [k] of activeGames) activeGames.delete(k);

  // ensure user docs exist AND are registered (startGame now gates on this)
  for (const p of [P1, P2, P3]) {
    try {
      economy.getOrCreateUser(p);
      if (!economy.isRegistered(p)) economy.registerUser(p, 'LudoTester');
    } catch (e) {}
  }

  // T1 - start 3-player game
  const sock = fakeSock();
  const r1 = await ludo.startGame(sock, CHAT, P1, [P2, P3], BOT_MARKER, { key: { id: 'x' } });
  record('T1 startGame 3p', r1.success === true && activeGames.has(CHAT));
  const game = activeGames.get(CHAT);
  record('T1b colors assigned', game.players.map((p) => p.color).join(',') === 'red,green,yellow', game.players.map((p) => p.color).join(','));

  // T2 - rollDice as current player
  const cur = game.getCurrentPlayer();
  const r2 = await ludo.rollDice(sock, CHAT, cur.fullJid, BOT_MARKER, { key: { id: 'x' } });
  record('T2 rollDice current', r2.success === true && game.lastRoll >= 1 && game.lastRoll <= 6);

  // T3 - rollDice as WRONG player (picked against CURRENT turn at call time)
  const nowCur = ludo._internals.normalizeJid(game.getCurrentPlayer().fullJid);
  const other = game.players.find((p) => ludo._internals.normalizeJid(p.fullJid) !== nowCur);
  const r3 = await ludo.rollDice(sock, CHAT, other.fullJid, BOT_MARKER, { key: { id: 'x' } });
  record('T3 rollDice wrong turn rejected', r3.success === false && /not your turn/i.test(r3.message));

  // T4 - voluntary leave = forfeit, game continues (2 players left)
  const leaver = game.players.find((p) => !game.isForfeited(p) && p !== game.getCurrentPlayer());
  const r4 = await ludo.leaveGame(sock, CHAT, leaver.fullJid, BOT_MARKER, { key: { id: 'x' } });
  const msg4 = sock.sent.map((s) => s.text).join(' ');
  record('T4 leaveGame forfeits', r4.success === true && game.isForfeited(leaver));
  record('T4b forfeit announced', /FORFEIT!/i.test(msg4));
  record('T4c pieces removed', leaver.pieces.every((p) => p.forfeited === true));

  // T5 - nextTurn skips forfeited: force turn onto forfeited player then advance
  game.hasExtraTurn = false;
  game.currentTurnIndex = game.players.indexOf(leaver);
  game.nextTurn();
  record('T5 nextTurn skips forfeited', !game.isForfeited(game.getCurrentPlayer()));

  // T6 - group departure (kick) = forfeit via hook
  const dep = game.players.find((p) => !game.isForfeited(p));
  const survivor = game.players.find((p) => !game.isForfeited(p) && p !== dep);
  await ludo.handleParticipantLeave(sock, CHAT, dep.jid);
  record('T6 participant-leave forfeits', game.isForfeited(dep));

  // T7 - last player standing wins by forfeit, game cleaned up
  record('T7 win-by-forfeit', game.gameOver === true && game.winner === survivor.fullJid && !activeGames.has(CHAT));
  const msg7 = sock.sent.map((s) => s.text).join(' ');
  record('T7b winner announced + reward', /VICTORY BY FORFEIT/i.test(msg7));

  // T8 - economy reward applied to the SURVIVOR (winner by forfeit)
  const wallet = (economy.getUser(survivor.fullJid)?.wallet) || 0;
  record('T8 winner +500 zeni', wallet >= 500, 'wallet=' + wallet);

  // T9 - fresh 2p game: endGame = forfeit
  const chat2 = '12039997880000002@g.us';
  const sock2 = fakeSock();
  const r9 = await ludo.startGame(sock2, chat2, P1, [P2], BOT_MARKER, { key: { id: 'x' } });
  record('T9 startGame 2p', r9.success === true);
  const game2 = activeGames.get(chat2);
  const ender = game2.players.find((p) => p.color === 'green'); // P2 (not starter)
  const r9b = await ludo.endGame(sock2, chat2, ender.fullJid, BOT_MARKER, { key: { id: 'x' } });
  record('T9b endGame by player = forfeit', r9b.success === true && game2.isForfeited(ender) && game2.winner === P1 && !activeGames.has(chat2));

  // T10 - non-player cannot end (grief protection intact)
  const chat3 = '12039997880000003@g.us';
  const sock3 = fakeSock();
  await ludo.startGame(sock3, chat3, P1, [P2], BOT_MARKER, { key: { id: 'x' } });
  const r10 = await ludo.endGame(sock3, chat3, P3, BOT_MARKER, { key: { id: 'x' } });
  record('T10 non-player end blocked', r10.success === false && /Only players/i.test(r10.message));
  const game3 = activeGames.get(chat3);

  // T11 - leaveGame by non-player rejected
  const r11 = await ludo.leaveGame(sock3, chat3, P3, BOT_MARKER, { key: { id: 'x' } });
  record('T11 non-player leave rejected', r11.success === false && /not in this game/i.test(r11.message));

  // T12 - dice+move happy path: force a 6, enter from base
  game3.currentTurnIndex = 0;
  const p1 = game3.players[0];
  game3.lastRoll = 0; game3.consecutiveSixes = 0; game3.hasExtraTurn = false;
  game3.lastRoll = 6;
  const mv = game3.movePiece(p1, 1);
  record('T12 six enters from base', mv.success === true && mv.fromBase === true && p1.pieces[0].position === 0, JSON.stringify(mv));

  // T13 - capture on start occupied by opponent? place P2 piece on pos 0 (unsafe? 0 IS safe) use pos 5
  game3.players[1].pieces[0].inBase = false; game3.players[1].pieces[0].position = 8;
  p1.pieces[0].position = 3; p1.pieces[0].inBase = false;
  game3.lastRoll = 5;
  const mv2 = game3.movePiece(p1, 1);
  record('T13 capture sends back', mv2.success === true && mv2.captured === true && game3.players[1].pieces[0].inBase === true, JSON.stringify(mv2));

  // T14 - wall blocks: two green pieces on pos 20
  game3.players[1].pieces[0].position = 20; game3.players[1].pieces[0].inBase = false;
  game3.players[1].pieces[1].inBase = false; game3.players[1].pieces[1].position = 20;
  p1.pieces[0].position = 18;
  game3.lastRoll = 2;
  const mv3 = game3.movePiece(p1, 1);
  record('T14 wall blocks non-safe', mv3.success === false && /WALL BLOCKED/i.test(mv3.error), JSON.stringify(mv3));

  // T15 - forfeited player cannot roll/move
  game3.forfeitPlayer(p1.jid);
  const r15 = await ludo.rollDice(sock3, chat3, p1.fullJid, BOT_MARKER, { key: { id: 'x' } }).catch(() => ({ success: false, message: '' }));
  record('T15 forfeited roll rejected', r15.success === false);

  // T16 - final forfeit through the EXPORT path cleans game state
  const r16 = await ludo.leaveGame(sock3, chat3, game3.players[1].fullJid, BOT_MARKER, { key: { id: 'x' } });
  record('T16 cascade forfeit cleans up', r16.success === true && !activeGames.has(chat3) && game3.gameOver === true);

  // purge test users from DB (idempotent reruns)
  try {
    const mongoose = require('mongoose');
    const cols = await mongoose.connection.db.listCollections().toArray();
    for (const c of cols) {
      const coll = mongoose.connection.db.collection(c.name);
      for (const q of [{ _id: { $in: [P1, P2, P3] } }, { userId: { $in: [P1, P2, P3] } }, { user: { $in: [P1, P2, P3] } }]) {
        try { await coll.deleteMany(q); } catch (e) {}
      }
    }
  } catch (e) {}

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n=== LUDO FORFEIT SUITE: ${pass}/${results.length} PASS ===`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
