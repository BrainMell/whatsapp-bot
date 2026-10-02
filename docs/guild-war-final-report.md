# Guild War Overhaul — Final Report

Overnight autonomous run, 2026-10-02 → 2026-10-03.
Branch: **`guild-war-ruins`** (off `audit/fix-pass-1`). NOT deployed — production still runs `audit/fix-pass-1` @ `cfd2ca1cb`, verified online and healthy after all testing.

---

## 1. What was kept / modified / removed / replaced

| Piece | Verdict | Detail |
|---|---|---|
| Old weekly war (`guildWars.js`, `GuildWar` model, `.j war` block, hourly scheduler) | **REPLACED** | It was a simulated RNG tournament with no real play. Deleted outright; new event framework in its place. |
| `Guild.warPoints`/`warPointsWeek` + `awardWarPoints` + 6 call sites (pvp/raid/abyss/bounty/boss/dungeon) | **REMOVED** | Redundant parallel scoring. Those sources keep their existing guild-XP calls. |
| Donation→XP and item-sale→XP conversions | **REMOVED** | "Guild Points are earned, not bought." Donations/sales still fund the guild bank (support). |
| Guild Bank interest + auto-loan-penalty jobs | **REMOVED** | Spec: no interest/penalty. |
| Guild core (rosters/roles/invites/level curve `addGuildPoints`) | **KEPT** | Untouched — rosters, levels and perks are exactly as the reset left them. |
| PvE combat (`guildAdventure`), chat PvP (`pvpSystem`), Go render service, cosmology | **KEPT** | Reused verbatim; combat rooms run through the real engine (no parallel system). |
| `encounterFramework` + `worldAlignment` (from yesterday) | **KEPT/EXTENDED** | Ruins DM actions ride the same DM entry; alignment window now launches real alignment wars; the `alignment_trial` placeholder was removed (no remnants). |
| `.j guild loan` | **MODIFIED** | New flow: `request <amt>` → GuildLoan collection → GM/officer `approve|reject @player` → `repay <amt>`. One active loan per player, 10% bank cap, leaving with a loan = wallet deduct or `User.debt` conversion. |
| `pvpSystem` | **MODIFIED** | Added cross-DM *Ruins duels*: player-keyed mirror registry + virtual chat ids, no Zeni escrow, ruins flee rule (concede + retreat, no wallet penalty), settle() on finish. |

## 2. What was built (all on the branch, 20 commits)

- **Event framework**: `GuildWarEvent` model + `state.js` state machine (INITIATED → REGISTRATION → ACTIVE → ENDED → REWARDS → ARCHIVED / ABORTED), hard end times, inactivity drops, restart recovery, boot hooks.
- **Map engine**: seeded generation (mulberry32), `side = ceil(√(players·K))` clamped, spanning tree + 12% extra edges, 12 room types (≈40% empty, ring-scaled danger/reward), even ring-walk spawns with adaptive spacing, World Core at center, landmarks. Alignment: K=12, up to 60², 3 world-region bands, dimensional-path edges.
- **Rooms**: atomic `$elemMatch`+positional claim/clear (race-safe, multi-instance), occupancy, residue, fog ($addToSet), single-pipeline occupant moves.
- **Encounters**: combat rooms via `guildAdventure.startRuinsCombat` (real turn loop/UI; flee→previous-room-forfeit hook; defeat→lives+respawn; victory→clear+GP+relic), puzzles (6 seeded template kinds, server-side answers, DM-answerable, graded), discovery/reward/hazard/lore/secret/anomaly/landmark/co-op/core runners.
- **Ruins PvP**: challenge/accept window (60s), timeout=concede, GP with anti-farm decay (25→12→6→3→0 vs same victim/day), carried-relic theft (cap 2, stealable = Rare+), loser retreat + protection.
- **Relics**: session-only (vanish at event end), 6 tiers, seeker/blink/ward categories, hand-in for GP, theft, full EventLog audit trail.
- **Guild Points**: live per-player scores with caps (300 normal/800 alignment, ×3 alignment), co-op bonus, core first-breach bonus (guild-wide), participation floor, end-of-event distribution into the real guild level curve.
- **Feed**: tiered (minor digest / normal rate-capped / major image cards), hard 10-msg/5min cap, 10-min scoreboards, final summary.
- **Visibility perks**: guild-level ladder L1→L10 (quadrant pings, mate positions, recent-enemy detection, radius-2 vision).
- **Alignment**: auto-launch on the cosmology alignment window (96h cadence, KV-claimed once), official-notice cards + paced DM registration wave; manual `.j gw start alignment` gives a group the feed HQ.
- **Renderers**: Royal Decree ruins map sheet (fog view, no banner/rank by construction — the "Thud"/red-section spec items are satisfied structurally; "Thud" does not exist in this repo — see decisions doc) + Guild Association notice cards.
- **Commands**: `.j gw start|start alignment|join|forcestart|status|end|abort|help` (mod-gated start) + DM grammar (`move/look/map/relics/handin/use/challenge/accept/flee/share map/status/quit/rejoin`).

## 3. Simulation results

