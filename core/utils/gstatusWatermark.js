'use strict';
// Omniverse watermark (bottom-right) for every image/video the bot posts to a group status.
// Best-effort: any failure returns the original buffer so a post is never blocked.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const LOGO = path.join(__dirname, '..', 'assets', 'omniverse_wm.png');
const WIDTH_FRAC = 0.24; // logo width relative to the media width
const MARGIN_FRAC = 0.025;

async function image(buf) {
  try {
    const { Jimp } = require('jimp');
    const base = await Jimp.read(buf);
    const W = base.bitmap.width, H = base.bitmap.height;
    const logo = await Jimp.read(LOGO);
    const lw = Math.max(48, Math.round(Math.min(W, H * 0.9) * WIDTH_FRAC));
    logo.resize({ w: lw });
    const m = Math.round(Math.min(W, H) * MARGIN_FRAC);
    base.composite(logo, W - logo.bitmap.width - m, H - logo.bitmap.height - m);
    const mime = /png/i.test(String(buf.slice(0, 8).toString('latin1'))) ? 'image/png' : 'image/jpeg';
    return await base.getBuffer(mime);
  } catch (e) {
    console.log('[GStatus] watermark(image) skipped:', e && e.message);
    return buf;
  }
}

async function video(buf) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gswm-'));
  try {
    const inP = path.join(dir, 'in.mp4'), outP = path.join(dir, 'out.mp4');
    await fs.promises.writeFile(inP, buf);
    const fc = `[1:v][0:v]scale2ref=w=main_w*${WIDTH_FRAC}:h=ow/a[lg][bg];[bg][lg]overlay=W-w-W*${MARGIN_FRAC}:H-h-W*${MARGIN_FRAC}`;
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} reject(new Error('timeout 90s')); }, 90000);
      const p = execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', inP, '-i', LOGO, '-filter_complex', fc,
        '-map', '0:a?', '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outP],
        { maxBuffer: 8 * 1024 * 1024 }, (err) => { clearTimeout(t); err ? reject(err) : resolve(); });
    });
    const out = await fs.promises.readFile(outP);
    return out.length ? out : buf;
  } catch (e) {
    console.log('[GStatus] watermark(video) skipped:', e && e.message);
    return buf;
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { image, video, LOGO };
