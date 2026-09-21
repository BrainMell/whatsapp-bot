// Functional smoke: .j world captions through the REAL showWorld path
// (mock sock; no DB).
// 2026-09-20 owner ruling: captions are SHORT and subtle - one or two lines,
// no mechanics, no command dumps, no lore spills. Lore belongs to the drops.
// Also covers the NEW `.j world all` gathered-chart gate (mods bypass,
// regular players need every unlockable map).
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';
// 💡 STUB ENGINE (#b4f71c staff bypass): worldMap._isStaff lazily requires
// ../engine - pre-seed the require cache so QA never loads the real engine.
const __enginePath = require.resolve('../core/engine.js');
require.cache[__enginePath] = { id: __enginePath, filename: __enginePath, loaded: true, exports: { isBotOwner: () => false, isGlobalMod: () => false, isRpgMod: () => false } };
const worldMap = require('../core/rpg/worldMap');

const sent = [];
const mockSock = { sendMessage: async (chatId, msg) => sent.push(msg) };

function assert(cond, label) {
    if (!cond) { console.error('✗ FAIL:', label); process.exitCode = 1; }
    else console.log('✓', label);
}

(async () => {
    const chatId = 'qa@c.us';
    const user = 'qa_user@s.whatsapp.net';

    // 1. locked abyss map at level 12 → the worlds-not-aligned IMAGE CARD
    // (owner 2026-09-21), the requirement as caption; the sheet never renders
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'abyss', { getLevel: () => 12 });
    assert(sent.length === 1 && !!sent[0].image, 'locked abyss (lvl 12): refusal CARD sent (owner 2026-09-21)');
    assert(/level \*20\*/.test(sent[0].caption || sent[0].text || ''), 'refusal names the CONFIRMED requirement (level 20)');
    const abyssSheetBuf0 = await require('../core/rpg/worldMapRenderer').renderAbyssSheet();
    assert(!sent[0].image.equals(abyssSheetBuf0), 'locked abyss: the card is NOT the abyss sheet');

    // 2. unlocked abyss map at level 20 → image + SHORT subtle caption
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'abyss', { getLevel: () => 20 });
    const cap = sent[0].caption || '';
    assert(!!sent[0].image, 'unlocked abyss (lvl 20): image renders');
    assert(cap.includes('rings upon rings'), 'abyss caption: the one identifying line is present');
    assert(!cap.includes('.j abyss enter'), 'abyss caption: NO command dump');
    assert(!cap.includes('wear faces'), 'abyss caption: NO variant-band spill (lore drops own that)');
    assert(!cap.includes('walks like you'), 'abyss caption: NO drifter spill');
    assert(!cap.includes('.j brew'), 'abyss caption: NO deep-brew pointer');
    assert(!cap.includes('dungeon-world') && !cap.includes('five hours'), 'abyss caption: no cosmology leak');
    assert(cap.length <= 400, 'abyss caption is SHORT (' + cap.length + ' chars)');

    // 3. First World sheet caption: short, no service list
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, '', {});
    const capFW = sent[0].caption || '';
    assert(!!sent[0].image, 'First World: image renders (no gate)');
    assert(capFW.includes('four quadrants'), 'FW caption: the one identifying line is present');
    assert(!capFW.includes('.j adventure') && !capFW.includes('.j repair'), 'FW caption: NO command dump');
    assert(!capFW.includes('five hours'), 'FW caption: no orbit equation leak');
    assert(capFW.length <= 400, 'FW caption is SHORT (' + capFW.length + ' chars)');

    // 4. world beyond locked at rank A → LOCKED CARD + requirement caption
    // (owner 2026-09-21: the World Beyond is locked for everyone except the
    // owner until the conditions are met; refusals are visual)
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'beyond', { getRank: () => 'A' });
    assert(sent.length === 1 && !!sent[0].image, 'beyond locked at rank A: refusal CARD sent (owner 2026-09-21)');
    assert(/rank \*S\*/.test(sent[0].caption || sent[0].text || ''), 'beyond refusal names the rank requirement');
    const wbSheetBuf0 = await require('../core/rpg/worldMapRenderer').renderWorldBeyondSheet();
    assert(!sent[0].image.equals(wbSheetBuf0), 'locked beyond: the card is NOT the WB sheet');

    // 4b. afterlife locked (dead-soul feature absent) → LOCKED CARD + requirement
    // caption (owner 2026-09-21: access failures get a visual refusal card; the
    // map itself is still never rendered)
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'afterlife', { getRank: () => 'A' });
    assert(sent.length === 1 && !!sent[0].image, 'afterlife locked: refusal CARD renders');
    assert(/reading of dead souls/.test(sent[0].caption || ''), 'afterlife locked: caption names the requirement');
    assert((sent[0].caption || '').length <= 400, 'afterlife locked caption is SHORT');

    // 5. invalid sub → usage menu (now lists .j world all)
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'narnia', {});
    assert(/WORLD CHARTS/.test(sent[0].text) && sent[0].text.includes('world all'), 'invalid sub-arg: usage menu lists world all');

    // 6. NEW `.j world all` - low-rank low-level player: refusal names BOTH gaps
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'all', { getLevel: () => 8, getRank: () => 'B' });
    assert(sent.length === 1 && !sent[0].image, 'world all (B rank, lvl 8): refusal only, zero image bytes');
    assert(/rank \*S\*/.test(sent[0].text) && /level \*20\*/.test(sent[0].text), 'world all refusal names rank S AND level 20');

    // 7. NEW `.j world all` - earned it (rank S + lvl 20): renders
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'all', { getLevel: () => 20, getRank: () => 'S' });
    const capAll = sent[0].caption || '';
    assert(!!sent[0].image, 'world all (S rank, lvl 20): atlas renders');
    assert(capAll.includes('gathered on one page'), 'world all caption: identifying line present');
    assert(capAll.length <= 400, 'world all caption is SHORT (' + capAll.length + ' chars)');

    // 8. NEW `.j world all` - MOD bypass at zero progress
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'all', { getLevel: () => 1, getRank: () => 'F', isMod: () => true });
    assert(!!sent[0].image, 'world all: mod bypass renders regardless of progress');

    console.log(process.exitCode ? 'CAPTION SMOKE: FAILURES ABOVE' : 'CAPTION SMOKE: ALL PASS');
})().catch(e => { console.error('SMOKE ERROR:', e); process.exit(1); });
