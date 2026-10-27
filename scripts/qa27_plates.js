'use strict';
// 26-R5 plate-cache QA — modes:
//   node qa27.js capture <classes...>   (plates ON: capture render + hit render per class, saves mp4s)
//   ULT_PLATES=0 node qa27.js baseline <classes...>
//   node qa27.js diff <classes...>      (ffmpeg-decode cap/hit/base mp4s, per-frame pixel diff)
//   node qa27.js sweepmeta              (print plate dir stats)
// Requires: NODE_PATH=/home/ubuntu/whatsapp-bot/node_modules, cwd=/tmp/vfxr4
// Env: ULT_PLATE_DIR=/tmp/vfxr4-plates ULT_PLATE_VER=qa27
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const ROOT = '/tmp/vfxr4';
const OUT = '/tmp/vfxr4-qa';
const PLATES = process.env.ULT_PLATE_DIR || '/tmp/vfxr4-plates';
const MODE = process.argv[2];
const CLASSES = process.argv.slice(3);
const skillVfx = require(path.join(ROOT, 'core/rpg/skillVfx'));
const stage = require(path.join(ROOT, 'core/rpg/vfxPreviewStage'))(1);

function ctxFor(cid) {
  const entry = skillVfx.SIGNATURE_SKILLS[cid];
  if (!entry) throw new Error('no signature for ' + cid);
  const sent = { texts: 0, media: [] };
  const player = { name: 'Qa' + cid, isSummon: false, level: 50, class: { id: cid, icon: '⚔️' }, stats: { hp: 900, maxHp: 1000, mp: 200 }, currentHP: 900 };
  const state = { inCombat: true, players: [player], enemies: [{ index: 0, name: 'Dummy', isDead: false, currentHP: 800, stats: { hp: 800, maxHp: 1000 } }] };
  const ability = { id: entry.id, name: entry.id.replace(/_/g, ' '), skillLevel: 3, maxLevel: 3, isUltimate: true };
  return {
    state, player, ability, targetIndex: 0, targetSide: 'enemy', focusIndex: 0, aoe: false, casterIndex: 0, layers: stage,
    hudData: { name: 'Qa' + cid, class: cid, level: 50, hp: 900, maxHp: 1000, mp: 200, energy: 100, maxEnergy: 200 },
    sendText: async () => { sent.texts++; },
    sendGif: async (buf) => { sent.media.push(Buffer.isBuffer(buf) ? buf : null); return { ok: true }; },
    sent,
  };
}

async function renderOne(cid) {
  const c = ctxFor(cid);
  const t0 = Date.now();
  const played = await skillVfx.animateUltimate(c);
  const ms = Date.now() - t0;
  const buf = c.sent.media.find((b) => b && b.subarray(4, 8).toString('latin1') === 'ftyp');
  return { played, ms, buf };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function captureMode() {
  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const cid of CLASSES) {
    const cap = await renderOne(cid);
    fs.writeFileSync(path.join(OUT, cid + '_cap.mp4'), cap.buf || Buffer.alloc(0));
    // wait for the background plate save to land
    let metaFiles = 0, waited = 0;
    while (waited < 20000) {
      await wait(500); waited += 500;
      try { metaFiles = parseInt(execSync(`find ${PLATES} -name meta.json | wc -l`).toString().trim(), 10); } catch (e) {}
      if (metaFiles >= rows.length + 1) break;
    }
    const hit = await renderOne(cid);
    fs.writeFileSync(path.join(OUT, cid + '_hit.mp4'), hit.buf || Buffer.alloc(0));
    rows.push({ cid, capMs: cap.ms, hitMs: hit.ms, capOk: !!cap.buf, hitOk: !!hit.buf, metaFiles });
    console.log(`[qa27] ${cid.padEnd(15)} capture=${cap.ms}ms hit=${hit.ms}ms speedup=${(cap.ms / Math.max(1, hit.ms)).toFixed(2)}x capOk=${!!cap.buf} hitOk=${!!hit.buf}`);
  }
  fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(rows, null, 1));
  console.log('[qa27] capture phase done');
}

async function baselineMode() {
  for (const cid of CLASSES) {
    const b = await renderOne(cid);
    fs.writeFileSync(path.join(OUT, cid + '_base.mp4'), b.buf || Buffer.alloc(0));
    console.log(`[qa27] ${cid.padEnd(15)} baseline=${b.ms}ms ok=${!!b.buf}`);
  }
  console.log('[qa27] baseline phase done');
}

