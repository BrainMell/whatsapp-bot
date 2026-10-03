// QA: owner-order fixes 2026-09-22
//  A. Mod add/remove restored (owner was told "do it manually" - the
//     immutable-mod-roles stubs are overruled and the original DB-backed
//     command bodies are back).
//  B. `.j gcowner @user` - mark a per-GC owner in the DB, immune to mute/
//     hardmute/kick/warn/demote/nuke/antispam/antibot/antilink.
//
// Runtime-proves: gcOwners registry round-trip + persistence + LID-safe
// identity matching (real module, in-memory KV) + source pins for every
// immunity surface and every restored command body.

process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const botConfig = require('../botConfig');
const System = require('../core/models/System');

// ── stub DB-touching model methods (in-memory) ───────────────────────────
const kv = {};
System.find = () => { const p = Promise.resolve(Object.entries(kv).map(([key, value]) => ({ key, value }))); return { lean: () => p, then: (r, j) => p.then(r, j), catch: (j) => p.catch(j) }; };
System.findOne = (q) => { const p = Promise.resolve(kv[q.key] ? { key: q.key, value: kv[q.key] } : null); return { lean: () => p, then: (r, j) => p.then(r, j), catch: (j) => p.catch(j) }; };
System.updateOne = async (q, u) => { // system.set shape: updateOne({ key }, { value }, { upsert: true })
    kv[q.key] = (u && u.value !== undefined) ? u.value : (u && u.$set ? u.$set.value : undefined);
    return {}; };
System.findOneAndUpdate = async (q, u) => { kv[q.key] = u.$set ? u.$set.value : u.value; return { key: q.key, value: kv[q.key] }; };

let pass = 0, fail = 0;
function assert(cond, label) {
    if (cond) { pass++; console.log('✓', label); }
    else { fail++; console.error('✗ FAIL:', label); process.exitCode = 1; }
}

function cfgFor(botId) {
    return {
        getBotId: () => botId, getBotName: () => botId,
        getPrefix: () => (botId === 'Joker' ? '.j' : '.s'),
        getCurrency: () => ({ symbol: 'Ꞩ', name: 'Zeni' }),
        getAssetPath: () => '', getStickerPath: () => '', getDataPath: () => '',
        getRPGAssetPath: () => '', getAuthPath: () => '', getSiblings: () => [],
        isEnabled: () => true, getVersion: () => '5.3.2', getSymbol: () => '.',
        getContentDescription: () => '', getFastResponses: () => [], pairingPhone: null,
    };
}
async function asJoker(fn) { return botConfig.storage.run(cfgFor('Joker'), fn); }

const fs = require('fs');
const engineSrc = fs.readFileSync('./core/engine.js', 'utf8');
const cardSrc = fs.readFileSync('./core/rpg/cardSystem.js', 'utf8');
const securitySrc = fs.readFileSync('./core/utils/security.js', 'utf8');

const GC = 'protected-gc@g.us';
const OWNER_PHONE = '251777123456';
const OWNER_JID = `${OWNER_PHONE}@s.whatsapp.net`;
const BYSTANDER = '251999000111@s.whatsapp.net';

