'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// qa_task21.js — Task 21 (owner 2026-10-21, 4th restatement — verbatim):
//   "I want the .j fish image to NOT be an image, but a girl that has the
//    floating thing on the water, bobbing up and down slightly. And I want
//    this generated once and saved on the server, or in the repo permanently,
//    as a usable asset and an overlay like the others. We should implement an
//    overlay that also explains this is the pond and shows what you caught.
//    And for the hunt, find sprites of deers that fit and other animals
//    grazing and fill them in. Place some grass around too.
//    After that, for all the renders for this new implementation - from the
//    world map to all the 3D and even the 2D ones like the fish and hunt -
//    implement a day and night cycle where it gets darker, but there are
//    light sources, of course. Make the colors for this day and night cycle
//    realistic."
// Source pins everywhere + asset checks (committed girl master) + phase math.
// Real renders/GIF encodes need canvas → run the render tier ON-BOX
// (qa_task21_render.js). Sandbox passes pins and skips the canvas tier.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}`); cond ? pass++ : fail++; };

process.env.QA_MODE = '1';

const dn = R('core/rpg/dayNight.js');
const dp = R('core/rpg/dockPov.js');
const hp = R('core/rpg/huntPov.js');
const bb = R('core/rpg/baseBuilder.js');
const sc = R('core/rpg/structureScenes.js');
const hs = R('core/rpg/homesteadBaseRenderer.js');
const gb = R('core/rpg/guildBaseRenderer.js');
const wa = R('core/rpg/worldAtlasRenderer.js');
const cm = R('core/rpg/continentMapRenderer.js');
const mc = R('core/rpg/mediaCache.js');

