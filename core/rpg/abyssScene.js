// ============================================
// 🕳️ ABYSS SCENE RENDERER — visual overhaul (owner brief abyss_overhaul_agent_brief.md, 2026-10-09)
//
// The Abyss gets its own visual identity, moving off the Go service's arena
// render onto pure node-canvas scenes built with the SAME proven toolkit as
// The Ruins (roomScene.js): content-measured sprites, depth-aware contact
// shadows, perspective-calibrated heights, the default-encounter HUD panel.
//
//   §2  Player sprites are PRESERVED 1:1 (resolvePlayerSpriteFile → the same
//       CLASS_SPRITE_SETS files) and grounded Ruins-style (contact shadow +
//       mass-bottom anchor + depth scale) so they sit IN the scene.
//   §3  Floor descent card: descending ring stack (world-map language),
//       current floor highlighted bold, player standing on the current ring.
//   §4  Background pool: core/rpgasset/environment/abyss/*.jpg (10+ scenes,
//       one per biome band), deterministic per floor, frozen per fight.
//   §5  Monster pool: existing forward-facing sheets (spriteIndex) + new
//       abyss-native sprites in enemies/abyss/ (by NAME — the enemies/ dir
//       C-locale index must never shift, it backs ABYSS_SPRITE_MAP + Go).
//   §6  Combat/defence cards: START + every TURN re-render the SAME frozen
//       composition with live HP/energy — pixel-stable like battleScene.
//   §7  Summon encounters: player LEFT, wild summon RIGHT, both grounded.
//
// Failure contract: every renderer returns null on any failure → callers
// keep their existing text fallbacks. Sync toBuffer encode (canvasAutoGate
// observes the sync form; createCanvas is memory-gated).
// ============================================

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const roomScene = require('./guildWar/roomScene');
const { drawGroundedSprite, drawContactShadow, contentBox, perspH,
        resolvePlayerSpriteFile, ensureFonts } = roomScene;

const RPGASSET = path.join(__dirname, '..', 'rpgasset');   // core/rpg/ → core/rpgasset/
const ENEMY_DIR = path.join(RPGASSET, 'enemies');
const ENEMY_ABYSS_DIR = path.join(ENEMY_DIR, 'abyss');          // new sprites, by NAME
const ENV_ABYSS_DIR = path.join(RPGASSET, 'environment', 'abyss'); // boss-room hall pool
const ENV_ABYSS_REG_DIR = path.join(ENV_ABYSS_DIR, 'regular');     // regular-encounter side-stage pool
// 🕳️ round-13 (owner 02:56Z image brief): the NEW abyss bestiary — 20
// image-3-family sprites (violet/crimson pixel demons). Lives in its own
// subdir so resolveEnemyArt's by-name check at the enemies/abyss/ ROOT can
// never see it (the mob and boss pools share 10 ids — a root-level
// `<id>.png` would leak into the FROZEN boss composition).
const ENEMY_BESTIARY_DIR = path.join(ENEMY_ABYSS_DIR, 'regular_bestiary');
const UI_DIR = path.join(RPGASSET, 'ui');

const W = 1200, H = 900;      // encounter scene canvas (matches roomScene — HUD transplant)
const FW = 900, FH = 1500;    // floor descent card (600×1000 card ratio × 1.5)

// ── C-locale dir listing (MUST mirror enemyVariants.js slot rule) ─────────
const cSort = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
let _enemyList = null;
function enemySheetList() {
    if (_enemyList) return _enemyList;
    try {
        _enemyList = fs.readdirSync(ENEMY_DIR)
            .filter((f) => f.toLowerCase().endsWith('.png'))
            .sort(cSort);
    } catch (e) { _enemyList = []; }
    return _enemyList;
}

// ── background pools (§4) ──────────────────────────────────────────────
// TWO pools since owner 2026-10-09 10:19Z ("keep the current backgrounds and
// enemies exclusively for Abyss boss rooms ... create new backgrounds
// inspired by the ones I've circled, but make them more Abyss-themed"):
//   boss pool    environment/abyss/*.png         — the 15 halls, BOSS ROOMS ONLY
//   regular pool environment/abyss/regular/*.png — abyss-themed side stages
//               edited from the owner's four CIRCLED foundations (dark_hall /
//               drowned_vault / mist_hollow / violet_sanctum) through the
//               owner-authorized style-prompt iteration loop. 🕳️ 2026-10-10
//               owner (01:56Z): mist_hollow OUT of the pool ("REMOVE IT FROM
//               THE FUCKING POOL") — file deleted, refs gone, pool = 3.
let _bgList = null, _bgListReg = null;
function bgList() {
    if (_bgList) return _bgList;
    try {
        _bgList = fs.existsSync(ENV_ABYSS_DIR)
            ? fs.readdirSync(ENV_ABYSS_DIR)
                .filter((f) => /\.(jpg|jpeg|png)$/i.test(f) && !f.startsWith('.'))
                .sort(cSort)
            : [];
    } catch (e) { _bgList = []; }
    return _bgList;
}
function bgListRegular() {
    if (_bgListReg) return _bgListReg;
    try {
        _bgListReg = fs.existsSync(ENV_ABYSS_REG_DIR)
            ? fs.readdirSync(ENV_ABYSS_REG_DIR)
                .filter((f) => /\.(jpg|jpeg|png)$/i.test(f) && !f.startsWith('.'))
                .sort(cSort)
            : [];
    } catch (e) { _bgListReg = []; }
    return _bgListReg;
}
// deterministic per floor — the same floor always renders the same stage
// (recon value: the Abyss is a PLACE). style: 'boss' → hall pool;
// 'regular' → side-stage pool (falls back to the hall pool until the
// regular assets land, so a floor never renders bare).
function bgFileForFloor(floor, style = 'boss') {
    const f = Number(floor) || 1;
    const reg = bgListRegular();
    if (style === 'regular' && reg.length) return reg[f % reg.length];
    const list = bgList();
    if (!list.length) return null;
    return list[f % list.length];
}
function bgDirFor(style) {
    return (style === 'regular' && bgListRegular().length) ? ENV_ABYSS_REG_DIR : ENV_ABYSS_DIR;
}
// (kept as an API for the QA suite — every hall is stage-safe)
const COMBAT_BG_EXCLUDE = /$^/;
function combatBgList() {
    return bgList().filter((f) => !COMBAT_BG_EXCLUDE.test(f));
}
let _bgCache = new Map(); // dir|file → Image|null
async function loadBg(file, dir = ENV_ABYSS_DIR) {
    const key = `${dir}|${file}`;
    if (_bgCache.has(key)) return _bgCache.get(key);
    const img = await loadImage(path.join(dir, file)).catch(() => null);
    if (_bgCache.size > 48) _bgCache.clear();
    _bgCache.set(key, img);
    return img;
}

// ── enemy art resolution (§5) ─────────────────────────────────────────────
// Priority: 1) hand-built abyss-native sprites in enemies/abyss/ (BY NAME —
// enemies/ C-locale index never shifts), 2) the documented C-locale sheet
// index (element-matched single sprites from the curated pool — REAL pixel
// art: knight/fire/ice/mutant/hybrid lines), 3) null → caller falls back.
// enemyId recovery: generateFloorEnemy names enemies from their pool id
// ("RABID RAT", "⚡ INFECTED COLOSSUS") — normalize back to map keys.
// 🕳️ 2026-10-09 (owner: "these new enemies look trash — find assets online"):
// the 8 AI-painted sprites are GONE; every pool id renders the curated
// pixel-art singles the Ruins uses (ABYSS_SPRITE_MAP element matching).
// 🕳️ 2026-10-09 08:43Z (owner: "let's get rid of the slime in the abyss, only
// those weird front facing creatures in my assets collection — they look
// like amalgamation"): the by-name rat/slime files are GONE too (the rat is
// a plain animal and the slime read low-quality + huge — neither is in the
// amalgamation family). The spawn pools now only contain ids whose sprites
// are the front-facing amalgamation singles. Overrides map is EMPTY but kept
// as a hook (enemy art resolution order unchanged).
// NOTE: enemies/abyss/ files never shift the enemies/ C-locale index that
// backs ABYSS_SPRITE_MAP + the Go service.
const ABYSS_ART_OVERRIDES = {};

