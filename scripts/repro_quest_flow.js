// REPRO 2: full solo journey flow — does the first encounter actually spawn?
// Watches state transitions + captured sock sends for 20s after start.
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const botConfig = require('../botConfig');
const economy = require('../core/rpg/economy');
const guildAdventure = require('../core/rpg/guildAdventure');

function cfgFor(botId) {
    return {
        getBotId: () => botId,
        getBotName: () => botId,
        getPrefix: () => '.j',
        getCurrency: () => ({ symbol: 'Ꞩ', name: 'Zeni' }),
        getAssetPath: () => '', getStickerPath: () => '', getDataPath: () => '',
        getRPGAssetPath: () => '', getAuthPath: () => '', getSiblings: () => [],
        isEnabled: () => true, getVersion: () => '5.3.2', getSymbol: () => '.',
        getContentDescription: () => '', getFastResponses: () => [],
        pairingPhone: null,
    };
}

const CHAT = '1203group@g.us';
const P1 = 'fighter@s.whatsapp.net';
economy.economyData.set(P1, {
    userId: P1, wallet: 100000, bank: 0, registered: true,
    nickname: 'fighter', stats: {}, progression: { level: 30 },
    adventurerRank: 'A',
});

const sends = [];
const sock = {
    sendMessage: async (c, m) => {
        const txt = typeof m.text === 'string' ? m.text : (m.caption || JSON.stringify(m).slice(0, 120));
        sends.push({ c, txt: String(txt) });
        console.log(`  [T+${((Date.now() - T0) / 1000).toFixed(1)}s SOCK]`, String(txt).slice(0, 200).replace(/\n/g, ' | '));
    },
};

const T0 = Date.now();
(async () => {
    const res = await botConfig.storage.run(cfgFor('Joker'), () =>
        guildAdventure.initAdventure(sock, CHAT, null, 'NORMAL', true, 'F', P1, null, null, { skipShop: true }),
    );
    console.log('START success=', res.success);

    // watch state for 20s
    for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = botConfig.storage.run(cfgFor('Joker'), () => guildAdventure.getGameState(CHAT, P1));
        if (!st) { console.log(`[T+${((Date.now() - T0) / 1000).toFixed(1)}s] STATE GONE (deleted/ended)`); break; }
        console.log(`[T+${((Date.now() - T0) / 1000).toFixed(1)}s] phase=${st.phase} active=${st.active} inCombat=${!!st.inCombat} encounter=${st.encounter}/${st.maxEncounters} enemies=${(st.enemies || []).length} players=${(st.players || []).length}`);
    }
    console.log('\nTOTAL SOCK SENDS:', sends.length);
    process.exit(0);
})().catch((e) => { console.error('HARNESS CRASH:', e.stack || e); process.exit(1); });
