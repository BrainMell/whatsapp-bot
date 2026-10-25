Halloween-mode art audit and sources

Implementation choice
- Halloween cards now use the repository's actual scene artwork instead of a hand-drawn silhouette mansion: manor.jpg, gallery.jpg, hallway_c.jpg, entrance.jpg, bedroom_a.jpg, bedroom_b.jpg, hallway_a.jpg, library.jpg, drawing.jpg, and ballroom.jpg in assets/bg.
- Guest cut-outs use the real bundled PNG sprites in assets/char. Their visible alpha is strengthened at render time so faint source opacity does not make a living guest look spectral.
- Cards choose a setting that fits the event (manor for the opener/finale, hallway at night, bedroom for body/clue cards, library for ritual/evidence, ballroom for voting). Art is composited behind text and sprite layers, rather than drawing a replacement house.

External packs researched for possible later expansion
- Kenney Graveyard Kit (CC0): https://kenney.nl/assets/graveyard-kit. 3D models, so these need deliberate renders/bakes before use in a 2D WhatsApp card pipeline.
- Kenney Roguelike/RPG Pack (CC0): https://kenney.nl/assets/roguelike-rpg-pack. Cohesive 16x16 pixel assets, but a different art direction from Blackvale's existing portrait backgrounds.
- AssetSmithy Gothic Victorian Background Sampler: https://assetsmithy.itch.io/3-free-gothic-victorian-characters-visual-novel-rpg-sprites-sampler and https://itch.io/t/6893076/free-5-gothic-2d-game-backgrounds-victorian-manor-night-town-royalty-free-sampler. Publisher describes commercial use as allowed and discloses that the art is AI-assisted. Not bundled because mixing it into the current hand-painted portrait set would create a visible style mismatch.

Source/license checks are notes for asset selection, not a legal opinion. Re-check the source pack's live license before adding any external files to the repository.
