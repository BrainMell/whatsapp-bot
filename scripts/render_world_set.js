// Render the full world card set to PNG for VISUAL inspection (owner demands
// real rendered results, not "code looks right"). Usage:
//   node scripts/render_world_set.js [outdir]
'use strict';
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || path.join(__dirname, 'render_out', 'worldcards_v6');
fs.mkdirSync(OUT, { recursive: true });

const R = require('../core/rpg/worldMapRenderer');

const JOBS = [
    ['atlas_all', () => R.renderCosmologyAtlasSheet()],
    ['first_world', () => R.renderFirstWorldSheet()],
    ['world_beyond', () => R.renderWorldBeyondSheet()],
    ['afterlife', () => R.renderAfterlifeSheet()],
    ['abyss', () => R.renderAbyssSheet()],
    ['afterlife_locked', () => R.renderAfterlifeLockedCard()],
    ['world_beyond_locked', () => R.renderWorldBeyondLockedCard()],
    ['abyss_sealed', () => R.renderAbyssMisalignedCard({ mode: 'closed', opensInLabel: 'locked 4h 12m' })],
    ['abyss_unreadable', () => R.renderAbyssMisalignedCard({ mode: 'unreadable' })],
    ['abyss_level_locked', () => R.renderAbyssMisalignedCard({ mode: 'level', level: 12, unlock: 20 })],
];

(async () => {
    for (const [name, fn] of JOBS) {
        try {
            const buf = await fn();
            if (!buf || buf.length < 100) { console.log('FAIL (null buffer):', name); continue; }
            fs.writeFileSync(path.join(OUT, name + '.png'), buf);
            console.log('OK', name, (buf.length / 1024).toFixed(0) + 'KB');
        } catch (e) {
            console.log('ERROR', name, e.message);
        }
    }
    // live-phase sweep for the atlas (labels must never collide at any phase)
    for (const min of [0, 45, 90, 150, 200, 225, 275]) {
        try {
            const buf = await R.renderCosmologyAtlasSheet(Date.now() + min * 60 * 1000);
            fs.writeFileSync(path.join(OUT, `atlas_phase_${min}.png`), buf);
            console.log('OK atlas_phase_' + min);
            const fw = await R.renderFirstWorldSheet(Date.now() + min * 60 * 1000);
            fs.writeFileSync(path.join(OUT, `first_world_phase_${min}.png`), fw);
            console.log('OK first_world_phase_' + min);
        } catch (e) { console.log('ERROR phase', min, e.message); }
    }
})();
