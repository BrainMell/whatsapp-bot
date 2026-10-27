'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// qa26b_vfx_r2 — Task 26 round-2 QA: renders the classes the owner called out
// (REAPER real scythe + shrink, DRAGON_LORD inverted dragon, DRAGON_GOD shrink,
// MAGE/APPRENTICE real meteors, CHRONOMANCER magic clock) plus a FIGHTER
// regression (must be byte-rendering unchanged path), then extracts key frames
// into a contact sheet for the visual pass.
// Usage: node scripts/qa26b_vfx_r2.js <outDir>
// Needs the bot's node_modules (NODE_PATH) + ffmpeg on PATH.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CASES = [
    ['REAPER', 3], ['DRAGON_LORD', 3], ['DRAGON_GOD', 3],
    ['MAGE', 3], ['APPRENTICE', 3], ['CHRONOMANCER', 3],
    ['DOOMSLAYER', 3], ['FIGHTER', 3], ['TIMELORD', 3],
];

// frame seconds to extract per class (windup / impact / late)
const FRAMES = (cid) => {
    const imp = { DRAGON_GOD: 2.55, DRAGON_LORD: 1.95, REAPER: 1.75, CHRONOMANCER: 1.05, TIMELORD: 1.3 }[cid] || 1.05;
    return [Math.max(0.15, imp - 0.7).toFixed(2), imp.toFixed(2), (imp + 0.55).toFixed(2)];
};

(async () => {
    const outDir = process.argv[2] || '/tmp/vfxqa26b';
    fs.mkdirSync(outDir, { recursive: true });
    const skillVfx = require('../core/rpg/skillVfx');
    const ultFx = require('../core/rpg/ultimateFx');
    const stage = require('../core/rpg/vfxPreviewStage')(1);
    const sigs = skillVfx.SIGNATURE_SKILLS;

    const manifest = [];
    for (const [cid, lv] of CASES) {
        const entry = sigs[cid];
        if (!entry) { manifest.push({ cid, ok: false, why: 'no signature' }); continue; }
        const rec = { cid, lv, ok: false };
        try {
            const k = 1;
            const vid = await ultFx.renderUltimateVideo({
                classId: cid, name: entry.id.replace(/_/g, ' '), side: entry.side,
                palette: skillVfx.PALETTE[cid], skillLevel: lv, maxLevel: 3, intensity: k,
                layers: stage, casterIndex: 0, targetIndex: 0, focusIndex: 0, targetSide: 'enemy',
                aoe: false, targets: [{ index: 0, hp: 800, maxHp: 1000 }],
            });
            if (vid && vid.mp4) {
                const base = path.join(outDir, `${cid}`);
                fs.writeFileSync(base + '.mp4', vid.mp4);
                if (vid.thumb) fs.writeFileSync(base + '.jpg', vid.thumb);
                rec.ok = true; rec.mp4 = vid.mp4.length;
                // extract frames
                rec.frames = [];
                for (const s of FRAMES(cid)) {
                    const png = `${base}_t${s}.png`;
                    const r = spawnSync('ffmpeg', ['-y', '-ss', s, '-i', base + '.mp4', '-frames:v', '1', png], { stdio: 'ignore' });
                    if (r.status === 0 && fs.existsSync(png)) rec.frames.push(png);
                }
            } else rec.why = 'null render';
        } catch (e) { rec.why = e.message; }
        manifest.push(rec);
        console.log(JSON.stringify({ cid: rec.cid, ok: rec.ok, mp4: rec.mp4, why: rec.why, frames: (rec.frames || []).length }));
    }
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // contact sheet
    const shots = manifest.flatMap((m) => m.frames || []);
    if (shots.length) {
        spawnSync('ffmpeg', ['-y', ...shots.flatMap((p) => ['-i', p]),
            '-filter_complex', (() => {
                const n = shots.length, cols = 3, rows = Math.ceil(n / cols);
                const ins = shots.map((_, i) => `[${i}:v]scale=320:-1,pad=324:260:2:2:black[s${i}];`).join('');
                const rowsTxt = [];
                for (let r = 0; r < rows; r++) {
                    const rowIns = [], idx = [];
                    for (let c = 0; c < cols; c++) { const i = r * cols + c; if (i < n) { rowIns.push(`[s${i}]`); idx.push(i); } }
                    rowsTxt.push({ rowIns, out: `r${r}`, n: idx.length });
                }
                let last = '';
                let acc = '';
                rowsTxt.forEach((rt, ri) => {
                    acc += `${rt.rowIns.join('')}hstack=inputs=${rt.n}[${rt.out}];`;
                });
                acc += rowsTxt.map((rt) => `[${rt.out}]`).join('') + `vstack=inputs=${rowsTxt.length}[v]`;
                return ins + acc + `;[v]scale=972:-1[vout]`;
            })(), '-map', '[vout]', path.join(outDir, 'sheet.png')], { stdio: 'ignore' });
    }
    const ok = manifest.filter((m) => m.ok).length;
    console.log(`[qa26b] rendered ${ok}/${manifest.length} — sheet: ${path.join(outDir, 'sheet.png')}`);
    process.exit(ok === manifest.length ? 0 : 1);
})().catch((e) => { console.error('[qa26b] fatal:', e); process.exit(2); });
