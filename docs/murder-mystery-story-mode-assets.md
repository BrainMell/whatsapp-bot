# Blackvale Story Mode asset plan

## Assets selected for the first implementation

Story Mode reuses the existing, committed Blackvale assets instead of adding a visually inconsistent second art style:

- **Locations:** the existing directory `core/games/murdermystery/assets/bg/` (manor, library, drawing room, gallery, hallways, ballroom, bedrooms, dining room, music room and other scenes).
- **Character portraits:** `core/games/murdermystery/assets/char/`.
- **Evidence illustrations:** `core/games/murdermystery/assets/clues/` (keys, letters, watch, perfume, weapons, boots and other props).
- **Type:** existing local Playfair Display, EB Garamond and Special Elite fonts.
- **Rendering:** the local `cards.js` renderer is reused for lobby cards, cast portraits, clue cards, private dossiers and the case report. All files are rendered locally; no external image API or runtime asset download is needed.

This reuses the repository's already committed art and keeps the classic mode's visual system intact. Story Mode adds its own labels and command captions, not changes to those shared assets.

## Asset research and import decision

The first build deliberately uses the repo's already-committed art. External assets were checked, but none were copied into the public repository because the closest style match has a raw-file redistribution restriction.

- [Kenney Graveyard Kit](https://kenney-assets.itch.io/graveyard-kit) — the publisher states CC0 1.0 and commercial use is allowed. The kit includes low-poly models and sprite/tile assets. It is a viable future option for a dedicated graveyard scene, but the 3D models need a deliberate render/bake step to match the current card pipeline.
- [Kenney Roguelike/RPG Pack](https://kenney.nl/assets/roguelike-rpg-pack) — CC0, 16×16 pixel-art assets. Good for a full pixel-art scenario, not a drop-in replacement for the existing painted Victorian art.
- [AssetSmithy 5-background sampler](https://assetsmithy.itch.io/5-free-gothic-2d-game-backgrounds-victorian-manor-night-town-visual-novel-sam) — the current page describes five 1920×1080 illustrated gothic backgrounds, allows commercial use and modification, and identifies the art as AI-assisted. It also prohibits reselling, redistributing or sharing the raw image files. That makes committing the pack's raw PNGs in this public source repo inappropriate, so it was researched but not imported.
- [AssetSmithy 3-character sampler](https://assetsmithy.itch.io/3-free-gothic-victorian-characters-visual-novel-rpg-sprites-sampler) — three characters with six expressions each, transparent PNGs, commercial use allowed, AI-assisted. Its page also prohibits raw-file redistribution, so it was not copied into this repository.
- [KATO Gaslit Streets & Ground](https://gemesyokudougmailcom.itch.io/free-gaslit-streets-ground-parallax-set) — a newly released free commercial-use parallax ground layer and possible exterior-scene lead. Check its full download terms before bundling it; the current release page describes it as an 800×200 transparent PNG layer.

The choice for this feature is to keep one consistent visual language using the committed backgrounds, character sprites, clue illustrations and fonts. Future scene expansion should use assets that can legally live in the repository (for example CC0), or have explicit permission for raw asset distribution.

## Asset acceptance criteria

1. Match the existing moody, illustrated/victorian-noir style.
2. Prefer a complete, internally consistent pack over isolated random downloads.
3. Record original source, author, license, and attribution/redistribution requirements beside every third-party asset.
4. Do not fetch assets during a live match. Bundle and optimize them during development.
5. Include a text or existing-art fallback if a visual card cannot render or send.
