# Summon-card art swap folder
Drop `<cardId>.png` here (e.g. `pyraxis.png`, `ifrit.png`) to replace a card's artwork.
- Any size; it is cover-fitted into the card's art window (roughly 3:2 landscape works best).
- Transparent PNGs are fine (an element-tinted backdrop is drawn behind them).
- Optional `<cardId>_back.png` is reserved for a card-back look.
No code change or restart-time config needed beyond a bot restart (art is cached per process).
Fallback order: this folder -> the legacy sprite listed in the catalog -> a generated glyph placeholder.
