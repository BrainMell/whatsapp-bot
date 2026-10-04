// 🖼️ Ruins render worker (child process) — keeps node-canvas drawing OFF
// the bot's event loop. Handles BOTH render kinds:
//   {type:'map', id, doc, player, extras}      → landscape war map
//   {type:'room', id, doc, player, room, opts} → door-variant room scene
// Replies {id, kind, png|error}.
process.on('message', async (msg) => {
    if (!msg || !['render', 'room'].includes(msg.type)) return;
    try {
        if (msg.type === 'room') {
            const roomScene = require('./roomScene');
            const buf = await roomScene._renderInProcess(msg.doc, msg.player, msg.room, msg.opts || {});
            process.send({ id: msg.id, kind: 'room', png: buf.toString('base64') });
        } else {
            const renderer = require('./mapRenderer');
            const buf = await renderer._renderInProcess(msg.doc, msg.player, msg.extras || {});
            process.send({ id: msg.id, kind: 'map', png: buf.toString('base64') });
        }
    } catch (e) {
        process.send({ id: msg.id, kind: msg.type === 'room' ? 'room' : 'map', error: e.message });
    }
});
