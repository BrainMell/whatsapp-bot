# Asset Credits

Attribution for third-party art shipped with the bot / image services.

## Hunt animals (`rabbit_lpc.png`, `deer_lpc.png`, `bear_lpc.png`)

- **Source:** [LPC Animals (2022)](https://opengameart.org/content/lpc-bears-deer-lions-and-more)
  by bluecarrou (bear, deer) and
  ["Bunny rabbit LPC style for PixelFarm"](https://opengameart.org/content/bunny-rabbit-lpc-style-for-pixelfarm)
  (rabbit), via OpenGameArt.org.
- **License:** GPL 3.0 / CC-BY-SA 3.0 (LPC dual licensing).
- Single walk/hop frames extracted from the sprite sheets; native facing
  (rabbit RIGHT, deer/bear LEFT) is registered in the Go image service's
  `GetSpriteFacing` table (`pkg/combat/sprites.go`).
- Deployed to BOTH boxes at `~/bot_generation/assets/rpgasset/enemies/`.

## Prior art already in the game (referenced, unchanged)

- Enemy sheets (bat, wolf, boar, goblin, troll, crab, ...): bundled with the
  project's image-service assets (sparklinlabs superpowers-asset-packs &
  related free packs, CC0/promotional bundles).
- Card UI (wood / gold / parchment): "RPG GUI construction kit" by Lamoot
  (OpenGameArt, CC-BY-SA 3.0).
- Fonts: Cinzel, Cinzel Decorative (OFL), MedievalSharp (OFL), Inter (OFL).
