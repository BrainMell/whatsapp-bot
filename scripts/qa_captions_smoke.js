// Final functional smoke: .j world captions through the REAL showWorld path
// (mock sock; no DB). Verifies the upgraded exploration captions flow into
// both the image-caption path and the text fallback path.
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';
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

    // 1. locked abyss map at level 12 → refusal text, NO image bytes
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'abyss', { getLevel: () => 12 });
    assert(sent.length === 1 && !sent[0].image, 'locked abyss (lvl 12): refusal only, zero image bytes');
    assert(/level \*20\*/.test(sent[0].text), 'refusal names the CONFIRMED requirement (level 20)');

    // 2. unlocked abyss map at level 20 → image + caption with new guide lines
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'abyss', { getLevel: () => 20 });
    const cap = sent[0].caption || '';
    assert(!!sent[0].image, 'unlocked abyss (lvl 20): image renders');
    assert(cap.includes('.j abyss enter'), 'abyss caption: WHERE TO EXPLORE pointer present');
    assert(cap.includes('wear faces'), 'abyss caption: subtle variant hint present (no spawn table)');
    assert(cap.includes('walks like you'), 'abyss caption: subtle drifter hint present');
    assert(cap.includes('.j brew'), 'abyss caption: deep brews pointer present');
    assert(!cap.includes('dungeon-world'), 'abyss caption: no mechanic leak (floor-is-world stays with the lore drops)');
    assert(!cap.includes('five hours'), 'abyss caption: no schedule leak');
    assert(cap.length <= 1024, 'abyss caption within WhatsApp 1024-char limit (' + cap.length + ')');

    // 3. First World sheet caption: town services + hunts
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, '', {});
    const capFW = sent[0].caption || '';
    assert(!!sent[0].image, 'First World: image renders (no gate)');
    assert(capFW.includes('.j adventure') && capFW.includes('.j repair'), 'FW caption: hunts + blacksmith named');
    assert(capFW.includes('.j brew') && capFW.includes('.j hospital'), 'FW caption: brewing + hospital named');
    assert(!capFW.includes('five hours'), 'FW caption: no orbit equation leak');
    assert(capFW.length <= 1024, 'FW caption within limit (' + capFW.length + ')');

    // 4. world beyond locked at rank A → refusal, no render
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'beyond', { getRank: () => 'A' });
    assert(sent.length === 1 && !sent[0].image && /rank \*S\*/.test(sent[0].text), 'beyond locked at rank A: refusal only');

    // 5. invalid sub → usage menu
    sent.length = 0;
    await worldMap.showWorld(mockSock, chatId, user, 'narnia', {});
    assert(/WORLD CHARTS/.test(sent[0].text), 'invalid sub-arg: usage menu');

    console.log(process.exitCode ? 'CAPTION SMOKE: FAILURES ABOVE' : 'CAPTION SMOKE: ALL PASS');
})().catch(e => { console.error('SMOKE ERROR:', e); process.exit(1); });
