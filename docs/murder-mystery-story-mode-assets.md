# Blackvale Story Mode asset plan

## Assets selected for the first implementation

Story Mode reuses the existing, committed Blackvale assets instead of adding a visually inconsistent second art style:

- **Locations:** the existing directory `core/games/murdermystery/assets/bg/` (manor, library, drawing room, gallery, hallways, ballroom, bedrooms, dining room, music room and other scenes).
- **Character portraits:** `core/games/murdermystery/assets/char/`.
- **Evidence illustrations:** `core/games/murdermystery/assets/clues/` (keys, letters, watch, perfume, weapons, boots and other props).
- **Type:** existing local Playfair Display, EB Garamond and Special Elite fonts.
- **Rendering:** the local `cards.js` renderer is reused for lobby cards, cast portraits, clue cards, private dossiers and the case report. All files are rendered locally; no external image API or runtime asset download is needed.

This reuses the repository's already committed art and keeps the classic mode's visual system intact. Story Mode adds its own labels and command captions, not changes to those shared assets.

## External asset research for later expansion

These are leads, not assets bundled by this change. Re-check the live license and any redistribution conditions before downloading, baking, or committing files.

- [Kenney Graveyard Kit](https://kenney.nl/assets/graveyard-kit) — CC0 3D graveyard kit. It could be useful for new exterior/interior scenes if we deliberately render it into the established card style; it is not a drop-in replacement for the current painted 2D backgrounds.
- [Kenney Roguelike/RPG Pack](https://kenney.nl/assets/roguelike-rpg-pack) — CC0 pixel-art content. The coherent pixel style is useful if we later choose a dedicated pixel-art scenario pack, but visibly clashes with the current painted Victorian cards when mixed directly.
- [AssetSmithy gothic Victorian sampler](https://assetsmithy.itch.io/3-free-gothic-victorian-characters-visual-novel-rpg-sprites-sampler) and [free Victorian manor backgrounds sampler thread](https://itch.io/t/6893076/free-5-gothic-2d-game-backgrounds-victorian-manor-night-town-royalty-free-sampler) — possible style-adjacent leads. The existing Halloween asset audit notes that these are described as free/commercial-use assets and AI-assisted; independently check current author terms before use.

## Asset acceptance criteria

1. Match the existing moody, illustrated/victorian-noir style.
2. Prefer a complete, internally consistent pack over isolated random downloads.
3. Record original source, author, license, and attribution/redistribution requirements beside every third-party asset.
4. Do not fetch assets during a live match. Bundle and optimize them during development.
5. Include a text or existing-art fallback if a visual card cannot render or send.
