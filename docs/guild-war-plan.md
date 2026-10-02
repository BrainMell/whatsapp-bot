# Guild War Overhaul — Implementation Plan

Branch: `guild-war-ruins` (off `audit/fix-pass-1`). Written BEFORE any code, per owner brief.
Author: Super Z (agent). Status: IN PROGRESS — see `docs/guild-war-progress.md` for live state.

## 0. Audit summary (full findings)

Existing system audited on-box + in repo. Verdicts:

| Piece | Verdict | Notes |
|---|---|---|
| `core/rpg/guildWars.js` (697L, weekly simulated tournament) | **REPLACE** | RNG brackets, no real play. Deleted. |
| `core/models/GuildWar.js` (`guildwars`) | **REPLACE** | New `GuildWarEvent` model (collection `guildwarevents`). Old collection untouched (data was reset; docs empty). |
| `.j war` command block (engine.js 21997-22436) | **REPLACE** | New `.j gw` surface. Old block deleted. |
| `index.js:637-667` hourly war spawn/resolve job | **REMOVE** | Replaced by event sweeper in engine 60s interval. |
| `Guild.warPoints` / `warPointsWeek` + `guildPerks.awardWarPoints` + 6 call sites (pvp 1220/1868, raid 588/617, abyss 908/984, bounty 165, adventure 5966/9049) | **REMOVE/RETARGET** | Parallel redundant scoring. Sources keep their existing `addGuildPoints` calls; warPoints layer deleted outright. |
| Donate→XP (engine.js ~19899), item-sale→XP (economy.js 1016-1025) | **REMOVE** | Money→Points conversion paths banned by spec. Donation still fills the bank (support), grants no XP. |
| Guild Bank: `.j guild loan` (engine 19922-20142), `Guild.loans` subdoc, `runDailyInterest`, `runDailyLoanProcessing` (guildPerks.js 321-480), scheduler index.js 555-579 | **MODIFY** | Loans stay as GM-approved support system; interest + penalties removed (spec: no interest/penalty). Loans move to `GuildLoan` collection (atomic, spec data-model sketch). |
| `guilds.js` guild core (roster/roles/invites/level curve `addGuildPoints`) | **KEEP** | Rosters preserved; `addGuildPoints` remains the one level curve (level*1000). New GP sources feed it. |
| Guild buildings/upgrades (`upgradeGuildBuilding`, spends bank) | **KEEP** | Bank as support system. Not a points path. |
| PvP `pvpSystem.js` (chat duels, Zeni stakes) | **KEEP + EXTEND** | Chat duels untouched. Ruins duels = new mode inside pvpSystem reusing `buildDuelPlayer`/stat/buff/turn core, own entry/stakes/flee. |
| PvE combat `guildAdventure.js` (`startCombat`, turn loop, renders) | **KEEP + HOOK** | Ruins combat rooms call `startCombat` with room encounters. Minimal hooks at flee/defeat/victory to enforce Ruins surrounding rules (flee→previous room + forfeit). |
| `encounterFramework.js` + `worldAlignment.js` (built 2026-10-02) | **KEEP + EXTEND** | The plug-in interface the spec anticipates. `worldAlignment` repurposed to launch Alignment wars. DM routing (engine.js:8771) extended with a pre-router for event actions. |
| `worldMapRenderer.js` Royal Decree kit (node-canvas, PAL, fonts) | **KEEP + CLONE** | Ruins map sheet = new renderer cloned from this pattern (see M8 mismatch). |
| Go render service `/api/combat` | **KEEP** | Encounter/combat art unchanged; Ruins combat uses new ruins background basenames. |
| Cosmology `triuneWindow` (96h period, 2h window) | **KEEP** | Alignment trigger source. |

### Spec-vs-code mismatches (owner asked to be told)

