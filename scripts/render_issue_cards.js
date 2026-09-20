// Render the current world-atlas + Dead World cards to PNG for visual inspection.
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';
const path = require('path');
const fs = require('fs');
const PROJ = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'render_out');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const worldMapRenderer = require(path.join(PROJ, 'core/rpg/worldMapRenderer'));
const dwRenderer = require(path.join(PROJ, 'core/rpg/deadWorldRenderer'));

(async () => {
    const jobs = [
        ['atlas_world_all.png', () => worldMapRenderer.renderCosmologyAtlasSheet()],
        ['sheet1_first_world.png', () => worldMapRenderer.renderFirstWorldSheet()],
        ['sheet2_world_beyond.png', () => worldMapRenderer.renderWorldBeyondSheet()],
        ['sheet3_afterlife.png', () => worldMapRenderer.renderAfterlifeSheet()],
        ['sheet4_abyss.png', () => worldMapRenderer.renderAbyssSheet()],
        ['dw_scene.png', () => dwRenderer.renderDeadWorldScene({
            playerName: 'DwHero', playerClass: 'FIGHTER', spriteIndex: 0,
            dungeonName: 'Fire Cave', rank: 'F', floor: 1,
            backgroundPath: 'rpgasset/environment/env1.png', environmentKey: 'env1.png',
        })],
        ['dw_victory.png', () => dwRenderer.renderDeadWorldVictory({
            playerName: 'DwHero', playerClass: 'FIGHTER', spriteIndex: 0,
            dungeonName: 'Fire Cave', rank: 'F', floor: 1,
            backgroundPath: 'rpgasset/environment/env1.png', environmentKey: 'env1.png',
        })],
    ];
    for (const [name, fn] of jobs) {
        try {
            const buf = await fn();
            if (buf && buf.length > 100) {
                fs.writeFileSync(path.join(OUT, name), buf);
                console.log('rendered', name, buf.length, 'bytes');
            } else {
                console.log('FAILED (null/small):', name);
            }
        } catch (e) {
            console.log('THREW for', name, ':', e.message);
        }
    }
    process.exit(0);
})();
