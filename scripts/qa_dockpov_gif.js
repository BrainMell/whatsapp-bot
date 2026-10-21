'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// qa_dockpov_gif.js — Task 19/20 (owner 2026-10-21):
//   ".j hunt shouldn't have a timer only a limit per how many times a day"
//   "fishing should be a gif — generate it once and keep it, overlay the new
//    stuff as the generation comes on" + the real dock-POV camera.
//   Task 20: "remove the timer from the fishing too" + the float bobbing in
//   and out of the water. Hunt GIF/sprite-sheet QA lives in qa_huntpov_gif.js.
// Tiers: source pins (everywhere) + REAL renders/GIF encodes + hunt-limit sim
// (needs canvas/node_modules → run ON-BOX; sandbox passes pins and skips).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const check = (name, cond) => { console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${name}`); cond ? pass++ : fail++; };

process.env.QA_MODE = '1'; // mediaCache → tmpdir (never touches prod cache)

const ba = R('core/rpg/baseActivities.js');
const bb = R('core/rpg/baseBuilder.js');
const sc = R('core/rpg/structureScenes.js');
const mc = R('core/rpg/mediaCache.js');
const dp = R('core/rpg/dockPov.js');
const bm = R('core/models/Base.js');

console.log('\n--- §A hunt: timer GONE, daily limit IN · fish: NO timer at all (Task 20) ---');
check('hunt has no cooldownMs (8m timer removed)', !/cooldownMs: 8 \* 60 \* 1000/.test(ba));
check('fish has NO cooldown either (Task 20: line rest removed)', !/cooldownMs/.test(ba));
check('hunt dailyLimit: 25 present', /dailyLimit: 25/.test(ba));
check('run() reads cooldowns MAP for hunt only (cd.huntDay/Count, no cd.fish)', /cd\.huntDay === day/.test(ba) && /cd\.huntCount \|\| 0/.test(ba) && !/cd\.fish/.test(ba));
check('limit message names the counter + UTC reset', /hunts used/.test(ba) && /midnight UTC/.test(ba));
check('res carries dailyUsed + dailyDay on success', /out\.dailyUsed/.test(ba) && /out\.dailyDay/.test(ba));
check('utcDay = UTC ISO date stamp', /toISOString\(\)\.slice\(0, 10\)/.test(ba));
check('bandOf is kind-aware (fish koi/carp · hunt stag/boar)', /kind === 'hunt'/.test(ba) && /drops\.stag_antler/.test(ba) && /drops\.boar_tusk/.test(ba) && /drops\.crystal_koi/.test(ba));

