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
  `backgrounds/backgrounds` (the same CC0 pack the repo's
  `backgrounds/background1-3.png` come from; art by Pixel-boy). Rebuilt the
  same day (owner: the abyss is a dungeon — daylight lawns removed): the pool
  is now DARK halls/caves/storm/void scenes only, palette-graded per depth
  band (pure pixel math — hue/val/tint, integer 7x NEAREST bake). **License:** CC0 1.0.
  - 2026-10-09 10:19Z (owner): this hall pool is now **BOSS ROOMS ONLY**
    ("keep the current backgrounds and enemies exclusively for Abyss boss rooms").
- **Abyss regular-encounter side stages** (`core/rpgasset/environment/abyss/regular/*.png`):
  owner-authorized AI style-prompt iterations ("using the correct ones as
  foundations, explore alternative styles, make a style prompt ... try over
  and over again till you get something passable") built FROM the four
  backgrounds the owner CIRCLED in the 2026-10-09 gallery review
  (dark_hall / drowned_vault / mist_hollow / violet_sanctum — the CC0
  sparklinlabs foundations above) via image-to-image editing, then flattened
  to a 112-color palette for the flat-shaded pixel look. Base art © sparklinlabs
  (CC0); the abyss re-theme generations are in-repo as deploy-safe bytes.
  File lineage: `dark_hall_abyss.png` ← dark_hall (gen v2),
  `drowned_vault_abyss.png` ← drowned_vault (v1), `violet_sanctum_abyss.png` ←
  violet_sanctum (v2).
- ~~**Mist hollow side stage** (`core/rpgasset/environment/abyss/regular/mist_hollow_abyss.png`)~~
  **REMOVED 2026-10-10** (owner 01:56Z: "REMOVE IT FROM THE FUCKING POOL" —
  the purple archway stage is out of the regular-encounter rotation; the file
  is deleted and the stage map keeps no entry for it).
- ~~**Abyss rat** (`core/rpgasset/enemies/abyss/abyss_rat.png`)~~ **REMOVED
  2026-10-09** (owner 08:43Z: only the front-facing amalgamation creatures
  belong in the abyss — the rat is a plain animal, not one of them).
  Was a front-facing frame cut from the [Evil Dungeon Asset Pack](https://opengameart.org/content/evil-dungeon-asset-pack)
  rat charset by Rodrigo Henrique (Rawdanitsu), via OpenGameArt.org. **License:** CC-BY 3.0.
- ~~**Abyss slime** (`core/rpgasset/enemies/abyss/abyss_slime.png`)~~ **REMOVED
  2026-10-09** (owner 08:43Z: "the slime is too low quality and big... let's
  get rid of the slime in the abyss").
  Was a front frame from ["Slime Monster 24x24"](https://opengameart.org/content/slime-monster-24x24)
  by Bonsaiheldin, via OpenGameArt.org. **License:** CC-BY 4.0.
- **Wild/ally summon sprites** (`core/rpgasset/summons/sparklinlabs/*.png`):
  the game's OWN summon art — one PNG per registry species (26/26), exported
  from the same sparklinlabs idle set the Go image service has always used
  for roster/detail cards (17 pack PNGs + 9 first-frame GIF→PNG conversions
  for the batch-6/7 species). Owner 2026-10-09: "NO DIGIMON — we literally
  have our own summon sprites" — the brief species→Digimon map was removed;
  digi-api fetches now apply to legacy DB rows only (Digimon is a Bandai/Namco
  trademark; the pre-existing legacy cache is unchanged).
- All other abyss enemies render the repo's existing curated forward-facing
  single-sprite pixel pool (`enemies/*.png` — sparklinlabs superpowers-asset-packs
  bundles, CC0 — see "Prior art" below). CAVE_BAT maps to the winged
  front-facing single (`fire (6).png`); the old bat sheet is a side-view walk
  strip with no front frame.

## Prior art already in the game (referenced, unchanged)

- Enemy sheets (bat, wolf, boar, goblin, troll, crab, ...): bundled with the
  project's image-service assets (sparklinlabs superpowers-asset-packs &
  related free packs, CC0/promotional bundles).
- Card UI (wood / gold / parchment): "RPG GUI construction kit" by Lamoot
  (OpenGameArt, CC-BY-SA 3.0).
- Fonts: Cinzel, Cinzel Decorative (OFL), MedievalSharp (OFL), Inter (OFL).
