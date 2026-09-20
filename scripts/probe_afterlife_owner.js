// Runtime probe: does `.j world afterlife` staff bypass actually resolve for the owner?
process.env.GO_IMAGE_SERVICE_URL = 'http://127.0.0.1:7860';
const path = require('path');
const enginePath = path.join(__dirname, '..', 'core', 'engine.js');

let engine;
try {
    engine = require(enginePath);
    console.log('engine loaded OK. exports include isBotOwner:', typeof engine.isBotOwner);
} catch (e) {
    console.log('REAL ENGINE LOAD FAILED (environmental):', e.message);
    process.exit(2);
}

const checks = [
    ['phone form', '233201487480@s.whatsapp.net'],
    ['lid form', '105712667648066@lid'],
    ['lid 2', '251453323092189@lid'],
    ['random user', '999999@s.whatsapp.net'],
];
for (const [label, jid] of checks) {
    console.log(`isBotOwner(${label}) =`, engine.isBotOwner(jid));
}

// worldMap staff resolution through the REAL engine export
const worldMap = require(path.join(__dirname, '..', 'core', 'rpg', 'worldMap.js'));
// _isStaff is not exported; probe via showWorld with a mock sock and capture output
const sent = [];
const sock = { sendMessage: async (c, m) => sent.push(m) };
(async () => {
    for (const [label, jid] of checks) {
        sent.length = 0;
        try {
            await worldMap.showWorld(sock, 'probe@g.us', jid, 'afterlife', {});
            const first = sent[0] || {};
            console.log(`afterlife as ${label}: -> ${first.image ? 'IMAGE card' : 'text'} :: ${String(first.caption || first.text || '').split('\n')[0].slice(0, 70)}`);
        } catch (e) {
            console.log(`afterlife as ${label}: THREW ${e.message}`);
        }
    }
    process.exit(0);
})();
