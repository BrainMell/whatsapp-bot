'use strict';
// End-to-end QA for class ultimate VFX media: render → GIF → WhatsApp-safe MP4.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { createCanvas } = require('canvas');
const skillVfx = require('../core/rpg/skillVfx');
const gif89a = require('../core/utils/gif89a');
const { gifToMp4Even } = require('../core/utils/mediaConvert');

const execFileAsync = promisify(execFile);
let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
  if (ok) {
    pass++;
    console.log('PASS', name, extra);
  } else {
    fail++;
    console.error('FAIL', name, extra);
  }
}

(async () => {
  const width = 480;
  const height = 360;
  const scene = createCanvas(width, height);
  const ctx = scene.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#171e35');
  sky.addColorStop(0.7, '#343047');
  sky.addColorStop(1, '#17131e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#10121f';
  ctx.fillRect(0, 285, width, 75);
  ctx.fillStyle = '#d6a6a2';
  ctx.fillRect(100, 155, 28, 105);
  ctx.beginPath(); ctx.arc(114, 145, 18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#817b8a';
  ctx.fillRect(320, 150, 45, 120);
  ctx.beginPath(); ctx.arc(342, 137, 24, 0, Math.PI * 2); ctx.fill();
  const background = scene.toBuffer('image/png');

  const player = { name: 'QA Berserker', class: { id: 'BERSERKER', icon: '🪓' } };
  const ability = { id: 'last_stand', name: 'Last Stand' };
  const state = { inCombat: true, phase: 'COMBAT', turnCount: 1, players: [], enemies: [] };
  const entry = skillVfx.getSignature('BERSERKER', 'last_stand');
  check('Berserker Last Stand signature is mapped', !!entry);
  if (!entry) throw new Error('Missing Berserker signature mapping');

  const gif = await skillVfx.renderSignatureGif(state, player, ability, entry, null, background);
  check('renderer outputs GIF89a bytes', gif89a.isGifBuffer(gif) && gif.length > 1000, String(gif ? gif.length : 0) + ' bytes');

  const thumbnail = gif89a.firstFrameJpeg(gif);
  check('frame-0 thumbnail is valid JPEG', Buffer.isBuffer(thumbnail) &&
    thumbnail.length > 500 && thumbnail[0] === 0xff && thumbnail[1] === 0xd8,
    String(thumbnail ? thumbnail.length : 0) + ' bytes');

  const mp4 = await gifToMp4Even(gif);
  check('converter outputs MP4 container', Buffer.isBuffer(mp4) && mp4.length > 500 &&
    mp4.toString('latin1', 4, 8) === 'ftyp', String(mp4 ? mp4.length : 0) + ' bytes');

  const outPath = path.join(os.tmpdir(), 'qa-skill-vfx-' + process.pid + '-' + Date.now() + '.mp4');
  try {
    fs.writeFileSync(outPath, mp4);
    const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
    const result = await execFileAsync(ffprobe, [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,pix_fmt,width,height',
      '-show_entries', 'format=duration', '-of', 'json', outPath
    ], { timeout: 10000, maxBuffer: 1024 * 1024 });
    const details = JSON.parse(result.stdout);
    const stream = details.streams && details.streams[0];
    check('MP4 decodes as H.264 yuv420p', !!stream &&
      stream.codec_name === 'h264' && stream.pix_fmt === 'yuv420p',
      stream ? stream.codec_name + ', ' + stream.pix_fmt : 'no video stream');
    check('MP4 dimensions are even and expected', !!stream &&
      stream.width === width && stream.height === height &&
      stream.width % 2 === 0 && stream.height % 2 === 0,
      stream ? stream.width + 'x' + stream.height : 'no video stream');
    check('MP4 has a positive duration', Number(details.format && details.format.duration) > 0,
      details.format && details.format.duration || 'missing');
  } finally {
    try { fs.unlinkSync(outPath); } catch {}
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
})().catch((err) => {
  console.error('QA CRASH:', err && err.stack || err);
  process.exitCode = 2;
});
