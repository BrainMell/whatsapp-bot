# Blackvale Manor: Halloween mode

Halloween is a first-class variant of the existing Murder Mystery engine. It reuses the game state, voting, characters and timelines, but routes major visual moments through a dedicated local canvas renderer. Core card art is procedural and generated at render time, so remote image-host outages cannot break gameplay.

## Commands

- .j mm halloween opens the image-led Halloween guide.
- .j mm halloween create opens a Halloween-themed lobby.
- Use the normal .j mm join, .j mm start, .j mm search and .j mm vote commands after the themed lobby opens.
- .j mm halloween card clue, evidence, ritual, blackmail or escape renders an illustrated artifact card.

## Asset research and license notes

These packs are good candidates for a later downloadable/local asset pass. Re-check the live license page at integration time, and keep each imported file with its source/license note.

1. [Kenney Graveyard Kit](https://kenney-assets.itch.io/graveyard-kit) - the author describes the pack as CC0 1.0 Universal; models, tilesheets and separate sprites. Suitable for gravestones, spectral props and cemetery motifs.
2. [Pulse Pastel Haunt](https://edfaygo.itch.io/pulse-pastel-haunt) - CC0 2D pixel-art pack with pumpkins, animated jack-o'-lanterns, ghosts, bats, gravestones, dead trees, lanterns and cobwebs. Its separate files and animation metadata are useful for future animated case cards.
3. [Halloween Pixel Pack by lesed](https://lesed.itch.io/halloween-pixel-pack) - 48 transparent 32x32 sprites; page states free for personal and commercial use. Do not assume that this grants redistribution rights for the unmodified pack; review full terms before bundling.
4. [itch.io CC0 Halloween game assets](https://itch.io/game-assets/new-and-popular/assets-cc0/free/tag-halloween) - a filter for creator-listed CC0 packs. Verify the selected pack's own live page, not just the listing.
5. [Horror Mansion Tileset Pack](https://muchopixels.itch.io/horror-mansion-tileset-pack) - stylistically relevant 16x16 mansion and cemetery tileset. Listed for visual reference only until its current license is reviewed.

## Art direction

Ink-blue night, plum fog, burnt-orange highlights, aged-gold keylines, candlelight and an original silhouette of Blackvale Manor. Cards are PNGs drawn locally using the existing canvas dependency. Character sprites use the game's roster if available; local vector motifs remain when a sprite is missing.

The initial Halloween renderer creates its own vector motifs locally; the external packs above have not been copied into the repository.
