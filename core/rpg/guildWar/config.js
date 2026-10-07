// ============================================
// ⚔️ GUILD WAR — central configuration
// Guild War Overhaul (Ruins + Alignment) 2026-10-03
//
// Every tunable in the system lives here. Balance by simulation,
// not by editing engine code. Env overrides marked below.
// ============================================

const CFG = {
    // ── lifecycle ──
    REGISTRATION_MS: 10 * 60 * 1000,        // registration window (mod can force-start)
    NORMAL_DURATION_MS: 90 * 60 * 1000,     // hard end time, normal war
    ALIGNMENT_DURATION_MS: 4 * 60 * 60 * 1000,
    INACTIVITY_MS: 20 * 60 * 1000,          // per-player inactivity → relics drop
    REJOIN_PROTECT_MS: 60 * 1000,
    MAX_CONCURRENT_EVENTS: 2,

    // ── ⏳ FINALE / THE FOUR WARDENS ──
    // owner 2026-10-05 23:09Z: "If a timer brings the Guild War to an end,
    // place 4 bosses around the map. After all 4 bosses die, then the Guild
    // War ends."
    // owner 2026-10-07 (Test Run 2 directive): the four bosses are ON THE MAP
    // FROM WAR START — randomly placed like the secret-room bosses — and the
    // war ends when all four are defeated. The timer no longer SPAWNS them;
    // when the clock runs out with wardens still standing the war enters the
    // hourglass grace (endsAt → endsAt + TIMEOUT_MS) so the boss hunt can
    // conclude, bounded by the safety timeout.
    FINALE: {
        BOSS_COUNT: 4,
        FROM_START: true,                   // wardens rise at startEvent, not at timer end
        BOSS_LEVEL_MULT: 3.0,               // warden level = BASE_ENEMY_LEVEL × this
        WARDEN_NAMES: ['the Ashen Warden', 'the Hollow Warden', 'the Thorn Warden', 'the Ember Warden'],
        TIMEOUT_MS: 60 * 60 * 1000,         // grace AFTER endsAt: if the wardens outlive every champion, the war still closes
    },

    // ── map ──
    MAP: {
        K_NORMAL: 8,                        // rooms per player (side = ceil(sqrt(players*K)))
        K_ALIGNMENT: 12,
        SIDE_MIN: 8, SIDE_MAX: 40,
        SIDE_MIN_ALIGNMENT: 24, SIDE_MAX_ALIGNMENT: 60,
        EXTRA_EDGE_RATIO: 0.12,             // extra edges over spanning tree
        REGIONS_ALIGNMENT: 3,               // world bands in alignment maps
        // ── MAP SIZE RANGES (owner 2026-10-07, Test Run 2: "Maybe I should do
        // a ranges thing, number of players increases the size of the map") ──
        // Beta maps were too small: 7 champions on a K_NORMAL=8 map got an
        // 8×8 grid and had charted it end-to-end inside an hour ("there's no
        // more passageway"). Side length is now looked up from explicit
        // PLAYER-COUNT RANGES instead of the old sqrt(players·K) curve —
        // legible, testable, and monotonic. Alignment maps keep their own
        // (larger) sqrt sizing below.
        SIZE_RANGES: [
            { maxPlayers: 3,  side: 10 },   //  100 rooms — duos/trios still get a world
            { maxPlayers: 6,  side: 12 },   //  144
            { maxPlayers: 9,  side: 14 },   //  196 — the Test Run 2 cohort lands here (was 8×8)
            { maxPlayers: 14, side: 16 },   //  256
            { maxPlayers: 21, side: 19 },   //  361
            { maxPlayers: 30, side: 22 },   //  484
            { maxPlayers: 45, side: 26 },   //  676
            { maxPlayers: Infinity, side: 30 }, // 900 — SIDE_MAX still clamps extreme rosters
        ],
        // room type weights (normal) — 'empty' is the remainder
        TYPES: {
            combat: 18, discovery: 10, reward: 8, puzzle: 8, hazard: 6,
            lore: 4, coop: 3, secret: 1.5, anomaly: 1, landmark: 0.5,
        },
        TYPES_ALIGNMENT: {                  // alignment shifts weight to specials
            combat: 16, discovery: 9, reward: 8, puzzle: 11, hazard: 6,
            lore: 4, coop: 4, secret: 2.5, anomaly: 2, landmark: 0.75,
        },
        EMPTY_RATIO: 0.40,                  // approx share of empty rooms
        // ── DEAD-END DENSITY (UX pass #6, owner brief 2026-10-07: "kept,
        // reduced") — cul-de-sacs stay in the generator (they are where
        // secrets and vaults feel earned), but the review flagged their
        // density: after loop edges, roughly a tenth of rooms still end in
        // a wall, and the worst seeds climb higher. A seeded relief pass
        // connects surplus dead-ends to an adjacent room until the share
        // sits at/below the cap — trimmed maps, never dead-end-free maps.
        DEADEND_MAX_SHARE: 0.08,            // max share of rooms with 1 exit
        DEADEND_RELIEF_SHARE: 0.25,         // relief edges ≤ 25% of room count per map
        RESIDUE_CHANCE: 0.25,               // cleared room leaves residue
        RESIDUE_LOOT_CHANCE: 0.5,           // residue carries small loot vs lore-only
        SPAWN_MIN_DIST_FRAC: 1 / 3,         // min pairwise spawn distance as fraction of side
        MOVE_COOLDOWN_MS: 6 * 1000,
    },

    // ── combat rooms ──
    COMBAT: {
        BASE_ENEMY_LEVEL: 10,
        LEVEL_RING_SCALE: 0.6,              // +levels per ring distance from spawn ring
        BOSS_CHANCE_SECRET: 0.5,            // secret room boss
        CORE_GUARD_LEVEL_MULT: 2.5,         // world-core guardian level multiplier
        // ── 🎚️ PvE BAND LADDER (owner spec 2026-10-06, ruins_pve_boss_scaling_prompt) ──
        // Regular encounters resolve at ENGAGE time against the ENGAGING
        // player + the guild's SHARED exploration progress. Enemy levels stay
        // set-in-stone per band: LOW/MED/HIGH anchors are drawn from the
        // ROSTER distribution (percentiles), never from one player's level.
        //   LOW  ≈ at/below the player, capped by roster median
        //   MED  ≈ slightly above the player, capped by roster p80
        //   HIGH = the LOWER EDGE of the roster's high range (owner rule:
        //          "high end enemies sit at the lower ends of the high range")
        // Bosses (secret / warden / world core) anchor to the roster too,
        // capped just above the strongest player so the top champion can
        // still SOLO them (owner rule). With ENABLED, buildRoomPayload's
        // seeded levels remain only as the fallback (solo rosters / compute
        // failure) — legacy ring curve.
        BANDS: {
            ENABLED: true,
            MIX_EARLY: { low: 0.70, mid: 0.25, high: 0.05 },   // exploration 0.0
            MIX_MID:   { low: 0.40, mid: 0.40, high: 0.20 },   // exploration 0.5
            MIX_LATE:  { low: 0.15, mid: 0.45, high: 0.40 },   // exploration 1.0
            RING_LOCAL_WEIGHT: 0.3,         // deep rooms (ring 0..1) push the mix hotter
            LOW_DROP: 2,                    // LOW band level ≈ player-2 (floor 1)
            MED_GAP: 2,                     // MED band level ≈ player+2
            HIGH_GAP: 5,                    // HIGH band level ≈ player+5 ("slightly above")
            MAX_PLAYER_GAP: 8,              // hard clamp: no regular pack beyond player+8 (variant bumps included)
            BOSS_LEVEL_ADD_SECRET: 6,       // secret boss = roster p80 + 6
            BOSS_LEVEL_ADD_CORE: 10,        // warden / world-core guardian = roster p80 + 10
            BOSS_CAP_ABOVE_TOP: 4,          // …but never more than +4 over the strongest player (solo rule)
            RANK_BY_BAND: { low: 'C', mid: 'B', high: 'A' },   // rank badge keys to the rolled band
            RANK_BOSS: 'S',
        },
        LIVES: 3,                           // per player per event
        RESPAWN_PROTECT_MS: 60 * 1000,
        // ── battle encounter variants ("the various adjustments") ──
        // Each variant reshapes the fight: enemy count/level, clear-reward
        // multiplier, and the card subtitle. Seeded per-room at event start.
        VARIANTS: {
            SKIRMISH: { name: 'Skirmish', weight: 38, levelDelta: 0, countDelta: 0, gpMult: 1.0,
                        note: 'a fair fight', danger: false,
                        line: 'Scavengers bar the way - bold, but no veterans.' },
            AMBUSH:   { name: 'Ambush', weight: 20, levelDelta: -1, countDelta: 1, gpMult: 1.2,
                        note: 'they strike first, +20% spoils', danger: true,
                        line: 'They were waiting for you. Blades flash from the dark.' },
            ELITE:    { name: 'Elite Guard', weight: 13, levelDelta: 3, countDelta: -1, gpMult: 1.5,
                        note: 'veterans, +50% spoils', danger: true,
                        line: 'Old-war veterans - armoured, drilled, unhurried.' },
            HORDE:    { name: 'Horde', weight: 15, levelDelta: -2, countDelta: 2, gpMult: 1.3,
                        note: 'many, weak, +30% spoils', danger: true,
                        line: 'A hungry pack floods the hall - too many to count.' },
            CURSED:   { name: 'Cursed Ground', weight: 9, levelDelta: 1, countDelta: 0, gpMult: 1.6,
                        note: 'the room drains you, +60% spoils', danger: true,
                        line: 'The air itself bites here. The dead do not rest easy.' },
            BOUNTY:   { name: 'Bounty Mark', weight: 5, levelDelta: 2, countDelta: 0, gpMult: 2.0,
                        note: 'a war-lord worth double', danger: true,
                        line: 'Their war-lord wears the silver of a bounty. Double spoils for the head.' },
        },
    },

    // ── pvp ──
    PVP: {
        CHALLENGE_WINDOW_MS: 60 * 1000,
        RELIC_STEAL_CAP: 2,                 // max carried relics claimable by winner
        WIN_GP: 25,
        SAME_VICTIM_DECAY: 0.5,             // GP multiplier per repeat vs same victim/day
        SAME_VICTIM_FLOOR_AFTER: 3,         // …floor at 0 after N repeats
        PROTECT_AFTER_LOSS_MS: 90 * 1000,
    },

    // ── puzzles ──
    PUZZLE: {
        TIME_LIMIT_MS: 90 * 1000,
        ATTEMPTS: 3,
        GP_SOLVE: 30,                       // fast/first-try graded below
        GP_GRADE_BONUS: 10,                 // per unused attempt
        FAIL_HAZARD_DAMAGE: 0.08,           // fraction of maxHP on final failed attempt
    },

    // ── relics (session-only) ──
    RELICS: {
        TIERS: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'],
        TIER_WEIGHTS: [40, 25, 17, 10, 5, 3],
        HANDIN_GP: { Common: 15, Uncommon: 30, Rare: 60, Epic: 120, Legendary: 240, Mythic: 500 },
        STEALABLE_FROM: 'Rare',             // tiers >= this are PvP-stealable + expose carrier
        SEEKER_CHARGES: 2,
        BLINK_CHARGES: 2,
        BLINK_MAX_ROOMS: 3,
        BLINK_COOLDOWN_MS: 60 * 1000,
        WARD_FIGHTS: 1,                     // wards consumed after N fights
        WARD_ATK: 0.25, WARD_DEF: 0.25,
        CARRY_EXPOSE_TIERS: ['Rare', 'Epic', 'Legendary', 'Mythic'],
    },

    // ── guild points ──
    POINTS: {
        ROOM_CLEAR: { combat: 15, puzzle: 20, discovery: 12, reward: 10, hazard: 12,
                      lore: 8, secret: 40, anomaly: 25, landmark: 30, coop: 18 },
        DISCOVERY_GP: 10,                   // first-visit exploration milestone per N rooms
        DISCOVERY_EVERY: 5,                 // every N distinct rooms → milestone
        PVP_WIN_GP: 25,
        COOP_BONUS: 0.5,                    // +50% when cleared with guildmate(s) present
        CORE_FIRST_GUILD: 200,              // first guild to breach World Core (each member share)
        CORE_BREACH_PLAYER: 80,
        PARTICIPATION_GP: 10,               // ≥1 action at end
        PLAYER_CAP_NORMAL: 300,
        PLAYER_CAP_ALIGNMENT: 800,
        ALIGNMENT_MULT: 3,                  // global GP multiplier for alignment events
    },

    // ── visibility perks (guild level ladder) ──
    VISIBILITY: {
        TIERS: [
            { level: 1, id: 'self', label: 'Own position + discovered map' },
            { level: 3, id: 'quadrant', label: 'Enemy-carrier quadrant ping (5 min)' },
            { level: 5, id: 'mates', label: 'Guildmate positions on demand' },
            { level: 7, id: 'detect', label: 'Recent-enemy detection (5 min decay)' },
            { level: 10, id: 'radius', label: 'Vision radius 2 + wider pings' },
        ],
        QUADRANT_REFRESH_MS: 5 * 60 * 1000,
        DETECT_DECAY_MS: 5 * 60 * 1000,
        RADIUS2: 2,
    },

    // ── feed ──
    FEED: {
        FLUSH_MS: 20 * 1000,                // digest flush cadence
        MINOR_MAX_LINES: 6,                 // minors merged into digest (max lines)
        NORMAL_GAP_MS: 8 * 1000,            // min gap between normal group messages
        MAX_MSGS_PER_5MIN: 10,              // hard cap; overflow → digest
        SCOREBOARD_EVERY_MS: 10 * 60 * 1000,
        MAX_CAPTION: 380,
    },

    // ── guild bank loans (support system; no interest, no penalties) ──
    LOANS: {
        MAX_FRACTION_OF_BANK: 0.10,         // single loan cap vs guild balance
        MIN_LOAN: 1000,
        ONE_ACTIVE_PER_PLAYER: true,
        TERM_MS: 7 * 24 * 60 * 60 * 1000,   // soft due date (reminder only)
        LEAVE_POLICY: 'wallet_deduct_or_debt', // leave guild with active loan:
                                            // auto-deduct from wallet, else User.debt flag
                                            // + block new guild loans until repaid
    },

    // ── alignment ──
    ALIGNMENT: {
        REGIONS: 3,
        CROSS_WORLD_RELIC_GP: 750,          // matching 2-piece cross-world relic hand-in
        NOTICE_CARD_TO_HOST: true,          // official-notice card to host group
    },
};

// env overrides (ops-friendly)
if (process.env.GW_REGISTRATION_MS) CFG.REGISTRATION_MS = parseInt(process.env.GW_REGISTRATION_MS, 10);
if (process.env.GW_NORMAL_DURATION_MS) CFG.NORMAL_DURATION_MS = parseInt(process.env.GW_NORMAL_DURATION_MS, 10);
if (process.env.GW_MOVE_COOLDOWN_MS) CFG.MAP.MOVE_COOLDOWN_MS = parseInt(process.env.GW_MOVE_COOLDOWN_MS, 10);

module.exports = CFG;