(async () => {
    console.log('\n── 1. GC owner registry: mark / check / clear (REAL module runtime) ──');
    const reg = require('../core/utils/gcOwners');
    await asJoker(async () => {
        reg.setGcOwner(GC, OWNER_JID);
        assert(reg.isGcOwner(OWNER_JID, GC) === true, 'marked owner matches exact JID');
        assert(reg.isGcOwner(`${OWNER_PHONE}:12@s.whatsapp.net`, GC) === true, 'device-suffixed spelling still matches');
        assert(reg.isGcOwner(BYSTANDER, GC) === false, 'another user does NOT match');
        assert(reg.isGcOwner(OWNER_JID, 'other-gc@g.us') === false, 'immunity is scoped to the marked GC only');
        assert(reg.getGcOwner(GC) !== null, 'getGcOwner returns the mark');
    });

    console.log('\n── 2. GC owner identity survives LID spellings ──');
    await asJoker(async () => {
        const lidResolver = require('../core/utils/lidResolver');
        // Seed the resolver cache exactly like a live session would:
        // LID number 923000444555 belongs to phone 251777123456.
        lidResolver.lidCache.set('923000444555', OWNER_PHONE);
        assert(reg.isGcOwner('923000444555@lid', GC) === true, '@lid mention resolves to the marked phone owner');
        // And the inverse direction: mark stored, check arrives as LID even
        // if the mark itself was stored from an @lid mention.
        reg.setGcOwner('lidgc@g.us', '923000444556@lid');
        lidResolver.lidCache.set('923000444556', '251777999888');
        assert(reg.isGcOwner('251777999888@s.whatsapp.net', 'lidgc@g.us') === true, 'phone check matches an @lid-stored mark');
    });

    console.log('\n── 3. GC owner mark persists to the shared DB and survives a reload ──');
    await asJoker(async () => {
        const persisted = kv['_shared_gc_owners'];
        assert(persisted && persisted[GC] && persisted[GC].includes(OWNER_PHONE), 'mark saved under _shared_gc_owners (shared key) via System.updateOne');
        // Fresh "boot": evict BOTH the registry and system.js, re-require,
        // then loadGcOwners() reads the shared key STRAIGHT from the DB layer
        // (System.findOne stub -> kv) via getFresh - no boot cache involved.
        delete require.cache[require.resolve('../core/utils/gcOwners')];
        delete require.cache[require.resolve('../core/utils/system')];
        const reg2 = require('../core/utils/gcOwners');
        await reg2.loadGcOwners();
        assert(reg2.isGcOwner(OWNER_JID, GC) === true, 'after a full DB reload the immunity is still enforced');
        const had = await reg2.clearGcOwner(GC);
        assert(had === true, 'clearGcOwner reports a removal');
        assert(reg2.isGcOwner(OWNER_JID, GC) === false, 'immunity lifted after ungcowner');
        assert(kv['_shared_gc_owners'] && !kv['_shared_gc_owners'][GC], 'removal persisted to the DB');
    });

    console.log('\n── 4. Mod add/remove restored (immutable-policy stubs OVERRULED) ──');
    {
        assert(!engineSrc.includes('Mod roles are immutable'), 'no immutable-policy refusal left in engine.js');
        assert(!cardSrc.includes('Mod roles are immutable'), 'no immutable-policy refusal left in cardSystem.js');
        // Restored bodies call the DB-backed helpers:
        assert(/addmod[\s\S]{0,2600}?await addGlobalMod\(target\);/.test(engineSrc), 'addmod body grants via addGlobalMod');
        assert(/delmod[\s\S]{0,900}?await delGlobalMod\(target\);/.test(engineSrc), 'delmod body revokes via delGlobalMod');
        assert(/delmod[\s\S]{0,1600}?await delRpgMod\(target\);[\s\S]{0,400}?await delCardsMod\(target\);/.test(engineSrc), 'delmod cleans ALL mod roles (Global+RPG+Cards)');
        assert(/addrpgmod[\s\S]{0,900}?await addRpgMod\(target\);/.test(engineSrc), 'addrpgmod body grants via addRpgMod');
        assert(/delrpgmod[\s\S]{0,900}?await delRpgMod\(target\);/.test(engineSrc), 'delrpgmod body revokes via delRpgMod');
        assert(/addcardsmod[\s\S]{0,900}?await addCardsMod\(target\);/.test(engineSrc), 'addcardsmod body grants via addCardsMod');
        assert(/delcardsmod[\s\S]{0,900}?await delCardsMod\(target\);/.test(engineSrc), 'delcardsmod body revokes via delCardsMod');
        // Permission ladder: addmod OWNER-ONLY (escalation fix stands)...
        const addmodIdx = engineSrc.indexOf('addmod`,');
        assert(addmodIdx !== -1, 'addmod branch present');
        const addmodBlock = engineSrc.slice(addmodIdx, addmodIdx + 900);
        assert(addmodBlock.includes('if (!isOwner) {'), 'addmod stays OWNER-ONLY (mods still cannot add mods)');
        // cardmod add/del restored in cardSystem:
        assert(/case 'cardmod':[\s\S]{0,600}?sub === 'add'[\s\S]{0,600}?inst\.modJids\.add\(target\)/.test(cardSrc), 'cardmod add writes the roster again');
        assert(/case 'cardmod':[\s\S]{0,1400}?sub === 'del'[\s\S]{0,600}?inst\.modJids\.delete\(target\)/.test(cardSrc), 'cardmod del revokes the roster again');
        assert(/case 'cardmod':[\s\S]{0,400}?if \(!isOwner && !isMod\)/.test(cardSrc), 'cardmod manage stays owner/global-mod gated');
        // reloadmods / listmods untouched:
        assert(engineSrc.includes('reloadmods'), 'reloadmods still present');
        assert(engineSrc.includes('listmods'), 'listmods still present');
    }

    console.log('\n── 5. `.j gcowner` command wired (owner-only, group-only) ──');
    {
        assert(engineSrc.includes('gcowner` ||') || engineSrc.includes('gcowner`'), 'gcowner command branch present');
        const gcIdx = engineSrc.indexOf("gcowner` ||");
        const gcBlock = engineSrc.slice(gcIdx, gcIdx + 3000);
        assert(gcBlock.includes('if (!isOwner) {'), 'gcowner is bot-owner-only');
        assert(gcBlock.includes("endsWith(\"@g.us\")"), 'gcowner refuses outside groups');
        assert(gcBlock.includes('await setGcOwner(chatId, target)'), 'gcowner marks via the registry');
        assert(gcBlock.includes('unmuteUser(target, chatId)'), 'marking clears any live mute in this GC');
        assert(engineSrc.includes('ungcowner` ||'), 'ungcowner command branch present');
        assert(engineSrc.includes('"gcowner"') && engineSrc.includes('"ungcowner"'), 'gcowner/ungcowner added to validPrefixes');
    }

    console.log('\n── 6. Immunity surfaces all check isGcOwner ──');
    {
        const count = (re) => (engineSrc.match(re) || []).length;
        // mute command guard + central muteUser guard:
        assert(count(/isGcOwner\(targetUser, chatId\)/g) >= 2, 'mute + hardmute target guards present');
        assert(count(/isGcOwner\(target, chatId\)/g) >= 2, 'kick + demote target guards present');
        assert(engineSrc.includes('isGcOwner(senderJid, chatId)'), 'antispam + antibot sender exemptions present');
        assert(engineSrc.includes('isGcOwner(pid, chatId)'), 'nuke spares the marked owner (identity-safe)');
        assert(engineSrc.includes('if (isGcOwner(userId, chatId)) {') && engineSrc.includes("mute suppressed for the marked owner"), 'central muteUser guard blocks EVERY mute path');
        assert(securitySrc.includes('engine.isGcOwner(normalizedSender, chatId)'), 'antilink security exempts the marked GC owner');
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    // Explicit exit: the fresh-boot simulation in section 3 re-requires
    // system.js, leaving a second Mongo-handle tree the event loop waits
    // on (same documented exit-linger noise as the rest of the battery).
    process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('✗ FATAL:', e); process.exit(1); });
