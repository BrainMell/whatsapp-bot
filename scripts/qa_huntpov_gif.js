'use strict';
// ===========================================================================
// qa_huntpov_gif.js -:
// "make something like that for hunting too, find the appropriate animal
// sprites for that sprite sheet, and add the overlay to both"
// Tiers: source pins (everywhere) + REAL renders: sprite-sheet bake, base
// frames per (biome, lvl), all 3 band GIFs, disk-hit repeats, shared viewer
// still, GIF89a structure (needs canvas/node_modules → run ON-BOX).
// ===========================================================================
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}`); cond ? pass++ : fail++; };

process.env.QA_MODE = '1'; // mediaCache → tmpdir (never touches prod cache)

const hp = R('core/rpg/huntPov.js');
const dp = R('core/rpg/dockPov.js');
const bb = R('core/rpg/baseBuilder.js');
const ba = R('core/rpg/baseActivities.js');
const sc = R('core/rpg/structureScenes.js');
const mc = R('core/rpg/mediaCache.js');

console.log('\n--- §A huntPov module: sheet, cache model, overlays ---');
check('sprite sheet constants + row map (Task 21 herd: 8 rows, Task 22 vector cells)', /const CW = 128, CH = 96, COLS = 4/.test(hp) && /ROW = . rabbit: 0, boar: 1, stag: 2, alert: 3, doe: 4, graze: 5, fawn: 6, sheep: 7 ./.test(hp) && /SHEET_ROWS = 8/.test(hp) && /SHEET_COMP = 0.75/.test(hp));
check('deer herd + other grazers painted in the sheet (doe/graze/fawn/sheep)', /kind === 'doe' \|\| kind === 'graze'/.test(hp) && /kind === 'fawn'/.test(hp) && /kind === 'sheep'/.test(hp));
check('sheet baked ONCE through mediaCache ("find the sprites, keep the sheet")', /mediaCache.cached.'huntsprites', 'hs3'/.test(hp));
check('sheet is a real PNG drawn from walk-cycle painters', /function paintAnimal/.test(hp) && /toBuffer\('image\/png'\)/.test(hp));
check('blits from the sheet with smoothing ON (vector art scales cleanly)', /imageSmoothingEnabled = true/.test(hp) && /drawImage\(sheet, col \* CW, row \* CH/.test(hp));
check('same "bake once" base frames as the pond (canonical seed, no user seed)', /hp3:\${biome}:L\$/.test(hp) && !/hp3:\${.*userId/.test(hp));
check('base frames stored via mediaCache disk L2 (huntpov kind)', /mediaCache\.cached\('huntpov'/.test(hp));
check('compose layer keyed by biome/level/PHASE/band (day/night, huntcompose kind)', /hgc2:\${biome}:L\${lvl}:\${phase}:\${band}/.test(hp) && /mediaCache.cached.'huntcompose'/.test(hp));
check('final GIF keyed per loot banner (hg3 + plateKey)', /hg3:\${biome}:L\${lvl}:\${phase}:\${band}:\${plateKey}/.test(hp) && /mediaCache.cached.'huntgif'/.test(hp));
check('WILDLIFE PLAN: herd lives in the base (stag/doe/fawn/sheep graze the meadow)', /function wildlifePlan/.test(hp) && /ROW\.stag/.test(hp) && /ROW\.graze/.test(hp) && /ROW\.fawn/.test(hp) && /ROW\.sheep/.test(hp) && /blitWildlife/.test(hp));
check('reuses the dockPov PNG-frame packer with its own magic', /dockPov\.packContainer\(base\.gw, base\.gh, base\.delayMs, pngs, CONTAINER_MAGIC\)/.test(hp) && /'HUNTPOV1'/.test(hp));
check('bands: low=rabbit hops, mid=boar + dust, epic=stag + flush + glint', /band === 'low'/.test(hp) && /ROW\.rabbit/.test(hp) && /ROW\.boar/.test(hp) && /ROW\.stag/.test(hp) && /ROW\.alert/.test(hp) && /antler glint/.test(hp));
check('rarity signalled only AFTER the roll (overlay contract)', /band chosen AFTER the roll/.test(hp));
check('day/night: grade + campfire/tent lights + moon/stars + fireflies at night', /dayNight\.grade\(c2, base\.gw, base\.gh, phase\)/.test(hp) && /campAnchors/.test(hp) && /dayNight\.moonStars/.test(hp) && /dayNight\.fireflies/.test(hp));
check('result overlay = the ESTABLISHED banner (Task 22), accepted from res.banner', /drawBanner/.test(hp) && /banner = null/.test(hp) && !/drawResultPlate/.test(hp));
check('5 biome palettes (isle/desert/tundra/highlands/volcanic)', /isle: \{/.test(hp) && /desert: \{/.test(hp) && /tundra: \{/.test(hp) && /highlands: \{/.test(hp) && /volcanic: \{/.test(hp));
check('grass: patches + nearly double tufts + tufts at every grazer\'s feet', /grass patches/.test(hp) && /ntuft = 44 \+ lvl \* 8/.test(hp) && /grass at each grazer/.test(hp));
check('ambient life in the base: clouds drift, grass sways, fire flickers, bush rustles', /drifting clouds/.test(hp) && /sway/.test(hp) && /flick/.test(hp) && /rustle/.test(hp));
check('lvl dressing: L2 archery butt + 2nd tent, L3 gold banner', /lvl >= 2/.test(hp) && /lvl >= 3/.test(hp));
check('gif89a encodeGif used (no new deps)', /require\('\.\.\/utils\/gif89a'\)/.test(hp) && /encodeGif\(\{ width: c\.gw/.test(hp));

console.log('\n--- §B wiring: caller, bandOf, viewer, CODE_VER ---');
check('cmdActivity tries renderHuntGif for hunts', /require\('\.\/huntPov'\)\.renderHuntGif/.test(bb));
check('bandOf routes hunt drops (stag epic / boar mid)', /kind === 'hunt'/.test(ba) && /drops\.stag_antler/.test(ba));
check('fishing float shares one geometry (base + overlay agree)', /function floatGeom/.test(dp));
check('hunting viewer = clearing still via huntPov (hunt_pov key)', /isHuntView/.test(sc) && /huntPov'\)\.paintStill/.test(sc));
check('mediaCache CODE_VER hashes huntPov.js', /'huntPov\.js'/.test(mc));

// -- runtime tier (needs node_modules - on-box) -----------------------------
let canvasOk = false;
try { require(path.join(ROOT, 'node_modules', 'canvas')); canvasOk = true; } catch (e) { /* sandbox */ }
if (!canvasOk) {
    console.log(`\n${'='.repeat(54)}\nSANDBOX: pins only (canvas missing) - ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}

