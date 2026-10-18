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
- [x] palette-swap baker — `scripts/kingdom3d/recolor_biomes.py` (hue-class recolour of ground/foliage/water/earth/rock)
- [x] biome sprite sets baked — `core/rpgasset/kingdom3d/biomes/{desert,tundra,highlands,volcanic}/` (255 files each, plain git, `.gitattributes` rule added)
- [x] terrain generator — `core/rpg/kingdomTerrain.js` (`pickBiome`, `shape`, `populate`; seeded value-noise elevation + moisture)
- [x] guild renderer wired to biomes — `buildWorld` picks biome from guild name (`state.biome` override); only `isle` has a sea
- [ ] proof sheets + docs (`node scripts/render_guild_biomes.js /tmp/gb`)
