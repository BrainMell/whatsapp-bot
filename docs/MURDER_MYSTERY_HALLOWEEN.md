# Blackvale Manor: Halloween mode

Halloween is a first-class mode of the existing Murder Mystery engine. It uses the same roster and voting rules, but has its own motives, suspect secrets and evening timeline alongside a dedicated local canvas renderer. Every guest connects through the relationship web, and alibi times come from the selected case timeline. Validation rejects disconnected webs or statements whose hours are absent from that timeline. Core card art is generated locally, so remote image-host outages cannot break gameplay.

## Commands

- .j mm halloween opens the image-led Halloween guide.
- .j mm halloween create opens a Halloween-themed lobby.
- Use the normal .j mm join, .j mm start, .j mm search and .j mm vote commands after the themed lobby opens.
- .j mm halloween card clue, evidence, ritual, blackmail or escape renders an illustrated artifact card.

## Case behavior

- Halloween cases choose from eight dedicated motives, fourteen themed secrets and a separate ten-beat evening timeline.
- The case generator builds a connected relationship ring, and statements target characters linked to that web.
- The timeline is sorted chronologically across midnight; alibi statements only use hours selected for that case.
- The final card and evidence cards still resolve from the actual game state. The gallery cards are standalone examples and do not alter live evidence.

## Asset research and license notes

These packs are good candidates for a later downloadable/local asset pass. Re-check the live license page at integration time, and keep each imported file with its source/license note.

1. [Kenney Graveyard Kit](https://kenney-assets.itch.io/graveyard-kit) - the author describes the pack as CC0 1.0 Universal; models, tilesheets and separate sprites. Suitable for gravestones, spectral props and cemetery motifs.
2. [Pulse Pastel Haunt](https://edfaygo.itch.io/pulse-pastel-haunt) - CC0 2D pixel-art pack with pumpkins, animated jack-o'-lanterns, ghosts, bats, gravestones, dead trees, lanterns and cobwebs. Its separate files and animation metadata are useful for future animated case cards.
3. [Halloween Pixel Pack by lesed](https://lesed.itch.io/halloween-pixel-pack) - 48 transparent 32x32 sprites; page states free for personal and commercial use. The creator explicitly prohibits reselling or redistributing the files, so link players to the creator’s page rather than bundling this pack.
4. [itch.io CC0 Halloween game assets](https://itch.io/game-assets/new-and-popular/assets-cc0/free/tag-halloween) - a filter for creator-listed CC0 packs. Verify the selected pack's own live page, not just the listing.
5. [Halloween Animated Pixel Pack by lesed](https://lesed.itch.io/halloween-animated-pixel-pack) - 34 sprites with 36 loops, frame PNGs, JSON timing data and GIF previews. Paid; commercial use is allowed but the author prohibits redistribution, so it is an optional user-acquired resource, not bundled here.
6. [Horror Mansion Tileset Pack](https://muchopixels.itch.io/horror-mansion-tileset-pack) - stylistically relevant 16x16 mansion and cemetery tileset. Listed for visual reference only until its current license is reviewed.

## Art direction

Ink-blue night, plum fog, burnt-orange highlights, aged-gold keylines, candlelight and an original silhouette of Blackvale Manor. Cards are PNGs drawn locally using the existing canvas dependency. Character sprites use the game's roster if available; local vector motifs remain when a sprite is missing.

The initial Halloween renderer creates its own vector motifs locally; the external packs above have not been copied into the repository.
