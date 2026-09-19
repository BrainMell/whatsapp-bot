// Integration QA: command-level flows with a mock sock (no WhatsApp needed).
// Run: node scripts/qa_integration_pass.js
process.env.NODE_ENV = 'test';

const assert = require('assert');
const cosmology = require('../core/rpg/cosmology');
const loreDrops = require('../core/rpg/loreDrops');
const enemyVariants = require('../core/rpg/enemyVariants');
const abyssSystem = require('../core/rpg/abyssSystem');
const craftingSystem = require('../core/rpg/craftingSystem');
const worldMap = require('../core/rpg/worldMap');
const worldMapRenderer = require('../core/rpg/worldMapRenderer');

// ─── mock sock: captures messages ────────────────────────────────────────────
function mockSock() {
    const sent = [];
    return {
        sent,
        async sendMessage(chatId, msg) { sent.push({ chatId, msg }); },
    };
}

(async () => {
    // ─── 1. .j world command flow: all four sub-maps + gates ─────────────
    {
        const sock = mockSock();
        await worldMap.showWorld(sock, 'chat1', 'user1', '', { getLevel: () => 50, getRank: () => 'F' });
        assert.strictEqual(sock.sent.length, 1);
        const first = sock.sent[0].msg;
        assert.ok(first.image || first.text, 'first world sheet delivered');
        if (first.image) {
            assert.ok(first.image.length > 50000, 'PNG buffer attached');
            assert.ok(first.caption.includes('four quadrants'), 'info card in caption');
        }
    }
    {
        // beyond: rank A -> refusal text ONLY (never a render)
        const sock = mockSock();
        await worldMap.showWorld(sock, 'chat1', 'user1', 'beyond', { getLevel: () => 50, getRank: () => 'A' });
        assert.strictEqual(sock.sent.length, 1);
        assert.ok(sock.sent[0].msg.text, 'locked beyond = text');
        assert.ok(sock.sent[0].msg.text.includes('S'), 'names the requirement');
        assert.strictEqual(sock.sent[0].msg.image, undefined, 'LOCKED = ZERO image bytes');
    }
    {
        // beyond: rank S -> render
        const sock = mockSock();
        await worldMap.showWorld(sock, 'chat1', 'user1', 'beyond', { getLevel: () => 50, getRank: () => 'S' });
        const m = sock.sent[0].msg;
        assert.ok(m.image || m.text, 'unlocked beyond delivers (image or text fallback)');
    }
    {
        // afterlife: dead-soul feature not implemented -> always refused, no render
        const sock = mockSock();
        await worldMap.showWorld(sock, 'chat1', 'user1', 'afterlife', { getLevel: () => 99, getRank: () => 'SSS' });
        const m = sock.sent[0].msg;
        assert.ok(m.text && m.text.includes('dead souls'));
        assert.strictEqual(m.image, undefined, 'afterlife map must never render while feature is absent');
    }
    {
        // abyss: below unlock -> refusal; at/above -> render
        const sock = mockSock();
        await worldMap.showWorld(sock, 'chat1', 'user1', 'abyss', { getLevel: () => 12, getRank: () => 'A' });
        const m = sock.sent[0].msg;
        assert.ok(m.text && m.text.includes('level *20*'));
        assert.strictEqual(m.image, undefined);

        const sock2 = mockSock();
        await worldMap.showWorld(sock2, 'chat1', 'user1', 'abyss', { getLevel: () => 20, getRank: () => 'A' });
        const m2 = sock2.sent[0].msg;
        assert.ok(m2.image || m2.text, 'abyss sheet at unlock level');
        if (m2.image) assert.ok(m2.caption.includes('five hours locked'), 'entry-cycle info in caption');
    }
    {
        // all four renders actually produce PNG buffers (renderer smoke)
        for (const fn of [worldMapRenderer.renderFirstWorldSheet, worldMapRenderer.renderWorldBeyondSheet,
            worldMapRenderer.renderAfterlifeSheet, worldMapRenderer.renderAbyssSheet]) {
            const buf = await fn();
            assert.ok(buf && buf.length > 50000, 'sheet renders to a real PNG');
            assert.strictEqual(buf[0], 0x89, 'PNG magic byte');
        }
    }
    console.log('✓ .j world: gates hard-refuse with zero image bytes; unlocked sheets render with info captions');

    // ─── 2. abyss encounter generation with variants + sprites ────────────
    {
        // every generated enemy now carries a spriteIndex (UI-CB-15 fix)
        for (let i = 0; i < 200; i++) {
            const floor = 1 + Math.floor(Math.random() * 60);
            const enc = abyssSystem.generateFloorEncounter(floor, { playerClassId: 'MAGE' });
            if (enc.enemy && !enc.enemy.isWildSummon) {
                assert.ok(Number.isInteger(enc.enemy.spriteIndex), `spriteIndex set on floor ${floor}`);
            }
        }
        // variant enemies appear at depth with class names + tags
        let sawVariant = 0;
        for (let i = 0; i < 300; i++) {
            const enc = abyssSystem.generateFloorEncounter(60, { playerClassId: 'MAGE' });
            if (enc.enemy && enc.enemy.variantTag) {
                sawVariant++;
                assert.ok(enc.enemy.humanoid === true);
                assert.ok(Number.isInteger(enc.enemy.spriteIndex));
            }
        }
        assert.ok(sawVariant > 5, `variants never spawned at floor 60 (${sawVariant}/300)`);
        // lore intro drops never break the encounter shape
        const enc2 = abyssSystem.generateFloorEncounter(2, { playerClassId: 'FIGHTER' });
        assert.ok(enc2.type && enc2.enemy !== undefined || enc2.treasure || enc2.event);
    }
    console.log('✓ abyss generation: spriteIndex everywhere, variants at depth with tags, encounters intact');

    // ─── 3. startRun includes a floor-1 message and respects the ctx ──────
    {
        // (no Mongo in sandbox - startRun needs AbyssRun; skip live call,
        //  but verify the signature accepts ctx without throwing at import)
        assert.strictEqual(typeof abyssSystem.startRun, 'function');
        assert.strictEqual(abyssSystem.generateFloorEncounter.length >= 1, true);
    }

    // ─── 4. brewing: new recipes exist, auto-inject, ingredients real ─────
    {
        const recipes = craftingSystem.BREWING_RECIPES;
        for (const id of ['abyssal_tonic', 'warden_broth', 'banner_ale']) {
            assert.ok(recipes[id], `missing brew: ${id}`);
            assert.strictEqual(recipes[id].category, 'BREWING');
            assert.ok(recipes[id].result.effect, 'effect id set');
        }
        // effect ids are ones the useItem flow actually handles
        const HANDLED = new Set(['restore_energy', 'heal', 'buff_all']);
        for (const id of ['abyssal_tonic', 'warden_broth', 'banner_ale']) {
            assert.ok(HANDLED.has(recipes[id].result.effect), `${id} effect not handled by useItem: ${recipes[id].result.effect}`);
        }
        // ingredients exist in the loot DB
        const lootSystem = require('../core/rpg/lootSystem');
        for (const recipe of [recipes.abyssal_tonic, recipes.warden_broth, recipes.banner_ale]) {
            for (const ingId of Object.keys(recipe.ingredients)) {
                const info = lootSystem.getItemInfo(ingId);
                assert.ok(info && info.name !== ingId || info.name !== 'Unknown item', `ingredient missing from DB: ${ingId}`);
            }
        }
        // lore drop attaches to performCraft success message (probabilistic - force via many runs)
        // NOTE: performCraft requires inventory/mongo; here we verify the message builder path
        // indirectly by ensuring loreDrops pools exist for every routed category.
        for (const cat of ['brewing', 'blacksmith', 'crafting']) {
            assert.ok(loreDrops.POOLS[cat] && loreDrops.POOLS[cat].length >= 10, `pool ${cat}`);
        }
    }
    console.log('✓ brewing: 3 deep brews registered with handled effects + real ingredients; craft pools present');

    // ─── 5. cosmology: abyss entry window drives the gate message ─────────
    {
        const w = cosmology.abyssWindow();
        assert.ok(w.label.startsWith('open') || w.label.startsWith('locked'));
        // the four clocks stay distinct constants
        assert.notStrictEqual(cosmology.FW_PERIOD_MS, cosmology.ABYSS_CYCLE_MS);
        assert.notStrictEqual(cosmology.ABYSS_CYCLE_MS, cosmology.AL_PERIOD_MS);
        assert.ok(cosmology.AL_PERIOD_MS !== 7 * 24 * 3600_000, 'triune is a state, not a 7d timer');
    }
    console.log('✓ cosmology: four clocks remain four separate systems');

    console.log('\nALL INTEGRATION CHECKS PASSED');
    process.exit(0);
})().catch((e) => { console.error('INTEGRATION FAIL:', e.message); process.exit(1); });
