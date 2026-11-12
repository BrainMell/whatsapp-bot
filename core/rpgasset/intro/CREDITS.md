# Aldafold registration intro — asset credits & licences

Most third-party audio is **CC0 1.0 (public domain)**. Exceptions (attribution required) are listed below.

| Files (`audio_src/`) | Source | Licence |
|---|---|---|
| `ambi_*`, `bd_boom`, `misc_cineboom`, `misc_crow`, `perc_*`, `drum_*`, `loop_drone_g_97` (.flac) | Sonic Pi sample library — https://github.com/sonic-pi-net/sonic-pi (`etc/samples`, originals from freesound.org, all CC0; see that folder's README) | CC0 1.0 |
| `knifeSlice*`, `drawKnife2`, `metalLatch`, `metalPot*`, `cloth*` (.ogg) | Kenney "RPG Audio" — https://kenney.nl / mirrored in https://github.com/ismetcabbar9-oss/kenney-audio-assets | CC0 1.0 |

Everything else (all artwork — paper-cutout scenery, silhouettes, creatures, sigils — the music score, the risers/impacts built from the samples above, and the typography layout) is original, generated procedurally by the scripts in `core/rpg/systems/intro/aldafold/` and `scripts/build_aldafold_intro.js`.

Fonts used (already bundled in `core/rpgasset/fonts/`): Cinzel / Cinzel Decorative (SIL OFL), IM Fell English (SIL OFL), Noto Sans Runic (SIL OFL).

`aldafold_logo.png` is the project's own logo, used unmodified.


## Attribution-required / licence-caveat items

| File | Source | Licence |
|---|---|---|
| `audio_src/glorytales_bombastic_opening.mp3` | "Bombastic Opening" from *Glorytales* by 0xabad1dea (Melissa Elliott) — https://github.com/0xabad1dea/glorytales. Trimmed/mixed under sound design; no endorsement implied. | CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/ |
| `art/dore_charon.jpg`, `art/dore_winged.png` | Gustave Doré engravings (Divina Commedia, 1857–68, public domain), as separated layers from https://github.com/jumpjack/divina-commedia-animata. Recoloured (duotone "etching") in `scenes.js`. | Originals public domain. The layer repo is GPL-3.0: if you redistribute the layer files themselves, keep that in mind. |

The earlier "all artwork is procedural" statement now applies to everything except the two Doré plates above (Question and Fate scenes).
