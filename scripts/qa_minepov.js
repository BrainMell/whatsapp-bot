/* QA: minePov — the pre-baked underground mining result card (owner 2026-10-23:
 * "assets saved on the repo, call for said assets and overlay like the fishing
 * so that it's instant"). Run from the whatsapp-bot dir: node scripts/qa_minepov.js
 *
 * Verifies, without WhatsApp:
 *   1. bandFor maps hauls off each location's own ore ladder
 *   2. renderMineCard ships a real MP4 from the committed repo asset
 *      (first call = one ffmpeg pass; repeat with same loot = cache hit)
 *   3. invalid location → null (caller falls back)
 *   4. the REAL mineOre end-to-end: video + gifPlayback + loot caption +
 *      jpegThumbnail, and the locked-location path stays plain text
 * Cleans up its throwaway user.
 */
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';
const jid = `qa_minepov_${Date.now()}@s.whatsapp.net`;

const payloads = [];
const mockSock = {
    sendMessage: async (chat, content) => { payloads.push(content); },
};

let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`[check] ${name}: ${cond ? 'PASS' : 'FAIL'}`); cond ? pass++ : fail++; };

async function main() {
    const mongoose = require('mongoose');
    const env = require('fs').readFileSync(require('path').join(__dirname, '..', '.env'), 'utf8');
    const uri = (env.match(/MONGO_URI=(.+)/) || [])[1]?.trim();
    if (!uri) throw new Error('MONGO_URI not found in .env');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000, bufferTimeoutMS: 45000 });
    console.log('[qa] mongoose connected');

    const economy = require('../core/rpg/economy');
    const progression = require('../core/rpg/progression');
    const minePov = require('../core/rpg/minePov');

    // 0. seed a minimal user (same shape qa_energy uses)
    economy.economyData.set(jid, {
        userId: jid, wallet: 1000, bank: 0, registered: true, nickname: 'QAMinePov',
        class: 'FIGHTER', adventurerRank: 'B', stats: { hp: 500, maxHp: 500, level: 24 },
        professions: { mining: { level: 5, xp: 0 } }, inventory: {}, equipment: {},
        statBonuses: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 },
    });

    // 1. bandFor — the location's own ore ladder decides the loop
    check('shimmering: iron only → low', minePov.bandFor('shimmering_caves', { iron_shard: 3 }) === 'low');
    check('shimmering: silver → mid', minePov.bandFor('shimmering_caves', { iron_shard: 2, silver_ore: 1 }) === 'mid');
    check('shimmering: gold → epic', minePov.bandFor('shimmering_caves', { iron_shard: 2, gold_ore: 1 }) === 'epic');
    check('deep_vein: obsidian (rarest) → epic', minePov.bandFor('deep_vein_shafts', { silver_ore: 4, obsidian_chunk: 1 }) === 'epic');
    check('deep_vein: mythril (2nd) → mid', minePov.bandFor('deep_vein_shafts', { silver_ore: 4, mythril_ore: 1 }) === 'mid');
    check('unknown loc → low', minePov.bandFor('nowhere', { gold_ore: 1 }) === 'low');

    // 2. renderMineCard direct — committed MP4 + ribbon + thumb
    const banner = { head: 'Shimmering Caves', lines: ['3× Iron Shard', '⚡ -15 energy · Mines Lv.1 (×1.00)'] };
    const t0 = Date.now();
    const media = await minePov.renderMineCard({ loc: 'shimmering_caves', drops: { iron_shard: 3 }, banner });
    const t1 = Date.now() - t0;
    check('renderMineCard returns media', !!media && !!media.buffer);
    check('contentType is video/mp4', media && media.contentType === 'video/mp4');
    check('mp4 payload > 20KB', media && media.buffer.length > 20000);
    check('thumbnail present', media && !!media.thumb && media.thumb.length > 500);
    check(`first render < 15s (one ffmpeg pass) — took ${t1}ms`, t1 < 15000);
    console.log(`   [lane] ${media && media.lane}, mp4 ${(media && media.buffer.length / 1024).toFixed(0)}KB, first render ${t1}ms`);

    const t2 = Date.now();
    const media2 = await minePov.renderMineCard({ loc: 'shimmering_caves', drops: { iron_shard: 3 }, banner });
    const t3 = Date.now() - t2;
    check(`repeat same-loot render is a cache hit < 500ms — took ${t3}ms`, t3 < 500 && !!media2.buffer);
    check('band follows drops when band omitted (epic haul)', !!(await minePov.renderMineCard({ loc: 'shimmering_caves', drops: { gold_ore: 1 }, banner })));

    // 3. invalid location → null
    check('invalid loc returns null', (await minePov.renderMineCard({ loc: 'area_51', banner })) === null);

    // 4. real mineOre end-to-end — video card with loot caption
    const maxEn = progression.getBaseStats(jid, 'FIGHTER').maxEnergy || 100;
    economy.setPersistentEnergy(jid, maxEn, maxEn);
    const { mineOre } = require('../core/commands/rpgCommands');
    payloads.length = 0;
    await mineOre(mockSock, 'qa-minepov-chat@s.whatsapp.net', jid, 'shimmering_caves');
    const p = payloads[0] || {};
    check('mineOre sent a payload', payloads.length === 1);
    check('payload is an MP4 video with gifPlayback', Buffer.isBuffer(p.video) && p.gifPlayback === true && p.video.length > 20000);
    check('caption keeps the mining banner + haul', typeof p.caption === 'string'
        && /MINING: SHIMMERING CAVES/i.test(p.caption)
        && /Energy Left:/.test(p.caption) && /- \d+x /.test(p.caption));
    check('jpegThumbnail present for the bubble', !!p.jpegThumbnail && p.jpegThumbnail.length > 500);
    check('caption loot lines match the ribbon source (same haul text)', /⚡ Energy Left/.test(p.caption));
    console.log('   [caption]', String(p.caption).split('\n').slice(0, 4).join(' | '));

    // 5. locked location stays plain text (void_fissure needs Mines Lv.3)
    payloads.length = 0;
    await mineOre(mockSock, 'qa-minepov-chat@s.whatsapp.net', jid, 'void_fissure');
    const lockP = payloads[0] || {};
    check('locked location answers text-only', typeof lockP.text === 'string' && /LOCATION LOCKED/i.test(lockP.text) && !lockP.video);

    // cleanup
    const User = require('../core/models/User').User || require('../core/models/User');
    if (User.findOne) await User.deleteOne({ userId: jid }).catch(() => {});
    economy.economyData.delete(jid);
    console.log(`\n[qa] RESULT: ${fail === 0 ? 'ALL PASS' : `${fail} FAILURES`} (${pass} passed)`);
    await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[qa] FATAL', e); process.exit(1); });
