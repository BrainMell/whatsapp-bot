'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// qa26_vfx_preview — headless render of every class ultimate VFX (Task 26 art swap).
// Mirrors adminConsole `.j mod vfx` but writes MP4 + impact-thumb to disk instead
// of WhatsApp, so art swaps can be reviewed as contact sheets before deploy.
// Usage: node scripts/qa26_vfx_preview.js <outDir> [classFilter] [level] [aoe]
// Run with the bot's node_modules on PATH (NODE_PATH) + QA_MODE=1 CODE_VER isolation.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

(async () => {
    const outDir = process.argv[2] || '/tmp/vfxqa';
    const filter = String(process.argv[3] || '').toLowerCase();
    const lvArg = /^\d+$/.test(String(process.argv[4] || '')) ? parseInt(process.argv[4], 10) : null;
    const aoe = String(process.argv[5] || '').toLowerCase() === 'aoe';
    fs.mkdirSync(outDir, { recursive: true });

    const skillVfx = require('../core/rpg/skillVfx');
    const ultFx = require('../core/rpg/ultimateFx');
    const skillTreeData = require('../core/rpg/skillTree').SKILL_TREES || {};
    const stage = require('../core/rpg/vfxPreviewStage')(aoe ? 3 : 1);
    const sigs = skillVfx.SIGNATURE_SKILLS;

    const info = (cid) => {
        const entry = sigs[cid]; if (!entry) return null;
        let name = entry.id.replace(/_/g, ' '), max = 3;
        const tree = skillTreeData[cid];
        outer: for (const t of Object.values((tree && tree.trees) || {})) {
            const sk = t.skills && t.skills[entry.id];
            if (sk) { name = sk.name || name; max = Number(sk.maxLevel) || 3; break outer; }
        }
        return { cid, entry, name, max };
    };
    const all = Object.keys(sigs).map(info).filter(Boolean)
        .filter((x) => !filter || String(x.cid).toLowerCase().includes(filter));

    const manifest = [];
    for (const x of all) {
        const lv = lvArg ? Math.min(x.max, Math.max(1, lvArg)) : x.max;
        const k = x.max <= 1 ? 1 : (lv - 1) / (x.max - 1);
        const rec = { cid: x.cid, lv, ok: false };
        try {
            const vid = await ultFx.renderUltimateVideo({
                classId: x.cid, name: x.name, side: x.entry.side,
                palette: skillVfx.PALETTE[x.cid], skillLevel: lv, maxLevel: x.max, intensity: k,
                layers: stage, casterIndex: 0, targetIndex: 0, focusIndex: 0, targetSide: 'enemy',
                aoe, targets: [{ index: 0, hp: 800, maxHp: 1000 }],
            });
            if (vid && vid.mp4) {
                const base = `${x.cid}_lv${lv}${aoe ? '_aoe' : ''}`;
                fs.writeFileSync(path.join(outDir, base + '.mp4'), vid.mp4);
                if (vid.thumb) fs.writeFileSync(path.join(outDir, base + '.jpg'), vid.thumb);
                rec.ok = true; rec.mp4 = vid.mp4.length;
            } else rec.why = 'null render';
        } catch (e) { rec.why = e.message; }
        manifest.push(rec);
        console.log(JSON.stringify(rec));
    }
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const ok = manifest.filter((m) => m.ok).length;
    console.log(`[qa26] rendered ${ok}/${manifest.length} classes${filter ? ` (filter=${filter})` : ''} aoe=${aoe}`);
    process.exit(ok === manifest.length ? 0 : 1);
})().catch((e) => { console.error('[qa26] fatal:', e); process.exit(2); });
