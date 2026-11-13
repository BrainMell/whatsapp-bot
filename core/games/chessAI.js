'use strict';
// ♟️ Chess engine for the bot's AI mode.
// hard/insane run a REAL UCI engine (Stockfish binary, spawn-per-move, Skill Level mapped) when installed;
// easy/medium and any stockfish failure use the built-in engine:
// negamax + alpha-beta + quiescence + iterative deepening (~150 lines, classic textbook recipe).
// Runs in a worker thread so a long think never blocks the WhatsApp event loop.
//   bestMoveAsync(fen, level, opts) -> Promise<{san, from, to, promotion, score, depth, engine}>
// Levels: easy / medium / hard / insane (depth, time budget and deliberate imprecision differ).

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs');
const { Chess } = require('chess.js');

// ── Stockfish (real UCI engine) for hard/insane ──────────────────────────────────────────
const SF = {
    hard:   { skill: 10, ms: 1200 },
    insane: { skill: 20, ms: 2000 },
};
function sfBin() {
    if (process.env.STOCKFISH_BIN) return process.env.STOCKFISH_BIN;
    // pm2's PATH often lacks /usr/games (Ubuntu apt installs stockfish there) - prefer the absolute path
    try { if (fs.existsSync('/usr/games/stockfish')) return '/usr/games/stockfish'; } catch (e) {}
    return 'stockfish';
}

function stockfishMove(fen, level) {
    const cfg = SF[level];
    return new Promise((resolve, reject) => {
        let p;
        try { p = spawn(sfBin(), [], { stdio: ['pipe', 'pipe', 'ignore'] }); }
        catch (e) { return reject(e); }
        let out = '', settled = false;
        const finish = (fn, arg) => { if (settled) return; settled = true; clearTimeout(timer); try { p.kill('SIGKILL'); } catch (e) {} fn(arg); };
        const timer = setTimeout(() => finish(reject, new Error('stockfish timeout')), cfg.ms + 8000);
        p.on('error', (e) => finish(reject, e));
        p.stdout.on('data', (d) => {
            out += d.toString();
            let i;
            while ((i = out.indexOf('\n')) >= 0) {
                const line = out.slice(0, i); out = out.slice(i + 1);
                const bm = line.match(/^bestmove (\S+)/);
                if (bm) finish(resolve, bm[1]); // UCI form: e2e4 / b7a8q
            }
        });
        p.stdin.write(`uci\nsetoption name Skill Level value ${cfg.skill}\nisready\nposition fen ${fen}\ngo movetime ${cfg.ms}\n`);
    });
}

function stockfishPing(ms = 6000) {
    return new Promise((resolve, reject) => {
        let p;
        try { p = spawn(sfBin(), [], { stdio: ['pipe', 'pipe', 'ignore'] }); }
        catch (e) { return reject(e); }
        let out = '', settled = false;
        const finish = (fn, arg) => { if (settled) return; settled = true; clearTimeout(t); try { p.kill('SIGKILL'); } catch (e) {} fn(arg); };
        const t = setTimeout(() => finish(reject, new Error('no uciok')), ms);
        p.on('error', (e) => finish(reject, e));
        p.stdout.on('data', (d) => {
            out += d.toString();
            if (/uciok/.test(out)) finish(resolve, true);
        });
        p.stdin.write('uci\n');
    });
}

// one-shot availability log at startup (main thread only - workers also load this module)
if (isMainThread) {
    stockfishPing().then(() => console.log('[Chess][AI] Stockfish available - hard/insane use it (classic engine stays on easy/medium + fallback)'))
        .catch((e) => console.log(`[Chess][AI] Stockfish NOT available (${e.message}) - hard/insane fall back to the built-in engine`));
}

