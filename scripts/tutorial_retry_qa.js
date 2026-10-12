// QA: tutorial retry_solo fix + `tutorial start <track>` parse fix (2026-10-12)
// Stub economy/inventory/guildAdventure, drive the real state machine.
const path = require('path');
const R = '/home/ubuntu/whatsapp-bot/core/rpg';

const sends = [];
const sock = { sendMessage: async (jid, content) => { sends.push(String((content && (content.text || content.caption)) || '')); } };
const CHAT = 'qa-chat@g';
const JID1 = 'qa1@s.whatsapp.net';
const JID2 = 'qa2@s.whatsapp.net';

const users = {
    [JID1]: { jid: JID1, level: 2, class: 'FIGHTER', tutorial: 'active', tutorialTracks: {}, tutorialPending: [], skills: {}, tutorialLoadout: null },
    [JID2]: { jid: JID2, level: 3, class: 'FIGHTER', tutorial: 'done', tutorialTracks: {}, tutorialPending: [], skills: {}, tutorialLoadout: null },
};

const economy = require(path.join(R, 'economy'));
economy.getUser = (jid) => users[jid] || null;
economy.saveUser = () => {};
economy.getDisplayName = (jid) => (users[jid] && users[jid].jid.split('@')[0]) || 'Tester';

const inv = require(path.join(R, 'inventorySystem'));
inv.addItem = async () => {};
inv.removeItem = async () => {};
inv.unequipItem = async () => {};
inv.getEquipment = () => ({ main_hand: null });

let questCalls = 0;
const ga = require(path.join(R, 'guildAdventure'));
ga.startTutorialQuest = async () => { questCalls++; return questCalls === 1 ? { success: false } : { success: true }; };
ga.startTutorialCombat = async () => ({ success: true });
ga.startTutorialGroupQuest = async () => ({ success: true });

const tutorial = require(path.join(R, 'tutorial'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const ok = (cond, label) => { console.log((cond ? 'PASS' : 'FAIL') + ' - ' + label); if (!cond) fail++; };

(async () => {
    // 1) basics begin → char → auto solo quest start (stubbed to FAIL) → retry_solo
    await tutorial.begin(sock, CHAT, JID1, '.', '');
    sends.length = 0;
    await tutorial.notify(JID1, 'char', { sock, chatId: CHAT, prefix: '.' });
    await sleep(3200);   // 2s timer + generous margin (module-load jitter)
    console.log('[debug] sends after auto-start:', JSON.stringify(sends.map((t) => t.slice(0, 60))));
    ok(sends.some((t) => t.includes('training grounds are busy')), 'failed start → busy message + retry_solo');
    ok(questCalls === 1, 'startTutorialQuest called once (failed)');

    // 2) THE FIX: retry must actually re-open the training quest
    sends.length = 0;
    const r = await tutorial.handleDM(sock, JID1, CHAT, 'retry', null, { prefix: '.' });
    await sleep(400);
    console.log('[debug] sends after retry:', JSON.stringify(sends.map((t) => t.slice(0, 60))), 'r=', JSON.stringify(r));
    ok(r && !r.text, 'retry consumed (no fallback text)');
    ok(questCalls === 2, 'FIX: retry re-runs startTutorialQuest (was a dead notify(inventory))');
    ok(sends.some((t) => t.includes('slime wobbles')), 'FIX: solo_fight instruction sent after successful retry');

    // 3) `tutorial start <track>` parse (was: unknown track → list spam)
    sends.length = 0;
    await tutorial.handleDM(sock, JID2, CHAT, 'tutorial start combat', null, { prefix: '.' });
    await sleep(400);
    console.log('[debug] sends after start-combat:', JSON.stringify(sends.map((t) => t.slice(0, 60))));
    ok(sends.some((t) => t.includes('ARMS & COMBAT')), 'FIX: "tutorial start combat" opens the combat track');

    console.log(fail === 0 ? 'TUTORIAL QA: ALL GREEN' : `TUTORIAL QA: ${fail} FAILURES`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('QA crashed:', e); process.exit(2); });
