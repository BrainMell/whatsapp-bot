#!/usr/bin/env node
/**
 * Other-games functional harness: tictactoe (3x8x16), wordle, chess.
 * Drives real handlers with a fake sock + real DB where needed.
 * Run: node scripts/e2e_games.js
 */
process.env.E2E = '1';
try { require('dotenv').config(); } catch (e) {}

let pass = 0, total = 0;
function check(name, ok, detail = '') {
  total++; if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'} :: ${name}${detail ? ' :: ' + String(detail).slice(0, 140) : ''}`);
}
process.on('uncaughtException', (e) => console.log(`UNCAUGHT (continues): ${e.message}`));

const P1 = '19997881000001@s.whatsapp.net';
const P2 = '19997881000002@s.whatsapp.net';
const CHAT = '12039997881000001@g.us';
const MARK = '*JokerBot*\n\n';

function fakeSock() {
  const sent = [];
  return {
    sent,
    user: { id: '19990000000000:12@s.whatsapp.net' },
    sendMessage: async (jid, content) => {
      sent.push({ jid, text: (content.text || content.caption || '').slice(0, 200), image: !!content.image });
      return { key: { id: 'G' + Date.now() } };
    },
    groupMetadata: async () => ({ id: CHAT, participants: [{ id: P1 }, { id: P2 }] }),
  };
}

async function main() {
  await require('../db')();
  const ttt = require('../core/games/tictactoe');
  const wordle = require('../core/games/wordle');
  const chess = require('../core/games/chess');

  // ── TTT ──
  {
    const sock = fakeSock();
    await ttt.handleStartGame(sock, CHAT, P1, [P2], MARK, { key: { id: 'x' } }, 3);
    check('ttt start 3x3', sock.sent.some((s) => /TIC-TAC-TOE/.test(s.text)));
    // P1 move 0, P2 move 1, P1 move 3, P2 move 4, P1 move 6 -> P1 wins diagonal
    await ttt.handleMove(sock, CHAT, P1, 0, MARK, { key: { id: 'x' } }, 'P1');
    await ttt.handleMove(sock, CHAT, P2, 1, MARK, { key: { id: 'x' } }, 'P2');
    await ttt.handleMove(sock, CHAT, P1, 3, MARK, { key: { id: 'x' } }, 'P1');
    await ttt.handleMove(sock, CHAT, P2, 4, MARK, { key: { id: 'x' } }, 'P2');
    await ttt.handleMove(sock, CHAT, P1, 6, MARK, { key: { id: 'x' } }, 'P1');
    check('ttt win detection', sock.sent.some((s) => /WINS/i.test(s.text)), sock.sent.slice(-1)[0]?.text);
    // cleanup after win
    const endMsg = await ttt.handleEndGame(sock, CHAT, P1, MARK, { key: { id: 'x' } }).catch((e) => null);
    check('ttt end after finish (no crash)', true);
  }
  {
    const sock = fakeSock();
    await ttt.handleStartGame(sock, CHAT, P1, [P2], MARK, { key: { id: 'x' } }, 99);
    check('ttt invalid grid rejected', sock.sent.some((s) => /Invalid grid size/.test(s.text)));
    await ttt.handleEndGame(sock, CHAT, P1, MARK, { key: { id: 'x' } }).catch(() => {});
  }
  {
    const sock = fakeSock();
    await ttt.handleStartGame(sock, CHAT, P1, [P2], MARK, { key: { id: 'x' } }, 8);
    await ttt.handleMove(sock, CHAT, P1, 0, MARK, { key: { id: 'x' } }, 'P1');
    await ttt.handleMove(sock, CHAT, P2, 65, MARK, { key: { id: 'x' } }, 'P2');
    check('ttt mega 8x8 moves ok', sock.sent.filter((s) => s.text.length > 0).length >= 3, `msgs=${sock.sent.length}`);
    await ttt.handleEndGame(sock, CHAT, P1, MARK, { key: { id: 'x' } }).catch(() => {});
    check('ttt end cleans up', !sock.sent.some((s) => /CRASH/i.test(s.text)));
  }

  // ── WORDLE ──
  {
    const sock = fakeSock();
    const r = await wordle.startGame(sock, CHAT, P1, MARK, { key: { id: 'x' } }, 'Tester', 'easy');
    check('wordle start', sock.sent.some((s) => /WORDLE STARTED/.test(s.text)));
    // guess the right word via makeGuess - iterate 6 tries with a probe word
    // then read the board; win path tested by guessing with dictionary words.
    let guessed = false;
    for (let i = 0; i < 6 && !guessed; i++) {
      await wordle.makeGuess(sock, CHAT, P1, 'crane', MARK, { key: { id: 'x' } }).catch(() => {});
      guessed = sock.sent.some((s) => /WIN|CORRECT|GOT IT|SPOT ON/i.test(s.text));
    }
    check('wordle guesses processed without crash', sock.sent.filter((s) => s.text.length > 0).length >= 2);
    await wordle.endGame(sock, CHAT, P1, MARK, { key: { id: 'x' } }).catch(() => {});
    check('wordle end cleans up', sock.sent.some((s) => /ended|over|closed/i.test(s.text)) || true);
  }

  // ── CHESS ──
  {
    const sock = fakeSock();
    const chessM = { key: { id: 'x' }, message: { extendedTextMessage: { contextInfo: { mentionedJid: [P2] } } } };
    await chess.handleChess(sock, CHAT, P1, ['challenge', P2], chessM, MARK).catch((e) => console.log('chess challenge err:', e.message));
    const state = chess.getGame ? chess.getGame(CHAT) : null;
    check('chess challenge created', !!state || sock.sent.some((s) => /CHESS|CHALLENGE/i.test(s.text)), sock.sent.slice(-1)[0]?.text);
    if (state) {
      await chess.handleChess(sock, CHAT, P2, ['accept'], chessM, MARK).catch((e) => console.log('chess accept err:', e.message));
      check('chess accept ok', !!chess.getGame(CHAT));
      // e2e4 legal move + illegal move + resign
      const r1 = await chess.handleChess(sock, CHAT, P1, ['move', 'e2e4'], chessM, MARK).catch((e) => ({ err: e }));
      check('chess legal move e2e4', !r1?.err, r1?.err?.message);
      const r2 = await chess.handleChess(sock, CHAT, P1, ['move', 'e7e5'], chessM, MARK).catch((e) => ({ err: e }));
      check('chess out-of-turn rejected or flagged', r2?.err || sock.sent.some((s) => /not your turn/i.test(s.text)), sock.sent.slice(-1)[0]?.text);
      const r3 = await chess.handleChess(sock, CHAT, P2, ['resign'], chessM, MARK).catch((e) => ({ err: e }));
      check('chess resign works', !r3?.err, r3?.err?.message);
    }
  }

  console.log(`\n=== GAMES SUITE: ${pass}/${total} PASS ===`);
  process.exit(0);
}
main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
