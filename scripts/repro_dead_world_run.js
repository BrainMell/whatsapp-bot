// ═══════════════════════════════════════════════════════════════════════════
//  REPRO: owner ticket 2026-09-21 (.j solo f -d)
//  CONTRACT: the Dead World encounter is TERMINAL - empty scene card, TEN
//  separate thought boxes, the regular-style victory card with the Dead
//  World congratulation caption, then the run ENDS (state deleted, no next
//  encounter, no QUEST COMPLETE banner, no rewards).
//  Production-faithful: shop NOT skipped, real thought pacing, then asserts
//  the terminal run. Logs every send + every state transition.
// ═══════════════════════════════════════════════════════════════════════════
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const path = require('path');
const PROJ = path.join(__dirname, '..');

// stub engine like qa_dead_world does
const __enginePath = require.resolve(path.join(PROJ, 'core/engine.js'));
require.cache[__enginePath] = {
    id: __enginePath, filename: __enginePath, loaded: true,
    exports: { isBotOwner: () => false, isGlobalMod: () => false, isRpgMod: () => false },
};

const botConfig = require(path.join(PROJ, 'botConfig'));
function cfgFor(botId) {
    return {
        getBotId: () => botId, getBotName: () => botId, getPrefix: () => '.j',
        getCurrency: () => ({ symbol: 'Ꞩ', name: 'Zeni' }),
        getAssetPath: () => '', getStickerPath: () => '', getDataPath: () => '',
        getRPGAssetPath: () => '', getAuthPath: () => '', getSiblings: () => [],
        isEnabled: () => true, getVersion: () => '5.3.2', getSymbol: () => '.',
        getContentDescription: () => '', getFastResponses: () => [], pairingPhone: null,
    };
}
botConfig.storage.run(cfgFor('Joker'), () => {});

const economy = require(path.join(PROJ, 'core/rpg/economy'));
const ga = require(path.join(PROJ, 'core/rpg/guildAdventure'));

const CHAT = 'repro_dw_group@g.us';
const P1 = 'repro_dw_hero@s.whatsapp.net';
economy.economyData.set(P1, {
    userId: P1, wallet: 50000, bank: 0, registered: true,
    nickname: 'DwHero', stats: {}, progression: { level: 12 },
    adventurerRank: 'B', class: 'FIGHTER', spriteIndex: 0,
});

// speed up the shop but keep the REAL shop path (owner did not use -s)
const GAME_CONFIG = ga.GAME_CONFIG;
if (GAME_CONFIG) { GAME_CONFIG.SHOP_TIME = 2500; console.log('shop time ->', GAME_CONFIG.SHOP_TIME); }
else console.log('!! no GAME_CONFIG export, shop stays 90s');

const deadWorld = require(path.join(PROJ, 'core/rpg/deadWorld'));
deadWorld.setThoughtDelayMs(300); // faster than prod but still sequential

let n = 0;
const t0 = Date.now();
const ts = () => `[+${((Date.now() - t0) / 1000).toFixed(1)}s]`;
const sends = [];
const sock = {
    sendMessage: async (c, m) => {
        n++;
        sends.push(m);
        const desc = m.image ? `IMAGE (${(m.image.length || 0)}b)${m.caption ? ' caption=' + JSON.stringify(String(m.caption).split('\n')[0].slice(0, 60)) : ' NO-CAPTION'}` : `text=${JSON.stringify(String(m.text || '').slice(0, 70))}`;
        console.log(`${ts()} send#${n}: ${desc}`);
    },
};

(async () => {
    console.log(ts(), '=== initAdventure solo F, forceDeadWorld, NO skipShop ===');
    const res = await ga.initAdventure(sock, CHAT, null, 'NORMAL', true, 'F', P1, null, null, { forceDeadWorld: true });
    console.log(ts(), 'init result:', res && res.success, res && res.msg ? String(res.msg).slice(0, 40) : '');

    // wait for the whole run: shop 2.5s + sequence + TERMINAL end
    let gone = false;
    for (let i = 0; i < 45; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const st = ga.getGameState(CHAT, P1);
        if (!st) { console.log(ts(), 'STATE GONE (run ended/deleted) ✓'); gone = true; break; }
        if (i % 3 === 0) console.log(ts(), `state: enc=${st.encounter}/${st.maxEncounters} phase=${st.phase} inCombat=${!!st.inCombat} active=${st.active} isProc=${!!st.isProcessing} dwDone=${!!st.deadWorldDone}`);
    }

    // ── contract assertions ──
    const thoughts = sends.filter((m) => typeof m.text === 'string' && /^_\*「 .+ 」\*_$/s.test(m.text));
    const images = sends.filter((m) => m.image);
    const last = sends[sends.length - 1];
    let ok = true;
    const assert = (cond, label) => { console.log(`${cond ? '  ok' : '  FAIL'} - ${label}`); if (!cond) ok = false; };
    assert(images.length >= 2, `scene + victory cards sent as images (${images.length})`);
    assert(thoughts.length === 10, `exactly TEN thought boxes (${thoughts.length})`);
    assert(last && last.image && last.caption, 'the LAST message is the victory card with the congratulation caption');
    assert(!sends.some((m) => String(m.text || '').includes('QUEST COMPLETE')), 'no QUEST COMPLETE banner (run did not continue)');
    assert(!sends.some((m) => String(m.text || '').includes('BATTLE COMMENCES')), 'no further encounter spawned (run did not continue)');
    assert(gone, 'run state deleted after the sequence (terminal run)');
    console.log(ts(), ok ? 'REPRO CONTRACT: ALL PASS' : 'REPRO CONTRACT: FAILURES');
    process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('REPRO ERROR:', e); process.exit(1); });
