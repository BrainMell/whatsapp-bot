/* Regression: `.j use <item>` must NEVER throw for ANY catalog item.
 * Owner report 2026-10-03: "use was returning an error for some items".
 * Root cause of that crash: undeclared `itemKey` in inventorySystem.useItem
 * (ReferenceError on every heal/regen potion). This suite walks the ENTIRE
 * ITEM_DATABASE + handler-level paths so any future undeclared identifier,
 * bad refactor or missing effect branch is caught at test time.
 *
 * Passing rule: useItem returns { success: true|false } gracefully.
 * Failing rule: a thrown ReferenceError/TypeError/any exception.
 *
 * Run: BOT_ROOT=$(pwd) node scripts/test_useitem_catalog.js
 * (needs MONGO_URI — .env is parsed; gwtest redirect like gw_sim)
 */
process.env.GW_TEST = '1';
const path = require('path');
const fs = require('fs');

const ROOT = process.env.BOT_ROOT || path.resolve(__dirname, '..');

// ── DB connect: .env → gwtest redirect BEFORE modules load (gw_sim pattern)
function loadEnv() {
    const envPath = path.join(ROOT, '.env');
    if (!fs.existsSync(envPath)) throw new Error('no .env at ' + envPath);
    const env = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?/.exec(line);
        if (m) env[m[1]] = m[2];
    }
    return env;
}

