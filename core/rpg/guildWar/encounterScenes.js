// ============================================
// ⚔️ RUINS ENCOUNTER SCENES — 2026-10-02 owner directive
// Every ruins room renders as a battle-encounter-style scene: the player
// standing in the room, a per-type prop in the enemy zone, and the SQUARE
// live map in the bottom-right panel. No banner, no fight menu, no combat
// UI on exploration scenes - ever. The caption carries the interactions.
// ============================================

const CFG = require('./config');

const WINDOW_COLS = 7;
const WINDOW_ROWS = 5;

// worldTheme lives in encounters.js; lazy require to avoid cycles
function themeOf(eventDoc, room) {
    const encounters = require('./encounters');
    const P = room?.payload || {};
    const raw = typeof P.get === 'function' ? P.get('theme') : P.theme;
    return encounters.worldTheme(raw || eventDoc.deadWorld);
}

function ringOf(room) {
    return Math.max(1, Math.round((room?.ring || 0) * 4) + 1);
}

// ── SQUARE map fragment for the bottom-right encounter panel ──
// Builds a WINDOW_COLS x WINDOW_ROWS view centered (clamped) on the player.
// states: current | seen | fog. kinds ride along for seen/current cells.
function buildMapFragment(eventDoc, player, room) {
    const side = Math.max(1, eventDoc.side || CFG.MAP.SIDE_MIN);
    const roomMap = new Map((eventDoc.rooms || []).map((r) => [r.key, r]));

    const [px, py] = String(player.roomId || room?.key || '0,0').split(',').map(Number);
    const coreKey = eventDoc.coreKey || `${Math.floor(side / 2)},${Math.floor(side / 2)}`;
    const [cx, cy] = String(coreKey).split(',').map(Number);

    // clamp window so it stays on the map
    let x0 = Math.min(Math.max(0, px - Math.floor(WINDOW_COLS / 2)), Math.max(0, side - WINDOW_COLS));
    let y0 = Math.min(Math.max(0, py - Math.floor(WINDOW_ROWS / 2)), Math.max(0, side - WINDOW_ROWS));

    const discovered = new Set(player.discovered || []);
    const cells = [];
    for (let wy = 0; wy < WINDOW_ROWS; wy++) {
        for (let wx = 0; wx < WINDOW_COLS; wx++) {
            const gx = x0 + wx, gy = y0 + wy;
            const key = `${gx},${gy}`;
            const r = roomMap.get(key);
            const isCurrent = gx === px && gy === py;
            const seen = isCurrent || discovered.has(key);
            if (isCurrent) {
                cells.push({ x: wx, y: wy, state: 'current', kind: r?.type || '', cleared: r?.state === 'CLEARED' });
            } else if (seen && r) {
                cells.push({ x: wx, y: wy, state: 'seen', kind: r.type || '', cleared: r.state === 'CLEARED' });
            } else {
                cells.push({ x: wx, y: wy, state: 'fog', kind: '', cleared: false });
            }
        }
    }

    // open edges inside the window, drawn only when at least one side is seen
    const edges = new Set(eventDoc.edges || []);
    const out = [];
    for (let wy = 0; wy < WINDOW_ROWS; wy++) {
        for (let wx = 0; wx < WINDOW_COLS; wx++) {
            const gx = x0 + wx, gy = y0 + wy;
            const key = `${gx},${gy}`;
            const hereSeen = cells[wy * WINDOW_COLS + wx].state !== 'fog';
            for (const d of ['e', 's']) {
                const [dx, dy] = d === 'e' ? [1, 0] : [0, 1];
                const nk = `${gx + dx},${gy + dy}`;
                if (!edges.has(`${key}|${d}`)) continue;
                const nx = wx + dx, ny = wy + dy;
                if (nx >= WINDOW_COLS || ny >= WINDOW_ROWS) continue;
                const thereSeen = cells[ny * WINDOW_COLS + nx].state !== 'fog';
                if (hereSeen || thereSeen) out.push(`${wx},${wy}|${d}`);
            }
        }
    }

    const theme = themeOf(eventDoc, room);
    return {
        title: `${theme.name.toUpperCase()} - RING ${ringOf(room)}`,
        cols: WINDOW_COLS,
        rows: WINDOW_ROWS,
        cells,
        edges: out,
        px: px - x0,
        py: py - y0,
        coredx: Math.sign(cx - px),
        coredy: Math.sign(cy - py),
    };
}

// ── scene renderer: { success, buffer } ──
// players: the requesting player as the lone scene actor.
async function renderScene(eventDoc, player, room, { state = 'intact', labelOverride } = {}) {
    const combatImageGenerator = require('../combatImageGenerator');
    const P = room?.payload || {};
    const theme = themeOf(eventDoc, room);

    // prop label: type label (or landmark name), overridden for cleared states
    const TYPE_LABELS = {
        puzzle: 'SEALED MECHANISM', discovery: 'BURIED CACHE', reward: 'OLD-WORLD VAULT',
        hazard: 'TRAPPED PASSAGE', lore: 'INSCRIBED HALL', secret: 'HIDDEN CHAMBER',
        anomaly: 'WORLD-THIN HALL', landmark: 'LANDMARK',
    };
    let label = labelOverride || TYPE_LABELS[room.type] || '';
    if (room.type === 'landmark' && state === 'intact') {
        const ln = typeof P.get === 'function' ? P.get('landmarkName') : P.landmarkName;
        if (ln) label = String(ln).toUpperCase();
    }

    const me = {
        name: player.name || 'Explorer',
        class: player.classId || player.class?.id || 'APPRENTICE',
        level: Math.floor(player.level || 1),
        hp: Math.floor(player.stats?.maxHp || 100),
        maxHp: Math.floor(player.stats?.maxHp || 100),
        currentHP: Math.floor(player.stats?.hp || player.stats?.maxHp || 100),
        energy: Math.floor(player.stats?.energy || 100),
        maxEnergy: Math.floor(player.stats?.maxEnergy || 100),
        adventurerRank: player.adventurerRank || 'F',
        spriteIndex: Math.max(0, Math.floor(player.spriteIndex || 0)),
    };

    const result = await combatImageGenerator.generateCombatImage([me], [], {
        combatType: 'PVE',
        rank: 'C',
        background: theme.bg,
        bypassQueue: true,
        encounter: {
            type: room.type,
            label,
            state,
            map: buildMapFragment(eventDoc, player, room),
        },
    });
    return result.success ? result.buffer : null;
}

module.exports = { buildMapFragment, renderScene, WINDOW_COLS, WINDOW_ROWS };
