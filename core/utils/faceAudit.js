// ============================================
// TEMP - FACING AUDIT (47-l5) - REMOVE AFTER THE AUDIT CLOSES
// 16:41Z (#card): "If you missed the lich what else could
// you miss? Anyways. Add a temp test command that spams the gc with every
// class sprite in an environment facing right, so that I can visually
// inspect which ones aren't, add the class name as a caption and some info
// so that ik which one to tell you".
// `.j facetest [filter]` (owner-only) renders EVERY unique class sprite
// (profileCardRenderer.CLASS_SPRITE_SETS, deduped across class keys) inside
// an abyss environment plate, transformed EXACTLY as the live scene pipeline
// transforms it - abyssScene.playerArtFlipFor() decides the mirror, so
// natively-LEFT art is flipped and EVERYTHING in these renders should end
// up FACING RIGHT. Any sprite that still faces LEFT in its render is
// mis-tabled in PLAYER_ART_FACES_LEFT / PLAYER_ART_FACES_NEVER
// (core/rpg/abyssScene.js) - the owner replies with the file name and that
// row gets fixed (Go table synced in the same pass).
// TEMPORARY TOOL: delete this file + the `facetest` block in engine.js once
// the owner signs the orientation audit off. Nothing in gameplay requires
// it; it never runs on its own; owner-gated like `.j fx`.
// ============================================

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const RPGASSET = path.join(__dirname, '..', 'rpgasset');   // core/utils → core/rpgasset
const BG_PLATE = path.join(RPGASSET, 'backgrounds', 'background1.png');

const W = 810, H = 1080;
const GROUND_Y = H - 150;          // sprite feet line (same grounded contract)
const SPRITE_H = 640;              // drawn content height - big enough to judge head/eye direction
const SEND_GAP_MS = 600;           // per-image pacing (WhatsApp flood safety)
const BREATH_MS = 2500;            // longer pause every BATCH images
const BATCH = 12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// lazy requires - engine.js only touches this module when the owner fires
// the command, so boot cost is zero and cycles (profileCardRenderer ↔ scene
// modules) behave exactly like the lazy requires inside abyssScene itself.
let _pr = null, _abyss = null, _room = null;
function spriteSets() {
    if (!_pr) _pr = require('../rpg/profileCardRenderer').CLASS_SPRITE_SETS;
    return _pr;
}
function abyss() {
    if (!_abyss) _abyss = require('../rpg/abyssScene');
    return _abyss;
}
function room() {
    if (!_room) _room = require('../rpg/guildWar/roomScene');
    return _room;
}

// -- unique sprite list: CLASS_SPRITE_SETS flattened, deduped by exact file
// name, remembering every class key that shares the art (ninja files =
// NINJA + KAGE, scout files = SCOUT + RANGER, …) so the caption can name
// every class affected by a wrong row. --
function buildAuditList() {
    const sets = spriteSets();
    const byFile = new Map();
    for (const [cls, list] of Object.entries(sets)) {
        for (const f of (list || [])) {
            if (!f) continue;
            if (!byFile.has(f)) byFile.set(f, { file: f, classes: [] });
            const e = byFile.get(f);
            if (!e.classes.includes(cls)) e.classes.push(cls);
        }
    }
    return [...byFile.values()];
}

