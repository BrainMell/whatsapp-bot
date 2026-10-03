// REPRO: quests & raids "don't even start anymore" (owner 2026-09-20).
// Drives guildAdventure.initAdventure the same way core/engine.js does,
// under a per-bot AsyncLocalStorage context, with mocked sock/economy.
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const botConfig = require('../botConfig');
const economy = require('../core/rpg/economy');
const guildAdventure = require('../core/rpg/guildAdventure');

function cfgFor(botId) {
    return {
        getBotId: () => botId,
        getBotName: () => botId,
        getPrefix: () => (botId === 'Joker' ? '.j' : '.s'),
        getCurrency: () => ({ symbol: 'Ꞩ', name: 'Zeni' }),
        getAssetPath: () => '', getStickerPath: () => '', getDataPath: () => '',
        getRPGAssetPath: () => '', getAuthPath: () => '', getSiblings: () => [],
        isEnabled: () => true, getVersion: () => '5.3.2', getSymbol: () => '.',
        getContentDescription: () => '', getFastResponses: () => [],
        pairingPhone: null,
    };
}
const asJoker = (fn) => botConfig.storage.run(cfgFor('Joker'), fn);

const CHAT = '1203group@g.us';
const P1 = 'fighter@s.whatsapp.net';
for (const jid of [P1, 'healer@s.whatsapp.net']) {
    economy.economyData.set(jid, {
        userId: jid, wallet: 100000, bank: 0, registered: true,
        nickname: jid.split('@')[0], stats: {}, progression: { level: 30 },
        adventurerRank: 'A',
    });
}

const sock = {
    sendMessage: async (c, m) => {
        const txt = typeof m.text === 'string' ? m.text : JSON.stringify(m).slice(0, 160);
        console.log(`  [SOCK → ${c}]`, txt.slice(0, 240).replace(/\n/g, ' | '));
    },
};

function banner(t) { console.log(`\n══ ${t} ══`); }

(async () => {
    banner('1. SOLO quest start (.j solo f), skipShop=true — engine path');
    try {
        const res = await asJoker(() => guildAdventure.initAdventure(
            sock, CHAT, null, 'NORMAL', true, 'F', P1, null, null, { skipShop: true },
        ));
        console.log('RESULT success=', res.success, 'isMenu=', !!res.isMenu, 'keys=', Object.keys(res));
        if (res.msg) console.log('MSG:', String(res.msg).slice(0, 400).replace(/\n/g, ' | '));
        const st = asJoker(() => guildAdventure.getGameState(CHAT, P1));
        console.log('STATE AFTER START:', st ? `phase=${st.phase} active=${st.active} botId=${st.botId} players=${st.players.length}` : 'NULL (NOT FOUND!)');
    } catch (e) {
        console.log('!!! THROWN DURING SOLO START:', e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
    }

    await new Promise((r) => setTimeout(r, 1500));

    banner('2. GROUP raid start (.j quest d) — engine path');
    try {
        const res = await asJoker(() => guildAdventure.initAdventure(
            sock, CHAT, null, 'NORMAL', false, 'D', P1, null, null, {},
        ));
        console.log('RESULT success=', res.success, 'isMenu=', !!res.isMenu);
        if (res.msg) console.log('MSG:', String(res.msg).slice(0, 400).replace(/\n/g, ' | '));
        const st = asJoker(() => guildAdventure.getGameState(CHAT));
        console.log('GROUP STATE:', st ? `phase=${st.phase} active=${st.active} botId=${st.botId}` : 'NULL (NOT FOUND!)');
    } catch (e) {
        console.log('!!! THROWN DURING GROUP START:', e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
    }

    setTimeout(() => process.exit(0), 2500);
})().catch((e) => { console.error('HARNESS CRASH:', e); process.exit(1); });