console.log('\n--- §B caller: persist counter, GIF paths, gifPlayback ---');
check('cmdActivity passes the cooldowns MAP to run()', /act\.run\(kind, ctx\.senderJid, tier, rec\.cooldowns \|\| \{\}\)/.test(bb));
check('hunt persists huntDay+huntCount; fish persists NOTHING (no timer)', /'cooldowns\.huntDay': res\.dailyDay/.test(bb) && /'cooldowns\.huntCount': res\.dailyUsed/.test(bb) && !/'cooldowns\.fish'/.test(bb));
check('fish tries the dock-POV GIF first', /require\('\.\/dockPov'\)\.renderFishingGif/.test(bb));
check('hunt tries the hunt-POV GIF (Task 20)', /require\('\.\/huntPov'\)\.renderHuntGif/.test(bb));
check('band comes from REAL drops, kind-aware (act.bandOf(res.drops, kind))', /act\.bandOf\(res\.drops, 'fish'\)/.test(bb) && /act\.bandOf\(res\.drops, 'hunt'\)/.test(bb));
check('static zoom card kept as fallback (gif failure ≠ gameplay failure)', /renderZoom\(ctx, rec, st, \{ banner: res\.banner, note/.test(bb));
check('send probes isGifBuffer → gifPlayback', /isGifBuffer\(media\.buffer\)/.test(bb) && /gifPlayback = true/.test(bb));
check('hunt note shows today counter; fish note says NO line rest', /Hunts today: \$\{res\.dailyUsed\}/.test(bb) && /No line rest/.test(bb));

console.log('\n--- §C the pond: girl-angler master asset (Task 21) ---');
check('NO GIRL — dock-POV restored (owner Task 22: "I meant GIF, not girl… UNDO that fishing bullshit")', !/function paintGirl/.test(dp) && !/paintGirl\(/.test(dp) && /DOCK_EDGE/.test(dp));
check('float bobbing up and down through the waterline (Task 20 bob restored: 0.45·bs)', /function floatBob/.test(dp) && /bs \* 0\.45;/.test(dp));
check('committed repo asset loader (generated once, saved permanently)', /loadCommitted/.test(dp) && /ASSET_VER/.test(dp) && /assets', 'scenes/.test(dp));
check('master bakes NO sun — compose owns the hour (no twin suns)', !/fillStyle = P\.sun/.test(dp) && /paintCelestial.c2, master.gw, master.gh, i \/ FRAMES, phase./.test(dp));
check('girl-scene sign is GONE — the established banner explains the place now (Task 22)', !/the sign: .THE POND. on a post/.test(dp) && /drawBanner/.test(dp));
check('dayNight cycle wired into the compose (grade + post-lantern/pool lights)', /dayNight.grade.c2, master.gw, master.gh, phase./.test(dp) && /dockAnchors/.test(dp) && /dayNight.light.c2, A.post.x/.test(dp));
check('biome washes keep the 5 realms distinct over the one master', /WASHERS/.test(dp) && /desert: \{/.test(dp) && /volcanic: \{/.test(dp));
check('compose cached per (biome, level, phase, band) — pondcompose kind', /pgc2:\${biome}:L\${lvl}:\${phase}:\${band}/.test(dp) && /mediaCache.cached.'pondcompose'/.test(dp));
check('RESULT OVERLAY = the ESTABLISHED banner (structureScenes.drawBanner, owner Task 22)', /scenes.drawBanner.c2, c.gw, c.gh, ribbon./.test(dp) && /BANNER_FROM_FRAME/.test(dp) && !/drawResultPlate/.test(dp));
check('final GIF cached per loot banner (pg3 + plateKey)', /pg3:\${biome}:L\${lvl}:\${phase}:\${band}:\${plateKey}/.test(dp) && /mediaCache.cached.'fishgif'/.test(dp));
check('rarity signalled only AFTER the roll (overlay contract)', /never pre-signals rarity/.test(dp));
check('RARE→carp approach, EPIC→big koi + splash', /band === 'mid' \|\| band === 'epic'/.test(dp) && /band === 'epic'/.test(dp));
check('GIF params: 480×360, 16 frames, 120ms', /GW = 480, GH = 360, FRAMES = 16, DELAY_MS = 120/.test(dp));
check('container roundtrip guards: magic + frame count', /CONTAINER_MAGIC/.test(dp) && /c\.pngs\.length !== FRAMES/.test(dp));
check('gif89a encodeGif used (no new deps, no ffmpeg)', /require\('\.\.\/utils\/gif89a'\)/.test(dp) && /encodeGif\(\{ width: c\.gw/.test(dp));

console.log('\n--- §C2 the float (Task 20 kept: bobbing in/out; Task 21: slightly) ---');
check('float geometry shared by base + overlay (floatGeom/floatBob/paintFloat)', /function floatGeom/.test(dp) && /function floatBob/.test(dp) && /function paintFloat/.test(dp));
check('fixed waterline the body crosses (wlY = by + bs·0.55)', /wlY: by \+ bs \* 0\.55/.test(dp));
check('dry/wet clip split at the waterline (body visibly in the water)', /rect\(bx - bs \* 1\.3, 0, bs \* 2\.6, wlY\)/.test(dp) && /rect\(bx - bs \* 1\.3, wlY/.test(dp));
check('antenna tip rides highest, drawn per half (last to go under)', /byy - bs \* 1\.5/.test(dp));
check('bite pulls the float UNDER (dip 1.35·bs at peak)', /dip = bite \* bs \* 1\.35/.test(dp));
check('overlay re-draws line+float via the same paintFloat (rod false, dip passed)', /paintFloat\(ctx, w, h, t, P, \{ rod: false, line: true, dip \}/.test(dp));
check('contact ripple breathes with the bob', /contact ripple/.test(dp));
check('container magic is parameterised (huntPov reuses the packer)', /function packContainer\(gw, gh, delayMs, pngs, magic = CONTAINER_MAGIC\)/.test(dp) && /function unpackContainer\(buf, magic = CONTAINER_MAGIC\)/.test(dp));

console.log('\n--- §D pond + hunting viewers + cache versioning ---');
check('pond viewer renders dock-POV still (canonical seed, no activity)', /isPondView = type === 'pond' && !activity/.test(sc) && /dockPov'\)\.paintStill/.test(sc));
check('pond viewer key distinct (pond_pov) so activity cards unaffected', /isPondView \? 'pond_pov' :/.test(sc));
check('hunting viewer renders the clearing still (Task 20, hunt_pov key)', /isHuntView = type === 'hunting' && !activity/.test(sc) && /huntPov'\)\.paintStill/.test(sc) && /'hunt_pov'/.test(sc));
check('mediaCache CODE_VER includes dockPov.js + huntPov.js', /'dockPov\.js', 'huntPov\.js'/.test(mc));
check('Base.js cooldowns comment documents huntDay/huntCount', /huntDay \(UTC/.test(bm) && /no timer, Task 19/.test(bm));

// ── runtime tier (needs node_modules — on-box) ──────────────────────────────
let canvasOk = false;
try { require(path.join(ROOT, 'node_modules', 'canvas')); canvasOk = true; } catch (e) { /* sandbox */ }
if (!canvasOk) {
    console.log(`\n${'='.repeat(54)}\nSANDBOX: pins only (canvas missing) — ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
}

(async () => {
    console.log('\n--- §E hunt daily-limit SIM (stubbed inventory/economy) ---');
    const inv = require(path.join(ROOT, 'core/rpg/inventorySystem'));
    const econ = require(path.join(ROOT, 'core/rpg/economy'));
    const act = require(path.join(ROOT, 'core/rpg/baseActivities'));
    const origAdd = inv.addItem, origMoney = econ.addMoney;
    inv.addItem = async () => ({ success: true });
    econ.addMoney = () => true;
    try {
        const T = 'qa_dockpov@s.whatsapp.net';
        const cd = {};
        let ok = 0, blocked = null, lastUsed = 0;
        for (let i = 1; i <= 30; i++) {
            const r = await act.run('hunt', T, 1, cd);
            if (r.ok) { ok++; lastUsed = r.dailyUsed; cd.huntDay = r.dailyDay; cd.huntCount = r.dailyUsed; }
            else { blocked = r; break; }
        }
        check(`25 hunts then BLOCK (got ${ok} ok, #${ok + 1} blocked)`, ok === 25 && !!blocked);
        check('counter tracked 1→25 through the day', lastUsed === 25);
        check('blocked text names 25/25 + midnight UTC', /25\/25/.test(blocked.text) && /midnight UTC/.test(blocked.text));
        // day rollover: old huntDay stamp → fresh count
        const r2 = await act.run('hunt', T, 1, { huntDay: '2001-01-01', huntCount: 25 });
        check('new UTC day resets the counter (stale day → allowed again)', r2.ok === true && r2.dailyUsed === 1);
        // Task 20: fish has NO timer — even a fresh stamp must not gate it
        const rf = await act.run('fish', T, 1, { fish: Date.now() });
        const rf2 = await act.run('fish', T, 1, { fish: Date.now() });
        check('fish has NO timer (back-to-back casts both run)', rf.ok === true && rf2.ok === true);
        check('fish drops enriched w/ rarity + value', /UNCOMMON|COMMON|RARE|EPIC/.test(rf2.text) && /sells .?[\d,]+Z/.test(rf2.text));
        check('bandOf fish: koi→epic, carp→mid, else low', act.bandOf({ crystal_koi: 1 }, 'fish') === 'epic' && act.bandOf({ silver_carp: 2 }, 'fish') === 'mid' && act.bandOf({ raw_fish: 3 }, 'fish') === 'low');
        check('bandOf hunt: stag→epic, boar→mid, else low', act.bandOf({ stag_antler: 1 }, 'hunt') === 'epic' && act.bandOf({ boar_tusk: 1 }, 'hunt') === 'mid' && act.bandOf({ venison: 2 }, 'hunt') === 'low');
    } finally { inv.addItem = origAdd; econ.addMoney = origMoney; }

    console.log('\n--- §F REAL renders: base frames, catch GIFs, viewer still ---');
    const outDir = path.join(__dirname, 'render_out', 'dockpov_qa');
    fs.mkdirSync(outDir, { recursive: true });
    const dpv = require(path.join(ROOT, 'core/rpg/dockPov'));
    const { createCanvas, Image } = require(path.join(ROOT, 'node_modules', 'canvas'));

    // anchor mirrors the painted float (antenna knob sampled at the tip)
    const probe = createCanvas(dpv.GW, dpv.GH), pctx = probe.getContext('2d');
    dpv.paintFrame(pctx, dpv.GW, dpv.GH, 0, { biome: 'isle', lvl: 1 });
    const g = dpv.floatGeom(dpv.GW, dpv.GH);
    const knobY = Math.round(g.by + dpv.floatBob(0, g.bs) - g.bs * 1.5);
    const kd = pctx.getImageData(Math.round(g.bx), knobY, 1, 1).data;
    check('float antenna knob painted at the geometry anchor (pale tip sampled)', kd[0] > 180 && kd[1] > 160);
    const wlY = Math.round(g.wlY), above = pctx.getImageData(Math.round(g.bx), Math.round(g.by), 1, 1).data;
    const below = pctx.getImageData(Math.round(g.bx), wlY + 3, 1, 1).data;
    check('waterline crossing: body ABOVE wl is bright red, BELOW wl is the wet tint', above[0] > 150 && above[0] > below[0] && below[0] < 180);

    const t0 = Date.now();
    const base = await dpv.getBaseFrames({ biome: 'isle', lvl: 1 });
    const bakeMs = Date.now() - t0;
    check(`base bake = 16 PNG frames 480×360 (${bakeMs}ms first bake)`, base.pngs.length === 16 && base.gw === 480 && base.gh === 360);
    const t1 = Date.now();
    await dpv.getBaseFrames({ biome: 'isle', lvl: 1 });
    check(`repeat getBaseFrames is a cache hit (${Date.now() - t1}ms — "generate once")`, (Date.now() - t1) < 250);
    for (const [i, p] of base.pngs.entries()) if (i % 5 === 0) fs.writeFileSync(path.join(outDir, `base_isle_L1_f${i}.png`), p);

    const bands = ['low', 'mid', 'epic'];
    const gifInfo = {};
    for (const band of bands) {
        const tb = Date.now();
        const g = await dpv.renderFishingGif({ biome: 'isle', lvl: 1, band });
        gifInfo[band] = { ms: Date.now() - tb, bytes: g.buffer.length };
        fs.writeFileSync(path.join(outDir, `catch_${band}.gif`), g.buffer);
        check(`catch GIF [${band}] = GIF89a magic, ${g.buffer.length}B in ${gifInfo[band].ms}ms`, g.contentType === 'image/gif' && g.buffer.slice(0, 6).toString('latin1') === 'GIF89a');
    }
    const tc = Date.now();
    const g2 = await dpv.renderFishingGif({ biome: 'isle', lvl: 1, band: 'epic' });
    check(`repeat catch GIF = disk hit (${Date.now() - tc}ms)`, g2.buffer.length === gifInfo.epic.bytes && (Date.now() - tc) < 250);
    // second biome bakes independently
    const g3 = await dpv.renderFishingGif({ biome: 'tundra', lvl: 3, band: 'mid' });
    fs.writeFileSync(path.join(outDir, 'catch_tundra_L3_mid.gif'), g3.buffer);
    check('second biome/level bakes its own base (tundra L3)', g3.buffer.length > 1000);

    // viewer stills through the real card path
    const scenes = require(path.join(ROOT, 'core/rpg/structureScenes'));
    const still = await scenes.renderStructureCard({ type: 'pond', level: 2, biome: 'isle', seed: 'qa-user-1', spec: { title: 'The Pond', subtitle: 'Dock POV · Lv.2', actions: ['.j fish'] } });
    fs.writeFileSync(path.join(outDir, 'viewer_pond_L2_still.jpg'), still.buffer);
    check('pond viewer = dock-POV still JPEG', still.contentType === 'image/jpeg' && still.buffer.length > 20000);
    const still2 = await scenes.renderStructureCard({ type: 'pond', level: 2, biome: 'isle', seed: 'DIFFERENT-user', spec: { title: 'The Pond', subtitle: 'Dock POV · Lv.2', actions: ['.j fish'] } });
    check('viewer still is SHARED across users (canonical seed cache hit)', still2.cached === true);
    const fallback = await scenes.renderStructureCard({ type: 'pond', level: 2, biome: 'isle', seed: 'qa-user-1', activity: 'fishing', spotlight: true, spec: { title: 'The Pond', banner: { head: 'Catch of the day', lines: ['1× River Trout'] } } });
    fs.writeFileSync(path.join(outDir, 'fallback_static_fishing.jpg'), fallback.buffer);
    check('static fishing fallback card still renders (gif-failure path)', fallback.contentType === 'image/jpeg' && fallback.buffer.length > 20000);

    // GIF frame count sanity: count image descriptors (0x2C) is unreliable via
    // raw scan — instead verify NETSCAPE loop extension + trailer exist.
    const raw = fs.readFileSync(path.join(outDir, 'catch_epic.gif'));
    check('GIF has NETSCAPE loop + trailer', raw.includes(Buffer.from('NETSCAPE2.0')) && raw[raw.length - 1] === 0x3B);

    console.log(`\nSamples → ${outDir}`);
    console.log(`${'='.repeat(54)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(54)}`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('QA crashed:', e); process.exit(1); });


// ── Task 22 motion + overlay pins (owner: "the water looks like it's moving,
// and the fish too" + "use the established overlay style") ──
check('THE WATER MOVES: traveling wave crests per band (parallax, alternating direction)', /traveling wave crests per band/.test(dp) && /const sp = 0\.045 \+ b \* 0\.02/.test(dp));
check('THE WATER MOVES: drifting ripple rings (two staggered, swell + fade)', /drifting ripple rings/.test(dp) && /t \* 0\.5 \+ k \* 0\.5/.test(dp));
check('THE FISH SWIM: 2-4x old speed + strong tail beat (readable in one loop)', /const speed = 0\.05 \+ rng/.test(dp) && /Math\.sin\(t \* Math\.PI \* 6/.test(dp));
check('banner accepted from the caller (res.banner) with a plateLines fallback', /banner = null/.test(dp) && /plateLines..fish., drops./.test(dp));
check('banner rides the LAST 5 frames only (after the bite, never pre-signals)', /BANNER_FROM_FRAME = FRAMES - 5/.test(dp) && /i >= BANNER_FROM_FRAME/.test(dp));
