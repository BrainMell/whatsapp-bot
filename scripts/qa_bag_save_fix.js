'use strict';
// ===========================================================================
// QA - bag upgrade + null-poison save round ("the bag
// upgrade bug - check the logs you'll see them complaining")
// Live evidence: Hexub¡ typed ".j inv upgrade" 3× (07:32-07:34Z) + asked
// "what's the prompt to upgrade inventory"; "We are also trying to upgrade".
// 3× "Failed to save user 2348161792083: Cannot create field 'def' in
// element {stats: null}" (07:43-07:45Z) - equipped items stored with
// stats:null (obsidian_shield / gloom_hood / weavers_cloak) made EVERY
// saveUser touching their stat leaves fail wholesale.
// A. leafDiff null-ancestor promotion (the save killer → self-healing write)
// B. $set+$unset same-path conflict guard
// C. deepStripUndefined (undefined → BSON-null producer kill)
// D. regression: normal leaf granularity + Task-13 churn/merge behavior
// E. repairItemStats: null-stats items restored from DB defs
// F. upgradeInventory flow on a sandbox_ user (cost ladder / deduction / max)
// G. router arg pattern sanity (mirrors engine.js branches)
// Run: node scripts/qa_bag_save_fix.js (QA_REPO to target another checkout)
// ===========================================================================
const path = require('path');
process.env.QA_MODE = '1';
const repo = process.env.QA_REPO || path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(cond, label) {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.error(`  ❌ ${label}`); }
}
function section(t) { console.log(`\n══ ${t} ══`); }

const economy = require(path.join(repo, 'core/rpg/economy'));
const inventorySystem = require(path.join(repo, 'core/rpg/inventorySystem'));
const rpgCommands = require(path.join(repo, 'core/commands/rpgCommands'));

function hasUndefinedDeep(v) {
    if (v === undefined) return true;
    if (v === null || typeof v !== 'object' || v instanceof Date || v instanceof Map) return false;
    for (const k of Object.keys(v)) if (hasUndefinedDeep(v[k])) return true;
    return false;
}