function decodeFrames(mp4, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-i', mp4, path.join(dir, 'f%03d.png')], { stdio: 'ignore' });
  if (r.status !== 0) throw new Error('ffmpeg decode failed for ' + mp4);
  return fs.readdirSync(dir).sort().map((f) => path.join(dir, f));
}

async function diffMode() {
  const { createCanvas, loadImage } = require('canvas');
  const rows = [];
  for (const cid of CLASSES) {
    const pair = { cap: path.join(OUT, cid + '_cap.mp4'), hit: path.join(OUT, cid + '_hit.mp4'), base: path.join(OUT, cid + '_base.mp4') };
    if (!fs.existsSync(pair.cap) || !fs.existsSync(pair.base)) { console.log(`[qa27] ${cid}: MISSING mp4s — skipped`); continue; }
    const res = {};
    for (const [tag, mp4] of Object.entries(pair)) {
      const files = decodeFrames(mp4, path.join(OUT, `dec_${cid}_${tag}`));
      const imgs = [];
      for (const f of files) {
        const img = await loadImage(f);
        const cv = createCanvas(img.width, img.height); cv.getContext('2d').drawImage(img, 0, 0);
        imgs.push(cv.getContext('2d').getImageData(0, 0, img.width, img.height));
      }
      res[tag] = imgs;
    }
    const cmp = (aTag, bTag) => {
      const A = res[aTag], B = res[bTag];
      let worst = { mean: 0, p999: 0, frame: -1 };
      const n = Math.min(A.length, B.length);
      for (let i = 0; i < n; i++) {
        const a = A[i].data, b = B[i].data;
        let sum = 0, cnt = 0; const deltas = [];
        for (let p = 0; p < a.length; p += 16) { // sample every 4th pixel
          const d = (Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]));
          sum += d; cnt++; if (d > 3) deltas.push(d);
        }
        const mean = sum / cnt / 3;
        deltas.sort((x, y) => x - y);
        const p999 = deltas.length ? deltas[Math.floor(deltas.length * 0.999)] : 0;
        if (mean > worst.mean) worst = { mean, p999, frame: i };
      }
      return worst;
    };
    const capVsBase = cmp('cap', 'base'), hitVsBase = cmp('hit', 'base');
    rows.push({ cid, capVsBase, hitVsBase });
    console.log(`[qa27] ${cid.padEnd(15)} cap~base mean=${capVsBase.mean.toFixed(3)}/255 p999=${capVsBase.p999} (f${capVsBase.frame}) | hit~base mean=${hitVsBase.mean.toFixed(3)}/255 p999=${hitVsBase.p999} (f${hitVsBase.frame})`);
    if (hitVsBase.mean > 2.5 || capVsBase.mean > 2.5) {
      const w = res.base[hitVsBase.frame >= 0 ? hitVsBase.frame : 0];
      const cv = createCanvas(w.width, w.height); cv.getContext('2d').putImageData(w, 0, 0);
      fs.writeFileSync(path.join(OUT, `${cid}_WORSTFRAME.png`), cv.toBuffer('image/png'));
    }
  }
  fs.writeFileSync(path.join(OUT, 'diffs.json'), JSON.stringify(rows, null, 1));
  const bad = rows.filter((r) => r.hitVsBase.mean > 2.5 || r.capVsBase.mean > 2.5);
  console.log(`[qa27] diff verdict: ${rows.length - bad.length}/${rows.length} classes within tolerance${bad.length ? ' — BAD: ' + bad.map((b) => b.cid).join(',') : ''}`);
}

(async () => {
  if (MODE === 'capture') await captureMode();
  else if (MODE === 'baseline') await baselineMode();
  else if (MODE === 'diff') await diffMode();
  else if (MODE === 'sweepmeta') {
    const out = execSync(`du -sh ${PLATES} 2>/dev/null; find ${PLATES} -name meta.json | wc -l; find ${PLATES} -name '*.png' | wc -l`).toString();
    console.log('[qa27] plate store:\n' + out);
  } else console.log('modes: capture|baseline|diff|sweepmeta');
  await wait(8000); process.exit(0);
})().catch((e) => { console.error('[qa27] FATAL', e); process.exit(1); });
