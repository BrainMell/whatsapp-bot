# CARD REDESIGN PLAN - 2026-09-16 (v2, full execution)

> Owner directive: the previous pass changed colors on one shared skeleton.
> That is rejected. Every style must be a genuinely different DESIGN SYSTEM:
> its own assets, shapes, motifs, typography, framing, textures, composition
> and visual language - recognizable from STRUCTURE alone, even in grayscale.
> Skill trees must NOT share one connected-circle layout. The owner-provided
> "SOUL FORGE" Allocate card becomes Style 6's Allocate design and drives
> Style 6's whole visual language.

## 1. COMPLETE CARD INVENTORY (as generated today)

Rendered by the Go image service (bot_generation) via /api/cards/portrait,
/api/cards/transaction, /api/summons/*; profile cards rendered Node-side
(profileCardRenderer.js). "Battle-active" = part of a combat/encounter flow.

| # | Card (kind) | Canvas | Command / trigger | Displays | Battle-active | Current style support |
|---|-------------|--------|-------------------|----------|---------------|----------------------|
| 1 | DUEL | 600x1000 | duel/pvp result | winner/loser, sprites, spoils ledger, forfeit stamp | YES (result) | none (baked decree) |
| 2 | QUEST | 600x1000 | guild adventure end | party tally, per-player spoils | YES (result) | none |
| 3 | TRIAL | 600x1000 | evolution/ascension | trial result, class art | YES (encounter) | none |
| 4 | ABYSS_ENTRY / ABYSS_RESULT | 600x1000 | abyss run | run intro/result | YES | none |
| 5 | QUESTSTART / RAID | 1000x600 | .quest/.raid start | party + dungeon scene | YES (battle starter screen) | none |
| 6 | HUNT | 1000x600 | hunt encounters | quarry scene + rewards | YES (encounter) | none |
| 7 | BOSS splash | 1024x576 | boss appear | boss intro | YES | none |
| 8 | VICTORY / DEFEAT + EndScreen | 600x1000 | combat end | outcome, rewards | YES (result) | none |
| 9 | RANK | 600x1000 | .rank | level, rank line, XP bar, standing rows, progress bars | no | phase-8 palette-only |
| 10 | ALLOCATE | 600x1000 | .allocate | unspent points, per-stat invested + per-pt value, spent bar | no | phase-8 palette-only |
| 11 | SKILLUP | 600x1000 | .skill up | skill medallion, tier, pips, cost | no | phase-8 palette-only |
| 12 | ABILITIES | 1000xH | .abilities | class codex doc title/quote, grouped skill rows + effect runes, pagination | no | phase-8 palette-only |
| 13 | SKILLTREE | 1200x1000 | .skilltree | class root, branches, tier nodes/links, points pill | no | NONE (decree constellation for everyone) |
| 14 | EQUIP | 1500x1000 | .equip | hero panel + 9 slot plates, tiers, durability, summary | no | phase-8 palette-only |
| 15 | SHOP | 800x1100 | (no live caller today; kind exists) | shop entries | no | phase-8 palette-only |
| 16 | GUILDINFO | 800x800 | .guild info | crest, motto, charter rows, level/XP, 3 building rings | no | NONE (decree bake) |
| 17 | CRAFT / BREW / COOK / FORGE / FISH | 1000x600 | .craft .brew .cook .forge (+fishing) | creator, item, qty seal, flavor | no | NONE (decree bakes) |
| 18 | DECREE (rank-up) | 1000x600 | rank-up ceremony | rank old->new, wax seal | no | NONE (decree bake) |
| 19 | PROFILE / character sheet | 800x1100 | .char/.profile + shop+cardstyle preview | class sprite/pfp, level, XP, 8 stats, guild line | no | REAL per-style designs (bg_1..10.png + layouts.json) |
| 20 | Style picker sheet | composite | .j cardstyle | 10 style thumbnails | no | auto (uses profile bgs) |
| 21 | Summon roster + summon detail | animated GIF | .summons | summon slots, stats, active marker | no (pre-battle) | NONE (own look) |
| 22 | TCG grids/decks/eshop/burn | various | claim/deck/coll/eshop | card-game collections | no | out of scope (separate TCG system) |
| 23 | Ludo / TTT / Chess boards | various | game commands | game state | no | out of scope (games, already own identities) |

Style numbering (menu order, everywhere): 1 Stonekeep, 2 Golden Arcanum,
3 Retro Court, 4 Woodmere, 5 Emblem Noir, 6 SOUL FORGE (was "Holo Gacha"),
7 Royal Decree (default), 8 Neon Arcade, 9 Rune Monolith, 10 Crimson Court.

## 2. STAY UNCHANGED (and why)

- Battle-active per owner rule: DUEL, QUEST, TRIAL, ABYSS_*, QUESTSTART/RAID
  (the battle starter screen), HUNT, BOSS splash, VICTORY/DEFEAT/EndScreen,
  combat scene renders + animated combat MP4. These are the combat art family
  (lamoot wood/gold bake) - consistent, in-use, owner excluded them.
- TCG system cards (#22) and game boards (#23): different product surfaces
  with their own approved looks; not part of the RPG card-style system.
- Royal Decree (style 7): the baked parchment/wood/gold identity IS a real
  design system and the server default. It stays byte-identical.

## 3. REDESIGNED (all 9 non-decree styles x each kind)

Kinds restyled through the new system: RANK, ALLOCATE, SKILLUP, ABILITIES,
SKILLTREE, EQUIP, SHOP, GUILDINFO, CRAFT/BREW/COOK/FORGE/FISH (one composition
per style, type variants), DECREE rank-up, PROFILE style-6 re-bake, summon
roster/detail per-style frames (frame/palette system). Style 7 callers keep
the exact baked output.

## 4. THE NINE DESIGN SYSTEMS (structure, not color)

Shared palette/typography/motif kit lives in pkg/cardstyle; per-style
renderers in pkg/combat (portrait kinds) + pkg/economy (craft/decree).

### 1 STONEKEEP - "The Bastion Ledger" (granite masonry)
Language: the card IS a fortress wall. Stacked stone SLABS with real mortar
gaps (no continuous panel). Iron header plate top-LEFT, riveted, title
stamped. Every section a separate slab with 3px bevel + corner rivets.
Values on hanging iron TAGS. Meters = iron channel with steel fill. Stone
speckle texture. Typography: Cinzel Dec Bold titles / Cinzel labels /
Inter-SemiBold data.
- RANK: 3 slabs (identity / record / standing); level stamped like a keystone.
- ALLOCATE: keystone number slab; stat rows as riveted iron tags.
- SKILLUP: shield-mount slab; level pips = rivets.
- ABILITIES: two-column chiseled ledger with carved band headers.
- SKILLTREE: MASONRY GRID - square blocks in wall courses (tier = course,
  branch = column); learned blocks torch-lit, links = glowing mortar cracks.
- EQUIP: armory wall, weapons on stone racks (3x3 slab grid).
- SHOP/GUILDINFO/CRAFT/DECREE: market counters, crest slab, anvil plaque,
  carved proclamation slab.

### 2 GOLDEN ARCANUM - "Ritual of Ascension" (indigo + ritual gold)
Language: everything organized by CONCENTRIC RITUAL CIRCLES. Great circle as
structural skeleton; orbital bands hold sections; gold hairline doubles;
glowing sigil numerals; translucent indigo panels; diamond markers.
- RANK: level as glowing sigil in circle core; record/standing as orbital bands.
- ALLOCATE: unspent points in the circle; seven stat nodes on the rim.
- SKILLUP: sigil in triangle-in-circle; tier runes around rim.
- ABILITIES: illuminated folio, sigil bullets.
- SKILLTREE: RADIAL MANDALA - root at center, branches = spokes, tiers = rings.
- EQUIP: slots placed on a great ring around the hero panel.
- Others: athanaeum ledger / sigil-ring crest / transmutation circle /
  gold-ink scroll.

### 3 RETRO COURT - "The Guild Playbill" (sepia broadsheet)
Language: typographic. NO panels - ink on aged paper. Oversized masthead,
hairline double rules, fleuron separators, small-caps subheads, dotted-leader
bill rows, halftone texture, burgundy accents. IM Fell English typography.
- RANK: masthead name; "PROGRAMME" bill rows; standing as classified column.
- ALLOCATE: "THE SEVEN WONDERS" dotted-leader bill.
- SKILLUP: star-billing announcement.
- SKILLTREE: PARLOUR GAME PATH - winding numbered route; learned stations
  filled burgundy.
- Others: costume bill / advertisements / society letterhead / intermission
  notice / front-page proclamation.

### 4 WOODMERE - "The Hearth & Bough" (carved oak)
Language: hanging SIGNBOARD header on iron hooks and chains; content on a
vellum page with visible binding stitches on the left; carved notch borders;
branch-and-leaf ornament; tally-notch meters; amber glow. Cinzel +
MedievalSharp.
- SKILLTREE: A LITERAL BRANCHING TREE - carved trunk and limbs growing from
  a root word; skill nodes = hanging wooden tags; learned tags glow amber.
- Others: ledger page record / notch allocation / wooden medallion skillup /
  guestbook abilities / pegged tool wall / market board / inn-sign crest /
  workbench plaque / carved notice board.

### 5 EMBLEM NOIR - "Classified Dossier" (matte black + gold + wax)
Language: austere file. Huge negative space; one gold hairline emblem;
wide-tracked Inter data rows over thin rules; file stamps (CASE / REF);
corner registration marks; the red wax seal is the only color.
- SKILLTREE: DIAMOND LATTICE - strict rotated-square grid, diagonal lines,
  gold nodes, wax seal at the apex node.
- Others: dossier sheet / allocation ledger / promotion memo / index list /
  manifest / procurement / chapter charter / operation report / investiture.

### 6 SOUL FORGE - "Celestial Sanctum" (deep indigo night + gold + cyan glow)
OWNER ANCHOR: the provided Allocate card defines the language. Elements:
night-sky indigo field with faint star field; gold hairline frame with center
diamonds top/bottom; centered gold display title + letterspaced subtitle +
thin rule; faint concentric magic circles behind key numbers; GLOWING CYAN
numerals; stat chips (rounded squares, 2-3 letter codes) + dotted leaders +
cyan values; rounded indigo panels with gold hairline; gold pill CTA;
MedievalSharp caption.
- ALLOCATE: EXACT reproduction of the owner card (SOUL FORGE / ATTRIBUTE
  ALLOCATION / class+tier line / UNSPENT POINTS / glowing count / THE SEVEN
  PATHS panel / chip rows / SPENT row / footnote / .j allocate pill / caption).
- RANK: "ASCENSION RECORD" - circle + glowing level, dotted-leader standing,
  rank pill.
- SKILLUP: "RITUAL OF MASTERY" - sigil circle, orbit-dot pips.
- ABILITIES: "CODEX OF STARS" - chip + dotted-leader entries, page label.
- SKILLTREE: ORBITAL RINGS - core star center, tier = concentric ring,
  branch = arc segment; learned stars glow cyan, maxed turn gold.
- EQUIP: "RELIC VAULT" - rounded panel grid, cyan glow tiers.
- SHOP: "WARDROBE OF WONDERS"; GUILDINFO: "SANCTUM CHARTER" with sigil ring.
- CRAFT/DECREE: "FORGIVING THE SOUL" transmutation notice / celestial decree.

### 8 NEON ARCADE - "Player One HUD" (synthwave cabinet)
Language: CRT marquee header with scanlines; bracket-cornered HUD panels;
segmented LED bars; 7-segment style numerals; horizon grid; magenta primary /
cyan secondary glow. Press Start 2P titles/values, Inter data.
- SKILLTREE: CIRCUIT GRID - right-angle traces with solder-pad nodes,
  bottom-up level columns.
- Others: PLAYER STATS screen / UPGRADE MENU (+ "PRESS START" pill) /
  MASTERY UNLOCKED / SKILL LIST.EXE / LOADOUT screen / ARMORY SHOP /
  GUILD SERVER / ITEM CRAFTED toast / RANK UP.

### 9 RUNE MONOLITH - "The Basalt Codex" (carved stone + ember)
Language: content ENGRAVED into basalt (dark inset + top-light offset).
Glyph columns run down the margins; carved glyph bands separate sections;
recessed carved panels (no pills); ember glow behind key values.
- SKILLTREE: PILLAR COLUMNS - one carved pillar per branch rising from a
  plinth; rune-socket nodes smolder when learned; tiers cross all pillars.
- Others: engraved tablet variants.

### 10 CRIMSON COURT - "Court of Crimson" (velvet damask + ornate gold)
Language: baroque. Gold cartouche headers, damask velvet field, heraldic
SHIELDS for key values, pennant rows, filigree connectors, candlelight
vignette. Cinzel Dec Bold + Cinzel.
- SKILLTREE: LINEAGE TREE - heraldic family tree; shield nodes joined by
  filigree; gold gleam when learned.
- Others: letters patent / court ledger with wax / investiture / retinue
  list / regalia display / court emporium / chapter arms / commission /
  herald's proclamation.

## 5. IMPLEMENTATION ARCHITECTURE

- pkg/cardstyle (NEW, shared): palettes (per-style role structs), canvas
  primitives (hairline frames, diamond accents, star fields, dotted leaders,
  chips, rounded panels, glow text, engrave text, bevel/rivets, segmented
  bars, sigil rings, tags, pennants, stamps, fleurons, damask, halftone,
  planks, glyph columns), font registry (Cinzel, Cinzel Dec, MedievalSharp,
  IM Fell x2, Press Start 2P, Inter x3 - fonts staged into craft/fonts/).
- pkg/combat/style01..10.go: per-style `renderStyleNN(kind, req)` covering
  RANK/ALLOCATE/SKILLUP/ABILITIES/SKILLTREE/EQUIP/SHOP/GUILDINFO.
- pkg/economy/style_craft.go: per-style CRAFT/BREW/COOK/FORGE/FISH + DECREE.
- Dispatch: GeneratePortraitCard + GenerateTransactionCard route themed
  kinds to the style renderer (style 0/7 keeps the exact baked output).
- Node: TransactionCardRequest + GUILDINFO + EQUIP payloads gain
  `style: user.cardStyle`; CARD_STYLE_NAMES[6] -> "Soul Forge"; style-6
  profile bg re-baked in the Soul Forge language (bg_6.png + layouts.json).
- QA: qa/styleqa/main.go renders EVERY kind x EVERY style to PNG for visual
  inspection; live verification through goImageService on Box1.

## 6. VERIFICATION BAR (per owner directive)

For every style: render all kinds, inspect alignment, spacing, readability,
asset usage, proportions, distinctness. Grayscale-recognizability is the bar
for "genuine redesign". Then verify live: service rebuilt + deployed, and a
real generatePortraitCard call from Box1 returns the styled card for the
picked style.


## 7. IMPLEMENTATION STATUS (2026-09-16, same session)

Shipped and live:
- pkg/cardstyle (NEW): palettes + full primitive vocabulary (frames, chips,
  dotted leaders, magic circles, vector stars, glow/engrave text, bevels,
  rivets, tags, pennants, shields, cartouches, stamps, LED bars, notch
  meters, damask, halftone, planks, glyph columns, star fields, vignettes).
- pkg/combat/style01..10.go + styles_common.go: 9 rebuilt systems x 8 kinds
  (RANK, ALLOCATE, SKILLUP, ABILITIES, SKILLTREE, EQUIP, SHOP, GUILDINFO).
- pkg/economy/econ_style_craft.go: 9 systems x CRAFT/BREW/COOK/FORGE/FISH +
  Soul Forge DECREE (other systems keep the royal decree bake for rank-up).
- Dispatch: /api/cards/portrait + /api/cards/transaction route themed kinds
  to the rebuilt systems; style 0/7 keeps byte-identical baked art.
- New payload fields: ctaLabel/ctaSub (portrait), style (transaction).
- Node: EQUIP/GUILDINFO/CRAFT/DECREE callers now pass user.cardStyle;
  CARD_STYLE_NAMES[6] = "Soul Forge"; ALLOCATE sends CTA lines +
  owner caption; profile bg_6.png re-baked in the Soul Forge language and
  layouts.json style 6 retuned (name/colors/glow).
- QA: qa/styleqa renders all 126 combos (9 styles x 14 kinds); visual QA
  loop fixed chips, glow halos, star glyph tofu (now vector stars), skilltree
  label collisions, guild slab clipping, masthead sizing.
- Verification: node --check, go build, live curl 7860 (styled bytes), live
  generatePortraitCard + renderProfileCard(style 6) from Box1.
- Deploy: rebuilt bot-generation binary deployed to BOTH boxes; all pm2
  services online.
