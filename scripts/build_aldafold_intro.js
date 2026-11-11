#!/usr/bin/env node
// Rebuild core/rpgasset/intro/aldafold_intro.mp4 (score + frames). Usage: node scripts/build_aldafold_intro.js [out.mp4] [--crf 25] [--seconds N]
const path = require('path'); const { execFileSync } = require('child_process'); const fs = require('fs');
const { renderIntro } = require('../core/rpg/systems/intro/aldafold/render');
const argv = process.argv.slice(2); const out = argv.find((x) => x.endsWith('.mp4')) || path.join(__dirname, '..', 'core', 'rpgasset', 'intro', 'aldafold_intro.mp4');
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
(async () => {
  const wav = path.join(require('os').tmpdir(), 'aldafold_score.wav'); execFileSync('python3', [path.join(__dirname, 'build_aldafold_audio.py'), wav], { stdio: 'inherit' });
  const t0 = Date.now(); await renderIntro({ audioPath: wav, outPath: out, crf: opt('--crf', 25), maxSeconds: opt('--seconds', 0) || undefined, onProgress: (p) => process.stdout.write(`\r${(p * 100).toFixed(0)}%`) });
  console.log(`\nok ${out} ${(fs.statSync(out).size / 1048576).toFixed(2)} MB in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})().catch((e) => { console.error(e); process.exit(1); });
