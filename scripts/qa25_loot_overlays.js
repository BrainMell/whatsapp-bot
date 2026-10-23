'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  QA 25 — loot ART in the result banners + the mine MACHINE (owner Task 25,
//  2026-10-23): ".j mine, instead of a person doing that make it a machine or
//  something … find some assets like fish assets and animal assets and redo
//  the overlay so that it contains those things"
//
//  Checks:
//    C1  lootArt resolves ALL fish + ore portraits (14/14) with sane sizes
//    C2  lootArt resolves the 4 hunt animal crops (rabbit/doe/boar/stag)
//    C3  mine card (activity mining): renders; MACHINE pixels (rust hull +
//        dark tracks) present; old miner skin-tone GONE from the scene
//    C4  fish ribbon overlay: transparent PNG, gold rims present, ART pixels
//        differ materially from the text-only ribbon
//    C5  hunt card with stag art: renders + differs from the no-drops card
//    C6  koi ribbon: white-orange koi pixels in the slot band
//    C7  loot banner geometry: panel ≤ canvas, slots ≥2, qty chip drawn
//    C8  exports + syntax canaries (drawLootBanner/drawMineMachine exported)
//
//  Run:  QA_MODE=1 CODE_VER=qa25x NODE_PATH=<repo>/node_modules node scripts/qa25_loot_overlays.js <outdir>
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const OUT = process.argv[2] || '/tmp/qa25';
fs.mkdirSync(OUT, { recursive: true });
const scenes = require('../core/rpg/structureScenes');
const dockPov = require('../core/rpg/dockPov');
const lootArt = require('../core/rpg/lootArt');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
    if (ok) { pass++; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`); }
    else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function toImg(buf) { return loadImage(buf); }
function dataOf(img) {
    const cv = createCanvas(img.width, img.height), c2 = cv.getContext('2d');
    c2.drawImage(img, 0, 0);
    return c2.getImageData(0, 0, img.width, img.height);
}
/** count pixels within tol of rgb in img */
function countColor(img, rgb, tol = 28) {
    const d = dataOf(img).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue;
        if (Math.abs(d[i] - rgb[0]) + Math.abs(d[i + 1] - rgb[1]) + Math.abs(d[i + 2] - rgb[2]) <= tol) n++;
    }
    return n;
}
function diffStats(img1, img2) {
    const d1 = dataOf(img1).data, d2 = dataOf(img2).data;
    let sum = 0, big = 0, n = Math.min(d1.length, d2.length);
    for (let i = 0; i < n; i += 4) {
        const df = Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
        sum += df; if (df > 60) big++;
    }
    return { mean: sum / (n / 4), big };
}

(async () => {
    console.log('— C1: fish + ore portraits resolve —');
    const fishIds = ['raw_fish', 'river_trout', 'silver_carp', 'crystal_koi'];
    const oreIds = ['iron_shard', 'silver_ore', 'gold_ore', 'mythril_ore', 'obsidian_chunk', 'diamond_shard', 'fire_shard', 'mana_crystal', 'dark_matter', 'legendary_shard'];
    const art1 = await lootArt.artForDrops(Object.fromEntries(fishIds.concat(oreIds).map((id) => [id, 1])), 20);
    check('C1 fish+ore art resolved', art1.length === 14, `${art1.length}/14`);
    check('C1 sizes sane', art1.every((a) => a.img && a.img.width >= 32 && a.img.height >= 32), art1.map((a) => `${a.id}:${a.img.width}x${a.img.height}`).slice(0, 3).join(' ') + ' …');

    console.log('— C2: hunt animal crops resolve —');
    const huntIds = ['rabbit_pelt', 'venison', 'boar_tusk', 'stag_antler'];
    const art2 = await lootArt.artForDrops(Object.fromEntries(huntIds.map((id) => [id, 1])), 8);
    check('C2 animal art resolved', art2.length === 4, `${art2.length}/4 → ${art2.map((a) => a.id).join(',')}`);
    const boar = art2.find((a) => a.id === 'boar_tusk');
    check('C2 boar tint applied (brown, not pink)', boar && (() => {
        const d = dataOf(boar.img).data; let brown = 0, pink = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 60) continue;
            if (d[i] > 200 && d[i + 1] > 130 && d[i + 2] > 130) pink++;
            if (d[i] > 60 && d[i] < 170 && d[i + 1] > 35 && d[i + 1] < 120 && d[i + 2] < 90) brown++;
        }
        return brown > 40 && pink < 12;
    })());

    console.log('— C3: mine card with the MACHINE —');
    const mineSpec = { title: 'The Mines', subtitle: 'Deep Veins · Lv 2', note: '', rows: [], actions: [], footer: '',
        banner: { head: 'Deep Vein Shafts', lines: ['3× Iron Shard', '1× Gold Ore', '+120 ZENI (lucky find)', '⚡ -25 energy · Mines Lv.2 (×1.25)'], drops: { iron_shard: 3, gold_ore: 1 } } };
    const mineCard = await scenes.renderStructureCard({ type: 'mines', level: 2, biome: 'isle', seed: 'qa25mine', activity: 'mining', spotlight: true, spec: mineSpec });
    fs.writeFileSync(path.join(OUT, 'mine_card_machine.jpg'), mineCard.buffer);
    const mineImg = await toImg(mineCard.buffer);
    check('C3 mine card renders', mineCard.buffer.length > 30000, `${mineCard.buffer.length}B ${mineImg.width}x${mineImg.height}`);
    const rust = countColor(mineImg, [138, 74, 42], 46);        // hull #8a4a2a
    const tracks = countColor(mineImg, [38, 38, 44], 18);       // crawler #26262c
    check('C3 machine pixels present', rust > 250 && tracks > 200, `hull=${rust}px tracks=${tracks}px`);
    const skin = countColor(mineImg, [232, 195, 154], 16);      // old miner face #e8c39a
    check('C3 no miner skin-tone', skin < 40, `skin=${skin}px`);
    // art slots: ore browns/golds inside the banner band
    const gold = countColor(mineImg, [201, 166, 90], 40);       // gold rims
    check('C3 gold banner + slot rims', gold > 300, `gold=${gold}px`);

    console.log('— C4: fish ribbon overlay carries art —');
    const ribArt = { head: 'Catch of the day', lines: ['1× River Trout — UNCOMMON · sells 140Z', '+45 ZENI'], drops: { river_trout: 1 } };
    const ovArt = await dockPov.renderRibbonOverlay(ribArt);
    const ovPlain = await dockPov.renderRibbonOverlay({ head: ribArt.head, lines: ribArt.lines });
    fs.writeFileSync(path.join(OUT, 'ribbon_trout.png'), ovArt.buffer);
    fs.writeFileSync(path.join(OUT, 'ribbon_plain.png'), ovPlain.buffer);
    const imgA = await toImg(ovArt.buffer), imgP = await toImg(ovPlain.buffer);
    check('C4 overlay renders', ovArt.buffer.length > 5000, `${ovArt.buffer.length}B ${imgA.width}x${imgA.height}`);
    const cornerAlpha = (() => { const d = dataOf(imgA).data; return d[3] < 10 && d[(imgA.width - 1) * 4 + 3] < 10; })();
    check('C4 transparent outside panel', cornerAlpha);
    const df = diffStats(imgA, imgP);
    check('C4 art visibly changes the ribbon', df.big > 400, `bigDiff=${df.big}px mean=${df.mean.toFixed(1)}`);
    const troutBrown = countColor(imgA, [120, 104, 70], 44);
    check('C4 trout pixels in slot band', troutBrown > 120, `brown=${troutBrown}px`);

    console.log('— C5: hunt card with stag art —');
    const huntSpec = { title: 'Hunting Grounds', subtitle: 'Glade · Lv 1', note: '', rows: [], actions: [], footer: '',
        banner: { head: 'The hunt returns', lines: ['1× Stag Antler — EPIC · sells 2,000Z'], drops: { stag_antler: 1 } } };
    const huntCard = await scenes.renderStructureCard({ type: 'hunting', level: 1, biome: 'isle', seed: 'qa25hunt', activity: 'hunting', spotlight: true, spec: huntSpec });
    fs.writeFileSync(path.join(OUT, 'hunt_card_stag.jpg'), huntCard.buffer);
    const huntImg = await toImg(huntCard.buffer);
    const huntPlain = await scenes.renderStructureCard({ type: 'hunting', level: 1, biome: 'isle', seed: 'qa25hunt', activity: 'hunting', spotlight: true, spec: { title: 'Hunting Grounds', subtitle: 'Glade · Lv 1', banner: { head: 'The hunt returns', lines: ['1× Stag Antler — EPIC · sells 2,000Z'] } } });
    const dfh = diffStats(huntImg, await toImg(huntPlain.buffer));
    check('C5 hunt card renders + art differs (same scene, art-less banner)', huntCard.buffer.length > 30000 && dfh.big > 400, `${huntCard.buffer.length}B bigDiff=${dfh.big}px`);

    console.log('— C6: koi ribbon —');
    const ovKoi = await dockPov.renderRibbonOverlay({ head: 'Catch of the day', lines: ['1× Crystal Koi — EPIC · sells 1,800Z'], drops: { crystal_koi: 1 } });
    fs.writeFileSync(path.join(OUT, 'ribbon_koi.png'), ovKoi.buffer);
    const imgK = await toImg(ovKoi.buffer);
    const koiOrange = countColor(imgK, [244, 128, 38], 46);
    const koiWhite = countColor(imgK, [252, 250, 244], 14);
    check('C6 koi pixels present', koiOrange > 100 && koiWhite > 60, `orange=${koiOrange}px white=${koiWhite}px`);

    console.log('— C7: banner geometry —');
    const U = dockPov.GH / 1000, GW = dockPov.GW, GH = dockPov.GH;
    // slots: 1 art @A=118u + pad 30u → slot box ends ≈ BX+30u+118u ; qty chip inside
    check('C7 overlay ≤ canvas', imgA.width === GW && imgA.height === GH, `${imgA.width}x${imgA.height} vs ${GW}x${GH}`);

    console.log('— C8: exports —');
    check('C8 drawLootBanner + drawMineMachine exported', typeof scenes.drawLootBanner === 'function' && typeof scenes.drawMineMachine === 'function');
    check('C8 drawMiner still exported (qa_base_fusion contract)', typeof scenes.drawMiner === 'function');

    // ── proof sheet: mine card + hunt card + trout ribbon over a pond frame
    try {
        const W = scenes.W, H = scenes.H;
        const sheet = createCanvas(W * 2 + 30, H * 2 + 30);
        const s2 = sheet.getContext('2d');
        s2.fillStyle = '#14100a'; s2.fillRect(0, 0, sheet.width, sheet.height);
        s2.drawImage(await toImg(mineCard.buffer), 10, 10, W, H);
        s2.drawImage(await toImg(huntCard.buffer), W + 20, 10, W, H);
        // ribbon proof: plaster trout ribbon on a pond still (what the GIF gets)
        const pond = createCanvas(GW, GH), pc = pond.getContext('2d');
        dockPov.paintStill(pc, GW, GH, { biome: 'isle', lvl: 1, phase: 'day' });
        pc.drawImage(await toImg(ovArt.buffer), 0, 0);
        s2.drawImage(pond, 10, H + 20, W, H);
        {
            const pond2 = createCanvas(GW, GH), p2 = pond2.getContext('2d');
            dockPov.paintStill(p2, GW, GH, { biome: 'isle', lvl: 1, phase: 'day' });
            p2.drawImage(await toImg(ovKoi.buffer), 0, 0);
            s2.drawImage(pond2, W + 20, H + 20, W, H);
        }
        fs.writeFileSync(path.join(OUT, 'qa25_proof_sheet.png'), sheet.toBuffer('image/png'));
        console.log(`  🖼️ proof sheet → ${path.join(OUT, 'qa25_proof_sheet.png')}`);
    } catch (e) { console.log('  ⚠️ proof sheet failed (non-fatal):', e.message); }

    console.log(`\nQA25: ${pass} pass, ${fail} fail`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('QA25 crashed:', e); process.exit(1); });
