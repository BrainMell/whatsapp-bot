'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  MEDIA CONVERT — the ffmpeg shell-outs for animated media (Task 24).
//
//  ⚠ 2026-10-21: a raw GIF sent as `video` is not a valid WhatsApp video
//  (the phone only plays MP4/H.264) — every animated lane must ship real
//  MP4. The summon lane proved the ffmpeg pipeline; this module centralises
//  it so baseBuilder/dockPov stop carrying their own copies.
//
//  Task 24 (owner 06:30Z): "the gif itself is cached, you just plaster that
//  overlay on it depending on what you catch, instead of fusing it into the
//  animation, so then you only have to generate the overlay and plaster it
//  on, making the generation wayyy faster" — gifToMp4Overlaid() is that
//  plaster: cached base GIF + cached transparent ribbon PNG → ONE ffmpeg
//  pass → H.264 MP4. The expensive canvas work (compose + encode) happens
//  once per (biome, level, phase, band); every catch after that only pays
//  for this conversion.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

function _tmp(ext) {
    return path.join(os.tmpdir(), `mc_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}${ext}`);
}
function _clean(...files) { for (const f of files) { try { fs.unlinkSync(f); } catch (e) { /* tmp */ } } }

function _run(args, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        execFile(FFMPEG, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err) => (err ? reject(err) : resolve()));
    });
}

/** GIF → H.264 MP4 (even dimensions, aspect kept, faststart). */
async function gifToMp4Even(gifBuf) {
    const gi = _tmp('.gif'), mo = _tmp('.mp4');
    try {
        fs.writeFileSync(gi, gifBuf);
        await _run(['-y', '-i', gi, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-an', mo]);
        const out = fs.readFileSync(mo);
        if (out.length <= 500) throw new Error('empty mp4');
        return out;
    } finally { _clean(gi, mo); }
}

/** Cached GIF + transparent PNG overlay → MP4 in ONE pass. The overlay rides
 *  EVERY frame (like the `.j base` view card). The PNG rides as a single-
 *  frame input: overlay's default eof_action=repeat holds it for the whole
 *  clip, and shortest=1 INSIDE the filter ends the graph when the GIF ends.
 *  (⚠ do NOT use `-loop 1` + `-shortest` here — that combo buffers forever
 *  under filter_complex on ffmpeg 6.x and hits the 30s exec timeout.) */
async function gifToMp4Overlaid(gifBuf, pngBuf) {
    const gi = _tmp('.gif'), pi = _tmp('.png'), mo = _tmp('.mp4');
    try {
        fs.writeFileSync(gi, gifBuf);
        fs.writeFileSync(pi, pngBuf);
        await _run([
            '-y', '-i', gi, '-i', pi,
            '-filter_complex',
            '[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2[base];[base][1:v]overlay=0:0:format=auto:eof_action=repeat[out]',
            '-map', '[out]', '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-an', mo,
        ]);
        const out = fs.readFileSync(mo);
        if (out.length <= 500) throw new Error('empty mp4');
        return out;
    } finally { _clean(gi, pi, mo); }
}

/** Repo-baked MP4 + transparent PNG overlay → MP4 in ONE pass (minePov lane:
 *  the underground loops are committed assets, so the ONLY runtime work is
 *  this plaster — same filter graph as gifToMp4Overlaid, mp4 input). */
async function mp4ToMp4Overlaid(mp4Buf, pngBuf) {
    const mi = _tmp('.mp4'), pi = _tmp('.png'), mo = _tmp('.mp4');
    try {
        fs.writeFileSync(mi, mp4Buf);
        fs.writeFileSync(pi, pngBuf);
        await _run([
            '-y', '-i', mi, '-i', pi,
            '-filter_complex',
            '[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2[base];[base][1:v]overlay=0:0:format=auto:eof_action=repeat[out]',
            '-map', '[out]', '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
            // -bf 0 (on-box A/B 2026-10-24, Box2, 54f mine loop): 700ms → 586ms
            // per fresh plaster for +12KB — every new haul text pays this pass,
            // so the encode is the hot loop. ultrafast/superfast were rejected:
            // only ~90-200ms faster but 2-3× the file size (slower WA upload).
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-bf', '0', '-an', mo,
        ]);
        const out = fs.readFileSync(mo);
        if (out.length <= 500) throw new Error('empty mp4');
        return out;
    } finally { _clean(mi, pi, mo); }
}

module.exports = { gifToMp4Even, gifToMp4Overlaid, mp4ToMp4Overlaid };