// -- LFS-stub-proof resolver: real PNG bytes only. The scene loaders try
// characters/clean first then characters/, and BOTH space and underscore
// spellings exist on disk (abyssScene._spriteNameVariants) - same walk here,
// plus a size gate so git-LFS pointer stubs (tiny ASCII text) never reach
// the image decoder (canvas throws "Unsupported image type" on those). --
function nameVariants(f) {
    const out = [f];
    if (/ \(/.test(f)) out.push(f.replace(/ \(/g, '_('));
    if (/_\(/.test(f)) out.push(f.replace(/_\(/g, ' ('));
    return out;
}
async function resolveSprite(file) {
    const dirs = [
        path.join(RPGASSET, 'characters', 'clean'),
        path.join(RPGASSET, 'characters'),
    ];
    for (const dir of dirs) {
        for (const name of nameVariants(file)) {
            const p = path.join(dir, name);
            try {
                const st = fs.statSync(p);
                if (!st.isFile() || st.size < 900) continue;   // LFS pointer ≈ 130-200 bytes
                const img = await loadImage(p);
                return { img, dir, name, p };
            } catch (e) { /* next candidate */ }
        }
    }
    return null;
}

// -- the verdict, verbatim from the live pipeline (playerArtFlipFor) - the
// caption tells the owner what the table currently believes so he can cite
// the file when a verdict is wrong. --
function verdictFor(file) {
    const { playerArtFlipFor, PLAYER_ART_FACES_NEVER } = abyss();
    const center = PLAYER_ART_FACES_NEVER.has(String(file || '').toLowerCase());
    if (center) return {
        flip: false, color: '#53d7ff', short: 'CENTER verdict (never flipped)',
        text: 'CENTER verdict - never flipped',
    };
    const flip = playerArtFlipFor(file);
    if (flip) return {
        flip: true, color: '#ffb84d', short: 'mirrored (native LEFT verdict)',
        text: 'MIRRORED - native LEFT verdict',
    };
    return {
        flip: false, color: '#7dff9a', short: 'native RIGHT (no flip)',
        text: 'native RIGHT - no flip',
    };
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// -- one audit card: environment plate + the sprite drawn through the SAME
// roomScene.drawGroundedSprite the scenes use (content-bbox grounding,
// hugging contact shadow, mirror transform) + burned-in label plate so the
// file is identifiable even when scrolling the spam fast. --
async function renderAuditCard(entry, n, total) {
    const res = await resolveSprite(entry.file);
    if (!res) return { error: 'NOT FOUND on disk (checked characters/clean + characters, space/underscore spellings)' };
    try { room().ensureFonts(); } catch (e) { /* fonts fall back to sans-serif */ }
    const v = verdictFor(entry.file);

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

 // environment: an abyss family background plate, cover-fit, dimmed so
 // sprite + plates read (fixed plate keeps orientation the ONLY variable)
    let bg = null;
    try { bg = await loadImage(BG_PLATE); } catch (e) { /* gradient fallback */ }
    if (bg) {
        const s = Math.max(W / bg.width, H / bg.height);
        const dw = bg.width * s, dh = bg.height * s;
        ctx.drawImage(bg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#241a33'); g.addColorStop(1, '#0d0a16');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = 'rgba(8,6,14,0.30)'; ctx.fillRect(0, 0, W, H);

 // the sprite - EXACTLY the scene draw: grounded on content bbox, foot
 // contact shadow, and the pipeline's mirror (everything must face RIGHT)
    await room().drawGroundedSprite(ctx, [res.dir], res.name, W / 2, GROUND_Y, SPRITE_H,
        { flip: v.flip, shadow: true });

 // top plate: #n/total · class(es) / file / verdict
    const classesLine = entry.classes.join(' · ');
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 30px "Cinzel", serif';
    const clsW = ctx.measureText(`#${n}/${total}  ${classesLine}`).width;
    ctx.font = '22px monospace';
    const fileW = ctx.measureText(entry.file).width;
    ctx.font = 'bold 22px "Cinzel", serif';
    const verW = ctx.measureText(v.text).width;
    const pw = Math.min(W - 52, Math.max(clsW, fileW, verW) + 48);
    roundRect(ctx, 26, 26, pw, 148, 12);
    ctx.fillStyle = 'rgba(10,8,18,0.82)'; ctx.fill();
    ctx.strokeStyle = 'rgba(216,180,90,0.45)'; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = '#f0b64a';
    ctx.font = 'bold 30px "Cinzel", serif';
    ctx.fillText(`#${n}/${total}  ${classesLine}`, 48, 68);
    ctx.fillStyle = '#e8e2f2';
    ctx.font = '22px monospace';
    ctx.fillText(entry.file, 48, 104);
    ctx.fillStyle = v.color;
    ctx.font = 'bold 22px "Cinzel", serif';
    ctx.fillText(v.text, 48, 138);

 // bottom reminder strip
    roundRect(ctx, 26, H - 92, W - 52, 56, 12);
    ctx.fillStyle = 'rgba(10,8,18,0.78)'; ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9ff0b0';
    ctx.font = 'bold 24px "Cinzel", serif';
    ctx.fillText('EVERY sprite here must FACE RIGHT ⇒', W / 2, H - 55);

    return { buffer: canvas.toBuffer('image/png'), verdict: v };
}

let _running = false;
async function handleCommand(sock, chatId, m, args, BOT_MARKER, reply) {
    if (_running) return reply(BOT_MARKER + '⚠️ facing audit already running - wait for it to finish.');
    _running = true;
    try {
        const q = String((args && args[0]) || '').toLowerCase().trim();
        let list = buildAuditList();
        const totalSets = list.length;
        if (q && q !== 'all') {
            list = list.filter((e) =>
                e.file.toLowerCase().includes(q) ||
                e.classes.join(' ').toLowerCase().includes(q));
        }
        if (!list.length) return reply(BOT_MARKER + `❌ no class sprite matches "${q}".`);
        const t0 = Date.now();
        await reply(BOT_MARKER +
            `🧪 FACING AUDIT - ${list.length} sprite renders incoming (of ${totalSets} unique files), one per message, transformed exactly as the live scene pipeline does. Every render should FACE RIGHT - reply the file name of any that doesn't. Filter: ${q || 'ALL'}`);
        let sent = 0;
        const missing = [];
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            const v = verdictFor(e.file);
            let r = null;
            try { r = await renderAuditCard(e, i + 1, list.length); }
            catch (err) { r = { error: (err && err.message) || 'render failed' }; }
            if (r.error) {
                missing.push(e.file);
                try { await sock.sendMessage(chatId, { text: BOT_MARKER + `⚠️ ${i + 1}/${list.length} ${e.file} - ${r.error}` }); } catch (e2) {}
            } else {
                const caption =
                    `🧪 FACING AUDIT ${i + 1}/${list.length}\n` +
                    `class: ${e.classes.join(', ')}\n` +
                    `file: ${e.file}\n` +
                    `pipeline: ${v.short}\n` +
                    `should face RIGHT → reply this file name if it faces LEFT`;
                try {
                    await sock.sendMessage(chatId, { image: r.buffer, caption });
                    sent++;
                } catch (err) {
                    try { await sock.sendMessage(chatId, { text: BOT_MARKER + `⚠️ send failed for ${e.file}: ${(err && err.message) || err}` }); } catch (e2) {}
                }
            }
            await sleep(SEND_GAP_MS);
            if ((i + 1) % BATCH === 0) await sleep(BREATH_MS);
        }
        const secs = Math.round((Date.now() - t0) / 1000);
        let done = BOT_MARKER + `✅ facing audit done - ${sent}/${list.length} renders sent in ${secs}s. Reply with the file names that face the wrong way.`;
        if (missing.length) done += `\n❌ missing on disk (${missing.length}): ${missing.join(', ')}`;
        await reply(done);
    } catch (err) {
        try { await reply(BOT_MARKER + `❌ facing audit crashed: ${(err && err.message) || err}`); } catch (e2) {}
    } finally {
        _running = false;
    }
}

// test surface (scripts/ QA + the 47-l5 render samples) - additive only
module.exports = { handleCommand, buildAuditList, resolveSprite, renderAuditCard, verdictFor };
