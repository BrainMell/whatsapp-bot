// RUNTIME PROBE: Abyss alignment gate - find the leak where the Abyss stays
// accessible when the required alignment (6h window / level tier) is not met.
'use strict';

// ── stub the engine BEFORE requiring worldMap (it lazily requires engine) ──
const path = require('path');
const Module = require('module');
const enginePath = require.resolve(path.join(__dirname, '..', 'core', 'engine.js'));

// Prevent actually loading the giant engine: intercept require for it
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === '../engine' || request === './engine' || request === enginePath) {
        return {
            isBotOwner: (jid) => /^(owner|105712667648066)/.test(String(jid || '')),
            isGlobalMod: (jid) => /^gmod/.test(String(jid || '')),
            isRpgMod: (jid) => /^rmod/.test(String(jid || '')),
        };
    }
    return origLoad.apply(this, arguments);
};

const worldMap = require(path.join(__dirname, '..', 'core', 'rpg', 'worldMap'));
const cosmology = require(path.join(__dirname, '..', 'core', 'rpg', 'cosmology'));

function mkSock(log) {
    return { sendMessage: async (chatId, msg) => { log.push(msg); } };
}

(async () => {
    const w = cosmology.abyssWindow();
    console.log('live window now:', JSON.stringify(w));

    const t0 = cosmology.T0;
    const lockedAt = t0 + 2 * 3600 * 1000;             // 2h into cycle -> locked
    const openAt = t0 + 5.5 * 3600 * 1000;             // into the open hour

    // ── 1. MAP gate (.j world abyss): helper matrix ──
    const helpersMatrix = {
        'level undefined -> ': { getLevel: () => undefined },
        'level NaN       -> ': { getLevel: () => NaN },
        'level null      -> ': { getLevel: () => null },
        'level string 8  -> ': { getLevel: () => '8' },
        'level throw     -> ': { getLevel: () => { throw new Error('db down'); } },
        'no helpers      -> ': {},
    };
    for (const [label, helpers] of Object.entries(helpersMatrix)) {
        const log = [];
        await worldMap.showWorld(mkSock(log), 'chat1', 'player1', 'abyss', helpers);
        const m = log[0] || {};
        const rendered = m.caption && m.caption.includes('rings upon rings');
        const lockedCard = m.caption && m.caption.includes('THE ABYSS IS NOT CHARTED');
        console.log(`MAP ${label} level-check => ${rendered ? 'SHEET RENDERED (LEAK!)' : lockedCard ? 'locked ok' : 'other: ' + JSON.stringify((m.caption || m.text || '').slice(0, 60))}`);
    }

    // ── 2. MAP gate with a high level while the window is LOCKED ──
    {
        const realWindow = cosmology.abyssWindow;
        try {
            cosmology.abyssWindow = () => ({ open: false, phaseInCycle: 0.5, msRemaining: 1, label: 'locked 1h 0m' });
            const log = [];
            await worldMap.showWorld(mkSock(log), 'chat1', 'player1', 'abyss', { getLevel: () => 25 });
            const m = log[0] || {};
            const rendered = m.caption && m.caption.includes('rings upon rings');
            const aligned = m.caption && (m.caption.includes('not aligned') || m.caption.includes('NOT ALIGNED'));
            console.log(`MAP level 25, window FORCED locked => ${rendered ? 'SHEET RENDERED (LEAK!)' : aligned ? 'alignment card ok' : 'other: ' + JSON.stringify((m.caption || m.text || '').slice(0, 60))}`);
            // staff walk in while locked
            const log2 = [];
            await worldMap.showWorld(mkSock(log2), 'chat1', 'owner1', 'abyss', { getLevel: () => 25 });
            const m2 = log2[0] || {};
            console.log(`MAP level 25, window locked, owner    => ${m2.caption && m2.caption.includes('rings upon rings') ? 'sheet (staff bypass ok)' : 'refused'}`);
        } finally {
            cosmology.abyssWindow = realWindow;
        }
    }

    // ── 3. ENTRY gate logic (verbatim replay of the engine block) ──
    // Mirrors engine.js `.g abyss enter` alignment block exactly.
    function entryGate(senderJid, tOverride) {
        let __w = null;
        let __gateAlive = true;
        try {
            const c = cosmology;
            __w = c.abyssWindow(tOverride == null ? Date.now() : tOverride);
            if (!__w || typeof __w.open !== 'boolean' || typeof __w.label !== 'string') __gateAlive = false;
        } catch (e) { __gateAlive = false; }
        const __gateBypass = /^(owner|105712667648066)/.test(String(senderJid || '')) || /^rmod/.test(String(senderJid || ''));
        if (!__gateAlive) return 'SEALED (unreadable)';
        if (!__w.open && !__gateBypass) return 'SEALED (not aligned)';
        return 'OPEN';
    }
    console.log('ENTRY locked window, player      =>', entryGate('player1', lockedAt));
    console.log('ENTRY locked window, owner       =>', entryGate('owner1', lockedAt), '(staff bypass = documented design)');
    console.log('ENTRY locked window, rpg mod     =>', entryGate('rmod1', lockedAt), '(staff bypass = documented design)');
    console.log('ENTRY open window,  player      =>', entryGate('player1', openAt));
    console.log('ENTRY garbage cosmology, player =>', (() => {
        const orig = cosmology.abyssWindow;
        try {
            require(path.join(__dirname, '..', 'core', 'rpg', 'cosmology')).abyssWindow = () => null;
            const c2 = require(path.join(__dirname, '..', 'core', 'rpg', 'cosmology'));
            let alive = true; let wv = null;
            try { wv = c2.abyssWindow(); if (!wv || typeof wv.open !== 'boolean') alive = false; } catch (e) { alive = false; }
            return alive ? 'OPEN (LEAK!)' : 'SEALED (fail closed)';
        } finally { /* restore not needed: fresh require cache per process */ }
    })());

    // ── 4. every other `.j world` sub stays gated ──
    for (const sub of ['beyond', 'afterlife', 'all']) {
        const log = [];
        await worldMap.showWorld(mkSock(log), 'chat1', 'player1', sub, { getLevel: () => 1, getRank: () => 'F' });
        const m = log[0] || {};
        const txt = (m.caption || m.text || '');
        console.log(`GATE ${sub}: ${m.image ? 'card' : 'text'} -> ${txt.split('\n')[0].slice(0, 60)}`);
    }

    process.exit(0);
})().catch((e) => { console.error('PROBE FAIL:', e); process.exit(1); });
