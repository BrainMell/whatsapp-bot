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
