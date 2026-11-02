# RPG Asset Licenses

Every third-party asset dropped into `core/rpgasset/` is logged here:
file(s), source URL, author, license, date added. Verified against the
license text shipped inside each download (not the page summary).

| File(s) | Source | Author | License | Added | Notes |
|---|---|---|---|---|---|
| `guildwar/ruins/atlas/props_atlas.png` + `props_atlas.json` | https://github.com/crawl/crawl (tiles shipped with Dungeon Crawl Stone Soup; pack fetched from https://opengameart.org/content/dungeon-crawl-32x32-tiles) | Dungeon Crawl Stone Soup dev team + contributors | CC0 (license text inside the pack: `LICENSE.txt` — "No Copyright … dedicated to the Commons") | 2026-11-02 | 26 props (torches, banner, broken columns, chests, crate, sarcophagus, statues, idols, altar, fountains, mold, bones) cropped from the 32x32 tileset, trimmed, shelf-packed. Drawn at scale 2. |
| `enemies/abyss/colossal/abyssal_god.png` | https://opengameart.org/content/demon-statue-flare-sprite-sheets | ryan.dansie | CC0 (stated on the OGA page) | 2026-11-02 | Front-facing frame (row 7, cell 0 of `demon_statue.png`), trimmed to 110x136 native — used as-is, no upscale (handoff rule). Mild abyss-palette regrade (tint only, no geometry). |

Both packs are CC0: no attribution required in-game; this log is kept for
provenance anyway.

## Rejected this pass (license / style)

- FGA/CraftPix monster pack (itch) — license redirects to craftpix.net
  file-licenses (attribution / account-bound); handoff says skip.
- "2D - Elemental Monster Spritesheets" (2DPIXX, CC-BY 4.0) — usable license
  but the art is chibi/cartoon "fly" creatures: wrong style for colossal
  abyss bosses, so not used.
- Kenney "Isometric Miniature Dungeon" — rejected in the handoff itself
  (3D-render look).

## Known gaps / notes

- Colossal art exists only for `ABYSSAL_GOD`. The other abyss boss ids
  (INFECTED_COLOSSUS, CORRUPTED_GUARDIAN, MUTATED_OVERSEER, ELDER_CHAOS,
  ELEMENTAL_ARCHON, VOID_HARBINGER, PRIMORDIAL_CHAOS, VOID_CORRUPTED,
  VOID_TITAN) have no license-clear >=128 px front-facing source found this
  pass; they keep rendering through the classic sheet pool (unchanged).
- Layered halls shipped for `obsidian_throne`, `drowned_crypt`,
  `void_sanctum`, composed and palette-graded from the same CC0 DCSS tiles
  (walls `church_*` / `catacombs_*` / `cobalt_stone_*` / `crystal_wall_*`,
  floors `black_cobalt_*` / `bog_green_*`, props `crumbled_column_*`,
  `zot_pillar`, `sarcophagus_open`, `boulder`, `mold_large_*`).
- The DCSS torch flames + zot pillar keep the artists' native semi-alpha
  pixels (glow), and the demon statue keeps its native soft shading — these
  are source-art alpha, not resize fringe; every other prop edge is hard.
