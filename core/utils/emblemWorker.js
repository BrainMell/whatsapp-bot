// emblemWorker.js - isolated sharp processor for guild emblem uploads.
// WHY: a native libvips/GLib crash inside sharp (e.g. an exotic/corrupt
// iPhone HEIF photo) ABORTS the whole Node process - the bot dies mid-reply
// and pm2 restarts it a minute later (the "hourglass then hang" report).
// Running sharp in this child process means the worst case is a dead
// worker, never a dead bot.
//
// Protocol: raw image bytes on stdin -> PNG bytes on stdout.
// Exit 0 + non-empty stdout = success. Anything else = failure.
'use strict';
const sharp = require('sharp');

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', async () => {
  try {
    const png = await sharp(Buffer.concat(chunks), {
      limitInputPixels: 8000000,
      sequentialRead: true,
      failOn: 'none', // be tolerant of slightly corrupt input instead of crashing
    })
      .rotate()
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    process.stdout.write(png);
    process.exit(0);
  } catch (e) {
    console.error('emblemWorker:', e.message);
    process.exit(1);
  }
});
// Hard self-kill: if the pipeline somehow wedges, die so the parent's
// timeout path stays the only waiter.
setTimeout(() => process.exit(3), 60000).unref();
