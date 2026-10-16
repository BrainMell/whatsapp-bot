'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// QA — guild base renderer + command wiring
// Run: node scripts/qa_guildbase.js   (artifacts → /tmp/qa_guildbase/)
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const OUTDIR = process.env.QA_OUT || '/tmp/qa_guildbase';
fs.mkdirSync(OUTDIR, { recursive: true });

const gbr = require('../core/rpg/guildBaseRenderer');

let pass = 0, fail = 0;
function ok(cond, label) {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.log(`  ❌ ${label}`); }
}

async function main() {
    console.log('— structure defs mirror GUILD_UPGRADES —');
    ok(gbr.GUILD_STRUCTS.hall.levels.length === 5, 'hall has 5 visual levels (GUILD_UPGRADES maxLevel 5)');
    ok(gbr.GUILD_STRUCTS.training.levels.length === 5, 'training has 5 visual levels');
    ok(gbr.GUILD_STRUCTS.treasury.levels.length === 5, 'treasury has 5 visual levels');
    ok(gbr.GUILD_STRUCTS.hall.fw === 4 && gbr.GUILD_STRUCTS.hall.fh === 4, 'hall footprint 4x4');
    ok(gbr.GUILD_STRUCTS.training.fw === 3 && gbr.GUILD_STRUCTS.treasury.fw === 2, 'training 3x3, treasury 2x2');

    console.log('— sprites exist on disk —');
    for (const st of Object.values(gbr.GUILD_STRUCTS)) {
        for (const lv of st.levels) {
            ok(fs.existsSync(path.join(__dirname, '..', 'core', 'rpgasset', 'guildbase', `${lv.sprite}.png`)), `${lv.sprite}.png exists`);
        }
    }

    console.log('— static render (view law: 1 frame PNG) —');
    const t0 = Date.now();
    const base = await gbr.renderGuildBaseImage({
        name: 'Iron Vanguard', level: 3, archetype: 'ADVENTURER',
        buildings: { hall: 3, training: 2, treasury: 2 },
        memberCount: 5, memberCap: 20, emblemColor: '#a02c3c', emblemIcon: '⚔️', motto: 'Steel sharpens steel.',
    }, {});
    ok(base.contentType === 'image/png' && base.buffer.length > 50000, `static view is PNG (${base.buffer.length}B in ${Date.now() - t0}ms)`);
    fs.writeFileSync(path.join(OUTDIR, 'view_mid.png'), base.buffer);

    console.log('— level clamps + junk input never crash —');
    const clamped = await gbr.renderGuildBaseImage({
        name: 'Edge Cases', level: 99, archetype: 'NOT_A_REAL_ARCH',
        buildings: { hall: 99, training: -3, treasury: 'two' },
        memberCount: 500, memberCap: undefined, emblemColor: 'javascript:alert(1)', emblemIcon: '', motto: '',
    }, {});
    ok(clamped.contentType === 'image/png' && clamped.buffer.length > 50000, 'junk levels/archetype/color render fine (clamped)');
    fs.writeFileSync(path.join(OUTDIR, 'view_junk.png'), clamped.buffer);

    console.log('— L0 plots (fresh guild) —');
    const fresh = await gbr.renderGuildBaseImage({
        name: 'Fresh Guild', level: 1, archetype: 'RESEARCH',
        buildings: { hall: 1, training: 0, treasury: 0 },
        memberCount: 2, memberCap: 10,
    }, {});
    ok(fresh.contentType === 'image/png', 'L0 structures render as plots');
    fs.writeFileSync(path.join(OUTDIR, 'view_fresh.png'), fresh.buffer);

    console.log('— celebrate animation (mp4 when ffmpeg present) —');
    try {
        const celeb = await gbr.renderGuildBaseImage({
            name: 'Iron Vanguard', level: 3, archetype: 'ADVENTURER',
            buildings: { hall: 4, training: 2, treasury: 2 },
            memberCount: 5, memberCap: 20, emblemColor: '#a02c3c', emblemIcon: '⚔️', motto: '',
        }, { static: false });
        if (celeb.contentType === 'video/mp4') {
            ok(celeb.buffer.length > 10000 && celeb.buffer.length < 3_000_000, `celebrate mp4 compact (${(celeb.buffer.length / 1024).toFixed(0)}KB — loads fast)`);
            fs.writeFileSync(path.join(OUTDIR, 'celebrate.mp4'), celeb.buffer);
        } else {
            ok(celeb.contentType === 'image/png', `mp4 unavailable → PNG fallback (${celeb.contentType})`);
        }
    } catch (e) {
        ok(false, 'celebrate path threw: ' + e.message);
    }

    console.log('— cache serves repeat views —');
    const t1 = Date.now();
    const again = await gbr.renderGuildBaseImage({
        name: 'Iron Vanguard', level: 3, archetype: 'ADVENTURER',
        buildings: { hall: 3, training: 2, treasury: 2 },
        memberCount: 5, memberCap: 20, emblemColor: '#a02c3c', emblemIcon: '⚔️', motto: 'Steel sharpens steel.',
    }, {});
    ok(again.buffer === base.buffer || (Date.now() - t1) < 400, `repeat view served from cache (${Date.now() - t1}ms)`);

    console.log('— engine wiring —');
    const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine.js'), 'utf8');
    ok(/guild info` \|\|\s*\n\s*lowerTxt === `\$\{botConfig\.getPrefix\(\)\.toLowerCase\(\)\} guild status` \|\|\s*\n\s*lowerTxt === `\$\{botConfig\.getPrefix\(\)\.toLowerCase\(\)\} guild` \|\|/.test(engineSrc), 'bare .j guild routes to the base view branch');
    ok(engineSrc.includes("guild base`") && engineSrc.includes("guild hq`"), '.j guild base / .j guild hq aliases wired');
    ok(engineSrc.includes("require('./rpg/guildBaseRenderer')"), 'engine requires guildBaseRenderer');
    ok(engineSrc.includes('base grounds render failed'), 'render failure is caught (never crashes command)');
    ok(engineSrc.includes('base image send failed — falling back to charter card'), 'send failure falls back to charter card');
    // caption keeps every stat the old info showed
    for (const token of ['Archetype:', 'Leader:', 'Members:', 'Bank:', 'Emblem:', 'Buildings:', 'Guild Hall: L', 'Training: L', 'Treasury: L', 'guild perks']) {
        ok(engineSrc.includes(token), `caption stat preserved: ${token}`);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
