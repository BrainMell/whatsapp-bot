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

## Abyss real-asset pass (2026-10-09 — owner: "atp just find assets online")

- **Abyss background pool** (`core/rpgasset/environment/abyss/*.png`):
  [sparklinlabs/superpowers-asset-packs](https://github.com/sparklinlabs/superpowers-asset-packs),
  `rpg-battle-system/backgrounds` (the same CC0 pack the repo's
  `backgrounds/background1-3.png` come from). Dark/indoor halls cropped to the
  scene ratio, palette-graded per biome band (pure pixel math — hue/val/tint,
  NEAREST-resampled). **License:** CC0 1.0.
- **Abyss rat** (`core/rpgasset/enemies/abyss/abyss_rat.png`): front-facing
  frame cut from the [Evil Dungeon Asset Pack](https://opengameart.org/content/evil-dungeon-asset-pack)
  rat charset by Rodrigo Henrique (Rawdanitsu), via OpenGameArt.org.
  **License:** CC-BY 3.0.
- **Abyss slime** (`core/rpgasset/enemies/abyss/abyss_slime.png`): front frame
  from ["Slime Monster 24x24"](https://opengameart.org/content/slime-monster-24x24)
  by Bonsaiheldin, via OpenGameArt.org. **License:** CC-BY 4.0.
- **Wild/ally summon sprites**: official Digimon artwork fetched at runtime
  from digi-api.com and cached under `core/rpgasset/summons/digimon/`
  (registry species map to Digimon via `DIGIMON_FOR_SPECIES` in
  `core/rpg/summonSprites.js`). Digimon is a Bandai/Namco trademark — sprites
  are used as recognizable fan-facing game art, same as the pre-existing
  cache.
- All other abyss enemies render the repo's existing curated single-sprite
  pixel pool (`enemies/*.png` — sparklinlabs superpowers-asset-packs bundles,
  CC0 — see "Prior art" below).

## Prior art already in the game (referenced, unchanged)

- Enemy sheets (bat, wolf, boar, goblin, troll, crab, ...): bundled with the
  project's image-service assets (sparklinlabs superpowers-asset-packs &
  related free packs, CC0/promotional bundles).
- Card UI (wood / gold / parchment): "RPG GUI construction kit" by Lamoot
  (OpenGameArt, CC-BY-SA 3.0).
- Fonts: Cinzel, Cinzel Decorative (OFL), MedievalSharp (OFL), Inter (OFL).
