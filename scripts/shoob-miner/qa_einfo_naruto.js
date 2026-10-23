// qa_einfo_naruto.js - post-promote verification: drive the REAL deployed
// cmdInfo (CARD_DIAG hook) with Mellow's exact query shape:
// ".j einfo halloween | naruto" -> cmdInfo(reply, chat, ['halloween | naruto', 'event'], perms)
// Run on box2: CARD_DIAG=1 node scripts/shoob-miner/qa_einfo_naruto.js
'use strict';
const REPO = '/home/ubuntu/whatsapp-bot';
const cardSystem = require(REPO + '/core/rpg/cardSystem.js');

(async () => {
  cardSystem.loadCardsDB(); // populate ALL_CARDS/EVENT_CARDS from the live JSON (same as bot boot / .g reloadcards)
  const cases = [
    ['halloween | naruto', 'event'],
    ['naruto | halloween', 'event'],
    ['itachi | halloween', 'event'],
  ];
  for (const [q, kw] of cases) {
    const msgs = [];
    const reply = (m) => msgs.push(typeof m === 'string' ? m : JSON.stringify(m));
    try {
      await cardSystem.__diag.cmdInfo(reply, 'qa@verify', [q, kw], { isOwner: true });
      const text = msgs.join('\n');
      const found = (text.match(/Found (\d+)/) || [])[1];
      const narutoLines = text.split('\n').filter(l => /naruto/i.test(l)).length;
      console.log(`\n== einfo ${q} -> Found=${found ?? 'NONE'} | naruto-mentioning lines=${narutoLines} | len=${text.length}`);
      console.log(text.split('\n').slice(0, 14).join('\n'));
      if (text.length > 2000) console.log('...[truncated]');
    } catch (e) {
      console.log(`== einfo ${q} -> ERROR: ${e.message}`);
    }
  }
  process.exit(0);
})();
