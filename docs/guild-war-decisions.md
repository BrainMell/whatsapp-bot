# Guild War — Running Decisions Log

Format: [phase] DECISION — rationale. Newest at bottom.

- [plan] "Thud" does not exist in this repo (exhaustive sweep) — interpreted as the attack/encounter visual area; Ruins map is its own Royal-Decree sheet with no banner/rank/bottom-sprite block by construction. Will show owner the rendered sheet in the morning.
- [plan] "Red section" not found — same resolution as Thud (satisfied by construction).
- [plan] Map rendering uses node-canvas Royal Decree kit (worldMapRenderer pattern), NOT the Go service — code wins over spec guess; combat art inside rooms stays Go-side.
- [plan] "Guild Points" = existing guild XP/level curve (addGuildPoints). No second currency; weekly warPoints layer deleted as redundant remnant.
- [plan] Old weekly war (guildWars.js) is a simulated RNG tournament with no real play → REPLACE, not adapt.
- [plan] Loans move from Guild.loans subdoc to GuildLoan collection (atomic ops, spec sketch); interest + penalty jobs removed (spec: no interest/penalty).
- [plan] Ruins PvP = new ruinsDuel mode INSIDE pvpSystem (reuses combat core) rather than a parallel fight engine — honors "don't write a parallel system" while giving own stakes/flee.
- [plan] DM actions ride the existing encounterFramework DM entry (engine.js:8771) via a new pre-router hook — one DM entry point, no new pipeline stage.
- [plan] Alignment trigger = existing cosmology triuneWindow + worldAlignment tick (repurposed from DM-trial to war launcher). 96h cadence already owner-approved.
- [plan] GP anti-farm via per-player event cap + diminishing same-target PvP + no guildmate GP (spec bullets covered).
- [build] Rooms stored as subdoc array inside the event doc (single-doc atomic conditions beat cross-collection transactions on Atlas free tier; 60×60=3600 compact rooms ≈ small doc). Verified against 16MB BSON limit in load sims.
- [build] Room-race bug found by S3 and fixed with $elemMatch-bound positional updates: plain 'rooms.key'+'rooms.state' filters matched the DOCUMENT via different elements and the positional $ wrote an arbitrary room (measured: 6 winners, 6 rooms corrupted). All room/player updates now bind ALL conditions to one element.
- [build] Circular require (state↔rooms/feed/points) resolved with lazy getters — a top-level require handed consumers the half-initialized exports (crash: "state.getEvent is not a function").
- [build] Spawn spacing: spec's fixed min-distance is infeasible at 100+ players on the outer ring; adaptive cap = min(base, perimeter/(players-1)). Spawning is an even ring walk; players shuffle onto slots (spec's shuffle preserved at assignment level).
- [build] pvpSystem duels are chat-keyed; Ruins duels span two DMs → added a player-keyed mirror registry + virtual chat ids (ruinsByPlayer), zero Zeni escrow, settle() awards GP + relic claims on finish/flee. Standard chat duels untouched.
- [build] Feed majors degrade to digest under the rate cap (spec's "degrade gracefully").
- [perf] L2 measured a 5.2s event-loop stall from in-process node-canvas renders → child-process render pool (2 slots, 10s timeout, in-process fallback so a map never hard-fails).
- [perf] .lean() on all event reads + immutable adjacency/room-index caches + projected move context (one ~1KB read per move instead of a full 841-1849-room document) — L2 move p95 improved 44s → 18-23s under all-simultaneous flood.
- [visual] Map glyphs restricted to the CARD-SYSTEM §6 DejaVu-verified whitelist (emoji have zero coverage; ⌛⛓ known tofu). Glyph map: ⚔ ✥ ⚑ ◈ ☠ ✺ ✚ ✦ ✷ ▲ ⨀.
- [known-limitation] At alignment-extreme scale (150 players ALL moving in the same second, 1849 rooms) p95 reaches ~60-75s with GC stalls up to ~10-20s on the 2-core box; correctness holds (0 failures, memory bounded). Structural next step if the owner wants faster extreme-scale: chunked room storage (one doc per region). Documented for the morning, deliberately not rushed overnight.