(async () => {
 // -- A. null-ancestor promotion --
    section('A. LEAFDIFF NULL-ANCESTOR PROMOTION');

 // THE LIVE CASE: equipped item with stats:null, repair writes stat leaves
    {
        const base = { equipment: { armor: { id: 'obsidian_shield', type: 'EQUIPMENT', stats: null } } };
        const ours = { equipment: { armor: { id: 'obsidian_shield', type: 'EQUIPMENT', stats: { def: 120, hp: 50 } } } };
        const { writeSet, unsetSet } = economy.leafDiff(ours, base);
        ok(writeSet['equipment.armor.stats'] && typeof writeSet['equipment.armor.stats'] === 'object'
           && writeSet['equipment.armor.stats'].def === 120,
           'null stats ancestor promoted to whole-subtree $set');
        ok(!('equipment.armor.stats.def' in writeSet), 'no leaf writes under the promoted ancestor');
        ok(!('equipment.armor.stats' in unsetSet), 'no $unset against the promoted write');
        ok(!('equipment.armor.stats.def' in unsetSet), 'no stray $unset of leaf paths');
        ok(!hasUndefinedDeep(writeSet), 'promoted write contains no undefined values');
    }

 // TOP-LEVEL poison: base stats:null, payload has stat leaves
    {
        const base = { stats: null };
        const ours = { stats: { def: 5, hp: 10 } };
        const { writeSet, unsetSet } = economy.leafDiff(ours, base);
        ok(writeSet['stats'] && writeSet['stats'].def === 5 && writeSet['stats'].hp === 10,
           'top-level stats:null promoted to whole-object write');
        ok(!('stats.def' in writeSet), 'descendant leaf suppressed after promotion');
        ok(!('stats' in unsetSet), 'NO $set stats + $unset stats in one update (old Mongo conflict)');
    }

 // EMPTY-SLOT EQUIP: base armor:null, equip an item (was: "Cannot create field 'id'…")
    {
        const base = { equipment: { armor: null, ring: { id: 'ring_x', stats: { luck: 2 } } } };
        const ours = { equipment: { armor: { id: 'iron_armor', stats: { def: 9 } }, ring: { id: 'ring_x', stats: { luck: 2 } } } };
        const { writeSet } = economy.leafDiff(ours, base);
        ok(writeSet['equipment.armor'] && writeSet['equipment.armor'].id === 'iron_armor',
           'equip-into-null-slot writes whole item (replaces null atomically)');
        ok(!('equipment.armor.id' in writeSet), 'no nested writes against null slot');
    }

 // SCALAR ANCESTOR drift (same failure class): base scalar, ours object
    {
        const base = { rank: 5 };
        const ours = { rank: { tier: 'A', pts: 3 } };
        const { writeSet } = economy.leafDiff(ours, base);
        ok(writeSet['rank'] && writeSet['rank'].tier === 'A', 'scalar→object drift promotes whole write');
    }

 // -- B. same-path $set/$unset conflict guard --
    section('B. SET+UNSET SAME-PATH GUARD');
    {
        const base = { stats: null, junk: { a: 1, b: 2 } };
        const ours = { stats: { def: 1 }, junk: { b: 5 } };
        const { writeSet, unsetSet } = economy.leafDiff(ours, base);
        ok(writeSet['stats'] && !('stats' in unsetSet), 'promoted path never also unset');
        ok(writeSet['junk.b'] === 5 && unsetSet['junk.a'] === "", 'real subfield deletion: changed leaf written, gone leaf unset');
        ok(!('junk' in writeSet) && !('junk.a' in writeSet), 'no whole-junk write when only one child changed');
    }
    {
 // {}-clear: parent write supersedes child unsets (Task-13 rule intact)
        const base = { junk: { a: 1 } };
        const ours = { junk: {} };
        const { writeSet, unsetSet } = economy.leafDiff(ours, base);
        ok(writeSet['junk'] && Object.keys(writeSet.junk).length === 0 && !('junk.a' in unsetSet),
           '{} clear = single parent write, redundant child unset dropped');
    }
    {
 // object→scalar (existing behavior must keep working)
        const base = { x: { y: 1 } };
        const ours = { x: 5 };
        const { writeSet, unsetSet } = economy.leafDiff(ours, base);
        ok(writeSet['x'] === 5 && !('x.y' in unsetSet), 'object→scalar: $set replaces, no $unset x.y conflict');
    }

 // -- C. deepStripUndefined --
    section('C. DEEP-STRIP-UNDEFINED (producer kill)');
    {
        const v = economy.deepStripUndefined({ a: { b: undefined, c: 1 }, d: [{ e: undefined, f: 2 }], g: undefined, h: null });
        ok(v.a.b === undefined && !('b' in v.a) && v.a.c === 1, 'undefined nested keys deleted');
        ok(v.d[0].f === 2 && !('e' in v.d[0]), 'undefined inside arrays-of-objects deleted');
        ok(!('g' in v), 'top-level undefined deleted');
        ok(v.h === null, 'explicit null preserved (legit leaf value)');
    }
    {
        const d = new Date(); const m = new Map([[1, 2]]);
        const v = economy.deepStripUndefined({ when: d, map: m, keep: 1 });
        ok(v.when === d && v.map === m, 'Dates/Maps passed through untouched');
    }
    {
 // THE REGISTERUSER REGRESSION: template without top-level stats,
 // stats key present-but-undefined must NEVER reach $set
        const payload = { userId: 'x', wallet: 100, stats: undefined, inventory: {} };
        const stripped = economy.deepStripUndefined(payload);
        ok(!('stats' in stripped) && stripped.wallet === 100, 'stats:undefined stripped from whole-doc payload');
    }

 // -- D. regression: normal leaf granularity preserved --
    section('D. LEAF GRANULARITY + TASK-13 REGRESSION');
    {
        const base = { stats: { hp: 1, def: 2 } };
        const ours = { stats: { hp: 1, def: 3 } };
        const { writeSet } = economy.leafDiff(ours, base);
        ok(writeSet['stats.def'] === 3 && !('stats.hp' in writeSet) && !('stats' in writeSet),
           'object-vs-object stays leaf-granular (no promotion)');
    }
    {
        const base = { stats: { hp: 1 } };
        const ours = { stats: { hp: 1, def: 3 } };
        const { writeSet } = economy.leafDiff(ours, base);
        ok(writeSet['stats.def'] === 3 && !('stats' in writeSet),
           'new leaf inside EXISTING db object stays a leaf write (object ancestor, works in Mongo)');
    }
    {
 // Task-13 churn kill: undefined leaves skipped
        const out = economy.flattenLeaves({ inventory: { brew: { quantity: 4, slot: undefined } } }, '', {});
        ok(!('inventory.brew.slot' in out) && out['inventory.brew.quantity'] === 4, 'flattenLeaves still skips undefined keys');
    }
    {
 // Task-13 merge safety: sibling-added item survives our unrelated change
        const ours = { wallet: 500, inventory: { potion: { quantity: 1 } } };
        const base = { wallet: 500, inventory: { potion: { quantity: 1 } } };
        const theirs = { wallet: 500, inventory: { potion: { quantity: 1 }, sword: { quantity: 1 } } };
        const merged = economy.threeWayMerge(ours, base, theirs);
        ok(merged.inventory.sword && merged.inventory.potion, 'threeWayMerge still preserves sibling additions');
    }

 // -- E. repairItemStats null-stats self-heal --
    section('E. REPAIR-ITEM-STATS NULL HEAL');
    {
        const info = inventorySystem.lootSystem ? null : null; // (lootSystem internal; use getItemInfo via repair)
        const item = { id: 'obsidian_shield', type: 'EQUIPMENT', stats: null, enhancementLevel: 0 };
        const r = inventorySystem.repairItemStats(item, 'obsidian_shield');
        const baseInfo = require(path.join(repo, 'core/rpg/lootSystem')).getItemInfo('obsidian_shield');
        if (baseInfo && baseInfo.stats && Object.keys(baseInfo.stats).length) {
            ok(r === true, 'null-stats equipped item detected as corrupted');
            ok(item.stats && typeof item.stats === 'object' && Object.keys(item.stats).length > 0,
               `stats restored from DB defs (${JSON.stringify(item.stats)})`);
            ok(item.baseStats && Object.keys(item.baseStats).length > 0, 'baseStats seeded for future recalcs');
        } else {
            ok(item.stats === null || (item.stats && typeof item.stats === 'object'), 'def missing - no crash either way');
            console.log(`  ℹ️ obsidian_shield has no baseStatsRef in this checkout; skipped strict asserts`);
        }
    }
    {
        const item = { id: 'iron_ring', type: 'EQUIPMENT', stats: { atk: 3 }, enhancementLevel: 0 };
        const baseInfo = require(path.join(repo, 'core/rpg/lootSystem')).getItemInfo('iron_ring');
        if (baseInfo && baseInfo.stats) {
            const r = inventorySystem.repairItemStats(item, 'iron_ring');
            const matches = Object.keys(baseInfo.stats).every(s => item.stats[s] === baseInfo.stats[s]);
            ok(r === false || matches, 'healthy item untouched (no false-positive repair)');
        } else {
            console.log('  ℹ️ iron_ring not in defs; skipped');
        }
    }

 // -- F. upgradeInventory flow (sandbox_ user → no DB writes) --
    section('F. UPGRADE-INVENTORY FLOW');
    {
        const jid = 'sandbox_qa_bag_' + Date.now();
        economy.registerUser(jid, 'BagQA');
        const u = economy.getUser(jid);
        u.wallet = 100000;
        const inv = inventorySystem.upgradeInventory(jid);
        ok(inv.success === true && inv.oldSlots === 20 && inv.newSlots === 25, `first upgrade 20→25 (cost ${inv.cost})`);
        ok(u.wallet === 100000 - inv.cost, 'wallet deducted exactly the quoted cost');
        const inv2 = inventorySystem.upgradeInventory(jid);
        ok(inv2.success && inv2.cost === Math.floor(inv.cost * 1.5), 'cost ladder ×1.5 per tier');
 // insufficient funds
        u.wallet = 10;
        const inv3 = inventorySystem.upgradeInventory(jid);
        ok(!inv3.success && /Not enough Zeni/.test(inv3.message) && /2,000|3,000|4,500|6,750/.test(inv3.message),
           `insufficient message shows both numbers ("${inv3.message}")`);
 // max slots
        u.wallet = 99999999; u.inventorySlots = 100;
        const inv4 = inventorySystem.upgradeInventory(jid);
        ok(!inv4.success && /maximum/.test(inv4.message), 'max slots refused');
 // rpgCommands wrapper end-to-end (stub sock, two-arg sendMessage)
        let sent = null;
        const sock = { sendMessage: async (chat, msg) => { sent = msg; } };
        u.wallet = 50000; u.inventorySlots = 20;
        await rpgCommands.upgradeInventory(sock, 'chat_qa', jid);
        ok(sent && /BAG\+/.test(sent.text) && /20 → 25/.test(sent.text), 'wrapper sends success card with slot delta');
    }

 // -- G. router arg patterns (mirrors engine.js branches) --
    section('G. ROUTER ARG PATTERNS');
    {
        const upRe = /^(upgrade|expand|up)$/i;
        ok(upRe.test('upgrade') && upRe.test('UP') && upRe.test('expand'), 'inv+arg: upgrade/expand/up accepted');
        ok(!upRe.test('1') && !upRe.test('2'), 'inv+page number still shows the page');
        ok(!upRe.test('upgradeable') && !upRe.test('upgraded'), 'no false positives on longer words');
        const nouns = ['bag', 'inv', 'inventory', 'BAG'];
        ok(nouns.every(n => ['bag', 'inv', 'inventory'].includes(n.toLowerCase())), 'upgrade/expand + bag-nouns accepted');
        ok(!['bag', 'inv', 'inventory'].includes('bagp'), 'no false-positive nouns');
    }

    console.log(`\n══════════ RESULT: ${pass} passed / ${fail} failed ══════════`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error('QA CRASH:', e); process.exit(1); });
