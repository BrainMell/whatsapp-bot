# Guild War — Progress Log

- [phase 1] AUDIT COMPLETE (2026-10-03 ~03:10 UTC). See plan §0. Old war = simulated weekly tournament; removal surface mapped precisely (files+lines).
- [phase 2] PLAN written (docs/guild-war-plan.md). Branch guild-war-ruins created off audit/fix-pass-1. Deploy safety verified: deploy.yml triggers only on audit/fix-pass-1; relay watches same branch — this branch cannot reach production.
- NEXT: removals + state machine stub.

## Build log (live)
- [p3] Removals DONE: old war files/commands/job, warPoints layer, donate+sale XP paths, interest/penalty jobs. Old loan block swapped for GM-approved flow.
- [p4-11] Core modules DONE (commit d9cc9157): config/models/state machine/mapEngine/fog/rooms/encounters+puzzles+relics/ruins duels/GP/loans/visibility/dmRouter/mapRenderer/noticeCard/alignment launcher; engine+boot wiring.
- NEXT: simulation suite (gw_sim.js on box /tmp clone) → load tests → visual pass → balance.