// ── built-in classic engine (easy/medium + fallback) ────────────────────────────────────
const LEVELS = {
  easy:   { depth: 1, ms: 500,  margin: 220, qd: 0 },
  medium: { depth: 2, ms: 1500,  margin: 60,  qd: 2 },
  hard:   { depth: 3, ms: 3500, margin: 0,   qd: 4 },
  insane: { depth: 5, ms: 6000, margin: 0,   qd: 6 },
};
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables, row 0 = rank 8 (white's view from the top). Black uses them mirrored.
const PST = {
  p: [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
  n: [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
  b: [[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
  r: [[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
  q: [[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],[0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
  k: [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]],
};
const KING_END = [[-50,-40,-30,-20,-20,-30,-40,-50],[-30,-20,-10,0,0,-10,-20,-30],[-30,-10,20,30,30,20,-10,-30],[-30,-10,30,40,40,30,-10,-30],[-30,-10,30,40,40,30,-10,-30],[-30,-10,20,30,30,20,-10,-30],[-30,-30,0,0,0,0,-30,-30],[-50,-30,-30,-30,-30,-30,-30,-50]];

// score from the point of view of the side to move
function evaluate(game) {
  const board = game.board();
  let score = 0, material = 0;
  for (const row of board) for (const p of row) if (p && p.type !== 'k' && p.type !== 'p') material += VAL[p.type];
  const endgame = material <= 2600;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = board[r][f];
    if (!p) continue;
    const tbl = p.type === 'k' && endgame ? KING_END : PST[p.type];
    const pst = p.color === 'w' ? tbl[r][f] : tbl[7 - r][f];
    const v = VAL[p.type] + pst;
    score += p.color === 'w' ? v : -v;
  }
  return game.turn() === 'w' ? score : -score;
}

const MATE = 100000;
function orderMoves(moves) {
  return moves.map((m) => {
    let s = 0;
    if (m.captured) s += 10 * VAL[m.captured] - VAL[m.piece] / 10 + 1000;
    if (m.promotion) s += VAL[m.promotion] + 900;
    if (m.san.endsWith('+') || m.san.endsWith('#')) s += 50;
    return [s, m];
  }).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
}

function makeSearcher(deadline) {
  let nodes = 0, stopped = false;
  const timeUp = () => { if ((++nodes & 511) === 0 && Date.now() > deadline) stopped = true; return stopped; };
  function quiesce(game, alpha, beta, qd) {
    const stand = evaluate(game);
    if (qd <= 0 || timeUp()) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const caps = orderMoves(game.moves({ verbose: true }).filter((m) => m.captured || m.promotion));
    for (const m of caps) {
      game.move(m);
      const sc = -quiesce(game, -beta, -alpha, qd - 1);
      game.undo();
      if (stopped) return alpha;
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }
  function negamax(game, depth, alpha, beta, ply, qd) {
    if (timeUp()) return 0;
    const moves = game.moves({ verbose: true });
    if (moves.length === 0) return game.inCheck() ? -MATE + ply : 0;
    if (game.isInsufficientMaterial()) return 0;
    if (depth <= 0) return quiesce(game, alpha, beta, qd);
    let best = -Infinity;
    for (const m of orderMoves(moves)) {
      game.move(m);
      const sc = -negamax(game, depth - 1, -beta, -alpha, ply + 1, qd);
      game.undo();
      if (stopped) return best === -Infinity ? 0 : best;
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  return { negamax, isStopped: () => stopped };
}

function findBestMove(fen, level = 'medium') {
  const cfg = LEVELS[level] || LEVELS.medium;
  const game = new Chess(fen);
  const root = orderMoves(game.moves({ verbose: true }));
  if (!root.length) return null;
  if (root.length === 1) return { san: root[0].san, from: root[0].from, to: root[0].to, promotion: root[0].promotion, score: 0, depth: 0 };
  const deadline = Date.now() + cfg.ms;
  let scored = null, doneDepth = 0;
  for (let d = 1; d <= cfg.depth; d++) {
    const s = makeSearcher(deadline);
    const cur = [];
    let alpha = -Infinity;
    for (const m of root) {
      game.move(m);
      // margin>0 (easy/medium): full window per move so near-equal moves can be told apart; otherwise share alpha.
      const sc = -s.negamax(game, d - 1, -Infinity, cfg.margin > 0 ? Infinity : -alpha, 1, cfg.qd);
      game.undo();
      if (s.isStopped()) break;
      cur.push({ m, sc });
      if (cfg.margin === 0 && sc > alpha) alpha = sc;
    }
    if (cur.length === root.length) { scored = cur; doneDepth = d; if (cur.some((x) => x.sc > MATE - 100)) break; }
    else break;
  }
  if (!scored) scored = root.map((m) => ({ m, sc: 0 })); // out of time before depth 1 finished (very slow host)
  scored.sort((a, b) => b.sc - a.sc);
  const top = scored[0].sc;
  let pool = scored.filter((x) => x.sc >= top - cfg.margin);
  if (top > MATE - 100) pool = [scored[0]]; // never throw away a forced mate
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { san: pick.m.san, from: pick.m.from, to: pick.m.to, promotion: pick.m.promotion, score: top, depth: doneDepth };
}

// ── worker plumbing ──────────────────────────────────────────────────────────
if (!isMainThread && workerData && workerData.__chessAI) {
  try { parentPort.postMessage({ ok: true, res: findBestMove(workerData.fen, workerData.level) }); }
  catch (e) { parentPort.postMessage({ ok: false, err: String(e && e.message || e) }); }
}

function classicBestMoveAsync(fen, level = 'medium') {
  return new Promise((resolve, reject) => {
    const cfg = LEVELS[level] || LEVELS.medium;
    let done = false;
    const w = new Worker(__filename, { workerData: { __chessAI: true, fen, level } });
    const kill = setTimeout(() => { if (!done) { done = true; w.terminate(); reject(new Error('ai timeout')); } }, cfg.ms + 6000);
    w.once('message', (m) => { if (done) return; done = true; clearTimeout(kill); w.terminate(); m.ok ? resolve(m.res) : reject(new Error(m.err)); });
    w.once('error', (e) => { if (done) return; done = true; clearTimeout(kill); reject(e); });
  });
}

async function bestMoveAsync(fen, level = 'medium') {
    // hard/insane: real Stockfish when present, built-in engine as fallback (missing binary, crash, timeout)
    if (SF[level]) {
        try {
            const uci = await stockfishMove(fen, level);
            const g = new Chess(fen);
            const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
            return { san: mv.san, from: mv.from, to: mv.to, promotion: mv.promotion, score: 0, depth: SF[level].skill, engine: 'stockfish' };
        } catch (e) {
            console.error(`[Chess][AI] stockfish path failed (${e.message}); falling back to built-in engine`);
        }
    }
    return classicBestMoveAsync(fen, level);
}

module.exports = { findBestMove, bestMoveAsync, classicBestMoveAsync, stockfishPing, evaluate, LEVELS };
