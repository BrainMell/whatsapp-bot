# FX asset credits

> **Provenance note:** this library landed in commit aa29ae46a (2026-10-23 "FREEE"
> directive) whose message claims the art is "all CC0/CC-BY OpenGameArt" and names
> only one author group ("RC Art", for the plasma sets, claimed CC0). That commit
> promised a credits file here but never shipped one; this document was
> reconstructed from the commit message and the shipped filenames. **No pack URLs,
> artist names or License.txt files were recorded in the repo** — every pack below
> is therefore **unverified** and needs license confirmation before commercial use.
> (Verified in-repo: `git log -1 --format=%B aa29ae46a`; no `core/rpgasset/fx/**/LICENSE*`.)

## Pack families (676 files total)

- `arcane/01-06/` — `Arcane_Effect_1-7.png`, 42 files (6 color sets x 7 frames).
  CraftPix-style free "arcane effect" pack series (probable origin: craftpix.net
  free pixel-effect packs; page not recorded). **License: claimed CC0/CC-BY — unverified.**
- `blood/` — `Blood-Magic-Effect_01-25.png`, 25 files. CraftPix-style "blood magic
  effect" free pack (probable origin: craftpix.net; page not recorded).
  **License: claimed CC0/CC-BY — unverified.**
- `cosmic/1-5/` — `Cosmic_01-25.png`, 25 files (5 sets x 5 frames). CraftPix-style
  "cosmic" free effect pack. **License: claimed CC0/CC-BY — unverified.**
- `earth/1-5/` — `Earth-Impact_01-25.png`, 25 files (5 sets x 5 frames).
  CraftPix-style "earth impact" free effect pack. **License: claimed CC0/CC-BY — unverified.**
- `fire/1-5/` — `Fire-Wrath__01-25.png`, 25 files (5 sets x 5 frames). CraftPix-style
  "fire wrath" free effect pack. **License: claimed CC0/CC-BY — unverified.**
- `light/` — `LightEffect_01-25.png`, 25 files. CraftPix-style "light effect" free
  pack. **License: claimed CC0/CC-BY — unverified.**
- `water/01-05/` — `Water__01-25.png`, 25 files (5 sets x 5 frames). CraftPix-style
  "water effect" free pack. **License: claimed CC0/CC-BY — unverified.**
- `projectile/` — `Pure_01-25.png`, 25 files. CraftPix-style projectile/"pure"
  energy effect pack. **License: claimed CC0/CC-BY — unverified.**
- `music/{original,gold,fire,purple}/1-5/` — `Music_01-25.png`, 100 files (4 color
  variants x 5 sets x 5 frames). CraftPix-style "music note" effect pack, 4 palettes.
  **License: claimed CC0/CC-BY — unverified.**
- `nature/` — `0-1.png ... 3-5.png` + `Preview.png`, 25 files. Multi-effect nature set
  (4 groups + pack preview sheet — the `Preview.png` presence suggests the pack was
  reshipped from a download bundle). **License: claimed CC0/CC-BY — unverified.**
- `wings/0-7/` — `01-05.png`, 40 files (8 wing variants x 5 frames). Flap-loop wing
  FX. **License: claimed CC0/CC-BY — unverified.**
- `plasma/{plasma_burst,plasma_super_blast,plasma_giga_shockwave,gravity_burst,loop_electro_storm,loop_electrical_charging,loop_plasma_anomaly,loop_gravity_core}/` —
  56 files (`Plasma Burst_1.png`, `Gravity Burst_1.png`, `Loop Electro Storm_1.png`, ...).
  The only group the landing commit attributes by name: **"RC Art"**, claimed **CC0**
  (likely the RC Art / "Plasma" sci-fi effect series on OpenGameArt/itch.io; exact
  page not recorded). **License: claimed CC0 — unverified.**
- `circle/` — `010000.png ... 010027.png`, 28 files. Summon-circle animation frames
  (28-step loop). **License: claimed CC0/CC-BY — unverified.**
- `portal1/` — `portal01.png ... portal64.png`, 64 files. Rift/portal animation
  (64-frame loop). **License: claimed CC0/CC-BY — unverified.**
- `gfx/66-72/` — `660000.png ... 720019.png`, 140 files (7 numbered sets x 20 frames,
  zero-padded frame names). "Free game fx sets" per the landing commit; automated
  frame-dump naming, pack not identifiable from filenames. **License: claimed
  CC0/CC-BY — unverified.**
- `sheets/` — `poof.png`, `smoke15.png`, `smoke30.png`, `explosion3.png`,
  `explosion12.png`, `Skull.png`, 6 files. Poof/smoke/explosion sprite sheets
  (filenames look like frame-count labels; source pack not identifiable).
  **License: claimed CC0/CC-BY — unverified.**

## What would make these verifiable

- Original pack URLs + author handles (commit aa29ae46a recorded none).
- A `License.txt`/`ReadMe` per pack — none was committed under `core/rpgasset/fx/`.
- Confirmation that every pack is genuinely OpenGameArt-hosted (the blanket claim)
  vs. CraftPix/itch.io exclusives, whose licenses differ (CraftPix free license
  permits commercial use but forbids redistributing the raw assets — a problem for
  an OSS repo if any pack turns out to be CraftPix-licensed).

Related demo tooling added with the library: `scripts/fx/scene_demo_reference.py`
(commit b4e033661) and `scripts/fx_mine_scene_v2.py` (commit 636b597f).
