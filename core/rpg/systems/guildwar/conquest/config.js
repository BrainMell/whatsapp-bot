'use strict';
// ⚔️ CONQUEST — tunables. Everything a designer would want to rebalance lives here.
// Feature flag: GW_CONQUEST=1 turns the whole layer on (off => nothing in this dir is reached).
const enabled = () => String(process.env.GW_CONQUEST || '') === '1';

const CFG = Object.freeze({
    // ── map shape ────────────────────────────────────────────────────────────
    PROV_COLS: 4, PROV_ROWS: 3,        // provinces per realm (12)
    PROV_SIZE: 5,                      // each province is 5x5 tiles -> 300 tiles/realm, 1500 world
    // ── marches ──────────────────────────────────────────────────────────────
    MARCH_SEC_PER_TILE: 45,            // base travel time per tile
    MARCH_MAX_SEC: 8 * 60,             // transit cap (a long trip never locks you > 8 min)
    MARCH_MIN_SEC: 20,
    MUSTER_WINDOW_SEC: 120,            // time to join a muster before it departs
    MUSTER_MIN: 2, MUSTER_MAX: 12,
    DETACH_MAX_PER_ORDER: 6,
    ORDER_BUDGET_OFFICER: 6,           // orders an officer may issue per war hour
    ORDER_BUDGET_MASTER: 40,
    RECALL_FORFEITS_CLAIM: true,
    // ── teleport / War Writs ─────────────────────────────────────────────────
    WRIT_START: 6,                     // writs a guild starts a war with
    WRIT_PER_HOUR: 2,
    WRIT_COST_BASE: 1, WRIT_COST_PER_5_TILES: 1, WRIT_COST_PER_3_HEADS: 1,
    SKYFALL_COST: 8, SKYFALL_PER_WAR: 1,  // deep strike anywhere
    // ── claiming ─────────────────────────────────────────────────────────────
    CLAIM_ATTACK_COOLDOWN_SEC: 90,     // after a failed assault the tile rests
    TILE_SHIELD_SEC: 300,              // fresh conquests can't be flipped for 5 min
    MAX_TILES_PER_GUILD: 60,
    UPKEEP_PER_TILE_HOUR: 1,           // supplies/hr per held tile beyond free ones
    FREE_TILES: 8,
    // ── defences ─────────────────────────────────────────────────────────────
    WALL_BASE_HP: { wood: 300, stone: 900, runed: 1800 },
    WALL_UPGRADE_COST: { wood: 0, stone: 40, runed: 120 },   // supplies
    GOLEM_BASE: { clay: { hp: 220, atk: 18 }, stone: { hp: 520, atk: 34 }, iron: { hp: 1100, atk: 62 }, rune: { hp: 2200, atk: 110 } },
    GOLEM_COST: { clay: 12, stone: 30, iron: 70, rune: 160 },          // supplies
    TURRET_BASE: { ballista: { dmg: 28, range: 1 }, flame: { dmg: 40, range: 1 }, arc: { dmg: 22, range: 2 }, frost: { dmg: 18, range: 1 } },
    TURRET_COST: { ballista: 25, flame: 45, arc: 55, frost: 40 },
    MAX_GOLEMS: 6, MAX_TURRETS: 4,
    BUFF_MAX_STACKS: 3,
    // ── breach encounter ─────────────────────────────────────────────────────
    BREACH_ROUND_SEC: 75,
    BREACH_MAX_ROUNDS: 12,
    BREACH_PARTY_HP_PER_POWER: 6,
    // ── gems ─────────────────────────────────────────────────────────────────
    GEM_NAME: 'Aether Gems',
    GEM_PER_WAR_CAP: 1500,             // banked-per-player per war
    GEM_CARRY_CAP: 400,                // un-banked ore a player can carry
    GEM_DROP_ON_DEFEAT: 0.5,           // carried ore lost when you are beaten
    GEM_SEAM_PEACE_CHANCE: 0.004,      // chance per mine action outside war
    GEM_VEIN_SUPPLY: [120, 260],       // gems in a vein tile
    GEM_MINE_BASE_SEC: 14, GEM_MINE_MIN_SEC: 5,
    GEM_BASE_YIELD: 2,
    // ── summon shop (gems) ───────────────────────────────────────────────────
    SHOP_PRICE: { COMMON: 150, UNCOMMON: 350, RARE: 900, LEGENDARY: 2600 },
});
module.exports = { CFG, enabled };
