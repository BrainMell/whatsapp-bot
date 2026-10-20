'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// bakeStream (47-k10) — shared "streaming bake" mp4 encoder for the .j
// animated cards. Task-37 pattern (homesteadRenderer) extracted so every
// card bake can adopt it:
//
//   OLD: render ALL N raw BGRA frames into an array (~90-150MB for a
//        20-frame card), THEN spawn ffmpeg and feed the array.
//   NEW: render frame 0, spawn ffmpeg immediately, and feed each frame as
//        it renders. Only ONE frame canvas + one raw buffer is alive at a
//        time, and the encode overlaps the render (wall-clock win).
//
// This is the memory half of the 2026-10-20 03:11Z crash story: three
// concurrent bakes × ~N held frames stacked straight into the pm2 cap.
// The queue (47-k9) stops the stacking; this removes the per-bake bulk.
//
// Frames are BGRA rawvideo exactly like the array encoder — byte-identical
// encode output for identical frame input (QA'd 47-k10).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * encodeRawStreamMp4({ first, count, next, frameMs, tmpPrefix }) → mp4 Buffer
 *   first    { raw, w, h }          raw frame 0 (already rendered)
 *   count    int                    total frame count (incl. frame 0)
 *   next     async (i) => { raw }|  called for i = 1..count-1, IN ORDER,
 *            null                   after frame count-1. Throwing aborts
 *                                   the encode (ffmpeg killed, temp cleaned).
 *   frameMs  int (default 100)      output framerate = 1000/frameMs
 *   tmpPrefix string (default 'bake')
 */
async function encodeRawStreamMp4({ first, count, next, frameMs = 100, tmpPrefix = 'bake' }) {
    if (!first || !first.raw || !first.w || !first.h) throw new Error('encodeRawStreamMp4: first raw frame required');
    if (typeof next !== 'function') throw new Error('encodeRawStreamMp4: next(i) required');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${tmpPrefix}-`));
    const outFile = path.join(tmp, 'out.mp4');
    try {
        const args = [
            '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${first.w}x${first.h}`,
            '-framerate', `${1000 / frameMs}`, '-i', 'pipe:0',
            // even-dim guard (no-op on even input)
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
            '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
            // 47-k10 A/B on identical base-card pixels: crf25 = -20.7% bytes vs
            // crf23, label text + sprite edges pixel-clean at 2x zoom (WhatsApp
            // displays these well below source size). RENDER_CRF=23 reverts.
            '-crf', String(process.env.RENDER_CRF || '25'),
            '-movflags', '+faststart', '-an', '-y', outFile,
        ];
        await new Promise((resolve, reject) => {
            const p = require('child_process').spawn(process.env.FFMPEG_PATH || 'ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
            let err = '';
            p.stderr.on('data', (d) => { err += d; if (err.length > 6000) err = err.slice(-3000); });
            p.on('error', reject);
            p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`)));
            (async () => {
                const feed = (buf) => (p.stdin.write(buf) ? null : new Promise((r) => p.stdin.once('drain', r)));
                await feed(first.raw);
                for (let i = 1; i < count; i++) {
                    const fr = await next(i);
                    if (!fr || !fr.raw) break;
                    await feed(fr.raw);
                }
                p.stdin.end();
            })().catch((e) => { try { p.stdin.destroy(); } catch (_) {} try { p.kill('SIGKILL'); } catch (_) {} reject(e); });
        });
        const mp4 = fs.readFileSync(outFile);
        if (!mp4 || mp4.length < 1000) throw new Error(`ffmpeg produced ${mp4 ? mp4.length : 0} bytes`);
        return mp4;
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best-effort */ }
    }
}

module.exports = { encodeRawStreamMp4 };
