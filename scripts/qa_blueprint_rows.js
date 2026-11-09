'use strict';
// ⚡ QA for GENERATION_BLUEPRINT wave-2 rows (2026-11-09)
// 1) mp4FirstFrameJpeg (Upload row helper)
// 2) boss-splash disk bake cold/warm (Boss splash row)
// 3) profile-card whole-card disk bake cold/warm (Profile/menu row)
process.env.BAKE_DIR = '/tmp/qa-blueprint-' + process.pid;
process.chdir('/home/ubuntu/whatsapp-bot');

(async () => {
  const { spawn } = require('child_process');
  const fs = require('fs');
  const { mp4FirstFrameJpeg } = require('../core/utils/mediaConvert');

  console.log('== 1) mp4FirstFrameJpeg ==');
  const tf = '/tmp/qa_ff_' + process.pid + '.mp4';
  await new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tf]);
    p.on('close', (code) => code === 0 ? res() : rej(new Error('gen ' + code)));
    p.on('error', rej);
  });
  const mp4 = fs.readFileSync(tf); try { fs.unlinkSync(tf); } catch (e) {}
  const t0 = Date.now();
  const jpeg = await mp4FirstFrameJpeg(mp4);
  const sig = jpeg.length > 3 && jpeg[0] === 0xff && jpeg[1] === 0xd8;
  console.log(`first-frame: ${jpeg.length}B jpeg-magic=${sig ? 'OK' : 'BAD'} in ${Date.now() - t0}ms`);

  console.log('== 2) boss splash disk bake ==');
  const bake = require('../core/utils/assetBake').makeBakeCache({ ns: 'bosssplash', version: 'v1', maxMB: 60, ext: 'jpg' });
  const go = require('../core/utils/goImageService');
  const payload = { name: 'QA Ember King', spriteFilename: 'calamaties (1).png', flavorText: 'QA flavor', tier: 'QA-T' };
  const k = bake.key(payload.name, payload.spriteFilename, payload.flavorText, payload.tier);
  if (!bake.get(k)) {
    const t1 = Date.now();
    const buf = await bake.getOrBake(k, () => go.generateBossSplash(payload));
    console.log(`cold: ${buf ? buf.length + 'B' : 'NULL'} in ${Date.now() - t1}ms`);
  }
  const t2 = Date.now();
  const warm = bake.get(k);
  console.log(`warm: ${warm ? warm.length + 'B disk hit' : 'MISS'} in ${Date.now() - t2}ms`);

  console.log('== 3) profile card whole-card bake ==');
  const pcr = require('../core/rpg/systems/meta/profileCardRenderer');
  const params = {
    user: { nickname: 'QATester', profile: { whatsappName: 'QA Tester' }, wallet: 12345, bank: 1000, pvpWins: 7, pvpLosses: 2 },
    classData: { name: 'Fighter', id: 'FIGHTER' },
    stats: { hp: 900, maxHp: 950, attack: 120, defense: 80, energy: 60, maxEnergy: 100 },
    equipStats: { attack: 15, defense: 10 },
    equipment: [], level: 21, rank: 'A', xpPercent: 40, xpCurrent: 4000, xpNeeded: 10000,
    style: 1,
  };
  for (const pass of ['cold', 'warm']) {
    const t3 = Date.now();
    try {
      const buf = await pcr.renderProfileCard(params);
      console.log(`${pass}: ${buf ? buf.length + 'B' : 'NULL'} in ${Date.now() - t3}ms`);
    } catch (e) { console.log(`${pass} FAILED: ${e.message}`); }
  }
  process.exit(0);
})().catch((e) => { console.error('QA FATAL', e); process.exit(1); });
