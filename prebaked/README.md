# prebaked/ — committed seed for the generation caches
Baked effect plates, card faces and death overlays that ship WITH the repo, so a wiped server starts warm.
On boot each cache copies any missing file from here into its live cache dir (never overwrites).
- `ult-plates/`  -> ~/.cache/ult-plates   (keys include a code hash: re-export after changing ultimateFx*.js)
- `cardfx-v1/`   -> ~/.cache/bot_bake/cardfx-v1
- `deathov/`     -> death overlay dir (DEATH_OV_DIR)
Refresh with `node scripts/export_prebaked.js` on a box whose caches are warm, then commit. Budget: PREBAKED_MAX_MB (default 60).
Disable seeding: `PREBAKED_SEED=0`.
