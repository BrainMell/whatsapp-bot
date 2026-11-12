'use strict';
// Render the whole cinematic to an H.264/AAC mp4 (WhatsApp-friendly) by piping frames into ffmpeg.
const { spawn } = require('child_process');
const { createCanvas } = require('canvas');
const TL = require('./timeline');
const S = require('./scenes');

async function renderIntro({ audioPath, outPath, crf = 25, onProgress, maxSeconds }) {
  const a = S.buildAssets(); await a.logoPromise; await a.artPromise;
  const { W, H, FPS } = TL, total = Math.round((maxSeconds || TL.DURATION) * FPS);
  const args = ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-'];
  if (audioPath) args.push('-i', audioPath);
  args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'main', '-level', '3.1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-g', '48', '-maxrate', '1800k', '-bufsize', '3600k');
  if (audioPath) args.push('-c:a', 'aac', '-b:a', '112k', '-ar', '44100', '-shortest');
  args.push(outPath);
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))); ff.on('error', rej); });
  const cv = createCanvas(W, H), ctx = cv.getContext('2d');
  for (let n = 0; n < total; n++) {
    S.renderFrame(ctx, a, n / FPS, n);
    const buf = cv.toBuffer('raw');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (onProgress && n % 120 === 0) onProgress(n / total);
  }
  ff.stdin.end(); await done; return outPath;
}
module.exports = { renderIntro };
