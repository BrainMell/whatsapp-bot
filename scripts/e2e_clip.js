#!/usr/bin/env node
/**
 * Audio clip unit tests - timestamp parser + end-to-end ffmpeg clip of a
 * generated tone file. Run on Box1: node scripts/e2e_clip.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const clip = require('../core/utils/audioclip');
let pass = 0, total = 0;
function check(name, ok, detail = '') {
  total++; if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'} :: ${name}${detail ? ' :: ' + String(detail).slice(0, 120) : ''}`);
}

// ── timestamp parser matrix ──
const T = [
  ['15', 15], ['15.5', 15.5], ['90s', 90], ['0:15', 15], ['1:30', 90],
  ['1:30.5', 90.5], ['1:02:30', 3750], ['2m30s', 150], ['1h2m3.5s', 3723.5],
  ['3m', 180], ['0:75', null], ['1:2:75', null], ['abc', null], ['-5', null],
  ['', null], ['1:', null], ['::', null], ['2h', 7200], ['1m', 60],
];
for (const [input, expected] of T) {
  const got = clip.parseTimestamp(input);
  check(`parse "${input}"`, got === expected, `got=${got} want=${expected}`);
}

check('fmt 90.5', clip.fmtTimestamp(90.5) === '1:30.5', clip.fmtTimestamp(90.5));
check('fmt 3750', clip.fmtTimestamp(3750) === '1:02:30', clip.fmtTimestamp(3750));
check('fmt 15', clip.fmtTimestamp(15) === '0:15', clip.fmtTimestamp(15));

// ── quoted media detection (synthetic message shapes) ──
const audioQ = { message: { extendedTextMessage: { contextInfo: { quotedMessage: { audioMessage: { ptt: true, url: 'x' } } } } } };
const vidQ = { message: { extendedTextMessage: { contextInfo: { quotedMessage: { videoMessage: { url: 'x' } } } } } };
const docQ = { message: { extendedTextMessage: { contextInfo: { quotedMessage: { documentMessage: { mimetype: 'audio/mpeg' } } } } } };
const docImg = { message: { extendedTextMessage: { contextInfo: { quotedMessage: { documentMessage: { mimetype: 'image/png' } } } } } };
check('quoted audio (ptt)', clip.getQuotedAudio(audioQ)?.type === 'audio' && clip.getQuotedAudio(audioQ).ptt === true);
check('quoted video rejected', clip.getQuotedAudio(vidQ) === null);
check('quoted audio doc', clip.getQuotedAudio(docQ)?.type === 'document');
check('quoted image doc rejected', clip.getQuotedAudio(docImg) === null);

// ── real ffmpeg round-trip: generate 30s tone, cut 5..10 ──
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipE2E-'));
  const src = path.join(dir, 'tone.wav');
  const out = path.join(dir, 'cut.mp3');
  try {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=30', '-ac', '2', src]);
    check('generated 30s tone', fs.statSync(src).size > 100000, fs.statSync(src).size + 'B');

    const { execFile } = require('child_process');
    const enc = await new Promise((res) => {
      execFile('ffmpeg', ['-y', '-v', 'error', '-i', src, '-ss', '5', '-to', '10', '-vn', '-ac', '2', '-acodec', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', out], (err) => res(!err));
    });
    check('ffmpeg cut ok', enc);
    const dur = await new Promise((res) => {
      execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', out], (err, so) => res(err ? null : parseFloat(so)));
    });
    check('clip duration ~5s', dur !== null && Math.abs(dur - 5) < 0.5, 'dur=' + dur);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n=== AUDIOCLIP SUITE: ${pass}/${total} PASS ===`);
  process.exit(pass === total ? 0 : 1);
})();
