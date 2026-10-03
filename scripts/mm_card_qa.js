#!/usr/bin/env node
// Visual QA renders: leaderboard card (full 10 / overflow 9+more / empty) + lobby card with fee
const path = require('path');
const fs = require('fs');
const cards = require(path.join(__dirname, '..', 'core', 'games', 'murdermystery', 'cards.js'));
const OUT = process.env.MM_QA_OUT || path.join(__dirname, '..', '..', 'mm_card_qa_out');
fs.mkdirSync(OUT, { recursive: true });

function rows(n, startScore = 60) {
  const names = ['Mell', 'Lapis', 'Tanluffy', 'Shadow', 'Raven', 'Crow', 'Vesper', 'Sable', 'Onyx', 'Umbra', 'Dusk'];
  return Array.from({ length: n }, (_, i) => ({
    rank: i + 1,
    name: names[i % names.length],
    score: startScore - i * 4,
    wins: 6 - (i % 4),
    games: 8 - (i % 3),
    winRate: 62 - i * 3,
    tag: [i % 3 ? `${(11 - i) % 6} kills` : '', i % 2 ? `${i % 3} saves` : ''].filter(Boolean).join(' · '),
    you: i === 4,
  }));
}

(async () => {
  // full board, 10 rows, no overflow
  const full = await cards.renderLeaderboardCard({ manorName: 'BLACKVALE MANOR', rows: rows(10), totalTracked: 10 });
  fs.writeFileSync(path.join(OUT, 'lb_full.png'), full);

  // overflow: 9 rows + "…and N more" line
  const over = await cards.renderLeaderboardCard({ manorName: 'BLACKVALE MANOR', rows: rows(9), totalTracked: 23 });
  fs.writeFileSync(path.join(OUT, 'lb_overflow.png'), over);

  // empty ledger
  const empty = await cards.renderLeaderboardCard({ manorName: 'BLACKVALE MANOR', rows: [], totalTracked: 0 });
  fs.writeFileSync(path.join(OUT, 'lb_empty.png'), empty);

  // lobby card with the prize line
  const lobby = await cards.renderLobbyCard({
    manorName: 'BLACKVALE MANOR',
    playerCount: 3, minPlayers: 4, maxPlayers: 11,
    openingLine: 'Old money. Older secrets.',
    prefix: '.j',
    prize: 17500,
  });
  fs.writeFileSync(path.join(OUT, 'lobby_prize.png'), lobby);

  console.log('rendered: lb_full, lb_overflow, lb_empty, lobby_prize ->', OUT);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
