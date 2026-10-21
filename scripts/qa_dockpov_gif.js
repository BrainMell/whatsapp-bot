'use strict';
// ═══════════════════════════════════════════════════════════════════════════
// qa_dockpov_gif.js — Task 19 (owner 2026-10-21):
//   ".j hunt shouldn't have a timer only a limit per how many times a day"
//   "fishing should be a gif — generate it once and keep it, overlay the new
//    stuff as the generation comes on" + the real dock-POV camera.
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

console.log('\n--- §A hunt: timer GONE, daily limit IN ---');
check('hunt has no cooldownMs (8m timer removed)', !/cooldownMs: 8 \* 60 \* 1000/.test(ba));
check('hunt dailyLimit: 25 present', /dailyLimit: 25/.test(ba));
check('fish keeps its 4m cooldown', /cooldownMs: 4 \* 60 \* 1000/.test(ba));
check('run() reads cooldowns MAP (cd.fish / cd.huntDay / cd.huntCount)', /cd\.fish \|\| 0/.test(ba) && /cd\.huntDay === day/.test(ba) && /cd\.huntCount \|\| 0/.test(ba));
check('limit message names the counter + UTC reset', /hunts used/.test(ba) && /midnight UTC/.test(ba));
check('res carries dailyUsed + dailyDay on success', /out\.dailyUsed/.test(ba) && /out\.dailyDay/.test(ba));
check('utcDay = UTC ISO date stamp', /toISOString\(\)\.slice\(0, 10\)/.test(ba));

console.log('\n--- §B caller: persist counter, GIF path, gifPlayback ---');
check('cmdActivity passes the cooldowns MAP to run()', /act\.run\(kind, ctx\.senderJid, tier, rec\.cooldowns \|\| \{\}\)/.test(bb));
check('hunt persists huntDay+huntCount; fish persists timestamp', /'cooldowns\.huntDay': res\.dailyDay/.test(bb) && /'cooldowns\.huntCount': res\.dailyUsed/.test(bb) && /'cooldowns\.fish': Date\.now\(\)/.test(bb));
check('fish tries the dock-POV GIF first', /require\('\.\/dockPov'\)\.renderFishingGif/.test(bb));
check('band comes from REAL drops (act.bandOf(res.drops))', /act\.bandOf\(res\.drops\)/.test(bb));
check('static zoom card kept as fallback (gif failure ≠ gameplay failure)', /renderZoom\(ctx, rec, st, \{ banner: res\.banner, note/.test(bb));
check('send probes isGifBuffer → gifPlayback', /isGifBuffer\(media\.buffer\)/.test(bb) && /gifPlayback = true/.test(bb));
check('hunt note shows today counter; fish note shows next cast', /Hunts today: \$\{res\.dailyUsed\}/.test(bb) && /Next cast in \$\{act\.fmtMs\(act\.RULES\.fish\.cooldownMs\)\}/.test(bb));

console.log('\n--- §C dock-POV module ---');
check('dockPov exports the compose/still/frame API', /renderFishingGif, getBaseFrames, paintStill, paintFrame/.test(dp));
check('true POV layout: horizon high, water upper frame, dock lower foreground', /HORIZON = 0\.16/.test(dp) && /DOCK_EDGE = 0\.63/.test(dp));
check('GIF params: 480×360, 16 frames, 120ms', /GW = 480, GH = 360, FRAMES = 16, DELAY_MS = 120/.test(dp));
check('ambient fish: 5-7 silhouettes by level (spec §Pond)', /nf = 5 \+ Math\.max\(0, lvl - 1\)/.test(dp));
check('base frames keyed WITHOUT user seed (shared "generate once")', /dp1:\$\{biome\}:L\$/.test(dp) && !/dp1:\$\{.*userId/.test(dp));
check('composed GIF keyed only by biome/level/band (no loot text in key)', /fg1:\$\{biome\}:L\$\{lvl\}:\$\{band\}/.test(dp));
check('rarity signalled only AFTER the roll (overlay contract)', /Drawn AFTER the roll is known/.test(dp));
check('RARE→carp approach, EPIC→big koi + splash', /band === 'mid' \|\| band === 'epic'/.test(dp) && /band === 'epic'/.test(dp));
check('base frames stored via mediaCache (disk L2 = "generate once and keep it")', /mediaCache\.cached\('dockpov'/.test(dp));
check('composed GIF cached under fishgif kind', /mediaCache\.cached\('fishgif'/.test(dp));
check('container roundtrip guards: magic + frame count', /CONTAINER_MAGIC/.test(dp) && /c\.pngs\.length !== FRAMES/.test(dp));
check('gif89a encodeGif used (no new deps, no ffmpeg)', /require\('\.\.\/utils\/gif89a'\)/.test(dp) && /encodeGif\(\{ width: base\.gw/.test(dp));

console.log('\n--- §D pond viewer + cache versioning ---');
check('pond viewer renders dock-POV still (canonical seed, no activity)', /isPondView = type === 'pond' && !activity/.test(sc) && /dockPov'\)\.paintStill/.test(sc));
check('pond viewer key distinct (pond_pov) so activity cards unaffected', /isPondView \? 'pond_pov' : type/.test(sc));
check('mediaCache CODE_VER includes dockPov.js', /'baseBuilder\.js', 'dockPov\.js'/.test(mc));
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
        // fish cooldown still timed
        const rf = await act.run('fish', T, 1, { fish: Date.now() });
        check('fish 4m rest intact (wait message)', rf.ok === false && /try again in/.test(rf.text));
        const rf2 = await act.run('fish', T, 1, {});
        check('fish with no stamp runs, drops enriched w/ rarity + value', rf2.ok === true && /UNCOMMON|COMMON|RARE|EPIC/.test(rf2.text) && /sells .?[\d,]+Z/.test(rf2.text));
        check('bandOf: koi→epic, carp→mid, else low', act.bandOf({ crystal_koi: 1 }) === 'epic' && act.bandOf({ silver_carp: 2 }) === 'mid' && act.bandOf({ raw_fish: 3 }) === 'low' && act.bandOf({}) === 'low');
    } finally { inv.addItem = origAdd; econ.addMoney = origMoney; }

    console.log('\n--- §F REAL renders: base frames, catch GIFs, viewer still ---');
    const outDir = path.join(__dirname, 'render_out', 'dockpov_qa');
    fs.mkdirSync(outDir, { recursive: true });
    const dpv = require(path.join(ROOT, 'core/rpg/dockPov'));
    const { createCanvas, Image } = require(path.join(ROOT, 'node_modules', 'canvas'));

    // anchor mirrors the painted bobber (red half sampled at t=0)
    const probe = createCanvas(dpv.GW, dpv.GH), pctx = probe.getContext('2d');
    dpv.paintFrame(pctx, dpv.GW, dpv.GH, 0, { biome: 'isle', lvl: 1 });
    const a = dpv.anchorFor(dpv.GW, dpv.GH);
    const pd = pctx.getImageData(Math.round(a.bx), Math.round(a.by) - 2, 1, 1).data;
    check('anchorFor matches painted bobber (red cap sampled)', pd[0] > 140 && pd[1] < 120);

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
