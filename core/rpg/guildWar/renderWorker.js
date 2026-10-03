// 🖼️ Ruins map render worker (child process) — keeps node-canvas drawing OFF
// the bot's event loop. Receives {id, doc, player, extras}, replies {id, png|error}.
process.on('message', async (msg) => {
    if (!msg || msg.type !== 'render') return;
    try {
        const renderer = require('./mapRenderer');
        const buf = await renderer._renderInProcess(msg.doc, msg.player, msg.extras || {});
        process.send({ id: msg.id, png: buf.toString('base64') });
    } catch (e) {
        process.send({ id: msg.id, error: e.message });
    }
});