1. **"Thud" does not exist in this repo.** Exhaustive case-insensitive sweep (code/docs/comments/git -S): only dictionary noise (`words.txt`) and base64 substring noise in `data/logoEmbeddings.json`. The encounter-card bottom area is drawn Go-side (separate repo, not present here). **Decision:** interpreted as "the attack/encounter visual area"; the Ruins map is its own Royal-Decree-style sheet rendered by node-canvas (below), which structurally contains no banner, no rank plate, and no bottom-right sprite block — the spec's three UI removals are satisfied by construction.
2. **"Red section" not found** anywhere in this repo's render code (nothing is flagged red as a removable section). Same resolution as above.
3. **"Box/grid style via the Go render service":** the actual map/atlas sheets in production (`worldMapRenderer.js` cosmology/abyss/atlas) are **node-canvas**, not the Go service. Code wins: the Ruins map clones that proven pipeline (fonts, palette, decree helpers). Combat *inside* rooms still uses the Go service as today.
4. **Spec's `scripts/rpg_reset.js`** is actually `scripts/full_rpg_reset.js`; it never touched `guildwars` (fine — old docs are empty post-reset anyway).
5. **Guild Points already exist** as guild XP (`addGuildPoints`, level curve). New system feeds it; no second points currency introduced. The old weekly `warPoints` is deleted (redundant parallel currency).

## 1. Hierarchy (as specced)

```
Authorized initiator (rpg-mod/global/owner) → GuildWarEvent (umbrella)
  → shared map (The Ruins) → individual players → room encounters
  → activity → Guild Points → guild level/perks → rewards
Alignment = peak variant, triggered by cosmology window.
```

## 2. Module architecture (new files under `core/rpg/guildWar/`)

| Module | Responsibility |
|---|---|
| `config.js` | ALL tunables (sizes, weights, points, caps, timings, relic numbers, perk tiers). One object, env-overridable where sensible. |
| `state.js` | State machine + persistence helpers (`GuildWarEvent` lifecycle, atomic transitions, restart recovery). |
| `mapEngine.js` | Seeded PRNG, grid gen (spanning tree + extra edges), room typing, spawns, fog/discovery, movement validation, viewport computation. Pure-ish: generator takes (seed, players, cfg) → map object. |
| `rooms.js` | Room state ops: enter/claim/clear/residue/occupants. Atomic `findOneAndUpdate` guards + per-room in-process mutex (multi-instance safe). |
| `encounters.js` | Common encounter interface + per-type runners (combat hook into guildAdventure, puzzle, discovery, hazard, lore, co-op, reward, secret, anomaly, landmark, world-core). |
| `puzzles.js` | Seeded template puzzle generators (sequence/rune lock, riddle via LLM with offline fallback, cipher, memory pattern, levers, co-op halves, map-riddle, cross-world). Server-side answers in room payload. |
| `ruinsPvp.js` | Ruins duel flow: challenge window, stakes (GP + carried relics), anti-farm, flee=concede, integration with pvpSystem combat core. |
| `relics.js` | Session-only relics: tiers, categories (seeker/blink/ward), acquisition, use, theft, hand-in, expiry at event end. |
| `points.js` | GP awards, anti-farming (diminishing returns, caps, no guildmate GP), end-of-event distribution. |
| `feed.js` | Batched group announcer (tiers minor/normal/major), digest merge, rate caps, scoreboard + final summary cards. |
| `bankLoans.js` | GuildLoan collection flow: request → GM approve → active → repay; leave-guild handling. |
| `visibility.js` | Guild-level perk ladder (fog tiers, pings, detection). |
| `mapRenderer.js` | node-canvas Ruins map sheet (Royal Decree kit clone): per-player fog viewport, no banner/rank, grid style. |
| `dmRouter.js` | DM action grammar for active events (`move n`, `look`, `use <relic>`, `handin`, `challenge @x`, `flee`, `share map`), plugged as pre-router in encounterFramework. |
| `index.js` | Public API: createEvent/register/start/move/act/leave/end + sweeper tick + command handlers for `.j gw`. |

Models: `core/models/GuildWarEvent.js`, `core/models/GuildLoan.js`. Removed: `core/models/GuildWar.js`.

## 3. Data models