(async () => {
    const env = loadEnv();
    let uri = env.MONGO_URI || env.MONGODB_URI;
    if (!uri) throw new Error('No MONGO_URI in .env');
    uri = uri.replace(/\/([^/?]+)(\?|$)/, '/gwtest$2');
    process.env.MONGO_URI = uri;
    await require(path.join(ROOT, 'db'))();
    const mongoose = require('mongoose');
    console.log(`[catalog] TEST db: ${mongoose.connection.name} @ ${mongoose.connection.host}`);

    const economy = require(path.join(ROOT, 'core/rpg/economy'));
    const lootSystem = require(path.join(ROOT, 'core/rpg/lootSystem'));
    const inventorySystem = require(path.join(ROOT, 'core/rpg/inventorySystem'));

    const TS = Date.now();
    const U = `usecat${TS}@s.whatsapp.net`;
    await economy.registerUser(U, 'UseCat');
    if (!economy.getUser(U)) throw new Error('failed to register synthetic user');
    // deep pockets so nothing blocks on affordability
    const wallet = economy.getUser(U);
    if (wallet && wallet.zeni !== undefined) { wallet.zeni = 100000000; economy.saveUser(U); }
    // POSITIVE PATH SETUP: damage HP + drain energy so heal/energy items can
    // actually succeed (fresh user is full-everything and bounces gracefully)
    const progression = require(path.join(ROOT, 'core/rpg/progression'));
    const sheet = progression.getCharacterSheet(U);
    const classId = typeof (sheet && sheet.class) === 'object' ? (sheet.class?.id || 'FIGHTER') : (sheet?.class || 'FIGHTER');
    const stats = progression.getBaseStats(U, classId);
    const maxHP = stats.maxHp || stats.hp || 100;
    economy.setPersistentHP(U, Math.max(1, Math.floor(maxHP * 0.3)), maxHP);
    const preUser = economy.getUser(U);
    if (preUser) { preUser.energy = 0; economy.saveUser(U); }

    const db = lootSystem.ITEM_DATABASE || {};
    const ids = Object.keys(db);
    console.log(`[catalog] walking ${ids.length} catalog items…`);

    // Fresh users start with a small bag (slot limit). Reset it periodically
    // so adds keep landing and useItem actually reaches the effect chains.
    const resetBag = async () => {
        const u = economy.getUser(U);
        if (u && u.inventory) { u.inventory = {}; await economy.saveUser(U); }
    };
    const ensureAdded = async (id) => {
        await resetBag();
        const addRes = await inventorySystem.addItem(U, id, 3);
        if (!addRes || !addRes.success) {
            // second chance after another reset (should not happen, but log it)
            await resetBag();
            const r2 = await inventorySystem.addItem(U, id, 3);
            if (!r2 || !r2.success) throw new Error(`addItem failed for ${id}: ${(r2 && r2.message) || 'unknown'}`);
        }
    };

    let ok = 0, gracefulFalse = 0, thrown = 0;
    const throws = [];
    const graceNote = [];

    for (const id of ids) {
        try {
            // fresh bag slice per item so consumed/stacked items never run dry
            await ensureAdded(id);
            const r = inventorySystem.useItem(U, id, null);
            if (r && r.success) ok++;
            else { gracefulFalse++; if (gracefulFalse <= 5) graceNote.push(`${id}: ${(r && r.message || '').slice(0, 60)}`); }
        } catch (e) {
            thrown++;
            throws.push(`${id}: ${e.constructor.name}: ${e.message}`);
        }
    }

    // EXPLICIT positive-path assertions (catch "rejected everything" bugs)
    const explicit = [];
    let explicitFail = 0;
    {
        economy.setPersistentHP(U, maxHP - Math.floor(maxHP * 0.5), maxHP);
        await ensureAdded('elixir');
        const er = inventorySystem.useItem(U, 'elixir', null);
        const fx = economy.hasActiveEffect ? economy.hasActiveEffect(U, 'full_restore') : null;
        explicit.push(`elixir at damaged HP: success=${er.success} msg=${String(er.message).slice(0, 50)} fullRestoreFx=${fx}`);
        if (!er.success) explicitFail++;
    }
    {
        const potionId = ids.find(i => db[i].effect === 'heal' && i !== 'elixir' && db[i].type === 'POTION');
        if (potionId) {
            economy.setPersistentHP(U, Math.max(1, Math.floor(maxHP * 0.4)), maxHP);
            await ensureAdded(potionId);
            const pr = inventorySystem.useItem(U, potionId, null);
            explicit.push(`heal potion ${potionId}: success=${pr.success} msg=${String(pr.message).slice(0, 50)}`);
            if (!pr.success) explicitFail++;
        }
    }
    {
        const enId = ids.find(i => (db[i].effect === 'restore_energy') || i === 'energy_drink');
        if (enId) {
            const eu = economy.getUser(U); if (eu) { eu.energy = 0; economy.saveUser(U); }
            await ensureAdded(enId);
            const vr = inventorySystem.useItem(U, enId, null);
            explicit.push(`energy item ${enId}: success=${vr.success} msg=${String(vr.message).slice(0, 50)}`);
            if (!vr.success) explicitFail++;
        }
    }

    // handler-level paths (async command layer with mock sock)
    const rpgCommands = require(path.join(ROOT, 'core/commands/rpgCommands'));
    const sent = [];
    const mockSock = { async sendMessage(chatId, content) { sent.push(content); return {}; } };
    const handlerCases = [
        { args: [mockSock, 'c', U, '1'], note: 'bag index #1' },
        { args: [mockSock, 'c', U, 'repair_kit_basic main_hand'], note: 'repair kit no target equipped' },
        { args: [mockSock, 'c', U, 'nonexistent_item_xyz'], note: 'unknown item' },
        { args: [mockSock, 'c', U, ''], note: 'no args usage tip' },
    ];
    let handlerThrown = 0; const handlerThrows = [];
    for (const c of handlerCases) {
        try { await rpgCommands.useItem(...c.args); }
        catch (e) { handlerThrown++; handlerThrows.push(`${c.note}: ${e.constructor.name}: ${e.message}`); }
    }
    // egg redirect path — any *_egg item must route to hatch system, not crash
    const eggId = ids.find(i => i.includes('summon_egg') || i.endsWith('_egg'));
    if (eggId) {
        try { inventorySystem.addItem(U, eggId, 1); await rpgCommands.useItem(mockSock, 'c', U, eggId); }
        catch (e) { handlerThrown++; handlerThrows.push(`egg redirect (${eggId}): ${e.constructor.name}: ${e.message}`); }
    }

    console.log(`\n══════ USE CATALOG: ${ids.length + handlerCases.length + (eggId ? 1 : 0)} cases — ` +
        `${thrown + handlerThrown} thrown ══════`);
    console.log('(explicit positive paths)\n  ' + explicit.join('\n  '));
    if (graceNote.length) console.log('(sample graceful rejections)\n  ' + graceNote.join('\n  '));
    if (throws.length) { console.log('\n❌ THROWN (inventorySystem.useItem):\n  ' + throws.slice(0, 40).join('\n  ')); }
    if (handlerThrows.length) { console.log('\n❌ THROWN (rpgCommands.useItem):\n  ' + handlerThrows.join('\n  ')); }

    if (thrown || handlerThrown || explicitFail) {
        console.log(`\nRESULT: FAIL (${thrown + handlerThrown} crashes, ${explicitFail} positive-path misses)`); process.exit(1);
    }
    console.log(`\nRESULT: PASS — every catalog item handled gracefully (${ok} succeeded, ${gracefulFalse} rejected with guidance)`);
    process.exit(0);
})().catch(e => { console.error('[catalog] fatal:', e); process.exit(1); });
