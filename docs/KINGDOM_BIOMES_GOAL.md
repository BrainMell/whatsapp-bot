# GOAL — five guild-kingdom biomes + one generated map per guild

Owner brief (2026-10-18 15:46Z): *"all the kingdoms (guilds) shouldn't be surrounded by an ocean — only
one. Make 5 different variants that look like different terrains (deserts, blah blah) using the assets we
have. Write an algorithm to automatically generate a unique map for each guild world in each terrain.
Commit every time you do something; finish before this free session ends."*

## Done = all of these
1. **5 biomes**, each visibly different: `isle` (ocean island — the ONLY one with a sea),
   `desert`, `tundra`, `highlands` (autumn valley), `volcanic`.
2. Biomes are made from the assets we already have (KayKit Medieval Hexagon Pack): the baker
   recolours ground / foliage / water / sand / rock per biome (`scripts/kingdom3d`), no new downloads.
3. A **seeded generator** (`core/rpg/kingdomTerrain.js`) builds a unique map from the guild name for any
   biome: silhouette, elevation + moisture noise, rivers (with bridges), lakes, ridges, forests, farms,
   mines, camps/ruins, watch-towers. Same guild → same land; different guilds → different land.
4. Guild picks its biome from its name hash (or `state.biome` override); renderer API unchanged.
5. Proof sheets rendered + eyeballed for every biome and several seeds; docs updated.

## Progress log (newest last — each line = a pushed commit)
- [ ] palette-swap baker
- [ ] biome sprite sets baked
- [ ] terrain generator
- [ ] guild renderer wired to biomes
- [ ] proof sheets + docs