```
GuildWarEvent {
  eventId, type: 'normal'|'alignment', hostGroupId, initiatedBy,
  guilds: [{guildId, name}], state: INITIATED|REGISTRATION|ACTIVE|ENDED|REWARDS|ARCHIVED|ABORTED,
  seed, config: <snapshot of cfg>, deadWorld, regions[],
  startedAt, registrationEndsAt, endsAt (hard), archivedAt,
  players: [{ jid, guildId, name, roomId, prevRoomId, status: active|inactive|defeated|quit,
              discovered: [roomKeys], relics: [{id, tier, category, charges, meta}],
              score, gpEarned, lastActionAt, protectedUntil, lives }],
  rooms: [{ key:'x,y', x, y, type, state: UNEXPLORED|ACTIVE|CLEARED, payload, clearedBy, clearedAt, occupants: [jids], residue }],
  objectives: { coreKey, coreClaimedBy, firstCoreBonus },
  scoreboard: [{guildId, points}], log: [{t, type, actor, payload}] (capped ring, full log streamed to EventLog doc)
}
GuildLoan { guildId, playerId, amount, status: requested|approved|active|repaid|rejected, approvedBy, requestedAt, repaidAt }
EventLog (separate doc per event, capped writes) — acquisition/use/theft/handin audit trail.
```

Atomicity: room enter/clear/claim via `Event.findOneAndUpdate({_id, 'rooms.key': k, <state cond>}, {...})` — no read-modify-write races, multi-instance safe. Per-room in-process promise-mutex adds ordering; DB conditions are the real guard.

## 4. Lifecycle

```
INITIATED → REGISTRATION (default 10 min, mod may force-start) → ACTIVE (hard end time)
  → ENDED (rewards computed) → REWARDS → ARCHIVED (recap card) ; ABORTED (mod, no rewards)
```
- Registration: players join from host group (`gw join`) or DM (`join`); must be in a guild and registered RPG player.
- Hard end: `endsAt` = start + duration (normal 90 min, alignment 4h; config). Any state → ENDED at endsAt.
- Inactivity: player with no action for 20 min → `inactive`; carried relics drop in current room; rejoin via `rejoin` (protection 60s).
- Restart recovery: sweeper on boot + 60s tick loads ACTIVE events from Mongo, rebuilds caches (feed queues, mutexes), never trusts memory as source of truth.

## 5. Map generation

- Seeded mulberry32 from `seed = eventId + type`. Grid `side = ceil(sqrt(players * K))`, K=8 normal (clamp 8..40), alignment K=12 (clamp 24..60), regions: alignment splits grid into W=2..3 vertical region bands, each themed by a dead world from `WORLD_CATALOG`; dimensional paths (special edges) connect regions.
- Topology: randomized DFS spanning tree over 4-neighbors + ~12% extra edges; some walls = missing edges. All rooms reachable by construction (tree) — verified by BFS in sims.
- Room types by weight, distance-from-spawn modulates danger/reward tiers: empty ~40%, combat 18%, discovery 10%, reward 8%, puzzle 8%, hazard 6%, lore 4%, co-op 3%, secret 1.5%, anomaly 1%, landmark 0.5%, world-core: 1 at center (guarded by final guardian encounter).
- Spawns: one player per room on outer ring, greedy farthest-point placement, min pairwise distance ≥ side/3, same-guild non-adjacency preferred.

## 6. Movement, fog, room flow

- DM grammar: `move north|south|east|west|n|s|e|w` (edge must exist), `look`, `map` (personal fog view, rendered sheet), `use <relic>`, `handin <relic|all>`, `challenge @user` (same room, different guild), `flee`, `share map @guildmate`, `gw status`.
- Move cost: cooldown 6s (config) enforced per player; movement blocked while room ACTIVE (encounter unresolved) unless fleeing.
- Fog: reveal radius 1 (8-neighborhood) on enter; explored persists. Enemies not shown through fog (perk tiers add detection). Personal map render = discovered rooms only.
- Room clear → CLEARED for everyone; residue (small loot/lore/cleared-by trace) on ~25% of cleared rooms.

## 7. Encounters