**Correctness suite `scripts/gw_sim.js`: 558/558 checks green** (re-run green after every fix round; final run after all perf work):
- S1 mapgen: connectivity (BFS from every spawn), spawn spacing, size scaling, single core, empty ratio 0.25–0.55 — 12 seeds × 4 sizes × …
- S2 lifecycle: create→register(8)→start→move→fog growth→puzzle solve→hand-in→map render→hard-end→rewards→archive.
- S3 race: 6 concurrent clears of one room → **exactly 1 winner** (this test FOUND a real atomicity bug — see §5).
- S4 pvp: steal cap honored (2), non-stealable kept, loser retreat, decay ledger 25/12/6/3/0.
- S5 loans: request/cap-reject/non-GM-reject/GM-approve/partial+full repay.
- S6 feed: hard cap respected (4 sent of 83 queued), minors digested.
- S7 balance: 30 seeded events, avg guild spread 0.07 (map-locality only).
- S8 recovery: memory-wipe recovery, registration auto-start, low-attendance abort.
- Test DB: `gwtest` (same Atlas cluster, separate database) — **production collections never touched**.

**Load suite `scripts/gw_load.js`** (mock-sock real modules, all-simultaneous flood — worst possible timing):

| Round | Players | Rooms | Moves | Failures | p50 | p95 | p99 | loop-lag max | RSS |
|---|---|---|---|---|---|---|---|---|---|
| L1 | 40 | 324 | 200 | **0** | 2.8s | 7.2s | 10.1s | 0.9s | 109MB |
| L2 | 100 | 841 | 500 | **0** | 12.2s | 20.9s | 27.2s | 3.8s | 150MB |
| L3 align | 150 | 1849 | 750 | **0** | 47.2s | 75.5s | 86.7s | ~18s | 186MB |
| L4 dual | 2×50 | — | 100 | **0** | 46.7s first wave | — | — | — | 192MB |

Before/after (perf round): L2 move p95 **44.4s → 20.9s**, loop-stall **5.2s → sub-4s (GC residue)**, dbOps/action ~3.2.
Note these are flood numbers — every player acting on the same second; real play is far sparser. Production bot verified healthy throughout (pm2 online, RAM 473/952MB).

## 4. Visual checks (rendered AND inspected with vision)

Rendered via `scripts/gw_visual.js` (copies in `/tmp/gwtest/scripts/render_out/` on Box 1, downloaded to the workspace):
- **Ruins map sheets** — small 9², medium 18², large 29², alignment 43²: Royal Decree parchment/frame/title, per-player fog (undiscovered = faint dots), type glyphs, mate/enemy markers, you-marker, legend, score line. **No banner, no rank plate** — spec satisfied.
- **Guild Association notice cards** — normal + alignment: decree kicker, Cinzel Deco title with tracking fix, IM Fell body, wax seal, "Let all guilds take heed".
- Fixes made after looking: glyph set replaced with the DejaVu-verified whitelist (emoji were tofu — the card-system §6 rule), font path depth (nested module resolved the wrong rpgasset dir), title tracking.

## 5. Failures found by the sims and fixed

1. **Room-claim atomicity hole** (S3): positional `$` updates matched the document via *different* rooms' conditions → 6 winners, 6 corrupted rooms. Fixed with `$elemMatch`-bound filters everywhere. This was exactly the race the spec feared.
2. **Circular require** (state↔rooms/feed/points): consumers captured half-initialized exports. Lazy getters.
3. **Infeasible spawn spacing** at scale → adaptive cap + even ring walk.
4. **pvp decay ledger** read stale snapshots → fresh projected read.
5. **Event-loop stalls**: in-process canvas renders (5.2s) → child pool; mongoose casting of full maps on reads → `.lean()` + caches; per-move full-doc re-reads → projected context.
6. Mongoose pipeline updates need `updatePipeline: true`; mongoose Maps reject `.` in keys (jids encoded).

## 6. Decisions made on your behalf (full log in `docs/guild-war-decisions.md`)

- "Thud"/red-section: do not exist in this repo (exhaustive sweep) → satisfied structurally (the Ruins sheet has no banner/rank/encounter-sprite block by construction).
- Map rendering uses the node-canvas Royal Decree kit, not the Go service (code wins; combat art inside rooms stays Go-side).
- Guild Points = the existing guild XP/level curve (no second currency).
- Ruins duels = new mode inside pvpSystem (cross-DM), not a parallel fight engine.
- Alignment auto-launch has no host group (feed is DM-driven); a mod hosting from a group gives that group the HQ.

## 7. Known limitations / what I'd do next

- **Alignment-extreme scale** (150 players all moving the same second, 1849 rooms): correct but slow (p95 ~75s, GC stalls ~10-20s) on the 2-core 1GB box. Normal scale (≤100) is comfortable. Structural fix if you want faster extremes: chunked room storage (one doc per region) — deliberately not rushed overnight.
- Feed major-cards reuse the notice renderer; a dedicated WORLD-EVENT card layout could be nicer.
- Ruins duels render with the standard combat card (Go side); a bespoke DUEL-RUINS card is a Go-repo change (out of scope overnight).
- The sim/load suites ran against `gwtest` on the same Atlas cluster — drop that database whenever you like.
- Sandbox JIDs (AdminSandbox `sandbox_`) were not wired into event joins — tester-mode integration is a small follow-up.

## 8. Morning decisions for you

1. **Deploy?** The branch is push-tested and sim-green but has NEVER run in production. Suggested: merge `guild-war-ruins` → `audit/fix-pass-1` (relay deploys + pm2 restarts), then start a real war with `.j gw start` from a group.
2. **Config pass**: all numbers live in `core/rpg/guildWar/config.js` — durations, GP values, caps, relic weights. Tell me anything to retune.
3. **Alignment cadence**: currently the 96h cosmology window auto-launches a registration phase. Want it quieter (manual-only) or keep auto?
4. **"Thud"**: if it really is a Go-side element you want removed from OTHER encounter types, point me at which card — the Go repo isn't in this workspace.
