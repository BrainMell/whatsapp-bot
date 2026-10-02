# Guild War — Progress Log

- [phase 1] AUDIT COMPLETE (2026-10-03 ~03:10 UTC). See plan §0. Old war = simulated weekly tournament; removal surface mapped precisely (files+lines).
- [phase 2] PLAN written (docs/guild-war-plan.md). Branch guild-war-ruins created off audit/fix-pass-1. Deploy safety verified: deploy.yml triggers only on audit/fix-pass-1; relay watches same branch — this branch cannot reach production.
- NEXT: removals + state machine stub.

## Build log (live)
- [p3] Removals DONE: old war files/commands/job, warPoints layer, donate+sale XP paths, interest/penalty jobs. Old loan block swapped for GM-approved flow.
- [p4-11] Core modules DONE (commit d9cc9157): config/models/state machine/mapEngine/fog/rooms/encounters+puzzles+relics/ruins duels/GP/loans/visibility/dmRouter/mapRenderer/noticeCard/alignment launcher; engine+boot wiring.
- NEXT: simulation suite (gw_sim.js on box /tmp clone) → load tests → visual pass → balance.

## FINAL STATE (2026-10-03 morning)
- Correctness suite: 558/558 green (final re-run after all perf changes).
- Load suite final: L1 40p 0-fail p95 7.2s · L2 100p 0-fail p95 20.9s · L3 150p-align 0-fail p95 75s (known limitation: GC stalls at extreme scale, chunked storage = next step) · L4 dual-event 0-fail.
- Visual pass: PASS (4 map scales + 2 notice cards inspected with vision; glyph whitelist + font-path + title-tracking fixes applied).
- Production: UNTOUCHED — branch guild-war-ruins not deployed; live bot still audit/fix-pass-1 @ cfd2ca1cb, pm2 healthy throughout.
- Full report: docs/guild-war-final-report.md