- Interface: `{ type, payload, onEnter(player), resolve(player, input) → {result, rewards, feedEvent} }` — every room type implements it; combat delegates to guildAdventure.
- **Combat rooms:** `startCombat(sock, groq, encounter, sessionKey='ruins:<eventId>:<jid>')` with world-themed enemies (per deadWorld pools + existing RPG enemies); hooks added in guildAdventure flee/death/victory paths (no-op when sessionKey isn't ruins-scoped). Flee → previous room, room stays ACTIVE, unclaimed reward stays with room, no points. Defeat → respawn at spawn corner with 60s protection, limited lives (3, config); room stays ACTIVE.
- **PvP:** same room + different guilds → any side may `challenge @x`; 60s accept window (timeout = implicit flee by challenged). Duel runs pvpSystem core (new `ruinsDuel` mode). Winner: GP + may claim up to `RELIC_STEAL_CAP` (2) carried relics (rarity-weighted). Loser: previous room + protection. Anti-farm: same-victim GP diminishing (×0.5 each repeat, floor 0 after 3/day); zero GP vs same-guild (they co-op instead).
- **Puzzles:** seeded templates (see puzzles.js), DM-answerable, 3 attempts, time limit 90s, graded reward; wrong answer → minor hazard or feed alert, never hard lock.
- **Co-op:** same-guild players in one room share the encounter; reward splits evenly + co-op bonus. Different-guild truce choice for special rooms (share or betray→PvP).

## 8. Relics (session-only)

- Tiers: Common/Uncommon/Rare/Epic/Legendary/Mythic (weights 40/25/17/10/5/3 tuned by room ring & type). Stored ONLY in event state; vanish at event end (hand-in converts to GP before end).
- Categories: **Seeker** (2 charges: reveals direction+distance to nearest unclaimed relic / pings Discovery+Reward rooms for 60s), **Blink** (2 charges, 60s cd: jump ≤3 rooms along discovered path; cannot enter World Core or PvP-occupied room; skipped room yields nothing, stays ACTIVE), **Ward** (next encounter buff: atk+25% / def+25% / shield / guaranteed flee / first-strike; consumed on use).
- Rare+ carried relics expose carrier to enemy detection perks; stealable in PvP. Hand-in (`handin`): GP by rarity (config: 15/30/60/120/240/500), removes from play. Every acquisition/use/theft/handin → EventLog + feed tier.

## 9. Guild Points & anti-farming

- Sources (config values, normal): room clear by type 5-40, discovery 10, pvp win 25, relic hand-in (above), co-op bonus +50%, core first-breach 200 (guild-wide), participation 10.
- Anti-farm: per-player event cap (300 normal / 800 alignment), diminishing same-target PvP, no guildmate GP, no repeat-clear points (room already cleared). GP → `guilds.addGuildPoints` (existing level curve) at event end + live scoreboard from EventPlayer.score.
- Participation (small, ≥1 action) vs accomplishments (large) distinction per spec.

## 10. Visibility perks (guild level ladder, config)

L1: own position + discovered map (default). L3: enemy-carrier quadrant ping (5 min refresh). L5: guildmate positions on demand. L7: recent-enemy detection (last 5 min, decay). L10: reveal radius 2 + bigger pings. Information advantage, never forced PvP (flee exists).

## 11. Alignment mode

- Trigger: cosmology `triuneWindow` start → `worldAlignment.tick` (existing, repurposed) claims window → creates alignment-type event + posts **Guild Association official-notice image card** (node-canvas decree style) to registered guilds' host candidates + paced DM invites to all registered players (existing wave pattern, cap raised).
- Map: K=12, clamp 24..60, 2-3 world regions with themed pools, dimensional-path edges between regions, cross-world encounters (mixed-world enemy pools, ruins-from-another-world rooms, 2-piece cross-world relic = big GP), higher weights for puzzle/anomaly/secret.
- Rewards: largest GP scale in system (config ×~3), alignment-only recap card, worlds-separate-again epilogue line in archive.

## 12. Feed

- Batcher: events queued with tier; flush every 20s (config) → minors merged into one digest line-set (max 6 lines), normal posts immediately-but-capped (min 8s between group sends), major (image card) always immediate. Hard cap 10 group msgs / 5 min; overflow → digest. Scoreboard every 10 min + final summary card at ENDED.
- Implementation: per-event feed state in memory + flushed queue persisted in event doc (crash-safe-ish: lose ≤1 flush window).

## 13. Performance design (first-class)

- Hot path (move): 1 atomic room update + 1 player update (single `findOneAndUpdate` on event doc with array filters, or per-room subdoc update) + fog diff (in-memory) + feed enqueue (memory). NO full-map writes on move. Map doc ≤ ~2.5k rooms (60² max); rooms stored as array of compact subdocs; indexed lookups by (eventId, key) via single-doc reads cached in memory (event-level cache invalidated by write).
- Rendering: personal map sheets cached per (player, discoveredCount, occupantsHash) — re-render only when visible state changed; render queue reuses `goImageService._enqueue` pattern for Go-side art; node-canvas sheets capped at 2 concurrent (own semaphore), viewport-only for alignment maps.
- Messaging: feed caps above; DM replies lean (≤ 400 chars + image when needed).
- Memory/timers: one 60s sweeper for ALL events (no per-player timers); caches bounded (LRU per event); everything cleared at ARCHIVED.
- Scale targets: Normal 20-40 players typical / 80 max; Alignment 100+ players target; 2 concurrent events; per-action p95 < 1.5s bot-side (excl. Go renders); event-loop lag stays < 500ms p99 (measured in load sim).
- Load tests use the SAME harness as the solo-quest job (mock sock + real modules + mongoose), measuring p50/p95/p99, DB op counts, render queue depth, memory growth, loop lag.

## 14. Config values (initial, all tunable in config.js)

K=8, side clamp [8,40] (normal) / K=12 clamp [24,60] (alignment); empty 40%; move cd 6s; challenge window 60s; puzzle 90s/3 attempts; relic tier weights 40/25/17/10/5/3; steal cap 2; lives 3; protection 60s; inactivity 20min; normal duration 90min; alignment 4h; registration 10min; GP values per §9; feed caps per §12; perk ladder per §10.

## 15. Build order (executed top to bottom)

1. This audit + plan (done when committed).
2. Removals: old GW (guildWars.js, GuildWar.js, `.j war` block, index.js job, warPoints layer), money→XP paths. Stub new state machine.
3. Models + event lifecycle + permissions + `.j gw` surface.
4. Map engine + spawns + mapRenderer (visual check) .
5. Rooms/movement/atomic clears + encounter interface (combat hook first).
6. Ruins PvP + co-op + feed.
7. Points + anti-farm.
8. Loans.
9. Visibility perks.
10. Relics + puzzles (interleaved where natural).
11. Alignment mode + notice card.
12. Simulation suite (30+ seeded runs, races, edge cases) + load tests + balance pass.
13. Visual pass with vision on every produced card type.
14. Final report.

## 16. Simulation & verification plan

- `scripts/gw_sim.js`: mock sock (records sends), real modules, real mongoose. Scenarios: S1 map gen invariants (connectivity BFS, spawn spacing, type distribution, size scaling) × seeds; S2 movement + fog; S3 room race (concurrent enter/clear same room — exactly-one-winner); S4 combat encounter E2E via real startCombat with mock sock; S5 flee rule; S6 PvP lifecycle (challenge/accept/timeout/flee/steal); S7 co-op split; S8 puzzle solve/fail/timeout; S9 relic lifecycle (acquire/use/charges/theft/handin/expiry); S10 GP caps + anti-farm; S11 loan flow (request/approve/repay/leave-guild); S12 permissions (non-mod rejected); S13 feed caps (assert send counts); S14 event end + rewards + archive + restart-mid-event recovery; S15 alignment scale; L1-L4 load (25/50/100/150 players + 2 concurrent events).
- Every run seeded; failures recorded with seed; suite re-run after each fix; balance report from aggregate GP stats.