// ── 🕳️ round-13 REGULAR-ONLY art map (owner 02:56Z: "the enemies in the 3rd
// image? Make or find about 20 of those ... this is for regular encounters").
// Read ONLY by the side path (planCombatLayout style 'side'); the boss path
// keeps calling resolveEnemyArt, so boss rooms render the approved
// amalgamation art even for the 10 shared ids. Files live in
// enemies/abyss/regular_bestiary/ and are audited sprites (transparent,
// abyss-graded, per-sprite facing recorded in ENEMY_FACING).
const ABYSS_REGULAR_ART = {
    MUTATED_HOUND: 'mutated_hound.png',
    SHADOW_STALKER: 'shadow_stalker.png',
    VENOM_SPIDER: 'venom_spider.png',
    VOID_CORRUPTED: 'void_corrupted.png',
    BLOOD_REAVER: 'blood_reaver.png',
    VOID_HARBINGER: 'void_harbinger.png',
    MUTATED_OVERSEER: 'mutated_overseer.png',
    INFECTED_COLOSSUS: 'infected_colossus.png',
    CORRUPTED_GUARDIAN: 'corrupted_guardian.png',
    ELDER_CHAOS: 'elder_chaos.png',
    PRIMORDIAL_CHAOS: 'primordial_chaos.png',
    ELEMENTAL_ARCHON: 'elemental_archon.png',
    VOID_TITAN: 'void_titan.png',
    ABYSSAL_GOD: 'abyssal_god.png',
    // round-13 new ids (image-3 homages: Gloom Brute / Crawler / Void Wraith)
    GLOOM_BRUTE: 'gloom_brute.png',
    DUSK_CRAWLER: 'dusk_crawler.png',
    NIGHT_WRAITH: 'night_wraith.png',
    CRIMSON_DEVOURER: 'crimson_devourer.png',
    HOLLOW_SERAPH: 'hollow_seraph.png',
    ABYSS_WEAVER: 'abyss_weaver.png',
};
function resolveEnemyArtRegular(enemy) {
    const id = enemyIdOf(enemy);
    if (id && ABYSS_REGULAR_ART[id]) {
        const f = ABYSS_REGULAR_ART[id];
        if (fs.existsSync(path.join(ENEMY_BESTIARY_DIR, f))) {
            return { dir: ENEMY_BESTIARY_DIR, file: f };
        }
    }
    return resolveEnemyArt(enemy);   // fallback chain unchanged (variants etc.)
}
function enemyIdOf(enemy) {
    const raw = String((enemy && (enemy.bossId || enemy.id)) || '');
    if (raw && !raw.startsWith('abyss_')) return raw.toUpperCase().replace(/\s+/g, '_');
    const name = String((enemy && enemy.name) || '')
        .replace(/[^\w\s'-]/g, '').trim().replace(/\s+/g, '_').toUpperCase();
    return name || null;
}
function resolveEnemyArt(enemy) {
    const id = enemyIdOf(enemy);
    // 1) new abyss-native sprite (override map → real file on disk wins)
    if (id && ABYSS_ART_OVERRIDES[id]) {
        if (fs.existsSync(path.join(ENEMY_ABYSS_DIR, ABYSS_ART_OVERRIDES[id]))) {
            return { dir: ENEMY_ABYSS_DIR, file: ABYSS_ART_OVERRIDES[id] };
        }
    }
    // 1b) any abyss-native file named exactly after the id
    if (id) {
        const p = path.join(ENEMY_ABYSS_DIR, `${id.toLowerCase()}.png`);
        if (fs.existsSync(p)) return { dir: ENEMY_ABYSS_DIR, file: `${id.toLowerCase()}.png` };
    }
    // 2) documented sheet index (same file the Go service resolves)
    const idx = Number(enemy && enemy.spriteIndex);
    const list = enemySheetList();
    if (Number.isFinite(idx) && idx >= 0 && idx < list.length) {
        return { dir: ENEMY_DIR, file: list[idx] };
    }
    return null;
}

// ── wild-summon art (§7) — the game's OWN sprites (owner 2026-10-09: "NO
// DIGIMON — WE LITERALLY HAVE OUR OWN SUMMON SPRITES") ─────────────────────
// Every registry species ships a dedicated sparklinlabs PNG (26/26, committed
// as real bytes). summonSprites.getSpritePath checks that folder FIRST (then
// retromon/SD/digimon-cache for legacy ids), so a pure local lookup is enough
// — no digi-api fetch anywhere on the render path. An unmatched id returns
// null and the caller keeps the text layer (same failure contract as before).
//
// AUDIT §6 (owner 2026-10-09: "flat-color, thick-black-outline" summons read
// as a different game): the sparklinlabs_abyss/ set is the SAME art run
// through the authorized post-process (pixel-grid normalize → outline
// recolor to abyssal violet → violet unify → 30-color palette quantize →
// trim), checked FIRST; the raw set stays as fallback.
const SUMMON_ABYSS_DIR = path.join(RPGASSET, 'summons', 'sparklinlabs_abyss');
const _summonAbyssSet = new Set((() => {
    try { return fs.readdirSync(SUMMON_ABYSS_DIR).filter((f) => f.toLowerCase().endsWith('.png')); } catch (e) { return []; }
})());
async function resolveSummonArt(species) {
    try {
        const summonSprites = require('./summonSprites');
        const p = summonSprites.getSpritePath(species);
        if (p && fs.existsSync(p)) {
            // processed twin first (same basename in sparklinlabs_abyss/)
            const base = path.basename(p);
            const twin = _summonAbyssSet.has(base)
                ? path.join(SUMMON_ABYSS_DIR, base) : null;
            const img = await loadImage(twin || p).catch(() => null);
            if (img) return { img, file: path.basename(p), processed: !!twin };
        }
    } catch (e) { /* fall through */ }
    return null;
}

// ── text helpers (canvas fonts have limited glyph coverage — keep ASCII) ──
function safeName(s, max = 20) {
    const t = String(s || '').replace(/[^\x20-\x7E]/g, '').trim();
    return (t.length > max ? t.slice(0, max - 1) + '..' : t) || '???';
}
function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}
function pillLocal(ctx, cx, cy, text, font, padX, bg, border, textColor) {
    // dedupe (code judge): the roomScene HUD kit is exported — use it
    return roomScene.pill(ctx, cx, cy, text, font, padX, bg, border, textColor);
}

// ── abyss floor banner (§5b, owner 2026-10-09 08:43Z: "the battle encounter
// sprite, the floor number? Yh use a banner, not the same banner as the
// regular dungeon, but something close") — banner_abyss.png IS the regular
// dungeon's ribbon (ui/banner.png) regraded into the abyss palette
// (obsidian-violet body, cold-gold folds, same silhouette). Drawn top-left
// with the floor number on the flat body — the regular dungeon's Go arena
// draws ui/banner.png for the same slot.
let _bannerAbyss = null;
async function drawFloorBanner(ctx, cx, cy, text) {
    try {
        if (!_bannerAbyss) {
            _bannerAbyss = await loadImage(path.join(UI_DIR, 'banner_abyss.png')).catch(() => null);
        }
        const BW = 236, BH = Math.round(BW * 118 / 573);   // 236x49, ribbon aspect
        const bx = cx, by = cy;                            // top-left anchor
        if (_bannerAbyss) {
            ctx.drawImage(_bannerAbyss, bx, by, BW, BH);
        } else {
            // asset missing → ribbon-shaped fallback plate (same footprint)
            ctx.fillStyle = 'rgba(30,23,46,0.95)';
            roundRectPath(ctx, bx, by + 4, BW, BH - 8, 6); ctx.fill();
            ctx.strokeStyle = 'rgba(196,158,74,0.8)'; ctx.lineWidth = 2;
            roundRectPath(ctx, bx, by + 4, BW, BH - 8, 6); ctx.stroke();
        }
        // the flat body spans ~x+36..x+BW-36 (fold ends excluded) — center the
        // number there so it never sits on a fold. Numeral legibility (owner
        // audit: "FLOOR 2" vs "FLOOR II"): Cinzel's serifed 1/11 read as
        // Roman numerals at banner size — digits render in bold sans, the
        // word keeps the Cinzel flavor.
        const tx = bx + BW / 2, ty = by + BH / 2 + 1;
        ctx.textBaseline = 'middle';
        const mF = /^(\s*FLOOR\s*)(.+)$/.exec(String(text));
        const parts = mF
            ? [{ t: mF[1], f: 'bold 17px "Cinzel", serif' }, { t: mF[2], f: 'bold 19px sans-serif' }]
            : [{ t: String(text), f: 'bold 19px "Cinzel", serif' }];
        const widths = parts.map((p) => { ctx.font = p.f; return ctx.measureText(p.t).width; });
        let px0 = tx - widths.reduce((a, b) => a + b, 0) / 2;
        ctx.textAlign = 'left';
        for (let i = 0; i < parts.length; i++) {
            ctx.font = parts[i].f;
            ctx.fillStyle = 'rgba(10,7,18,0.85)';
            ctx.fillText(parts[i].t, px0 + 1, ty + 2);
            ctx.fillStyle = '#e8d8a8';
            ctx.fillText(parts[i].t, px0, ty);
            px0 += widths[i];
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
    } catch (e) { /* banner is cosmetic — never block the card */ }
}
function segBarLocal(ctx, cx, cy, w, h, pct, fillFrom, fillTo) {
    return roomScene.segBar(ctx, cx, cy, w, h, pct, fillFrom, fillTo);
}

// ── scene backdrop: pool image cover-drawn + abyssal grade + vignette ────
// (canvas-relative dims — the same painter serves 1200x900 scenes AND the
// 900x1500 floor card)
async function drawBackdrop(ctx, file, dir = ENV_ABYSS_DIR) {
    const CW = ctx.canvas.width, CH = ctx.canvas.height;
    // base wash (also the fallback when no pool art exists)
    const g0 = ctx.createLinearGradient(0, 0, 0, CH);
    g0.addColorStop(0, '#0b0912');
    g0.addColorStop(0.55, '#161020');
    g0.addColorStop(1, '#0d0a14');
    ctx.fillStyle = g0; ctx.fillRect(0, 0, CW, CH);
    const img = file ? await loadBg(file, dir) : null;
    if (img) {
        // cover-fit crop (backgrounds are ~scene ratio; never squash) — and
        // NEAREST sampling: the pool is real pixel art now, keep it crisp
        ctx.imageSmoothingEnabled = false;
        const s = Math.max(CW / img.width, CH / img.height);
        const dw = img.width * s, dh = img.height * s;
        ctx.drawImage(img, (CW - dw) / 2, (CH - dh) / 2, dw, dh);
        ctx.imageSmoothingEnabled = true;
    }
    // abyssal grade: cool the top, sink the bottom into darkness — the
    // "descending forever" read + a calmer stage floor for the HUD panel
    const g1 = ctx.createLinearGradient(0, 0, 0, CH);
    g1.addColorStop(0, 'rgba(10,8,24,0.55)');
    g1.addColorStop(0.42, 'rgba(10,8,24,0.10)');
    g1.addColorStop(1, 'rgba(4,3,10,0.72)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, CW, CH);
    // vignette
    const vg = ctx.createRadialGradient(CW / 2, CH * 0.46, CH * 0.30, CW / 2, CH * 0.5, CH * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH);
}

// ── FROZEN LAYOUTS (§6 — pixel-stable TURN renders, battleScene pattern) ──
const _layoutCache = new Map(); // sessionKey → plan
const _LAYOUT_MAX = 240;
function layoutFor(sessionKey) {
    let l = _layoutCache.get(sessionKey);
    if (!l) {
        l = { plan: null };
        _layoutCache.set(sessionKey, l);
        if (_layoutCache.size > _LAYOUT_MAX) {
            const oldest = _layoutCache.keys().next().value;
            if (oldest !== undefined) _layoutCache.delete(oldest);
        }
    }
    return l;
}
function clearLayout(sessionKey) {
    if (sessionKey) _layoutCache.delete(sessionKey);
}

// depth anchors (scene geometry) — owner 2026-10-09 10:19Z round:
// the OLD ENEMY_GY 566 sat ABOVE the halls' visible floor band (~600-760),
// which is exactly why "a lot of the enemies appear to be floating". Every
// actor now grounds on the floor plane the stages actually paint.
const PLAYER_GY = 806;       // front of stage (unchanged — approved framing)
const BOSS_GY = 655;         // boss tower feet — ON the floor plane, still depth-staggered vs the player
// Pokémon-style SIDE layout (regular encounters, owner-circled spots:
// circle A ≈ 235,510 → enemy cluster middle-left; circle B ≈ 900,780 →
// player bottom-right). Enemies face RIGHT, player + summons face LEFT.
const SIDE_ENEMY_X = 290;
const SIDE_ENEMY_GY = 645;
const SIDE_SUMMON_X = 300;
const SIDE_SUMMON_GY = 648;
const SIDE_PLAYER_X = 890;
// owner 2026-10-09 14:07Z: "the damage indicator should be red honestly" —
// the hit state is now a RED damage flash: blood-red source-atop fill + an
// ember halo (see drawActorGrounded) so it reads unmistakably on every body
// color, including the purple amalgamation family.
const HIT_TINT = 'rgba(122,16,12,0.58)';
const HIT_GLOW = 'rgba(255,64,32,0.88)';

// ── native facing of the pool art (RE-VERIFIED on processed contact sheet,
// 2026-10-10 audit) — which way the pixels actually look — used to honor the
// owner's facing rule ("the player sprite should face left, while the enemy
// sprite faces right; the same applies to summons") WITHOUT mirroring
// front-facing sprites for nothing. Only art with a real directional bias
// gets flipped. ⚠️ Round-4 bug this table fixes: DRAGON was eyeballed as
// left-facing, so the wild-summon flip turned it AWAY from the player
// (owner audit defect C). The processed sheet shows it faces RIGHT.
// 🕳️ 2026-10-10 round-12 FIX (owner, 01:56Z: "some enemies face the wrong
// direction"): ELDER_CHAOS (calamaties (1)) is a LEFT-leaning profile — the
// red crest sweeps left and the eye cluster sits left-of-center, so it was
// rendering AWAY from the player (proof: owner's F19 screenshot). Head-crop
// audit at 6x of all 14 live-pool ids: everything else is front-facing or
// right-biased (MUTATED_HOUND mirror-diff 0.686 → symmetric front face).
const ENEMY_FACES_LEFT = new Set(['SHADOW_STALKER', 'ELDER_CHAOS']);  // hybrides (1) wolf leans left · calamaties (1) crest/eyes lean left

// ── per-enemy facing registry (owner round-13, 02:56Z: "it's clear not all
// of them will be facing the same direction so don't make a universal rule,
// or do that but leave head room to tweak individuals") — THIS is the
// headroom: one row per bestiary sprite, audited at 6× head-crop zoom after
// generation. 'L' = art natively faces LEFT · 'R' = faces RIGHT ·
// 'F' = front-facing (never flipped). The flip decision reads THIS table
// first; ENEMY_FACES_LEFT above stays as the legacy-art fallback.
// Flip rule on the mirrored stage (enemy wing RIGHT, facing LEFT):
//   flip = nativeFacing === 'R'. Tweak one row → one sprite turns.
// ⚠️ round-15 RE-AUDIT (owner 09:15Z: "some of your generated enemies are
// facing the wrong direction"): every head was re-cropped at 6× with a
// center BISECTOR drawn on the zoom sheet — a head right-of-the-bisector is
// natively RIGHT. Four rows were misfiled 'F' and never flipped, so they
// rendered staring AWAY from the hero (archon's crested helm, brute's single
// eye, overseer's eye pair, all right-of-center). Corrected:
const ENEMY_FACING = {
    // audited 'L' (side-profile heads — verified on the bisector zoom sheet):
    MUTATED_HOUND: 'L', SHADOW_STALKER: 'L', ABYSSAL_GOD: 'L', DUSK_CRAWLER: 'L',
    CRIMSON_DEVOURER: 'L', ABYSS_WEAVER: 'L',
    // round-15: regenerated in the grim dusk family, art delivered LEFT-facing
    VOID_HARBINGER: 'L', CORRUPTED_GUARDIAN: 'L',
    // round-15 bisector audit: natively RIGHT-facing → MUST flip to face hero
    ELEMENTAL_ARCHON: 'R', GLOOM_BRUTE: 'R', MUTATED_OVERSEER: 'R',
    // accuracy rows (unflipped art anyway — flip only fires on 'R'):
    BLOOD_REAVER: 'L', INFECTED_COLOSSUS: 'L', VOID_TITAN: 'L',
    // audited 'F' (front-facing — never flipped):
    VENOM_SPIDER: 'F', VOID_CORRUPTED: 'F', ELDER_CHAOS: 'F',
    PRIMORDIAL_CHAOS: 'F', NIGHT_WRAITH: 'F', HOLLOW_SERAPH: 'F',
};
function enemyNativeFacing(id) {
    const key = String(id || '').toUpperCase();
    if (ENEMY_FACING[key]) return ENEMY_FACING[key];
    if (ENEMY_FACES_LEFT.has(key)) return 'L';
    return 'F';   // legacy default: front-facing amalgamations never flip
}
// 2026-10-10 round-8 FIX (owner: "some summos facing the wrong direction"):
// every species below was re-verified on a 2× labeled zoom sheet with a
// center bisector — boar's tusks point RIGHT, giant's mace and yeti's club
// lead LEFT. ⚠️ SECOND-PASS CORRECTION (hyper critic + 3× scene crops):
// SNAKE is natively RIGHT-facing — the zoom-sheet eyeball had it backwards,
// mirroring ally snakes away from the enemies and flipping wild snakes away
// from the player. ⚠️ THIRD-PASS CORRECTION (6× bisector zoom): REPTILE is
// natively RIGHT-facing too — the raised axe is the cocked back-swing arm,
// the snout/jaw/horn all extend RIGHT of the eye. SKITTERSWARM demoted to
// neutral: at 6× the swarm's heads point in mixed directions (no real
// single-direction bias → never flip, per the rule below).
// ⚠️ round-15 (owner 09:15Z proof: the ally Drake stared at the player's
// back in r14_A3): the dragon art is NATIVELY LEFT-facing — render-verified
// on the round-14 proof sheet. Moved to FACES_LEFT so allies mirror it to
// face RIGHT toward the enemy wing and wild dragons on the right wing keep
// facing LEFT toward the hero with NO flip.
const SUMMON_FACES_LEFT = new Set(['BAT', 'GIANT', 'YETI', 'DRAGON']);
const SUMMON_FACES_RIGHT = new Set(['PLAGUEFANG', 'DINO', 'BOAR', 'SNAKE', 'REPTILE']);
const summonFaceKey = (file) => String(file || '').replace(/\.png$/i, '').toUpperCase();
// best-effort species key for a wild summon BEFORE its art resolves
function planWildSpeciesKey(state, enemy) {
    const sp = state && state.abyssRun && state.abyssRun.currentEncounterData
        && state.abyssRun.currentEncounterData.species;
    return summonFaceKey(String(sp || (enemy && enemy.name) || ''));
}

// ── audit §1 BACKGROUND METADATA (owner brief battle-scene-visual-audit) ──
// The side stages are all 1920×1440 (4:3 = scene ratio), so the cover-fit is
// an identity fraction map — but the transform is still computed properly so
// slots stay ON the painted floor even if a future bg changes ratio.
//   floorTop/floorBottom — the visible floor plane in image fractions (feet
//   may only land inside it); vp — one-point perspective vanishing point.
//   tags  — scene family (selection vocabulary).
//   suit  — creature habitats this stage reads right for (owner defect A:
//   "some backgrounds do not suit the creatures placed on them" — a flat
//   cartoon dragon on a dark plaza).
// 🕳️ round-14 REMEASURE (owner 08:09Z: "the backgrounds some are so off the
// monsters are floating"): every band below was re-measured on the actual
// 1200×900 cover-fit render of each stage (grid-overlay pass) — the old
// values were eyeballed too generous (dark_hall family 0.50 with the real
// wall base at 0.53; amphitheater 0.50 with the tier WALL running to 0.62,
// which put back-row bodies ON the wall). floorClamp() below now hard-clamps
// every slot's feet into the stage's readable floor band.
const BG_META = {
    'dark_hall_abyss.png':      { floorTop: 0.53, floorBottom: 0.95, vp: [0.50, 0.47], tags: ['plaza', 'wide'],    suit: ['beast', 'brute', 'undead'] },
    'drowned_vault_abyss.png':  { floorTop: 0.53, floorBottom: 0.95, vp: [0.50, 0.48], tags: ['plaza', 'pit'],    suit: ['aquatic', 'undead', 'brute'] },
    // (mist_hollow_abyss removed from the pool by owner ruling 2026-10-10 —
    //  file deleted; entry kept out so a stray copy can never be staged)
    'violet_sanctum_abyss.png': { floorTop: 0.53, floorBottom: 0.95, vp: [0.50, 0.47], tags: ['plaza', 'sanctum'], suit: ['ethereal', 'arcane', 'flying', 'brute', 'undead'] },
    // 🕳️ round-13 (owner 02:56Z image-2 brief: dusk-wasteland inspiration,
    // "different and unique maps", keep the existing three): five NEW
    // crimson-dusk stages generated from the owner's reference, floor bands
    // measured on the 1920x1440 renders (zoom pass 2026-10-10)
    // (crimson_dunes_abyss / sunken_amphitheater_abyss removed from the pool
    //  AND this table by owner ruling round-15 2026-10-10 — "the arena and
    //  sand dune looking ones literally don't fit"; files deleted, entries
    //  kept out so a stray copy can never be staged)
    'ruined_causeway_abyss.png':    { floorTop: 0.52, floorBottom: 0.95, vp: [0.50, 0.38], tags: ['causeway', 'gate'],  suit: ['brute', 'undead', 'arcane', 'beast'] },
    'bone_fields_abyss.png':        { floorTop: 0.47, floorBottom: 0.95, vp: [0.44, 0.38], tags: ['basin', 'bones'],    suit: ['undead', 'beast', 'ethereal'] },
    'obsidian_ridge_abyss.png':     { floorTop: 0.40, floorBottom: 0.95, vp: [0.50, 0.28], tags: ['volcanic', 'ridge'], suit: ['brute', 'beast', 'arcane'] },
    // 🕳️ round-15 (owner 09:15Z: "2 of the backgrounds — the arena and sand
    // dune looking ones — literally don't fit"): amphitheater + dunes DELETED
    // from the pool and disk; replaced by two unique maps generated from the
    // APPROVED dusk family (bone_fields / obsidian_ridge anchors), floor
    // bands grid-measured on the 1200x900 cover-fits. Flat walkable floors
    // only — no tiered seating, no dune slopes.
    'ashen_basilica_abyss.png':     { floorTop: 0.66, floorBottom: 0.95, vp: [0.50, 0.44], tags: ['basilica', 'nave'],     suit: ['undead', 'ethereal', 'arcane', 'brute', 'flying'] },
    'withered_grove_abyss.png':     { floorTop: 0.47, floorBottom: 0.95, vp: [0.50, 0.30], tags: ['grove', 'wasteland'],   suit: ['beast', 'undead', 'ethereal', 'flying'] },
};
// creature → habitat (drives stage compatibility; audit §5 "choose
// backgrounds by tag compatibility with the enemy/summon set")
const ENEMY_HABITAT = {
    CAVE_BAT: 'flying', EMBER_SPAWN: 'brute', FROST_WISP: 'ethereal', STONE_HULK: 'brute',
    MUTATED_HOUND: 'beast', CRYSTAL_GOLEM: 'arcane', SHADOW_STALKER: 'beast', VENOM_SPIDER: 'beast',
    INFERNO_KNIGHT: 'brute', TIDAL_FURY: 'aquatic', BOULDER_TITAN: 'brute', GLACIAL_WRAITH: 'ethereal',
    STORM_CALLER: 'ethereal', VOID_HARBINGER: 'ethereal', BLOOD_REAVER: 'undead', ANCIENT_GUARDIAN: 'arcane',
    ELDER_CHAOS: 'ethereal', PRIMORDIAL_CHAOS: 'ethereal', VOID_CORRUPTED: 'undead',
    RABID_RAT: 'beast', SLIME: 'aquatic',
    // round-13 bestiary ids
    GLOOM_BRUTE: 'brute', DUSK_CRAWLER: 'beast', NIGHT_WRAITH: 'flying',
    CRIMSON_DEVOURER: 'beast', HOLLOW_SERAPH: 'ethereal', ABYSS_WEAVER: 'beast',
};
const SUMMON_HABITAT = {
    BAT: 'flying', DINO: 'beast', DRAGON: 'flying', GHOST: 'ethereal', SNAKE: 'beast',
    OCTOPUS: 'aquatic', TIDALMAW: 'aquatic', SHIP_CRUISER: 'aquatic', SHIP_FIGHTER: 'arcane',
    SHIP_SQUID: 'aquatic', BOAR: 'beast', PLAGUEFANG: 'beast', YETI: 'beast', MUSHROOM: 'beast',
    FROSTPEEP: 'ethereal', EMBERWICK: 'brute', FIREGUARD: 'brute', GIANT: 'brute', STARNAIL: 'ethereal',
    SKITTERSWARM: 'beast', BOGLURK: 'beast', SLIME: 'aquatic', MIMIC: 'arcane', CHEST: 'arcane',
    LUMENMOTH: 'ethereal', REPTILE: 'beast',
};
// relative body mass (audit §2 "target_height_px at scale 1.0"): multiplies
// the slot's depth-calibrated height so the eyeball creature stops reading
// at the same mass as the hound. Default 1.0 for unmapped ids.
const ENEMY_SIZE = {
    CAVE_BAT: 0.78, EMBER_SPAWN: 0.85, FROST_WISP: 0.86, STONE_HULK: 1.08,
    MUTATED_HOUND: 0.88, CRYSTAL_GOLEM: 1.10, SHADOW_STALKER: 0.84, VENOM_SPIDER: 0.72,
    INFERNO_KNIGHT: 1.06, TIDAL_FURY: 0.95, BOULDER_TITAN: 1.12, GLACIAL_WRAITH: 0.92,
    STORM_CALLER: 0.95, VOID_HARBINGER: 0.98, BLOOD_REAVER: 1.00, ANCIENT_GUARDIAN: 1.10,
    ELDER_CHAOS: 1.15, PRIMORDIAL_CHAOS: 1.15, VOID_CORRUPTED: 1.05,
    // round-13 bestiary ids — wide quadrupeds carry lower mass muls so their
    // content width stays inside the right-wing corridor (hound w/h ~1.4)
    GLOOM_BRUTE: 1.10, DUSK_CRAWLER: 0.85, NIGHT_WRAITH: 0.80,
    CRIMSON_DEVOURER: 0.90, HOLLOW_SERAPH: 0.95, ABYSS_WEAVER: 0.88,
};
const SUMMON_SIZE = {
    DRAGON: 1.18, GIANT: 1.10, FIREGUARD: 1.05, YETI: 1.05, TIDALMAW: 1.00, OCTOPUS: 1.00,
    LUMENMOTH: 1.00, BOAR: 1.00, PLAGUEFANG: 0.98, SHIP_CRUISER: 0.95, SHIP_FIGHTER: 0.95,
    SHIP_SQUID: 0.95, BOGLURK: 0.95, SKITTERSWARM: 0.90, STARNAIL: 0.85, REPTILE: 0.85,
    EMBERWICK: 0.82, MIMIC: 0.80, CHEST: 0.80, GHOST: 0.72, FROSTPEEP: 0.75, MUSHROOM: 0.70,
    BAT: 0.68, DINO: 0.60, SNAKE: 0.60, SLIME: 0.60,
};
const enemyHabitatOf = (id) => ENEMY_HABITAT[String(id || '').toUpperCase()] || 'beast';
const summonHabitatOf = (key) => SUMMON_HABITAT[String(key || '').toUpperCase()] || 'beast';
const enemySizeOf = (id) => ENEMY_SIZE[String(id || '').toUpperCase()] || 1.0;
const summonSizeOf = (key) => SUMMON_SIZE[String(key || '').toUpperCase()] || 1.0;

// deterministic tag-compatible stage pick (audit §5): filter the regular
// pool by habitat suit → hash(floor:habitat) → avoid the previous floor's
// stage when there is an alternative. Falls back to the whole pool.
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
const _lastRegBg = new Map();     // floor → file (consecutive-repeat guard)
function bgForEncounter(floor, habitat, opts = {}) {
    const reg = bgListRegular();
    if (!reg.length) return null;
    if (opts.forceBg && reg.includes(opts.forceBg)) return opts.forceBg;   // QA hook
    const suited = reg.filter((f) => ((BG_META[f] && BG_META[f].suit) || []).includes(habitat));
    const pool = suited.length ? suited : reg;
    const h = hashStr(`${Number(floor) || 1}:${habitat}`);
    let pick = pool[h % pool.length];
    const prev = _lastRegBg.get((Number(floor) || 1) - 1);
    if (pool.length > 1 && pick === prev) pick = pool[(h + 1) % pool.length];
    _lastRegBg.set(Number(floor) || 1, pick);
    return pick;
}
// cover-fit transform for a background image into the scene canvas — slots
// defined in IMAGE FRACTIONS map through this so feet land on the painted
// floor plane regardless of source ratio (audit §1).
function coverTransform(imgW, imgH, cw, ch) {
    if (!imgW || !imgH) return null;
    const s = Math.max(cw / imgW, ch / imgH);
    return { s, ox: (cw - imgW * s) / 2, oy: (ch - imgH * s) / 2, iw: imgW, ih: imgH };
}
async function bgCoverTransform(file, dir) {
    if (!file) return null;
    const img = await loadBg(file, dir);
    if (!img) return null;
    return coverTransform(img.width, img.height, W, H);
}

async function planCombatLayout(state, opts = {}) {
    const enemies = (state && state.enemies) || [];
    const players = (state && state.players) || [];
    const me = players[0] || null;
    const isWildSummon = !!(enemies[0] && (enemies[0].isWildSummon
        || (state.abyssRun && state.abyssRun.currentEncounterType === 'wild_summon')));
    const enemy = enemies[0] || null;
    const isBoss = !!(enemy && (enemy.isBoss || enemy.bossId));
    // owner 2026-10-09 10:19Z: the centered tower style (current backgrounds +
    // big front-facing amalgamations) is EXCLUSIVE to boss rooms. Everything
    // else — plain mobs, pack fights, wild-summon duels — renders the
    // Pokémon-style SIDE layout on the new abyss-themed side stages.
    const style = isBoss ? 'boss' : 'side';

    const plan = {
        kind: isWildSummon ? 'summon' : 'combat',
        style,
        floor: (state && state.abyssFloor) || 1,
        bg: null, bgDir: null,
        enemy: null,
        player: null,
        allies: [],
        wildSpecies: isWildSummon
            ? safeName((state.abyssRun && state.abyssRun.currentEncounterData && state.abyssRun.currentEncounterData.species)
                || (enemy && enemy.name), 20)
            : null,
        pack: [],
    };

    // ══ BOSS PATH — the composition the owner approved (10:19Z round) is the
    // quality bar and must render UNCHANGED (audit: "Do not change boss
    // scenes") — geometry, sizes, order all kept verbatim. ══
    if (style === 'boss') {
        plan.bg = bgFileForFloor(plan.floor, 'boss');
        plan.bgDir = bgDirFor('boss');
        plan.enemy = enemy ? {
            art: resolveEnemyArt(enemy),
            cx: W * 0.5,
            gy: BOSS_GY,
            h: Math.round(perspH(BOSS_GY) * 2.05),
            flip: false,
            name: safeName(enemy && enemy.name, 22),
            isBoss: true,
        } : null;
        plan.player = {
            cx: W * 0.5,
            gy: PLAYER_GY,
            h: Math.round(perspH(PLAYER_GY) * 0.96),
            flip: false,
        };
        try {
            const allies = (state.summons || []).filter((s) => s && !s.isDead).slice(0, 2);
            for (let i = 0; i < allies.length; i++) {
                const s = allies[i];
                const art = await resolveSummonArt(s.species || s.name);
                const slot = { cx: 400 - i * 118, gy: 640 + i * 8 };
                plan.allies.push({
                    art: art ? { img: art.img, file: art.file } : null,
                    cx: slot.cx, gy: slot.gy,
                    h: Math.round(perspH(slot.gy) * (i === 0 ? 0.62 : 0.56)),
                    flip: art ? SUMMON_FACES_RIGHT.has(summonFaceKey(art.file)) : false,
                    name: safeName(s.name, 16),
                });
            }
        } catch (e) { /* ally art is cosmetic — never fail the scene for it */ }
        if (plan.player) plan.player.file = playerSpriteFileFor(me);
        return plan;
    }

    // ══ SIDE PATH (regular encounters) — 🕳️ round-13 REBUILD (owner 02:56Z
    // image brief: "ignore the hubs and hp and bars in the first image, only
    // the position and style ... something like this as the default abyss
    // encounter"): the owner's Battle-Example composition — PLAYER FRONT-LEFT
    // (bottom-left of the open stage, above the frozen HUD panel), enemy wing
    // STAGGERED DOWN THE RIGHT SIDE (back-top → front-bottom), party arc
    // falling in behind the hero. Mirrors the round-4 side layout; every
    // depth/size math is preserved, only the aisles are flipped. ══
    // Stage pick: tag-compatible with what actually stands on it (§5).
    const wildKey = planWildSpeciesKey(state, enemy);
    const habitat = isWildSummon ? summonHabitatOf(wildKey) : enemyHabitatOf(enemyIdOf(enemy));
    plan.bg = bgForEncounter(plan.floor, habitat, opts) || bgFileForFloor(plan.floor, 'regular');
    plan.bgDir = plan.bg ? bgDirFor('regular') : null;
    // image-fraction → canvas mapping (feet land on the painted floor plane)
    const tr = await bgCoverTransform(plan.bg, plan.bgDir);
    const SX = (fx) => Math.round(tr ? tr.ox + fx * tr.iw * tr.s : fx * W);
    const SY = (fy) => Math.round(tr ? tr.oy + fy * tr.ih * tr.s : fy * H);
    // 🕳️ round-14 (owner 08:09Z: "the backgrounds some are so off the monsters
    // are floating"): fixed fy slots were calibrated on the original plaza
    // stages — on the dusk stages (and worst on the amphitheater's tier WALL)
    // they put bodies on walls / above the readable ground. Every slot's feet
    // are now hard-clamped into the stage's MEASURED floor band (BG_META).
    const _meta = BG_META[plan.bg] || null;
    const floorClamp = (gy) => {
        if (!_meta) return gy;
        const top = SY(_meta.floorTop) + 6;
        const bot = SY(_meta.floorBottom) - 6;
        return Math.min(Math.max(gy, top), bot);
    };

    // formation slots (audit §3): enemies back-left upper ON the floor plane,
    // never at the screen edge; front slot = the ACTIVE enemy, queued pack
    // members take the back row (staggered, depth-scaled smaller).
    // round-8 FIX (owner: "enemies overlaying in a full party"): back-row
    // members now stagger LEFT+deeper of the active enemy ONLY. The old
    // 3-member formation put a pack slot at fx 0.510 while ALLY_SLOTS[2]
    // sits at fx 0.494 — the two rows were designed into the same corridor
    // and the resolver oscillated (2-pass cap) instead of converging. With
    // the pack fully inside the enemy corridor, the ally row never meets it.
    // formation slots — MIRRORED round-13: the enemy wing marches down the
    // RIGHT half (active front-low, pack deeper-right + higher), same depth
    // ladder as the approved layout. The active slot clears the player's box
    // (player halfW ~70-90 @ fx 0.500) and stays off the frame edge.
    // round-13b spacing audit (on-box measured halfW): the new bestiary art is
    // WIDER than the old amalgamations — the 2/3-body ladders were re-spread
    // (fx gaps +, back rows climb higher) so wide bodies separate WITHOUT the
    // shrink pass flattening them (owner: "enemies overlaying" ban).
    // formation slots — 🕳️ round-14 REBALANCE (owner 08:09Z: "I gave you a
    // reference image for the position and you butchered it, the player is in
    // the center why?"): the front enemy slot moves to the TRUE Battle-
    // Example mirror of the approved round-4 layout — active enemy front-RIGHT
    // (fx 0.68-0.70) facing the hero across the open center aisle, pack
    // staggering back-RIGHT + higher, every row clamped to the stage floor.
    // formation slots — 🕳️ round-15 REBUILD (owner 09:15Z: "your layout and
    // formation arrangement looks so trash"): the round-13/14 ladder marched
    // the pack members TOWARD THE FRAME EDGE (fx 0.855/0.912) while the
    // perspective vanishing point sits CENTER — back rows were pushed the
    // wrong way, hugging the edge at crushed sizes, which read as bodies
    // strewn across the stage. Proper depth staging: the ACTIVE enemy holds
    // front-RIGHT (low, biggest), pack members step back toward the
    // vanishing point (deeper = LEFTWARD + higher on the floor plane),
    // de-crushed size ladder (0.82 / 0.70 with a 0.92 depth cap). The right
    // half stays the enemy wing; the open center aisle stays open.
    const FORMATIONS = {
        1: [{ fx: 0.705, fy: 0.708, mul: 1.00 }],
        2: [{ fx: 0.715, fy: 0.710, mul: 1.00 }, { fx: 0.640, fy: 0.640, mul: 0.82 }],
        3: [{ fx: 0.720, fy: 0.712, mul: 1.00 }, { fx: 0.655, fy: 0.642, mul: 0.82 }, { fx: 0.605, fy: 0.578, mul: 0.70 }],
    };
    // ally row beside/behind the player (audit: "never on top of the
    // player's body"); a third ally is supported for the test matrix.
    // owner 2026-10-09 14:07Z: "the player sprite literally looks like a hub
    // UI element on the screen... not standing in the map". Root causes: feet
    // at 89.5% frame height (corner-hug, on the featureless near-camera band),
    // raw ungraded class sprite against palette-graded stages, and the tag+bars
    // riding UNDER the feet like a widget footer. Game-dev practice for staging
    // side-view actors: put the feet ON the readable mid-floor of the ground
    // plane (perspective grid, not the frame edge), grade the sprite into the
    // scene's light, keep one tag+bar stack per entity ABOVE the head.
    // round-8: ally ARC (owner round-8 "enemies overlaying in a full party"
    // turned out to be the party row too — debug boxes showed 3 wide summons
    // (content halfW 95/82/69) sharing slots only 74px apart, so the old
    // 2-pass resolver oscillated between the enemy corridor and ally
    // neighbors instead of converging). Game-dev staging answer: the party
    // ARCS around the hero — deep-left lane rises toward the enemy diagonal,
    // mid lane keeps the approved single-ally position, and the 3rd summon
    // flanks FRONT-RIGHT of the player in the empty foreground. Wide species
    // get a content-width lane cap so a boar can't outgrow its lane.
    // ally arc — MIRRORED round-13: the party falls in BEHIND the hero,
    // arcing up-LEFT across the band ABOVE the HUD panel (feet ≤ 0.71H so
    // nobody sinks into the panel; the HUD no-go lift below stays as a
    // belt-and-braces guard for odd art aspect ratios).
    // ally arc — 🕳️ round-14 (owner 08:09Z rebuke + FROZEN player-left /
    // summon-right rule): the summons stand to the hero's RIGHT — between him
    // and the enemy wing, arcing up toward it. The round-13 build had them
    // BEHIND-LEFT of a centered hero, staring at the back of his head.
    const ALLY_ARC = {
        1: [{ fx: 0.360, fy: 0.672, mul: 0.62 }],
        2: [{ fx: 0.360, fy: 0.672, mul: 0.62 }, { fx: 0.442, fy: 0.634, mul: 0.58 }],
        3: [{ fx: 0.356, fy: 0.676, mul: 0.60 }, { fx: 0.436, fy: 0.638, mul: 0.57 }, { fx: 0.498, fy: 0.602, mul: 0.54 }],
    };
    const ALLY_LANE_MAXW = 140;   // px of horizontal lane per summon (content) — r15: the 7-body stress case needs the arc to actually separate; 170 let a wide boar hog half the party band
    // the hero: FRONT-LEFT — the actual Battle-Example position (owner 08:09Z:
    // "the player is in the center why?"). fx 0.260 mirrors the approved
    // round-4 player slot (cx 890 → 310 on the mirrored stage); feet at
    // fy 0.700 stay 14px above the HUD panel's top edge (y 644).
    const PLAYER_SLOT = { fx: 0.260, fy: 0.700 };

    const queue = (state.abyssRun && Array.isArray(state.abyssRun.packQueue) && !isWildSummon)
        ? state.abyssRun.packQueue.filter(Boolean) : [];

    const formation = FORMATIONS[Math.min(3, 1 + queue.length)] || FORMATIONS[1];

    // ── resolve every actor's art + size FIRST (bboxes feed collision) ──
    const actors = [];
    const members = [{ e: enemy, slot: formation[0], kind: isWildSummon ? 'wild' : 'active' }]
        .concat(queue.slice(0, 2).map((m, i) => ({ e: m, slot: formation[i + 1], kind: 'pack', qIndex: i })));
    for (const m of members) {
        if (!m.e || !m.slot) continue;
        if (m.kind === 'pack' && m.e.isDead) continue;
        const art = m.kind === 'wild' ? null : resolveEnemyArtRegular(m.e);
        const speciesKey = m.kind === 'wild' ? summonFaceKey(plan.wildSpecies) : null;
        const sizeMul = m.kind === 'wild' ? summonSizeOf(speciesKey) : enemySizeOf(enemyIdOf(m.e));
        const cx = SX(m.slot.fx), gy = floorClamp(SY(m.slot.fy));
        let h = Math.round(perspH(gy) * m.slot.mul * sizeMul
            * (m.kind === 'wild' ? 1.18 : 1.12));
        // DEPTH CAP (VLM critic, bg4_2e zoom-verified): a big-bodied back-row
        // species must never render larger than the front-row actor on the
        // same plane — deeper reads smaller, no exceptions
        if (m.kind === 'pack' && actors.length && actors[0].h) {
            h = Math.min(h, Math.round(actors[0].h * 0.92));
        }
        actors.push({
            role: m.kind, ref: m.e, qIndex: m.qIndex,
            art,
            speciesKey,
            cx, gy, h,
            // facing rule (owner, round-13 mirrored stage): the enemy wing
            // stands RIGHT and faces LEFT toward the hero — flip only art
            // that natively looks RIGHT (per-enemy registry, see
            // ENEMY_FACING: 'F' front art never flips); wild flips finalize
            // after its own sprite resolves below
            flip: m.kind === 'wild'
                ? SUMMON_FACES_RIGHT.has(speciesKey)
                : enemyNativeFacing(enemyIdOf(m.e)) === 'R',
            name: safeName(String((m.e && m.e.name) || '')
                .replace(/\s*\(pack\s*\d+\/\d+\)\s*$/i, ''), 22),
            alpha: m.kind === 'pack' ? 0.94 : 1,
        });
    }
    // wild-summon art = the game's OWN sprites (processed set first)
    const wildActor = actors.find((a) => a.role === 'wild');
    if (wildActor) {
        const art = await resolveSummonArt(plan.wildSpecies);
        if (art) {
            wildActor.art = { img: art.img, file: art.file };
            // wild takes the ENEMY side (right wing) → faces LEFT → mirror
            // only natively-right summon art
            wildActor.flip = SUMMON_FACES_RIGHT.has(summonFaceKey(art.file));
        }
    }
    // deployed ally summons — the party arc (see ALLY_ARC above)
    try {
        const allies = (state.summons || []).filter((s) => s && !s.isDead).slice(0, 3);
        const arc = ALLY_ARC[Math.min(3, Math.max(1, allies.length))] || ALLY_ARC[1];
        for (let i = 0; i < allies.length; i++) {
            const s = allies[i];
            const art = await resolveSummonArt(s.species || s.name);
            const slot = arc[i] || arc[arc.length - 1];
            const speciesKey = summonFaceKey(art ? art.file : (s.species || s.name));
            const cx = SX(slot.fx), gy = floorClamp(SY(slot.fy));
            actors.push({
                role: 'ally', ref: s, art: art ? { img: art.img, file: art.file } : null,
                cx, gy,
                h: Math.round(perspH(gy) * slot.mul * 0.96),
                // party side faces RIGHT (toward the enemy wing) — mirror
                // only the natively-left art
                flip: art ? SUMMON_FACES_LEFT.has(summonFaceKey(art.file)) : false,
                name: safeName(s.name, 16),
                speciesKey,
                alpha: 0.96,
            });
        }
    } catch (e) { /* ally art is cosmetic — never fail the scene for it */ }
    // player — front-left slot (Battle-Example position), native art faces
    // RIGHT toward the enemy wing (the old side layout mirrored it left)
    const pgy = floorClamp(SY(PLAYER_SLOT.fy));
    actors.push({
        role: 'player', ref: me,
        cx: SX(PLAYER_SLOT.fx), gy: pgy,
        h: Math.round(perspH(pgy) * 0.94),
        flip: false, name: safeName((me && me.name) || 'You', 16),
        file: playerSpriteFileFor(me),
    });

    // ── bbox collision resolve (audit §3/§D): measure the real content,
    // then nudge colliding actors — v2 rules live below the HUD lift ──
    const measured = [];
    for (const a of actors) {
        let halfW = Math.round(a.h * 0.42);   // estimate before art measures
        try {
            if (a.role === 'player' && a.file) {
                const img = await loadBg(a.file, path.join(RPGASSET, 'characters', 'clean'))
                    || await loadBg(a.file, path.join(RPGASSET, 'characters'));
                if (img) {
                    const box = await contentBox(a.file, path.join(RPGASSET, 'characters', 'clean'))
                        || await contentBox(a.file, path.join(RPGASSET, 'characters'));
                    if (box) halfW = Math.round(box.w * (a.h / box.h) / 2);
                }
            } else if (a.art && a.art.dir && a.art.file) {
                const img = await loadBg(a.art.file, a.art.dir);
                if (img) {
                    const box = await measureImageBox(img, a.art.file);
                    halfW = Math.round(box.w * (a.h / box.h) / 2);
                }
            } else if (a.art && a.art.img) {
                const box = await measureImageBox(a.art.img, a.art.file || null);
                halfW = Math.round(box.w * (a.h / box.h) / 2);
                // ally lane cap: a wide species is shortened until its CONTENT
                // fits its lane (w/h preserved) — oversized party bodies were
                // the root of the full-party fusion
                if (a.role === 'ally' && box.w > 0) {
                    const capH = Math.round(ALLY_LANE_MAXW * box.h / box.w);
                    if (capH < a.h) { a.h = Math.max(56, capH); halfW = Math.round(box.w * (a.h / box.h) / 2); }
                }
            }
        } catch (e) { /* estimate stands */ }
        measured.push({ a, halfW, top: a.gy - a.h, bottom: a.gy, left: a.cx - halfW, right: a.cx + halfW });
        a.halfW = halfW;   // actors carry it too — the scatter below reads it
    }
    // NaN HARDENING (round-13): a broken/unreadable asset must never poison
    // the collision resolver (NaN halfW turns every clamp into NaN and the
    // next pass moves actors to NaN). Fall back to the depth estimate.
    for (const m of measured) {
        if (!Number.isFinite(m.halfW) || m.halfW <= 0) {
            m.halfW = Math.max(12, Math.round(m.a.h * 0.42));
            m.a.halfW = m.halfW;
            m.left = m.a.cx - m.halfW; m.right = m.a.cx + m.halfW;
        }
    }
    // HUD no-go zone (roomScene _hubGeom: panel spans x −26..505, y 644..900)
    const HUD = { left: -26, right: 505, top: 644, bottom: H };
    for (const m of measured) {
        // sprites must never sink into the HUD panel: raise any feet that
        // would land inside the panel rectangle (meaningful overlap only)
        const xOv = Math.min(m.right, HUD.right) - Math.max(m.left, HUD.left);
        if (m.bottom > HUD.top && xOv > 12) {
            const lift = m.bottom - HUD.top + 6;
            m.a.gy -= lift; m.bottom -= lift; m.top -= lift;
        }
    }
    const byDepth = measured.slice().sort((x, y) => x.bottom - y.bottom);   // shallow first
    // ── round-8 resolver v2 (owner: "enemies overlaying in a full party") ──
    // The old 2-pass geometric shove had two failure modes: the 0.14W..0.86W
    // clamp let enemies be pushed INTO the party row, and capped passes meant
    // an actor squeezed between two constraints stayed fused. v2 is
    // role-aware and convergent:
    //   • ANCHORS (never moved): the player and the ACTIVE enemy
    //   • same-side overlap → pure geometry (part ways)
    //   • cross-side overlap → the non-anchor retreats into its OWN corridor
    //     (enemies leftward, allies rightward) — never across the aisle
    //   • per-role clamp ranges: pack/wild stay inside the enemy corridor
    //     [0.07W .. 0.60W]; allies stay between it and the player's box
    //   • 6 sweep passes, then a last-resort 7% shrink per still-fused body
    //     (3 rounds max, never an anchor) — a slightly smaller back-row body
    //     reads as MORE perspective depth, never as a defect
    const TOL = 14;   // px of allowed bbox kiss
    const playerBox0 = measured.find((m) => m.a.role === 'player');
    const enemyBox0 = measured.find((m) => m.a.role === 'active');
    for (const m of measured) {
        if (m.a.role === 'player' || m.a.role === 'active') { m.lo = m.a.cx; m.hi = m.a.cx; continue; }
        if (m.a.role === 'ally') {
            // round-14: the party stands BETWEEN the hero and the enemy wing
            // (frozen player-left / summon-right) — retreat LEFT toward the
            // hero when squeezed, never into the enemy corridor.
            // round-15: hi back at 0.575W — the stress case (3 enemies + 3
            // allies) needs the arc room between the hero and the pack
            // ladder; the deepest pack slot (0.605W) still clears it.
            m.lo = playerBox0 ? Math.max(Math.round(W * 0.155), playerBox0.right + 14) : Math.round(W * 0.155);
            m.hi = Math.round(W * 0.575);
            if (m.hi < m.lo) m.hi = m.lo;
        } else {                    // pack / wild — the enemy corridor (right wing)
            // round-15: lo drops to 0.55W — back-row slots retreat toward
            // the vanishing point instead of the frame edge
            m.lo = Math.round(W * 0.55);
            // RIGHT-EDGE GUARD: a wide back-row body must never render past
            // the frame (12px margin) — clamp the corridor to its own width
            m.hi = Math.min(Math.round(W * 0.92), Math.round(1188 - m.halfW));
            if (m.hi < m.lo) m.hi = m.lo;
        }
    }
    const rebox = (m) => { m.left = m.a.cx - m.halfW; m.right = m.a.cx + m.halfW; m.top = m.a.gy - m.a.h; m.bottom = m.a.gy; };
    const sideOf = (m) => (m.a.role === 'ally' || m.a.role === 'player') ? -1 : 1;   // −1 party (left), +1 enemy wing (right)
    for (let pass = 0; pass < 9; pass++) {
        let moved = false;
        for (let i = 0; i < byDepth.length; i++) {
            for (let j = i + 1; j < byDepth.length; j++) {
                const A = byDepth[i], B = byDepth[j];
                const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
                const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
                if (ox <= TOL || oy <= TOL) continue;
                const away = (A.a.cx <= B.a.cx) ? -1 : 1;      // push A away from B
                const tryMove = (m, dir) => {
                    if (m.lo === m.hi) return false;           // anchored
                    const room = dir < 0 ? m.a.cx - m.lo : m.hi - m.a.cx;
                    if (room <= 4) return false;
                    m.a.cx = Math.max(m.lo, Math.min(m.hi, m.a.cx + dir * (ox - TOL + 10)));
                    rebox(m); moved = true; return true;
                };
                // passes 0-4: resolve by moving (shrink only if fully pinned);
                // passes 5+: force-shrink the still-fused bodies FIRST, then
                // let the smaller boxes settle with the same move rules —
                // sizes only decrease, so the moves now CONVERGE instead of
                // trading places (round-13b: budget 4, factor 0.91 — the wider
                // bestiary bodies need one more shrink round than the old art)
                if (pass >= 5) {
                    for (const m of [A, B]) {
                        if (m.a.role === 'player' || m.a.role === 'active') continue;
                        m.shrinks = m.shrinks || 0;
                        if (m.shrinks < 4) {
                            m.shrinks++;
                            m.a.h = Math.max(48, Math.round(m.a.h * 0.91));
                            m.halfW = Math.max(12, Math.round(m.halfW * 0.91));
                            m.a.halfW = m.halfW;
                            rebox(m); moved = true;
                        }
                    }
                    const ox2 = Math.min(A.right, B.right) - Math.max(A.left, B.left);
                    const oy2 = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
                    if (ox2 <= TOL || oy2 <= TOL) continue;   // shrink alone settled it
                }
                {
                    if (sideOf(A) !== sideOf(B)) {
                        // cross-aisle: the movable body retreats to its own side
                        if (tryMove(A, sideOf(A)) || tryMove(B, sideOf(B))) continue;
                        if (tryMove(A, away) || tryMove(B, -away)) continue;
                    } else {
                        if (tryMove(A, away) || tryMove(B, -away)) continue;
                    }
                }
                // both pinned: shrink the deeper non-anchor member(s)
                for (const m of [A, B]) {
                    if (m.a.role === 'player' || m.a.role === 'active') continue;
                    m.shrinks = m.shrinks || 0;
                    if (m.shrinks < 3) {
                        m.shrinks++;
                        m.a.h = Math.max(48, Math.round(m.a.h * 0.93));
                        m.halfW = Math.max(12, Math.round(m.halfW * 0.93));
                        m.a.halfW = m.halfW;
                        rebox(m); moved = true;
                    }
                }
            }
        }
        if (!moved) break;
    }

    // ── round-15 FINAL DISASSEMBLY ── the move/shrink passes can still leave
    // a fused pair in the 7-body stress case (cross-side bodies parked at
    // nearly the same cx after the cascade). Strict-priority sweeps: each
    // still-fused pair separates by moving the LOWER-priority body strictly
    // AWAY — allies retreat toward the hero (they have the whole arc to
    // lo), pack retreats toward the wing edge. Anchors never move.
    const prio = (m) => (m.a.role === 'player' ? 0 : m.a.role === 'active' ? 1 : m.a.role === 'pack' ? 2 : 3);
    // (tryMove above is scoped to the pass loop — the sweep carries its own mover)
    const sweepMove = (m, dir, ox) => {
        if (m.lo === m.hi) return false;
        const room = dir < 0 ? m.a.cx - m.lo : m.hi - m.a.cx;
        if (room <= 4) return false;
        m.a.cx = Math.max(m.lo, Math.min(m.hi, m.a.cx + dir * (ox - TOL + 10)));
        rebox(m); return true;
    };
    for (let sweep = 0; sweep < 5; sweep++) {
        let any = false;
        for (let i = 0; i < byDepth.length; i++) {
            for (let j = i + 1; j < byDepth.length; j++) {
                const A = byDepth[i], B = byDepth[j];
                const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
                const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
                if (ox <= TOL || oy <= TOL) continue;
                const mover = prio(A) >= prio(B) ? A : B;
                const other = mover === A ? B : A;
                if (mover.a.role === 'player' || mover.a.role === 'active') continue;
                const dir = mover.a.cx <= other.a.cx ? -1 : 1;
                if (sweepMove(mover, dir, ox)) { any = true; continue; }
                // pinned in that direction: allow a bounded overshoot past the
                // corridor edge (24px) before giving up — the stress case parks
                // the snake exactly at hi while the spider needs the lane
                const savedLo = mover.lo, savedHi = mover.hi;
                if (dir < 0) mover.lo = Math.max(8, mover.lo - 24); else mover.hi = mover.hi + 24;
                const movedNow = sweepMove(mover, dir, ox);
                mover.lo = savedLo; mover.hi = savedHi;
                if (movedNow) { any = true; continue; }
                const m = mover;
                m.shrinks = m.shrinks || 0;
                if (m.shrinks < 6) {
                    m.shrinks++;
                    m.a.h = Math.max(48, Math.round(m.a.h * 0.91));
                    m.halfW = Math.max(12, Math.round(m.halfW * 0.91));
                    m.a.halfW = m.halfW;
                    rebox(m); any = true;
                }
            }
        }
        if (!any) break;
    }

    // scatter the resolved actors back into the plan (halfW = measured real
    // content half-width — lets QA assert the anti-overlap contract in REAL
    // pixels instead of frame-height estimates)
    for (const a of actors) {
        if (a.role === 'player') {
            plan.player = { cx: a.cx, gy: a.gy, h: a.h, flip: a.flip, file: a.file, halfW: a.halfW };
        } else if (a.role === 'ally') {
            plan.allies.push({
                art: a.art, cx: a.cx, gy: a.gy, h: a.h, flip: a.flip,
                name: a.name, speciesKey: a.speciesKey, halfW: a.halfW,
            });
        } else if (a.role === 'pack') {
            plan.pack.push({ art: a.art, cx: a.cx, gy: a.gy, h: a.h, flip: a.flip, alpha: a.alpha, plateName: a.name, halfW: a.halfW });
        } else {
            plan.enemy = {
                art: a.art, cx: a.cx, gy: a.gy, h: a.h, flip: a.flip, halfW: a.halfW,
                name: a.name, isBoss: false,
            };
        }
    }
    return plan;
}
function playerSpriteFileFor(player) {
    try {
        const f = resolvePlayerSpriteFile(player || {});
        return f || null;
    } catch (e) { return null; }
}

// ── scene-grade for the PLAYER class sprite (owner 14:07Z defect: the raw
// class art is bright studio-lit while enemies ship palette-graded into the
// abyss — the player read as a sticker). Applies the scene's ambient to the
// sprite itself via source-atop veils (alpha-preserving): an obsidian-violet
// ambient pass + a faint cold rim pass. Cached per file. ──
const _playerGradeCache = new Map();
async function gradedPlayerArt(file, ambient = 0.30) {
    if (!file) return null;
    // cache per file + quantized ambient bucket (scene-adaptive veils differ)
    const bucket = Math.round(ambient * 20) / 20;
    const key = `${file}|${bucket}`;
    if (_playerGradeCache.has(key)) return _playerGradeCache.get(key);
    const dirs = [path.join(RPGASSET, 'characters', 'clean'), path.join(RPGASSET, 'characters')];
    let img = null;
    for (const d of dirs) { img = await loadBg(file, d); if (img) break; }
    if (!img) { _playerGradeCache.set(key, null); return null; }
    try {
        const off = createCanvas(img.width, img.height);
        const octx = off.getContext('2d');
        octx.drawImage(img, 0, 0);
        octx.globalCompositeOperation = 'source-atop';
        octx.fillStyle = `rgba(21,13,42,${bucket.toFixed(2)})`;   // obsidian-violet ambient
        octx.fillRect(0, 0, off.width, off.height);
        octx.fillStyle = `rgba(64,52,110,${(bucket * 0.4).toFixed(2)})`;   // cold rim cast
        octx.fillRect(0, 0, off.width, off.height);
        octx.globalCompositeOperation = 'source-over';
        const art = { img: off, file: `graded:${file}` };
        _playerGradeCache.set(key, art);
        return art;
    } catch (e) {
        const art = { img, file };
        _playerGradeCache.set(key, art);
        return art;
    }
}

// ── local grounded draw for combat actors (enemies, wild + ally summons) ──
// Handles Image objects AND repo files, with the owner round-4 additions:
//   • flip        — the Pokémon-style facing rule (player side LEFT, enemy
//                   side RIGHT) without mirroring front-facing art
//   • tint        — "when I attack an enemy, its sprite should get a red
//                   damage flash" (recolor 14:07Z): per-pixel source-atop
//                   flood on an isolated content layer, silhouette stays crisp
//   • foot-band shadows — measureImageBox now returns feetX/feetW/massY
// Same grounding math as roomScene.drawGroundedSprite (content bottom ON the
// ground line, shared depth-aware contact shadow).
const _imgBoxCache = new Map(); // file → box
async function measureImageBox(img, key) {
    if (key && _imgBoxCache.has(key)) return _imgBoxCache.get(key);
    let box;
    try {
        const off = createCanvas(img.width, img.height);
        const octx = off.getContext('2d');
        octx.drawImage(img, 0, 0);
        const data = octx.getImageData(0, 0, img.width, img.height).data;
        let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                if (data[(y * img.width + x) * 4 + 3] > 16) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        box = (maxX < 0) ? { x: 0, y: 0, w: img.width, h: img.height }
            : (() => {
                // foot band (bottom ~12% of the content) + mass bottom — same
                // contract roomScene.contentBox returns, so contact shadows
                // hug the FEET instead of the full sprite width
                const footTop = Math.max(minY, maxY - Math.max(2, Math.round((maxY - minY) * 0.12)));
                let fMinX = img.width, fMaxX = -1, massY = maxY;
                const minRowW = Math.max(2, Math.round((maxX - minX) * 0.04));
                for (let y = maxY; y >= minY; y--) {
                    let rowW = 0, rMin = img.width, rMax = -1;
                    for (let x = minX; x <= maxX; x++) {
                        if (data[(y * img.width + x) * 4 + 3] > 16) {
                            rowW++; if (x < rMin) rMin = x; if (x > rMax) rMax = x;
                        }
                    }
                    if (rMax >= 0 && y >= footTop) {
                        if (rMin < fMinX) fMinX = rMin;
                        if (rMax > fMaxX) fMaxX = rMax;
                    }
                    if (massY === maxY && rowW >= minRowW) massY = y;
                }
                return {
                    x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
                    feetX: fMaxX < 0 ? minX : fMinX,
                    feetW: fMaxX < 0 ? (maxX - minX + 1) : (fMaxX - fMinX + 1),
                    massY,
                };
            })();
    } catch (e) {
        box = { x: 0, y: 0, w: img.width, h: img.height };
    }
    if (key && _imgBoxCache.size > 64) _imgBoxCache.clear();
    if (key) _imgBoxCache.set(key, box);
    return box;
}
async function drawActorGrounded(ctx, art, cx, groundY, ch, opts = {}) {
    if (!art) return null;
    let img = null;
    if (art.dir && art.file) {
        img = await loadImage(path.join(art.dir, art.file)).catch(() => null);
    } else if (art.img) {
        img = art.img;
    }
    if (!img) return null;
    const box = await measureImageBox(img, art.file || null);
    const flip = !!opts.flip;
    let src = img, sx = box.x, sy = box.y, sw = box.w, sh = box.h;
    if (opts.tint) {
        // isolate the content crop on a transparent layer, flood it dark
        // purple 'source-atop' (clips to the sprite's own alpha), composite
        const off = createCanvas(box.w, box.h);
        const octx = off.getContext('2d');
        octx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
        octx.globalCompositeOperation = 'source-atop';
        octx.fillStyle = opts.tint;
        octx.fillRect(0, 0, box.w, box.h);
        octx.globalCompositeOperation = 'source-over';
        src = off; sx = 0; sy = 0;
    }
    const scale = ch / box.h;
    // audit §F: "integer scaling and nearest-neighbor … so density stays
    // consistent" — snap the side-style actors' scale to crisp steps (whole
    // pixels when close, half-steps otherwise) so every sprite's pixel grid
    // stays even; the boss path passes pixelSnap:false and renders exactly
    // as approved.
    let drawScale = scale;
    if (opts.pixelSnap) {
        // round-13b FIX: the snap must NEVER inflate the planned height. The
        // old `Math.max(0.5, …)` floor was calibrated for the ~300px
        // amalgamation canvases; the round-13 bestiary art carries ~900px
        // content boxes → target scale lands at 0.15-0.35 and the floor drew
        // those sprites ~2-3× too big (back row clipped off-frame, owner A3
        // proof). Snap rules now: scale ≥ 1 → whole-step within 10%;
        // 0.5 ≤ scale < 1 → half-step within 10%; below 0.5 the half-step
        // grid is coarser than the target itself → draw at the exact scale.
        if (scale >= 1) {
            const whole = Math.round(scale);
            if (Math.abs(scale - whole) / scale <= 0.10) drawScale = whole;
        } else if (scale >= 0.5) {
            const half = Math.round(scale * 2) / 2;
            if (half >= 0.5 && Math.abs(scale - half) / scale <= 0.10) drawScale = half;
        }
    }
    const dw = Math.round(box.w * drawScale);
    const dh = Math.round(box.h * drawScale);
    // MASS-BOTTOM ANCHOR (owner 14:07Z "floating" round + VLM critic verdicts):
    // several sheets carry a sparse translucent fringe BELOW the body (wisp
    // tails, baked ground kisses) — anchoring the raw content bottom put the
    // VISIBLE feet rows above the shadow line and read as hovering. Anchor
    // the MASS bottom (last row with real body width) on the ground line
    // instead; the fringe then hangs into the contact shadow, which glues
    // the feet to the floor. Solid-footed sprites (massY ≈ content bottom)
    // render exactly as before.
    const anchorRows = box.massY ? Math.max(1, box.massY - box.y) : box.h;
    const anchorH = Math.round(anchorRows * drawScale);
    // weight sink: press the sprite 2-3px past the ground line so thin-tipped
    // silhouettes (claws, tentacles) physically enter the contact shadow
    const SINK = Math.max(2, Math.round(ch * 0.012));
    const drawX = Math.round(cx - dw / 2);
    const drawY = Math.round(groundY - anchorH + SINK);
    if (opts.shadow !== false) {
        const feetW = box.feetW ?? box.w;
        const feetCx = (box.feetX ?? box.x) + feetW / 2;
        // shadowWide (side scenes): thin-footed silhouettes (talons, claws)
        // get a footprint that reads as weight, not a pencil line
        const wide = opts.shadowWide
            ? Math.max(feetW * 1.35, box.w * 0.55)
            : Math.max(feetW, box.w * 0.5);
        const footW = wide * scale;
        const footOff = (feetCx - (box.x + box.w / 2)) * scale;
        drawContactShadow(ctx, flip ? cx - footOff : cx + footOff, groundY, footW, ch,
            opts.alpha != null ? opts.alpha : 1,
            { boost: opts.shadowBoost || 1.35, ryMin: opts.shadowRyMin || 12 });
        // FEET WELD (VLM critic, zoom-verified): the shared actor shadow parks
        // its dark core BELOW the base line — right for boots, which sink into
        // it — but thin-tipped sprites only graze the faint top rows of the
        // gradient, which reads as a hover gap (octopus tentacles ~10px, stalker
        // claws ~7px). Weld the contact: a tight dark ellipse straddling the
        // ground line under the visible foot band, so darkness starts AT the
        // feet instead of below them.
        const weldRy = Math.max(5, Math.round(ch * 0.020));
        const wAlpha = Math.min(0.74, 0.46 * (opts.shadowBoost || 1.35)
            * (opts.alpha != null ? opts.alpha : 1));
        ctx.save();
        ctx.translate(flip ? cx - footOff : cx + footOff, groundY + weldRy * 0.35);
        ctx.scale(Math.max(9, footW * 0.55), weldRy);
        const wg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        wg.addColorStop(0, `rgba(8,6,4,${wAlpha.toFixed(3)})`);
        wg.addColorStop(0.7, `rgba(8,6,4,${(wAlpha * 0.45).toFixed(3)})`);
        wg.addColorStop(1, 'rgba(8,6,4,0)');
        ctx.fillStyle = wg;
        ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    ctx.save();
    if (opts.alpha != null && opts.alpha < 1) ctx.globalAlpha = opts.alpha;
    ctx.imageSmoothingEnabled = false;   // pixel art stays crisp
    if (opts.tint) {
        // red hit halo — the hit state must read even on purple-bodied amalgams
        ctx.shadowColor = HIT_GLOW;
        ctx.shadowBlur = 22;
    }
    if (flip) {
        ctx.translate(cx, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(src, sx, sy, sw, sh, -dw / 2, drawY, dw, dh);
    } else {
        ctx.drawImage(src, sx, sy, sw, sh, drawX, drawY, dw, dh);
    }
    ctx.restore();
    // h = VISIBLE mass height (ground line → sprite top): plates hug what the
    // eye sees instead of floating over the invisible fringe
    return { w: dw, h: anchorH };
}

// ── live combat pools (battleScene mapping — battle-tested field names) ───
function livePools(state, enemies) {
    const me = (state.players || [])[0] || {};
    const e0 = (enemies || [])[0] || {};
    return {
        hp: Math.max(0, Math.floor(me.currentHP ?? (me.stats && me.stats.hp) ?? 0)),
        maxHp: Math.max(1, Math.floor((me.stats && (me.stats.maxHp || me.stats.hp)) || me.currentHP || 1)),
        energy: Math.max(0, Math.floor(me.mana ?? 0)),
        maxEnergy: Math.max(1, Math.floor(me.maxMana || 1)),
        enemyHp: Math.max(0, Math.floor(e0.currentHP ?? (e0.stats && e0.stats.hp) ?? 0)),
        enemyMaxHp: Math.max(1, Math.floor((e0.stats && e0.stats.maxHp) || e0.currentHP || 1)),
        enemyAlive: Math.floor(e0.currentHP ?? (e0.stats && e0.stats.hp) ?? 0) > 0,
    };
}

// audit §G: "One name tag and HP bar per enemy and per summon" + "HP/MP from
// live values" — per-entity pools for the ACTIVE enemy, the queued pack
// members and the deployed allies. Pack members carry their own stats (they
// spawn at 55% stats); currentHP rides along once they take damage.
function liveEntities(state, enemies) {
    const base = livePools(state, enemies);
    const ents = [];
    const e0 = (enemies || [])[0];
    ents.push({
        hp: base.enemyHp,
        maxHp: base.enemyMaxHp,
        alive: base.enemyAlive,
    });
    const queue = (state.abyssRun && Array.isArray(state.abyssRun.packQueue))
        ? state.abyssRun.packQueue.filter(Boolean).slice(0, 2) : [];
    for (const m of queue) {
        const cur = Math.max(0, Math.floor(m.currentHP ?? (m.stats && m.stats.hp) ?? m.hp ?? 0));
        const max = Math.max(1, Math.floor((m.stats && m.stats.maxHp) || m.maxHp || cur || 1));
        ents.push({ hp: Math.min(cur, max), maxHp: max, alive: cur > 0 });
    }
    const allies = [];
    try {
        for (const s of ((state.summons || []).filter((x) => x && !x.isDead).slice(0, 3))) {
            const cur = Math.max(0, Math.floor(s.currentHP ?? (s.stats && s.stats.hp) ?? s.hp ?? 0));
            const max = Math.max(1, Math.floor((s.stats && s.stats.maxHp) || s.maxHp || s.maxHP || cur || 1));
            allies.push({ hp: Math.min(cur, max), maxHp: max });
        }
    } catch (e) { /* ally pools are cosmetic */ }
    return { ...base, ents, allies };
}

// ── plate stack geometry (audit §G): fixed offsets from the sprite's
// measured top — bar closest, name above it, badge (WILD SUMMON) on top.
// Offsets clear the pill heights (font px + 10) so nothing ever overlaps
// the sprite's head or each other.
const PLATE = { bar: 12, name: 36, badge: 62 };

// measure a pill's footprint the same way roomScene.pill draws it
function pillSize(ctx, text, font, padX) {
    ctx.font = font;
    const h = (parseFloat((font.match(/(\d+(?:\.\d+)?)px/) || [])[1] || 12)) + 10;
    return { w: Math.ceil(ctx.measureText(text).width) + padX * 2, h };
}
// collision-resolve plate anchors: shift later (lower-priority) plates UP
// until their name pill no longer intersects an earlier one
function resolvePlateCollisions(ctx, plates) {
    // full-stack boxes: name pill AND hp bar both count, or a pushed pill
    // still leaves its bar covering the neighbor's (turn1 defect: the back-row
    // pack plate's bar rode over the active enemy's bar/name)
    const stackBox = (p) => {
        const rh = (p.rect && p.rect.h) || 22, bh = (p.barH || 9) + 4;
        const t1 = p.nameCy - rh / 2, b1 = p.nameCy + rh / 2;
        const t2 = p.barCy - bh / 2, b2 = p.barCy + bh / 2;
        return { top: Math.min(t1, t2), bot: Math.max(b1, b2) };
    };
    for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (let i = 0; i < plates.length; i++) {
            for (let j = i + 1; j < plates.length; j++) {
                const A = plates[i], B = plates[j];
                if (!A.rect || !B.rect) continue;
                const ax0 = A.x - A.rect.w / 2, ax1 = A.x + A.rect.w / 2;
                const bx0 = B.x - B.rect.w / 2, bx1 = B.x + B.rect.w / 2;
                if (ax0 >= bx1 || bx0 >= ax1) continue;   // no X overlap → fine
                const ab = stackBox(A), bb = stackBox(B);
                if (ab.top < bb.bot && bb.top < ab.bot) {
                    const push = (ab.bot - bb.top) + 6;
                    B.nameCy -= push; B.barCy -= push; B.badgeCy -= push;
                    B.rect.cy = B.nameCy;
                    moved = true;
                }
            }
        }
        if (!moved) break;
    }
}

// ── THE ENCOUNTER SCENE (§6) ──────────────────────────────────────────────
async function drawCombatScene(ctx, plan, live, opts = {}) {
    const turnNum = opts.turnNumber || 0;
    await drawBackdrop(ctx, plan.bg, plan.bgDir);

    // ── BOSS STYLE: the approved composition, drawn in the approved order,
    // pixel-identical to the round the owner green-lit ("Do not change boss
    // scenes"). Kept as its own branch on purpose. ──
    if (plan.style === 'boss') {
        // stage wash behind the tower
        if (plan.enemy) {
            const wx = plan.enemy.cx, wy = plan.enemy.gy - plan.enemy.h * 0.34;
            const wr = plan.enemy.h * 0.92;
            const wash = ctx.createRadialGradient(wx, wy, wr * 0.18, wx, wy, wr);
            wash.addColorStop(0, 'rgba(6,4,12,0.5)');
            wash.addColorStop(0.62, 'rgba(6,4,12,0.28)');
            wash.addColorStop(1, 'rgba(6,4,12,0)');
            ctx.fillStyle = wash;
            ctx.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
        }
        // flank allies stand BEHIND the tower
        for (const a of plan.allies || []) {
            await drawActorGrounded(ctx, a.art || null, a.cx, a.gy, a.h, { alpha: 0.92, flip: a.flip });
        }
        if (plan.enemy && plan.enemy.art) {
            const drawn = await drawActorGrounded(ctx, plan.enemy.art, plan.enemy.cx, plan.enemy.gy, plan.enemy.h,
                { flip: plan.enemy.flip, tint: opts.hitEnemy ? HIT_TINT : null,
                  shadowBoost: 1.45, shadowRyMin: 14, pixelSnap: false });
            const headTop = plan.enemy.gy - (drawn ? drawn.h : plan.enemy.h);
            if (live.enemyAlive) {
                pillLocal(ctx, plan.enemy.cx, headTop - 14, plan.enemy.name, 'bold 14px sans-serif', 10,
                    plan.enemy.isBoss ? 'rgba(90,20,14,0.95)' : 'rgba(26,21,13,0.95)',
                    plan.enemy.isBoss ? 'rgba(255,196,87,0.95)' : 'rgba(61,48,19,0.95)', '#FFFFFF');
                segBarLocal(ctx, plan.enemy.cx, headTop + 2, 150, 11,
                    live.enemyHp / live.enemyMaxHp, '#d63c14', '#f59d2a');
                if (opts.activeActor === 'enemy') {
                    await roomScene.drawTurnCrystal(ctx, plan.enemy.cx, headTop - 40, plan.enemy.h, 14);
                }
            }
        }
        if (plan.player && plan.player.file) {
            const drawn = await drawGroundedSprite(ctx, [path.join(RPGASSET, 'characters', 'clean'),
                                                        path.join(RPGASSET, 'characters')],
                plan.player.file, plan.player.cx, plan.player.gy, plan.player.h,
                { flip: !!plan.player.flip, shadowBoost: 1.25, shadowRyMin: 10 });
            const headTop = plan.player.gy - (drawn ? drawn.h : plan.player.h);
            pillLocal(ctx, plan.player.cx, plan.player.gy + 22, safeName(opts.playerName || 'You', 16),
                'bold 13px sans-serif', 10, 'rgba(26,21,13,0.95)', 'rgba(61,48,19,0.95)', '#FFFFFF');
            segBarLocal(ctx, plan.player.cx, plan.player.gy + 40, 112, 11, live.hp / live.maxHp, '#d63c14', '#f59d2a');
            segBarLocal(ctx, plan.player.cx, plan.player.gy + 56, 92, 8, live.energy / live.maxEnergy, '#12d7f5', '#0a86c8');
            if (opts.activeActor === 'player') {
                await roomScene.drawTurnCrystal(ctx, plan.player.cx + 34, headTop, plan.player.h, 14);
            }
        }
        await drawFloorBanner(ctx, 26, 16, `FLOOR ${plan.floor}`);
        if (turnNum > 0) {
            pillLocal(ctx, W / 2, 34, `TURN ${turnNum}`, 'bold 13px sans-serif', 10,
                'rgba(139,26,43,0.94)', 'rgba(245,240,225,0.85)', '#F5F0E1');
        }
        await roomScene.drawHudPanel(ctx, {
            name: opts.playerName || 'You',
            hp: live.hp, maxHp: live.maxHp,
            energy: live.energy, maxEnergy: live.maxEnergy,
            state: opts.hudState || 'ABYSS',
        });
        return;
    }

    // ══ SIDE STYLE — rebuilt per the owner's visual audit ══
    // stage wash behind the enemy cluster (lifts dark silhouettes off the
    // stage the same way the boss wash does)
    if (plan.enemy) {
        const wx = plan.enemy.cx, wy = plan.enemy.gy - plan.enemy.h * 0.34;
        const wr = plan.enemy.h * 0.92;
        const wash = ctx.createRadialGradient(wx, wy, wr * 0.18, wx, wy, wr);
        wash.addColorStop(0, 'rgba(6,4,12,0.42)');
        wash.addColorStop(0.62, 'rgba(6,4,12,0.24)');
        wash.addColorStop(1, 'rgba(6,4,12,0)');
        ctx.fillStyle = wash;
        ctx.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
    }
    // the player gets the same silhouette-lift wash — without it the sprite
    // sat on the bare near-camera tiles like a pasted-on widget
    if (plan.player && plan.player.file) {
        const wx = plan.player.cx, wy = plan.player.gy - plan.player.h * 0.36;
        const wr = plan.player.h * 0.80;
        const wash = ctx.createRadialGradient(wx, wy, wr * 0.20, wx, wy, wr);
        wash.addColorStop(0, 'rgba(6,4,12,0.36)');
        wash.addColorStop(0.62, 'rgba(6,4,12,0.20)');
        wash.addColorStop(1, 'rgba(6,4,12,0)');
        ctx.fillStyle = wash;
        ctx.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
    }

    // audit §4 z-order rule: sort EVERY actor by foot Y (lower draws later),
    // sprites first in one pass, plates after — plates can never be covered.
    ctx.imageSmoothingEnabled = false;   // audit §F: no mixed smoothing
    const spritePass = [];
    for (const p of plan.pack || []) {
        if (!p.art) continue;
        spritePass.push({ gy: p.gy, run: async () => {
            const d = await drawActorGrounded(ctx, p.art, p.cx, p.gy, p.h,
                { flip: p.flip, alpha: p.alpha, shadowBoost: 2.05, shadowRyMin: 16, shadowWide: true, pixelSnap: true });
            if (d) p.drawnH = d.h;
        } });
    }
    if (plan.enemy && plan.enemy.art) {
        spritePass.push({ gy: plan.enemy.gy, run: async () => {
            // owner 2026-10-09 14:07Z: a player hit flashes the target RED for
            // that turn render (opts.hitEnemy — per-turn, never frozen)
            const d = await drawActorGrounded(ctx, plan.enemy.art, plan.enemy.cx, plan.enemy.gy, plan.enemy.h,
                { flip: plan.enemy.flip, tint: opts.hitEnemy ? HIT_TINT : null,
                  shadowBoost: plan.kind === 'summon' ? 2.05 : 2.1, shadowRyMin: 16, shadowWide: true, pixelSnap: true });
            if (d) plan.enemy.drawnH = d.h;
        } });
    }
    for (const a of plan.allies || []) {
        if (!a.art) continue;
        spritePass.push({ gy: a.gy, run: async () => {
            const d = await drawActorGrounded(ctx, a.art, a.cx, a.gy, a.h,
                { alpha: a.alpha || 0.96, flip: a.flip, shadowBoost: 1.95, shadowRyMin: 15, shadowWide: true, pixelSnap: true });
            if (d) a.drawnH = d.h;
        } });
    }
    if (plan.player && plan.player.file) {
        // graded art (abyss ambient) through the SAME grounded path as every
        // other actor — one shadow/flip/snap contract for the whole scene.
        // AMBIENT-ADAPTIVE (VLM critic: stage 1's player corner is much darker
        // than the party stages', so the fixed veil left a 2.3× luminance
        // sticker ratio there while 1.36× passed elsewhere): sample the
        // backdrop under the player slot and scale the veil to the scene.
        let ambient = 0.30;
        try {
            const sx0 = Math.max(0, Math.round(plan.player.cx - plan.player.h * 0.45));
            const sy0 = Math.max(0, Math.round(plan.player.gy - plan.player.h));
            const sw0 = Math.min(Math.round(plan.player.h * 0.9), W - sx0);
            const sh0 = Math.min(Math.round(plan.player.h), H - sy0);
            if (sw0 > 4 && sh0 > 4) {
                const d = ctx.getImageData(sx0, sy0, sw0, sh0).data;
                let sum = 0, n = 0;
                for (let i = 0; i < d.length; i += 64) {
                    sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; n++;
                }
                const lum = sum / Math.max(1, n);   // 0..255 backdrop luminance
                ambient = Math.max(0.24, Math.min(0.55, 0.62 - (lum / 255) * 0.62));
            }
        } catch (e) { /* sample fails → default veil */ }
        const art = await gradedPlayerArt(plan.player.file, ambient);
        spritePass.push({ gy: plan.player.gy, run: async () => {
            const d = await drawActorGrounded(ctx, art, plan.player.cx, plan.player.gy, plan.player.h,
                { flip: !!plan.player.flip, shadowBoost: 1.85, shadowRyMin: 14, shadowWide: true, pixelSnap: true });
            if (d) plan.player.drawnH = d.h;
        } });
    }
    spritePass.sort((x, y) => x.gy - y.gy);
    for (const s of spritePass) await s.run();

    // ── plates (audit §G): one name tag + HP bar per entity, fixed offsets
    // above each sprite's measured top, collision-checked, turn indicator
    // as a small status crystal BESIDE the active plate (never floating
    // over a head — owner defect: "floating blue crystal … no clear meaning") ──
    const plates = [];
    if (plan.enemy && plan.enemy.art && (live.ents ? live.ents[0].alive : live.enemyAlive)) {
        const top = plan.enemy.gy - (plan.enemy.drawnH || plan.enemy.h);
        const isWild = plan.kind === 'summon';
        const label = isWild ? String(plan.wildSpecies || '').toUpperCase() : plan.enemy.name;
        const e = live.ents ? live.ents[0] : { hp: live.enemyHp, maxHp: live.enemyMaxHp };
        const nameRect = pillSize(ctx, label, 'bold 14px sans-serif', 10);
        plates.push({
            x: plan.enemy.cx, nameCy: top - PLATE.name, barCy: top - PLATE.bar,
            badgeCy: isWild ? top - PLATE.badge : null,
            badge: isWild ? 'WILD SUMMON' : null,
            name: label, nameFont: 'bold 14px sans-serif', padX: 10,
            nameBg: 'rgba(26,21,13,0.95)', nameBorder: 'rgba(61,48,19,0.95)',
            hp: e.hp, maxHp: e.maxHp, barW: 150, barH: 11,
            fill: ['#d63c14', '#f59d2a'], rect: nameRect,
            active: opts.activeActor === 'enemy', prio: 0,
        });
    }
    (plan.pack || []).forEach((p, i) => {
        if (!p.art) return;
        const e = live.ents && live.ents[i + 1];
        if (!e || !e.alive) return;
        const top = p.gy - (p.drawnH || p.h);
        const nameRect = pillSize(ctx, p.plateName || p.name || '???', 'bold 12px sans-serif', 8);
        plates.push({
            x: p.cx, nameCy: top - PLATE.name + 2, barCy: top - PLATE.bar + 2,
            name: p.plateName || p.name || '???', nameFont: 'bold 12px sans-serif', padX: 8,
            nameBg: 'rgba(24,20,14,0.92)', nameBorder: 'rgba(56,44,20,0.9)',
            hp: e.hp, maxHp: e.maxHp, barW: 116, barH: 9,
            fill: ['#c44418', '#e8873a'], rect: nameRect, active: false, prio: 1,
        });
    });
    (plan.allies || []).forEach((a, i) => {
        if (!a.art) return;
        const s = live.allies && live.allies[i];
        if (!s) return;
        const top = a.gy - (a.drawnH || a.h);
        const nameRect = pillSize(ctx, a.name || 'SUMMON', 'bold 12px sans-serif', 8);
        plates.push({
            x: a.cx, nameCy: top - PLATE.name + 4, barCy: top - PLATE.bar + 4,
            name: a.name || 'SUMMON', nameFont: 'bold 12px sans-serif', padX: 8,
            nameBg: 'rgba(20,24,26,0.92)', nameBorder: 'rgba(38,66,74,0.9)',
            hp: s.hp, maxHp: s.maxHp, barW: 96, barH: 9,
            fill: ['#1fae5e', '#5fd88a'], rect: nameRect, active: false, prio: 2,
        });
    });
    plates.sort((x, y) => x.prio - y.prio);
    resolvePlateCollisions(ctx, plates);
    for (const p of plates) {
        if (p.badge) {
            pillLocal(ctx, p.x, p.badgeCy, p.badge, 'bold 10px sans-serif', 8,
                'rgba(88,34,120,0.94)', 'rgba(216,150,255,0.9)', '#EFD9FF');
        }
        pillLocal(ctx, p.x, p.nameCy, p.name, p.nameFont, p.padX, p.nameBg, p.nameBorder, '#FFFFFF');
        segBarLocal(ctx, p.x, p.barCy, p.barW, p.barH, p.maxHp ? p.hp / p.maxHp : 0, p.fill[0], p.fill[1]);
        if (p.active) {
            // small turn-status crystal beside the active plate (inline with
            // the name line — same asset as the main game's indicator)
            await roomScene.drawTurnCrystal(ctx, p.x + p.rect.w / 2 + 18, p.nameCy + 12, 78, 0);
        }
    }

    // ── player plate: ABOVE the head like every other actor (owner 14:07Z:
    // the under-feet tag+bars read as a hub UI widget pinned to the corner;
    // §G says one tag+bar stack per entity — same geometry as the enemies) ──
    if (plan.player && plan.player.file) {
        const top = plan.player.gy - (plan.player.drawnH || plan.player.h);
        const label = safeName(opts.playerName || 'You', 16);
        pillLocal(ctx, plan.player.cx, top - 52, label,
            'bold 13px sans-serif', 10, 'rgba(26,21,13,0.95)', 'rgba(61,48,19,0.95)', '#FFFFFF');
        segBarLocal(ctx, plan.player.cx, top - 12, 112, 11, live.hp / live.maxHp, '#d63c14', '#f59d2a');
        segBarLocal(ctx, plan.player.cx, top - 30, 92, 8, live.energy / live.maxEnergy, '#12d7f5', '#0a86c8');
        if (opts.activeActor === 'player') {
            const pw = pillSize(ctx, label, 'bold 13px sans-serif', 10);
            await roomScene.drawTurnCrystal(ctx, plan.player.cx + pw.w / 2 + 18, top - 40, 78, 0);
        }
    }

    // ── floor banner (top-left; owner 08:43Z: floor number rides a banner —
    // close to the regular dungeon's, but the abyss variant) + turn pill ──
    await drawFloorBanner(ctx, 26, 16, `FLOOR ${plan.floor}`);
    if (turnNum > 0) {
        pillLocal(ctx, W / 2, 34, `TURN ${turnNum}`, 'bold 13px sans-serif', 10,
            'rgba(139,26,43,0.94)', 'rgba(245,240,225,0.85)', '#F5F0E1');
    }

    // ── the default-encounter HUD panel (bottom-left, real ui assets) ──
    await roomScene.drawHudPanel(ctx, {
        name: opts.playerName || 'You',
        hp: live.hp, maxHp: live.maxHp,
        energy: live.energy, maxEnergy: live.maxEnergy,
        state: opts.hudState || 'ABYSS',
    });
}

// ── render entry: START | TURN — same return shape as the Go path so the
// existing send/timeout/fallback logic in guildAdventure applies unchanged ──
async function renderAbyssCombat(state, { phase = 'START', turnInfo = null, turnOrderStr = null, planOpts = null } = {}) {
    try {
        if (!state || !state.isAbyss) return { success: false };
        const sessionKey = state.sessionKey;
        let plan;
        if (phase === 'START' || !sessionKey) {
            plan = await planCombatLayout(state, planOpts || {});
            if (sessionKey) layoutFor(sessionKey).plan = plan;
        } else {
            plan = (layoutFor(sessionKey).plan) || await planCombatLayout(state);
            if (!layoutFor(sessionKey).plan) layoutFor(sessionKey).plan = plan;
        }
        const enemies = state.enemies || [];
        const live = liveEntities(state, enemies);   // per-entity pools (audit §G)
        const actor = turnInfo && turnInfo.actor;
        let activeActor = null;
        if (phase === 'TURN' && actor) activeActor = actor.isEnemy ? 'enemy' : 'player';
        // owner 2026-10-09 14:07Z: "the damage indicator should be red" — a
        // PLAYER turn that dealt damage (or explicitly targeted the active
        // enemy) flashes the enemy RED for THIS render. Passed per-render —
        // never frozen into the cached plan.
        let hitEnemy = false;
        if (phase === 'TURN' && activeActor === 'player' && enemies.length) {
            const e0 = enemies[0];
            const t = turnInfo.target;
            hitEnemy = Number(turnInfo.damage) > 0
                || !!(t && (t === e0 || (t.id && e0.id && t.id === e0.id)));
        }

        ensureFonts();
        const c = createCanvas(W, H);
        const ctx = c.getContext('2d');
        // the reference always shows the TURN badge — START renders as TURN 1
        await drawCombatScene(ctx, plan, live, {
            turnNumber: (turnInfo && turnInfo.turnNumber) || 1,
            activeActor,
            hitEnemy,
            playerName: (state.players && state.players[0] && state.players[0].name) || 'You',
            hudState: phase === 'START' ? 'ABYSS' : `TURN ${(turnInfo && turnInfo.turnNumber) || ''}`.trim(),
        });
        const buffer = c.toBuffer('image/png');

        const combatIntegration = require('./combatIntegration');
        const caption = phase === 'TURN'
            ? combatIntegration.generateTurnCaption(state.players, state.enemies, turnInfo || {})
            : combatIntegration.generateStartCaption(state.players, state.enemies, {
                rank: state.dungeonRank,
                turnOrderStr: turnOrderStr || null,
                theme: { theme: 'The Abyss', description: 'The dark rises to meet you.' },
            });
        return { success: true, buffer, caption };
    } catch (e) {
        console.error('[AbyssScene] render failed:', e?.message);
        return { success: false };
    }
}

// ══════════════════════════════════════════════════════════════════════════
// §3 FLOOR DESCENT CARD — the descent is the Abyss's identity, so the card
// IS the world-map language: a stack of descending rings (shallower floors
// higher and smaller, deeper floors lower and larger), the CURRENT floor
// highlighted bold amber with the player standing on it, the unseen below
// fading into darkness. Preserves the useful info the old Go card carried
// (tier/danger pill, the ledger of commands).
// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// mirror of abyssSystem.isBossFloor (kept pure here — no mongoose pull)
function isBossFloorMirror(floor) {
    const f = Number(floor) || 1;
    if (f >= 11 && f <= 20) return f % 3 === 0;
    return f % 5 === 0;
}
// tiny vector marker (no font dependency — canvas glyph coverage is unsafe)
function drawSwordCross(ctx, cx, cy, s, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, s * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s); ctx.stroke();
    ctx.restore();
}

// ring-stack motion: phase p ∈ [0,1) maps to a vertical offset in LOGICAL px.
// p=0 → -AMP (stack at its highest), p=0.5 → +AMP (lowest), smooth sine both
// ways — the stack "slowly descends, then starts back up again".
const RING_AMP = 120;
function ringOffsetForPhase(p) {
    return -RING_AMP * Math.cos(2 * Math.PI * p);
}

// the SIMPLE descent-shaft backdrop shared by §3 floor-descent card and §4
// result card (owner 20:48Z: combat-family art is FORBIDDEN on these cards —
// "use something simple"). No image asset, no fallback, no combat pool: a
// quiet vertical gradient + one soft center glow + a vignette. Regression to
// combat art is structurally impossible — combat art is not referenced here.
// `sink` (0..1) darkens the whole shaft for result moments.
function paintSimpleShaft(ctx, sink = 0) {
    const gShaft = ctx.createLinearGradient(0, 0, 0, FH);
    gShaft.addColorStop(0, '#0a0812');
    gShaft.addColorStop(0.55, '#120d1c');
    gShaft.addColorStop(1, '#060409');
    ctx.fillStyle = gShaft; ctx.fillRect(0, 0, FW, FH);
    const gGlow = ctx.createRadialGradient(FW / 2, 700, 60, FW / 2, 700, 620);
    gGlow.addColorStop(0, 'rgba(96,66,158,0.14)');
    gGlow.addColorStop(1, 'rgba(96,66,158,0)');
    ctx.fillStyle = gGlow; ctx.fillRect(0, 0, FW, FH);
    const gVig = ctx.createRadialGradient(FW / 2, FH / 2, FH * 0.30, FW / 2, FH / 2, FH * 0.80);
    gVig.addColorStop(0, 'rgba(0,0,0,0)');
    gVig.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = gVig; ctx.fillRect(0, 0, FW, FH);
    if (sink > 0) {
        ctx.fillStyle = `rgba(4,3,8,${Math.min(0.6, sink).toFixed(3)})`;
        ctx.fillRect(0, 0, FW, FH);
    }
}

async function paintFloorCard(ctx, payload = {}, off = 0) {
    const floor = Math.max(1, Number(payload.floor) || 1);
    const tier = safeName(payload.tier || 'F', 12);
    const mult = Number(payload.mult) || 1;

    paintSimpleShaft(ctx);

    // ── header: THE ABYSS ──
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '58px "Cinzel Deco", serif';
    ctx.fillStyle = 'rgba(212,175,96,0.16)';
    ctx.fillText('THE ABYSS', FW / 2 + 3, 106 + 3);
    ctx.fillStyle = '#d8b45a';
    ctx.fillText('THE ABYSS', FW / 2, 106);
    ctx.strokeStyle = 'rgba(216,180,90,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(FW / 2 - 320, 136); ctx.lineTo(FW / 2 + 320, 136); ctx.stroke();
    ctx.fillStyle = 'rgba(216,180,90,0.9)';
    ctx.beginPath(); ctx.arc(FW / 2, 136, 4, 0, Math.PI * 2); ctx.fill();

    // ── player nameplate (left, reference-style box) ──
    const playerName = safeName(payload.playerName || 'DESCENDER', 18);
    ctx.font = '26px "Cinzel", serif';
    const pw = Math.max(240, ctx.measureText(playerName).width + 56);
    ctx.fillStyle = 'rgba(12,9,20,0.92)';
    roundRectPath(ctx, 44, 168, pw, 52, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(216,180,90,0.75)'; ctx.lineWidth = 2;
    roundRectPath(ctx, 44, 168, pw, 52, 8); ctx.stroke();
    ctx.fillStyle = '#e8dcc0'; ctx.textAlign = 'left';
    ctx.fillText(playerName, 68, 203);
    ctx.textAlign = 'center';

    // ── tier / danger pill ──
    pillLocal(ctx, FW / 2, 252, `TIER ${tier}   DANGER x${mult.toFixed(1)}`, 'bold 22px "Cinzel", serif', 18,
        'rgba(24,16,40,0.94)', 'rgba(139,97,195,0.85)', '#cdbdf0');

    // ── the descending ring stack (drifts by `off` — the descent loop) ──
    const CX = FW / 2;
    const CENTER_Y = 720 + off;         // current floor rides the stack
    const RING_GAP = 96;
    const FIRST_Y = 340 + off;          // shallowest drawn ring
    const range = [];
    for (let d = -4; d <= 3; d++) {
        const f = floor + d;
        if (f < 1) continue;   // (user-side judge): no F-3..F0 above F1
        const y = CENTER_Y + d * RING_GAP;
        if (y < FIRST_Y - 60 || y > 1100) continue;
        range.push({ floor: f, d, y });
    }
    for (const r of range) {
        const isCur = r.d === 0;
        const isPast = r.d < 0;
        // recession (VLM critic): looking DOWN a shaft, deeper rings are
        // FARTHER — smaller and dimmer; passed floors above sit closer to the
        // eye and read larger. The old grow-toward-bottom read as rings
        // approaching the viewer.
        const rx = 205 - r.d * 22;
        const ry = Math.max(14, rx * 0.20);
        const a = isCur ? 1 : isPast ? Math.max(0.22, 0.42 + r.d * 0.05) : Math.max(0.14, 0.38 - r.d * 0.07);
        // glow for the current ring
        if (isCur) {
            ctx.save();
            ctx.shadowColor = 'rgba(240,182,74,0.85)';
            ctx.shadowBlur = 34;
            ctx.strokeStyle = 'rgba(240,182,74,0.95)';
            ctx.lineWidth = 5;
            ctx.beginPath(); ctx.ellipse(CX, r.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
            ctx.fillStyle = 'rgba(240,182,74,0.10)';
            ctx.beginPath(); ctx.ellipse(CX, r.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.strokeStyle = isBossFloorMirror(r.floor)
                ? `rgba(214,88,60,${(a * 0.95).toFixed(3)})`
                : `rgba(150,140,190,${a.toFixed(3)})`;
            ctx.lineWidth = isBossFloorMirror(r.floor) ? 3 : 1.6;
            ctx.beginPath(); ctx.ellipse(CX, r.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = `rgba(16,12,30,${(0.42 * a).toFixed(3)})`;
            ctx.beginPath(); ctx.ellipse(CX, r.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
            if (isBossFloorMirror(r.floor)) {
                drawSwordCross(ctx, CX + rx - 24, r.y - ry - 11, 7, `rgba(230,120,90,${a.toFixed(3)})`);
                // (user-side judge): an unexplained X reads as a bug — label it
                ctx.font = '11px "Cinzel", serif';
                ctx.fillStyle = `rgba(230,120,90,${Math.min(0.9, a * 1.4).toFixed(3)})`;
                ctx.textAlign = 'left';
                ctx.fillText('BOSS', CX + rx + 14, r.y + 4);
                ctx.textAlign = 'center';
            }
        }
        // left label
        ctx.font = `${isCur ? 19 : 14}px "Cinzel", serif`;
        ctx.fillStyle = isCur ? '#f0b64a' : `rgba(190,180,215,${Math.min(0.85, a * 1.6).toFixed(3)})`;
        ctx.textAlign = 'right';
        ctx.fillText(`F${r.floor}`, CX - rx - 14, r.y + 5);
        ctx.textAlign = 'center';
    }

    // ── the player, standing ON the current ring's near edge (§2) ──
    const curRx = 205;
    const curRy = Math.max(14, curRx * 0.20);
    const spriteFile = playerSpriteFileFor({
        class: { id: payload.playerClassId || 'FIGHTER' },
        spriteIndex: Number(payload.playerSpriteIndex) || 0,
    });
    if (spriteFile) {
        await drawGroundedSprite(ctx,
            [path.join(RPGASSET, 'characters', 'clean'), path.join(RPGASSET, 'characters')],
            spriteFile, CX - 92, CENTER_Y + curRy * 0.55, 118);
    }

    // ── current-floor title block — FIXED position (does NOT ride the ring
    // stack's ±120px drift) on a scrim plate: the rings sweep BEHIND the plate
    // every loop, so the title can never collide with the amber ring's glow
    // (reviewer blocker on the first render) ──
    const TB = { x: 512, y: 668, w: FW - 512 - 44, h: 108 };
    const tbFill = ctx.createLinearGradient(TB.x, 0, TB.x + TB.w, 0);
    tbFill.addColorStop(0, 'rgba(12,9,20,0.55)');   // soft left edge — the ring
    tbFill.addColorStop(0.35, 'rgba(12,9,20,0.88)');// arcs stay readable behind
    tbFill.addColorStop(1, 'rgba(12,9,20,0.88)');
    ctx.fillStyle = tbFill;
    roundRectPath(ctx, TB.x, TB.y, TB.w, TB.h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(216,180,90,0.4)'; ctx.lineWidth = 2;
    roundRectPath(ctx, TB.x, TB.y, TB.w, TB.h, 10); ctx.stroke();
    ctx.textAlign = 'right';
    ctx.font = '46px "Cinzel Deco", serif';
    ctx.fillStyle = '#f0b64a';
    ctx.fillText(`FLOOR ${floor}`, FW - 68, TB.y + 58);
    ctx.font = '17px "Cinzel", serif';
    ctx.fillStyle = 'rgba(220,205,240,0.85)';
    const enc = payload.encounterType || 'combat';
    const flavor = enc === 'treasure' ? 'something glitters below'
        : enc === 'event' ? 'the dark whispers -'
        : enc === 'wild_summon' ? (payload.enemyName ? `a wild ${safeName(payload.enemyName, 14)} stirs` : 'a wild presence stirs')
        : payload.isBoss ? 'a boss bars the way'
        : payload.enemyName ? `${safeName(payload.enemyName, 16)} waits below`
        : 'something waits below';
    ctx.fillText(flavor, FW - 68, TB.y + 88);
    ctx.textAlign = 'center';

    // ── the ledger (bottom panel — preserved from the old card) ──
    const rows = Array.isArray(payload.rows) && payload.rows.length ? payload.rows : (
        // next-boss is computed from the same mirror the ring X-marks use, so
        // the ledger can never contradict the art (VLM critic: F18 marked on a
        // card whose ledger claimed "EVERY 5TH")
        (() => {
            let nb = null;
            for (let f = floor; f <= floor + 12; f++) { if (isBossFloorMirror(f)) { nb = f; break; } }
            return [
                { label: 'NEXT BOSS', value: nb ? `FLOOR ${nb}` : 'WATCH THE MARKS' },
                { label: 'FIGHT', value: '.combat attack' },
                { label: 'TREASURE', value: '.abyss collect' },
                { label: 'EVENTS', value: '.abyss choose 1|2' },
                { label: 'EXTRACT', value: '.abyss retreat' },
            ];
        })());
    const LX = 60, LY = 1156, LW = FW - 120, LH = 268;
    ctx.fillStyle = 'rgba(10,8,18,0.94)';
    roundRectPath(ctx, LX, LY, LW, LH, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(216,180,90,0.6)'; ctx.lineWidth = 2;
    roundRectPath(ctx, LX, LY, LW, LH, 10); ctx.stroke();
    ctx.font = '22px "Cinzel", serif';
    ctx.fillStyle = '#d8b45a'; ctx.textAlign = 'center';
    ctx.fillText('T H E   L E D G E R', FW / 2, LY + 38);
    ctx.font = '20px "Cinzel", serif';
    rows.slice(0, 6).forEach((row, i) => {
        const y = LY + 74 + i * 30;
        ctx.fillStyle = 'rgba(205,189,240,0.75)';
        ctx.textAlign = 'left';
        ctx.fillText(String(row.label || '').slice(0, 18), LX + 28, y);
        ctx.fillStyle = '#efe6d0';
        ctx.textAlign = 'right';
        ctx.fillText(String(row.value || '').slice(0, 26), LX + LW - 28, y);
    });
    ctx.textAlign = 'center';
    ctx.font = 'italic 19px "IM Fell", serif';
    ctx.fillStyle = 'rgba(180,170,205,0.6)';
    ctx.fillText('the abyss hungers', FW / 2, LY + LH + 34);
}

// static PNG (original single-frame contract — also the animation fallback)
async function renderAbyssFloorCardPng(payload = {}) {
    try {
        ensureFonts();
        const c = createCanvas(FW, FH);
        const ctx = c.getContext('2d');
        await paintFloorCard(ctx, payload, 0);
        return c.toBuffer('image/png');
    } catch (e) {
        console.error('[AbyssScene] floor card failed:', e?.message);
        return null;
    }
}

// ══════════════════════════════════════════════════════════════════════════
// §4 RUN RESULT CARD — EXTRACTED / FALLEN (owner 14:07Z: "the abyss retreat
// still used the old image card style"). Same visual family as the descent
// card: shaft backdrop, descending rings, the descender on the current ring,
// ledger box — with an ascent light shaft when they make it out, and a red
// sink when they don't. Returns a PNG buffer (result cards are momentary,
// no loop), or null → callers keep their text fallback.
// ══════════════════════════════════════════════════════════════════════════
async function renderAbyssResultCard(payload = {}) {
    try {
        ensureFonts();
        // 🕳️ 2026-10-10 round-12: third outcome CLEARED — the per-floor
        // victory moment (owner: "the old victory and defeat cards are being
        // used for the abyss"). Same family, gold beam, floor-reward ledger.
        const oc = String(payload.outcome || 'EXTRACTED').toUpperCase();
        const outcome = oc === 'FALLEN' ? 'FALLEN' : (oc === 'CLEARED' ? 'CLEARED' : 'EXTRACTED');
        const fallen = outcome === 'FALLEN';
        const cleared = outcome === 'CLEARED';
        const floor = Math.max(1, Number(payload.floor) || 1);
        const c = createCanvas(FW, FH);
        const ctx = c.getContext('2d');

        // backdrop: the simple shaft, sunk deeper for a result moment
        // (owner 20:48Z — combat-family art is forbidden on these cards)
        paintSimpleShaft(ctx, fallen ? 0.34 : 0.20);

        // header — same family as the descent card
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.font = '44px "Cinzel Deco", serif';
        ctx.fillStyle = 'rgba(212,175,96,0.16)';
        ctx.fillText('THE ABYSS', FW / 2 + 2, 118 + 2);
        ctx.fillStyle = '#d8b45a';
        ctx.fillText('THE ABYSS', FW / 2, 118);
        ctx.strokeStyle = 'rgba(216,180,90,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(FW / 2 - 250, 148); ctx.lineTo(FW / 2 + 250, 148); ctx.stroke();

        // outcome word
        ctx.font = '78px "Cinzel Deco", serif';
        ctx.fillStyle = fallen ? 'rgba(20,6,8,0.85)' : 'rgba(24,16,6,0.85)';
        ctx.fillText(outcome, FW / 2 + 3, 268 + 3);
        ctx.fillStyle = fallen ? '#d4503c' : '#e8c975';
        ctx.fillText(outcome, FW / 2, 268);

        // score pill
        const score = Math.max(0, Number(payload.score) || 0);
        const pillText = fallen
            ? `SCORE ${score.toLocaleString()} · -90% LOOT LOST`
            : cleared
                ? `SCORE ${score.toLocaleString()} · FLOOR ${floor} CLEARED`
                : `SCORE ${score.toLocaleString()} · 100% LOOT KEPT`;
        pillLocal(ctx, FW / 2, 330, pillText, 'bold 22px "Cinzel", serif', 18,
            fallen ? 'rgba(30,10,12,0.94)' : 'rgba(24,16,40,0.94)',
            fallen ? 'rgba(212,80,60,0.85)' : 'rgba(139,97,195,0.85)',
            fallen ? '#f0c0b0' : '#cdbdf0');

        // ascent light shaft (extracted / cleared) / red sink (fallen) behind
        // the rings — tapered soft-edged beam + a light pool on the current
        // ring, never a hard-edged rectangle (reviewer defect on the first
        // render). cleared beams gold like extracted: a victory moment.
        const CX = FW / 2;
        const CENTER_Y = 800;
        if (!fallen) {
            const beam = ctx.createLinearGradient(0, 210, 0, CENTER_Y);
            beam.addColorStop(0, 'rgba(232,201,117,0)');
            beam.addColorStop(1, 'rgba(232,201,117,0.16)');
            ctx.fillStyle = beam;
            ctx.beginPath();
            ctx.moveTo(CX - 64, 210);
            ctx.lineTo(CX + 64, 210);
            ctx.lineTo(CX + 176, CENTER_Y - 6);
            ctx.lineTo(CX - 176, CENTER_Y - 6);
            ctx.closePath();
            ctx.fill();
            ctx.save();
            ctx.translate(CX, CENTER_Y);
            ctx.scale(1, 0.36);
            const pool = ctx.createRadialGradient(0, 0, 12, 0, 0, 235);
            pool.addColorStop(0, 'rgba(232,201,117,0.20)');
            pool.addColorStop(1, 'rgba(232,201,117,0)');
            ctx.fillStyle = pool;
            ctx.beginPath(); ctx.arc(0, 0, 235, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        } else {
            const sink = ctx.createLinearGradient(0, CENTER_Y, 0, FH);
            sink.addColorStop(0, 'rgba(150,30,20,0)');
            sink.addColorStop(1, 'rgba(150,30,20,0.16)');
            ctx.fillStyle = sink;
            ctx.fillRect(0, CENTER_Y, FW, FH - CENTER_Y);
        }

        // ring stack: two passed floors above, current bold, two below fading
        const ringRange = [];
        for (let d = -2; d <= 2; d++) {
            const f = floor + d;
            if (f < 1) continue;
            ringRange.push({ floor: f, d, y: CENTER_Y + d * 96 });
        }
        for (const r of ringRange) {
            const isCur = r.d === 0;
            const isPast = r.d < 0;
            // same recession as the descent card: deeper = farther = smaller
            const rx = 168 - r.d * 18;
            const ry = Math.max(13, rx * 0.20);
            const a = isCur ? 1 : isPast ? Math.max(0.22, 0.40 + r.d * 0.06) : Math.max(0.14, 0.36 - r.d * 0.08);
            if (isCur) {
                ctx.save();
                ctx.shadowColor = fallen ? 'rgba(212,80,60,0.85)' : 'rgba(240,182,74,0.85)';
                ctx.shadowBlur = 30;
                ctx.strokeStyle = fallen ? 'rgba(224,96,72,0.95)' : 'rgba(240,182,74,0.95)';
                ctx.lineWidth = 5;
                ctx.beginPath(); ctx.ellipse(CX, r.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
                ctx.fillStyle = fallen ? 'rgba(212,80,60,0.10)' : 'rgba(240,182,74,0.10)';
                ctx.beginPath(); ctx.ellipse(CX, r.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.strokeStyle = `rgba(150,140,190,${a.toFixed(3)})`;
                ctx.lineWidth = 1.6;
                ctx.beginPath(); ctx.ellipse(CX, r.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = `rgba(16,12,30,${(0.42 * a).toFixed(3)})`;
                ctx.beginPath(); ctx.ellipse(CX, r.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
            }
            ctx.font = `${isCur ? 18 : 13}px "Cinzel", serif`;
            ctx.fillStyle = isCur ? (fallen ? '#e08a70' : '#f0b64a') : `rgba(190,180,215,${Math.min(0.85, a * 1.6).toFixed(3)})`;
            ctx.textAlign = 'right';
            ctx.fillText(`F${r.floor}`, CX - rx - 14, r.y + 5);
            ctx.textAlign = 'center';
        }

        // the descender, standing on the current ring (graded like combat)
        const curRx = 168, curRy = Math.max(13, curRx * 0.20);
        const spriteFile = playerSpriteFileFor({
            class: { id: payload.playerClassId || 'FIGHTER' },
            spriteIndex: Number(payload.playerSpriteIndex) || 0,
        });
        if (spriteFile) {
            const art = await gradedPlayerArt(spriteFile);
            await drawActorGrounded(ctx, art, CX + 86, CENTER_Y + curRy * 0.55, 100,
                { shadowBoost: 1.4, shadowRyMin: 10, pixelSnap: true });
        }

        // ledger box (bottom, reference-style trim)
        const ledgerRows = cleared
            ? [
                { label: 'XP EARNED', value: `+${Math.max(0, Number(payload.keptXp) || 0).toLocaleString()}` },
                { label: 'ZENI EARNED', value: `+${Math.max(0, Number(payload.keptGold) || 0).toLocaleString()}` },
                { label: 'RUNES', value: String(Math.max(0, Number(payload.runes) || 0)) },
                { label: 'MONSTERS', value: String(Math.max(0, Number(payload.monstersKilled) || 0)) },
                { label: 'BOSSES', value: String(Math.max(0, Number(payload.bossesKilled) || 0)) },
                { label: 'DEPTH', value: `FLOOR ${floor} / 200` },
            ]
            : [
            { label: 'XP KEPT', value: `+${Math.max(0, Number(payload.keptXp) || 0).toLocaleString()}` },
            { label: 'ZENI KEPT', value: `+${Math.max(0, Number(payload.keptGold) || 0).toLocaleString()}` },
            { label: 'RUNES', value: String(Math.max(0, Number(payload.runes) || 0)) },
            { label: 'MONSTERS', value: String(Math.max(0, Number(payload.monstersKilled) || 0)) },
            { label: 'BOSSES', value: String(Math.max(0, Number(payload.bossesKilled) || 0)) },
            { label: 'DEPTH', value: `FLOOR ${floor} / 200` },
        ];
        const BX = 92, BW = FW - BX * 2, BY = 1080, RH = 52, BH = ledgerRows.length * RH + 26;
        ctx.fillStyle = 'rgba(12,9,20,0.92)';
        roundRectPath(ctx, BX, BY, BW, BH, 10); ctx.fill();
        ctx.strokeStyle = fallen ? 'rgba(212,80,60,0.55)' : 'rgba(216,180,90,0.55)'; ctx.lineWidth = 2;
        roundRectPath(ctx, BX, BY, BW, BH, 10); ctx.stroke();
        ledgerRows.forEach((row, i) => {
            const ry2 = BY + 38 + i * RH;
            ctx.font = '20px "Cinzel", serif';
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(196,158,74,0.85)';
            ctx.fillText(row.label, BX + 34, ry2);
            ctx.font = 'bold 22px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillStyle = '#e8dcc0';
            ctx.fillText(row.value, BX + BW - 34, ry2 + 1);
            if (i < ledgerRows.length - 1) {
                ctx.strokeStyle = 'rgba(216,180,90,0.16)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(BX + 26, ry2 + 18); ctx.lineTo(BX + BW - 26, ry2 + 18); ctx.stroke();
            }
        });
        ctx.textAlign = 'center';

        // flavor line (the old cards carried one — kept as game copy)
        ctx.font = 'italic 18px "Cinzel", serif';
        ctx.fillStyle = fallen ? 'rgba(220,150,130,0.6)' : 'rgba(180,170,205,0.6)';
        ctx.fillText(fallen ? 'the abyss claims another'
            : cleared ? 'deeper it waits'
            : 'a wise extraction', FW / 2, BY + BH + 44);

        return c.toBuffer('image/png');
    } catch (e) {
        console.error('[AbyssScene] result card failed:', e?.message);
        return null;
    }
}

// animated: the ring stack slowly descends and starts back up at the lower
// side (owner brief). Returns a looping GIF buffer; falls back to the static
// PNG when the encoder or any frame fails. Buffer contract unchanged for
// callers — they probe isAnimatedCard() to set gifPlayback.
const FLOOR_GIF = { scale: 0.6, frames: 16, delayMs: 140 };
async function renderAbyssFloorCard(payload = {}) {
    try {
        const { encodeGif } = require('../utils/gif89a');
        if (!encodeGif) throw new Error('gif89a unavailable');
        const S = FLOOR_GIF.scale;
        const GW = Math.round(FW * S), GH = Math.round(FH * S);
        ensureFonts();
        const frames = [];
        for (let i = 0; i < FLOOR_GIF.frames; i++) {
            const c = createCanvas(GW, GH);
            const ctx = c.getContext('2d');
            ctx.setTransform(S, 0, 0, S, 0, 0);
            await paintFloorCard(ctx, payload, ringOffsetForPhase(i / FLOOR_GIF.frames));
            const data = ctx.getImageData(0, 0, GW, GH).data;
            frames.push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
        }
        const gif = encodeGif({ width: GW, height: GH, frames, delayMs: FLOOR_GIF.delayMs, loop: 0 });
        if (gif && gif.length > 100) return gif;
        throw new Error('gif encode empty');
    } catch (e) {
        console.error('[AbyssScene] animated floor card fell back to PNG:', e?.message);
        return renderAbyssFloorCardPng(payload);
    }
}

module.exports = {
    renderAbyssCombat, renderAbyssFloorCard, renderAbyssFloorCardPng, renderAbyssResultCard, clearLayout,
    planCombatLayout, bgFileForFloor, bgList, bgListRegular, bgDirFor, combatBgList,
    bgForEncounter, liveEntities, BG_META, coverTransform,
    enemyIdOf, resolveEnemyArt, resolveEnemyArtRegular, resolveSummonArt,
    enemyNativeFacing, ABYSS_REGULAR_ART, ENEMY_FACING, ABYSS_ART_OVERRIDES,
    isBossFloorMirror,
    HIT_TINT, HIT_GLOW,
    isAnimatedCard: (b) => { try { return require('../utils/gif89a').isGifBuffer(b); } catch (e) { return false; } },
    W, H, FW, FH,
};