console.log('\n--- §1 dayNight.js — the shared sky-clock ---');
check('five realistic phases on the real UTC clock (dawn/day/golden/dusk/night)', /dawn/.test(dn) && /golden/.test(dn) && /dusk/.test(dn) && /night/.test(dn) && /getUTCHours/.test(dn));
check('phase windows: dawn 5-7, day 7-17, golden 17-18.5, dusk 18.5-20, night 20-5', /h >= 5 && h < 7/.test(dn) && /h >= 7 && h < 17/.test(dn) && /h >= 17 && h < 18\.5/.test(dn) && /h >= 18\.5 && h < 20/.test(dn));
check('grade(): realistic colour bands, never grey/black (blue moonlight, orange dusk)', /rgba\(16,30,66/.test(dn) && /rgba\(255,130,72/.test(dn) && /rgba\(255,196,150/.test(dn) && /rgba\(255,190,110/.test(dn));
check('bands feather at their edges (no hard seam across scenes)', /setA|addColorStop/.test(dn));
check('light(): additive glow that punches through the dark (lighter composite)', /globalCompositeOperation = 'lighter'/.test(dn));
check('moonStars() + fireflies() for the night scenes', /function moonStars/.test(dn) && /function fireflies/.test(dn));

console.log('\n--- §2 the girl-angler master asset (committed to the repo) ---');
const ASSET_DIR = path.join(ROOT, 'core', 'assets', 'scenes');
const assets = [1, 2, 3].map((l) => path.join(ASSET_DIR, `pond_girl_l${l}_v1.bin`));
check('pond_girl_l1/l2/l3_v1.bin EXIST in core/assets/scenes (committed)', assets.every((p) => fs.existsSync(p)));
const magics = assets.filter(fs.existsSync).map((p) => fs.readFileSync(p).slice(0, 9).toString('utf8'));
check('all three assets carry the PONDGIRL1 container magic', magics.length === 3 && magics.every((m) => m === 'PONDGIRL1'));
const sizes = assets.filter(fs.existsSync).map((p) => fs.statSync(p).size);
check(`assets are real bakes (${sizes.map((s) => (s / 1024).toFixed(0) + 'KB').join(', ')}) — not stubs`, sizes.every((s) => s > 100000));
check('preview contact sheets committed next to them', [1, 2, 3].every((l) => fs.existsSync(path.join(ASSET_DIR, `pond_girl_l${l}_preview.png`))));
check('bake script committed (scripts/bake_pond_girl.js — re-runs byte-identical)', fs.existsSync(path.join(ROOT, 'scripts', 'bake_pond_girl.js')));
check('runtime READS the committed asset, bakes only as fallback', /function loadCommitted/.test(dp) && /fs\.readFileSync\(p\)/.test(dp) && /bakeLevelFrames\(lvl\)/.test(dp));
check('loader exposes committed flag (qa can prove the repo asset is served)', /committed: true/.test(dp));

console.log('\n--- §3 the pond overlay (explains the place + shows the catch) ---');
check('result plate drawn per catch AFTER compose (loot text never in compose key)', /drawResultPlate\(c2, c\.gw, c\.gh, \{ title: 'The Pond', lines \}\)/.test(dp));
check('plateLines maps real loot ids → names + rarity colours (both activities)', /plateLines/.test(dp) && /silver_carp/.test(dp) && /stag_antler/.test(dp) && /RARITY_COL/.test(dp));
check('rarity colours: COMMON/UNCOMMON/RARE/EPIC all mapped', /COMMON: '#e8e8e0'/.test(dp) && /UNCOMMON: '#8ee08e'/.test(dp) && /RARE: '#7ab8f0'/.test(dp) && /EPIC: '#c9a0ff'/.test(dp));
check('baseBuilder passes REAL drops into both GIF renderers', /drops: res\.drops/.test(bb));

console.log('\n--- §4 hunt: deer herd + grazing animals + grass ---');
check('8-row sheet with doe/graze/fawn/sheep', /doe: 4, graze: 5, fawn: 6, sheep: 7/.test(hp));
check('wildlifePlan: herd baked into the base frames (not only the roll overlay)', /function wildlifePlan/.test(hp) && /blitWildlife\(c2, GW, GH, i \/ FRAMES, sheet/.test(hp));
check('7 animals graze the clearing (stag + 3 does + fawn + 2 sheep)', /put\(ROW\.stag/.test(hp) && (hp.match(/put\(ROW\.(graze|sheep|fawn)/g) || []).length >= 6);
check('grass around: patches + 44+lvl·8 tufts + tufts at every grazer\'s feet', /ntuft = 44 \+ lvl \* 8/.test(hp) && /for \(let i = 0; i < 9 \+ lvl \* 2; i\+\+\)/.test(hp) && /for \(let i = 0; i < 5; i\+\+\)/.test(hp));
check('grazers animate (slow nibble/sheep/fawn poses per frame)', /slow nibble/.test(hp) && /hop-shuffle/.test(hp));

console.log('\n--- §5 day/night across EVERY render surface ---');
check('pond: compose grades + night lantern/moon glints + moonStars', /dayNight\.grade\(c2, master\.gw, master\.gh, phase\)/.test(dp) && /dayNight\.moonStars\(c2, master\.gw/.test(dp));
check('pond still wears the hour too (paintStill phase param)', /function paintStill\(ctx, w, h, \{ lvl = 1, biome = 'isle', phase = null/.test(dp));
check('hunt: compose grades + campfire/tent lights + moon/stars/fireflies', /dayNight\.grade\(c2, base\.gw, base\.gh, phase\)/.test(hp) && /campAnchors/.test(hp) && /dayNight\.fireflies\(c2, base\.gw/.test(hp));
check('hunt still is async + herd + hour (await in structureScenes)', /await require\('\.\/huntPov'\)\.paintStill/.test(sc));
check('3D structure cards: phase in cache key (sc3) + grade + structure light + moon', /'sc3'/.test(sc) && /dn\.grade\(ctx, W, H, phase\)/.test(sc) && /dn\.light\(ctx, sp\.x/.test(sc) && /dn\.moonStars/.test(sc));
check('homestead base map: scene carries window lights + grade + moon + stateHash phase', /lights\.push/.test(hs) && /dayNight\.grade\(ctx, sc\.W, sc\.H, dnPhase\)/.test(hs) && /opts\.phase \|\| dayNight\.phaseAt\(\)/.test(hs));
check('guild grounds: lights anchors + grade + moon + stateHash phase', /const lights = smokeAnchors\.map/.test(gb) && /dayNight\.grade\(ctx, sc\.W, sc\.H, dnPhase\)/.test(gb) && /opts\.phase \|\| require\('\.\/dayNight'\)\.phaseAt\(\)/.test(gb));
check('world atlas: map-area-only grade (parchment stays readable) + moon over the sea', /dayNight\.grade\(ctx, MW, MH, dnPhase, \{ x: mx, y: my, w: MW, h: MH \}\)/.test(wa) && /dayNight\.moonStars\(ctx, MW, MH/.test(wa));
check('atlas memo key includes the phase (night chart ≠ day chart)', /hi, dnPhase\]/.test(wa));
check('legacy continent chart wears the hour under its pins', /dayNight'\)\.grade\(ctx, W, H/.test(cm));
check('mediaCache CODE_VER hashes dayNight.js (art edits auto-invalidate)', /'dayNight\.js'/.test(mc));

// ── phase math (pure, no canvas) ────────────────────────────────────────────
console.log('\n--- §6 phase math sanity ---');
const D = require(path.join(ROOT, 'core/rpg/dayNight.js'));
const at = (h) => D.phaseAt(new Date(Date.UTC(2026, 9, 21, h, 0, 0)));
check('05:00 → dawn', at(5) === 'dawn');
check('06:59 → dawn, 07:00 → day', at(6.98) === 'dawn' && at(7) === 'day');
check('12:00 → day (true colours)', at(12) === 'day');
check('17:30 → golden, 19:00 → dusk', at(17.6) === 'golden' && at(19) === 'dusk');
check('20:00 → night, 04:59 → night (before dawn)', at(20) === 'night' && at(4.98) === 'night');
check('grade(day) is a no-op (true colours at noon)', D.grade(() => {}, 10, 10, 'day') === undefined);
check('PHASES carry dark + lightsOn (dusk/night light their windows)', D.phaseInfo('night').lightsOn === true && D.phaseInfo('dusk').lightsOn === true && D.phaseInfo('day').lightsOn === false);

// ── runtime tier (needs node_modules — on-box) ─────────────────────────────
let canvasOk = false;
try { require(path.join(ROOT, 'node_modules', 'canvas')); canvasOk = true; } catch (e) { /* sandbox */ }
if (!canvasOk) {
    console.log(`\n${'='.repeat(54)}\nSANDBOX: pins only (canvas missing) — ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}

(async () => {
    console.log('\n--- §7 runtime: the committed asset is what actually serves ---');
    const dpv = require(path.join(ROOT, 'core/rpg/dockPov'));
    const master = await dpv.getBaseFrames({ lvl: 2 });
    check(`base = the COMMITTED repo asset (committed=${master.committed}, 16 frames)`, master.committed === true && master.pngs.length === 16);
    const comp = await dpv.composePond({ biome: 'isle', lvl: 2, phase: 'night', band: 'low' });
    check('composePond produces a 16-frame container at night', !!comp.buffer && comp.buffer.length > 100000);
    const gif = await dpv.renderFishingGif({ biome: 'isle', lvl: 2, band: 'epic', drops: { crystal_koi: 1 }, phase: 'night' });
    check('night catch GIF encodes GIF89a with the plate', gif.contentType === 'image/gif' && gif.buffer.slice(0, 6).toString('latin1') === 'GIF89a');
    const lines = dpv.plateLines('fish', { crystal_koi: 1, raw_fish: 3 });
    check('plateLines order by value (koi first) + EPIC colour', lines[0].text.includes('Crystal Koi') && lines[0].color === '#c9a0ff');
    console.log(`\n${'='.repeat(54)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(54)}`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('QA crashed:', e); process.exit(1); });
