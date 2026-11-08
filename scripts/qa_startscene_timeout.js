'use strict';
// qa_startscene_timeout.js — 2026-11-08 (owner: solo froze twice at the first combat image
// after the restart, zombie "already have an active Solo raid"). Proves: a combat-start
// scene that hangs FOREVER no longer kills the run — 10s guard fires, text intro goes out,
// first turn arms, state goes inCombat.
const path = require('path');
const ROOT = '/home/ubuntu/whatsapp-bot';
process.chdir(ROOT);
const connectDB = require(path.join(ROOT, 'db.js'));
const ga = require(path.join(ROOT, 'core/rpg/systems/adventures/guildAdventure.js'));
const CI = require(path.join(ROOT, 'core/rpg/systems/combat/combatIntegration.js'));

const sent = [];
const fakeSock = { sendMessage: async (jid, content) => { sent.push(content); return {}; } };
process.on('unhandledRejection', (e) => { console.log('[qa] FAIL: unhandledRejection:', (e && e.message) || e); process.exit(1); });

(async () => {
  await connectDB();
  const real = CI.generateCombatScene;
  CI.generateCombatScene = () => new Promise(() => {}); // lost Go render, never settles
  const chatId = 'qa-startscene@c.us', jid = 'qa-startscene-user@s.whatsapp.net';
  let st = null;
  try {
    const t0 = Date.now();
    const res = await ga.initAdventure(fakeSock, chatId, null, 'NORMAL', true, 'E', jid, null, null, { skipShop: true });
    console.log('[qa] initAdventure success=' + (res && res.success) + ' msg=' + String((res && res.msg) || '').slice(0, 80).replace(/\n/g, ' '));
    console.log('[qa] waiting past the 10s guard...');
    await new Promise((r) => setTimeout(r, 13500));
    st = ga.getGameState(chatId, jid);
    const texts = sent.filter((s) => s && s.text);
    const intro = texts.find((s) => /Combat Started/.test(s.text || ''));
    console.log('[qa] elapsed=' + (Date.now() - t0) + 'ms msgs=' + sent.length + ' textMsgs=' + texts.length +
      ' introText=' + !!intro + ' inCombat=' + !!(st && st.inCombat) + ' phase=' + (st && st.phase));
    const ok = !!intro && !!(st && st.inCombat);
    console.log(ok ? '[qa] PASS: hung scene -> text intro, run continues' : '[qa] FAIL: run still freezes');
    process.exitCode = ok ? 0 : 1;
  } finally {
    CI.generateCombatScene = real;
    if (st) { st.active = false; st.inCombat = false; for (const t of Object.values(st.timers || {})) { try { t && clearTimeout(t); } catch (e) {} } }
    try { for (const k of Array.from(ga.gameStates.keys())) if (String(k).includes('qa-startscene')) ga.gameStates.delete(k); } catch (e) {}
    const mongoose = require('mongoose');
    try { await mongoose.connection.close(); } catch (e) {}
  }
})().catch((e) => { console.log('[qa] ERROR:', (e && e.stack) || e); process.exit(1); });
