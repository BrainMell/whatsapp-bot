# v3 Asset Pack Guide - skills / runes / summons / monster kits

Owner-supplied processed pack (`pixel_assets_named.zip`, ) merged with
the owner-generated gap-fill sheets (8 labeled sheets, same date), processed
through the established pipeline (crop → face-key → silhouette fill →
hires/true_res exports). **This pack is the source of truth for ability, rune,
summon-node and monster-kit art.** The older flat
`core/rpgasset/{skills,runes}/` slices (v1/v2) remain on disk as a
fallback but the loaders no longer consult them first.

## Layout

- `hires/` - ~512px nearest-neighbour upscales. **Default for all renderers**
  (node-canvas cards downscale with smoothing; crisp result).
- `true_res/` - native pixel-art size (1 image pixel = 1 art pixel).
- `manifest.json` - machine-readable mapping (skills with class + display name,
  runes with categories + tier sprite maps, summons path/node entries, monster
  kits). `substitute: true` = no dedicated art existed at pack time.
- `skill_index.json` - GENERATED bridge: `<CLASS>:<skillTreeId>` and bare
  `<skillTreeId>` → `hires/...` sprite path (built from skillTree display names,
  apostrophe-normalized: "Slayer’s Focus" ↔ `slayers_focus`).

## What changed in v3 (owner brief rune_ability_asset_integration_v2.md)

1. **Skill assets replaced** - 272 skills / 45 classes now resolve through
   `skill_index.json`; 269 from the owner pack + 3 direct matches. The 39
   `substitute` skills got **dedicated art** from owner sheet 1 (Mage Mana
   Drain, Berserker Blood Frenzy, Chronomancer Time Stop, Merchant Money Rain,
   Dragonslayer Dragonfall, Warlord Strategic Maneuver / Wide Cleave / Banner
   Charge, Doomslayer Blood Siphon / Crucible, Avatar Elemental Nova, Bard
   Crescendo of Chaos, Lich Eternal Slumber / Apocalypse Nova, Tycoon Zeni
   Storm, Archmage Reality Warp / Mana Surge, Templar Judgment Strike / Sacred
   Ground, Nightblade Shadow Dance / Deadly Toxins / Eviscerate / Eclipse,
   Zenmaster Perfect Strike / Focused Meditation / Serene Impact, Dragon God
   Leviathan's Bane, Reaper Grim Reaping + the 11 shared-artwork skills
   (Warrior Cleave/Execute, Rogue Assassinate, Mage Frost Bolt / Arcane
   Missiles / Blizzard / Meteor / Arcane Shield, Warlord Shield Bash, Tycoon
   Bribe, Nightblade Shadow Clone)). Their `substitute` flags are cleared in
   `manifest.json`.
2. **Rune tier art completed** - every one of the **39 runes** now has four
   tier sprites (`<rune>_lesser/normal/greater/abyssal.png`). The 8 runes that
   had tier art keep it; the 31 that shared one sprite got 4 tiers from owner
   sheets 5-8. Resolution: `skillAssets.getRuneArt(type, tier)`.
3. **Summon skill nodes** - 15 paths × 5 nodes now have dedicated node icons
   (`summons/<arch>/<path>_n1..n5.png`; n1 = the existing path icon alias).
   Wired into `summonSkillTrees.js` at load (`node.icon`), consumed via
   `skillAssets.getSummonNodeArt(archetype, pathKey, nodeNumber)`.
   NOTE: the owner sheets label nodes with flavor names; the GAME node names
   (Reinforced Plating, Damage Immunity, …) are unchanged - icons were assigned
   by path × node position.
4. **Monster kits** - all **12** `MONSTER_ARCHETYPES` now have kit art
   (`monsters/kits/kit_<arch>.png`, wired as `MONSTER_ARCHETYPES[k].kitIcon`,
   loader `skillAssets.getKitArt`). The 7 previously-missing kits map from
   owner sheet 4: BOSS←wolf, SPELLBREAKER←witch, PHALANX←orc, NEMESIS←ghost,
   BERSERKER_MOB←demon, VOID_WALKER←necromancer, COLOSSUS←minotaur. The 5
   summon-archetype kits alias the pack's kit_1..5 portraits (octopus=MAGE,
   green imp=BRUTE, beetle=STALKER, skull-pale=SUPPORT, loot-imp=TANK - easy to
   re-map by swapping files if the owner prefers different pairings). Nine
   extra mob portraits ship in `monsters/extras/` (bandit, skeleton, spider,
   goblin, slime, lizardman, elemental, undead dragon, rogue).
5. **`.rune list <page>`** - new paginated RUNE CODEX image card (8 plates per
   page, tier art, real names/desc/categories from `runeSystem.RUNE_TYPES` +
   v3 manifest). Text fallback preserved.
6. **`.abilities <skillId>`** - full redesign (skill art on a riveted plate as
   the centerpiece, stat medallion rail, real effect + description, unlock
   requirement from the tree's `requires`, tier-specific rune sockets).
   Invalid IDs keep the existing graceful "no learned ability matches" path.

## Data rules (unchanged mechanics)

- Matching is by **class + display name** (apostrophe-normalized), never by
  assumed id equality.
- Rune tier resolution: `<rune>_<tier>.png` if it exists, else `<rune>.png`.
- Skill canvases differ in size - center in the cell, never assume fixed px.
- Draw pixel art with `imageSmoothingEnabled = false` when upscaling.

## Known limitations

- 3 skill ids initially missed because of typographic apostrophes
  (Dragonslayer Slayer's/Hunter's Roar, Shogun Daimyo's Authority) - resolved
  by normalization; 272/272 skillTree skills covered (QA: `scripts/v3_pack_qa.js`).
- Sheet-1 duplicates (the generator repeated a few cells, e.g. two Banner
  Charge variants, "Maner Charge" typo) - best cell chosen per skill; spares
  remain in `unassigned/`.
- The 5 summon-archetype kit portrait pairings are judgment calls (see §4).
- `unassigned/` (56 sheets assets) has no game mapping yet - kept for future
  custom-class skills.
- LFS guard: `core/rpgasset/v3/**` is excluded from Git-LFS in `.gitattributes`
  (box `git reset --hard` deploys must serve real bytes - same rule as the
  abyss backgrounds).