(async () => {
    const outDir = path.join(__dirname, 'render_out', 'huntpov_qa');
    fs.mkdirSync(outDir, { recursive: true });
    const hpv = require(path.join(ROOT, 'core/rpg/huntPov'));
    const { createCanvas } = require(path.join(ROOT, 'node_modules', 'canvas'));

    console.log('\n--- §C REAL renders: sheet, base frames, all 3 band GIFs ---');
    const t0 = Date.now();
    const sheet = await hpv.getHuntSpriteSheet();
    check(`sprite sheet baked (${Date.now() - t0}ms, ${sheet.width}×${sheet.height}px = 4×8 cells of 128×96 incl. the herd)`, sheet.width === 512 && sheet.height === 768);
    fs.writeFileSync(path.join(outDir, 'sprite_sheet.png'), sheet.src);

 // cells: every row must have non-empty pixels in every frame cell
    const probe = createCanvas(hpv.CW, hpv.CH), pctx = probe.getContext('2d');
    let empty = 0;
    for (const row of Object.values(hpv.ROW)) {
        for (let col = 0; col < hpv.COLS; col++) {
            pctx.clearRect(0, 0, hpv.CW, hpv.CH);
            hpv.blitAnimal(pctx, sheet, row, col, hpv.CW / 2, hpv.CH - 2, 1, false, false);
            const d = pctx.getImageData(0, 0, hpv.CW, hpv.CH).data;
            let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
            if (n < 60) empty++;
        }
    }
    check('every sheet cell paints real pixels (32/32 non-empty)', empty === 0);

    const t1 = Date.now();
    const base = await hpv.getHuntBaseFrames({ biome: 'isle', lvl: 1 });
    check(`hunt base bake = 16 PNG frames 480×360 (${Date.now() - t1}ms first bake)`, base.pngs.length === 16 && base.gw === 480 && base.gh === 360);
    const t2 = Date.now();
    await hpv.getHuntBaseFrames({ biome: 'isle', lvl: 1 });
    check(`repeat getHuntBaseFrames is a cache hit (${Date.now() - t2}ms - "generate once")`, (Date.now() - t2) < 250);
    for (const [i, p] of base.pngs.entries()) if (i % 5 === 0) fs.writeFileSync(path.join(outDir, `hunt_base_isle_L1_f${i}.png`), p);

    const gifInfo = {};
    for (const band of ['low', 'mid', 'epic']) {
        const tb = Date.now();
        const g = await hpv.renderHuntGif({ biome: 'isle', lvl: 1, band });
        gifInfo[band] = { ms: Date.now() - tb, bytes: g.buffer.length };
        fs.writeFileSync(path.join(outDir, `hunt_${band}.gif`), g.buffer);
        check(`hunt GIF [${band}] = GIF89a magic, ${g.buffer.length}B in ${gifInfo[band].ms}ms`, g.contentType === 'image/gif' && g.buffer.slice(0, 6).toString('latin1') === 'GIF89a');
    }
    const tc = Date.now();
    const g2 = await hpv.renderHuntGif({ biome: 'isle', lvl: 1, band: 'epic' });
    check(`repeat hunt GIF = disk hit (${Date.now() - tc}ms)`, g2.buffer.length === gifInfo.epic.bytes && (Date.now() - tc) < 250);
    const g3 = await hpv.renderHuntGif({ biome: 'tundra', lvl: 3, band: 'mid' });
    fs.writeFileSync(path.join(outDir, 'hunt_tundra_L3_mid.gif'), g3.buffer);
    check('second biome/level bakes its own base (tundra L3, archery + banner)', g3.buffer.length > 1000);
    const g4 = await hpv.renderHuntGif({ biome: 'volcanic', lvl: 2, band: 'epic' });
    fs.writeFileSync(path.join(outDir, 'hunt_volcanic_L2_epic.gif'), g4.buffer);
    check('third biome renders (volcanic L2)', g4.buffer.length > 1000);

    console.log('\n--- §D hunt viewer still (shared canonical bake) ---');
    const scenes = require(path.join(ROOT, 'core/rpg/structureScenes'));
    const still = await scenes.renderStructureCard({ type: 'hunting', level: 2, biome: 'isle', seed: 'qa-user-1', spec: { title: 'Hunting Grounds', subtitle: 'The Clearing · Lv.2', actions: ['.j hunt'] } });
    fs.writeFileSync(path.join(outDir, 'viewer_hunting_L2_still.jpg'), still.buffer);
    check('hunting viewer = clearing still JPEG', still.contentType === 'image/jpeg' && still.buffer.length > 20000);
    const still2 = await scenes.renderStructureCard({ type: 'hunting', level: 2, biome: 'isle', seed: 'DIFFERENT-user', spec: { title: 'Hunting Grounds', subtitle: 'The Clearing · Lv.2', actions: ['.j hunt'] } });
    check('hunting viewer still SHARED across users (canonical seed cache hit)', still2.cached === true);
    const stillPond = await scenes.renderStructureCard({ type: 'pond', level: 2, biome: 'isle', seed: 'qa-user-1', spec: { title: 'The Pond', subtitle: 'Dock POV · Lv.2', actions: ['.j fish'] } });
    fs.writeFileSync(path.join(outDir, 'viewer_pond_L2_still.jpg'), stillPond.buffer);
    check('pond viewer unaffected (dock-POV still still renders)', stillPond.contentType === 'image/jpeg' && stillPond.buffer.length > 20000);

 // GIF structure sanity on the epic sample
    const raw = fs.readFileSync(path.join(outDir, 'hunt_epic.gif'));
    check('hunt GIF has NETSCAPE loop + trailer', raw.includes(Buffer.from('NETSCAPE2.0')) && raw[raw.length - 1] === 0x3B);

    console.log(`\nSamples → ${outDir}`);
    console.log(`${'='.repeat(54)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(54)}`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('QA crashed:', e); process.exit(1); });


// -- the herd is REAL vector art now ("that looks like shit") --
check('NO fillRect pixel animals left (the px() block painter is gone)', !/function px\(/.test(hp) && !/px\(ctx, -7/.test(hp));
check('deer family = ellipse bodies + stroked legs (established card-art technique)', /ctx\.ellipse\(0, -0\.95 \* ss, 0\.95 \* ss, 0\.46 \* ss/.test(hp) && /function strokeLeg/.test(hp));
check('stag antlers are BRANCHED lines, not white blobs', /const br = \(bx, by, dx, dy\)/.test(hp) && /#e6d3a8/.test(hp));
check('sheep is woolly puffs, boar has tusk curve, fawn has spots', /woolly body/.test(hp) && /quadraticCurveTo\(1\.12 \* ss/.test(hp) && /fawn spots/.test(hp));
check('real walk cycles: diagonal trot pairs + body bob (not static rects)', /const TROT = \[0\.55, 0, -0\.55, 0\]/.test(hp) && /Math\.sin\(pose \* Math\.PI \/ 2\) \* 0\.035/.test(hp));
check('bigger cells (128x96) with blit compensation so on-screen size is unchanged', /const dw = CW \* scale \* SHEET_COMP, dh = CH \* scale \* SHEET_COMP/.test(hp));
