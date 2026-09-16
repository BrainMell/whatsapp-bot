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

## 8. V3 - FULL VISUAL INSPECTION PASS (2026-09-16, owner-triggered)

The owner rejected v2 ("still looks the same with other themes") and demanded
a real per-set, per-style VISUAL inspection. All 126 QA renders (9 styles x
14 kinds) were pulled from the build box and inspected image-by-image. The
inspection found real problems that code review alone missed:

### 8.1 Findings (v2 -> v3)

STRUCTURAL SAMENESS (the owner's exact complaint):
- EQUIP: 6 of 9 styles were the same "left portrait + 3x3 slot grid"
  skeleton (Stonekeep, Woodmere, Soul Forge, Neon, Monolith, Crimson).
- SKILLTREE: Soul Forge duplicated the Arcanum radial-ring constellation
  (the owner had explicitly banned one shared ring layout).
- SHOP: every style had a fixed 1100px canvas with rows crammed at the top
  and a giant dead void below.

RENDER DEFECTS:
- Monolith RANK: engraved name overlapped the glyph band (ticks struck
  through the letters).
- Stonekeep: empty riveted keystone plate top-right on 7 of 8 kinds.
- Crimson ALLOCATE: right column overflow ("HALF VALUE..." clipped at the
  card edge; CTA pennant truncated).
- Monolith ALLOCATE: "[" "]" rendered as vertical bars (font substitution).
- Stonekeep GUILDINFO: guild name engraved dark-on-dark, nearly invisible.
- Stonekeep economy cards: torch/ember glows rendered as dirty smudges.
- Monolith ABILITIES: last row sub-text clipped by the slab bottom.
- Noir RANK: rank line truncated to "B-RANK ADVENT...".

### 8.2 v3 structural redesigns (not recolours)

- EQUIP is now 9 distinct compositions:
  Stonekeep = riveted armory wall grid (kept); Arcanum = hero center +
  flanking columns (kept); Retro = playbill dotted list (kept); Woodmere =
  pegboard with two wooden rails, ropes and alternating drop lengths;
  Noir = dossier manifest (kept); Soul Forge = RELIC VAULT with three gold
  hairline shelves, relics as glowing gems standing ON the shelf lines;
  Neon = LOADOUT hotbar terminal (two full-width equip rails + operative /
  integrity / notes panels); Monolith = THE RELIC ASCENT, nine carved steps
  rising left-to-right with relic braziers on each tread and the hero statue
  on the summit plateau; Crimson = THE REGALIA DISPLAY, nine pendant shields
  hanging from two gold rails on drop-rods.
- SKILLTREE: Soul Forge rebuilt as SOUL THREADS (three ritual bead-threads
  hanging from summoning rings, roman tier marks, names beside every bead).
  Arcanum constellation nodes now carry skill names + progress (flipped
  inward near the branch chips to avoid collisions).
- SHOP: canvas height is now computed from the entry count in all 9 styles
  (no dead voids); Monolith exchange re-spaced.
- Defect fixes as listed above (Monolith band spacing, bracket-safe CTA
  strings, Stonekeep keystone "EST. J" chisel stamp + guild name slab +
  clean economy plaque, Crimson three-line note + "[N]" pennant, Noir
  auto-shrink rank line).

### 8.3 v3 verification

- Three QA rounds (render -> LOOK at every PNG -> fix -> re-render). Round 3
  verified all fixes: no collisions, no clipping, no voids; EQUIP 9/9 and
  SKILLTREE 9/9 structurally distinct.
- Deployed: rebuilt binary swapped on Box2 (md5 1e750387...) AND Box1;
  pm2 go/scraper/whatsapp-bot all online on both boxes.
- Live: :7860 /api/cards/portrait returns distinct styled bytes per style
  (8/8 distinct hashes for RANK+ALLOCATE x 4 styles); real Box1
  generatePortraitCard path verified for styles 3/6/10; live EQUIP
  re-verified after the Box2 binary swap (Relic Ascent + Regalia Display
  confirmed from the live API).
- Repos: bot_generation 92569bc pushed to origin/main; Box1 mirror commit
  f369ac5; whatsapp-bot docs updated (this section).

## 9. V4 PASS - BROKEN COMMANDS + COMPLETED THEME COVERAGE (2026-09-16)

Owner report that started this pass: ".abilities and .equip are broken, the
skill tree is still showing the default design." All three root-caused and
fixed; then the remaining unthemed economy surfaces were redesigned, and the
whole inventory was re-verified visually.

### 9.1 Root causes + fixes

| Symptom | Root cause | Fix |
|---|---|---|
| .abilities fatal (every call) | viewAbilities referenced pagination arg `pageArg` but the signature never declared it (ReferenceError, message skipped as FATAL) | signature now `(sock, chatId, senderJid, senderName, pageArg)` - engine already passed it |
| .abilities fatal one layer deeper | `abilityEffectText()` was called by the text+card builders but never defined anywhere | new module-level formatter: effect object -> one short line, covering every effect type in the schema |
| abilities card tofu boxes | real payloads carry emoji (cost `⚡`, rune glyphs); theme faces (Cinzel/IM Fell/PressStart/Inter) have no such glyphs | card payload now uses ASCII tags (EN 12, CD2, STUN/BURN/... via effectTags()); cardstyle.Sanitize also drops emoji/symbol codepoints as a global defense (item names like "☣️ Infected Shard" included) |
| skill tree = default design for everyone | SKILLTREE generatePortraitCard call passed kind but never `style` | passes `user.cardStyle` now; live render verified (style 9 player gets THE PILLARS OF MASTERY, not the decree constellation) |
| .equip broken UX | bare `.equip` printed the legacy raw text list; equip errors doubled the ❌ prefix | bare `.equip` now shows the themed EQUIP card (same as .equipment); single ❌ |

### 9.2 Completed theme coverage: money family

The balance + money-movement cards had never been themed (Kenney base for
every player). They are now part of each theme's system, following the same
base-and-variation contract as the craft family (see section 10):

| Kind | Canvas | Command | Composition per theme |
|---|---|---|---|
| BALANCE | 1000x600 | .balance/.bal | the theme's treasury register (vault plaque / gilded ledger / statement of account / coin till / house account / astral exchequer / credit terminal / counting stone / treasurer's plate) |
| TRANSFER | 1000x600 | .transfer | the theme's directed flow: FROM WALLET -> TO ADVENTURER |
| DEPOSIT | 1000x600 | .deposit | same flow, wallet -> bank |
| WITHDRAW | 1000x600 | .withdraw | same flow, bank -> wallet (arrow reverses) |

Node style pass-throughs added for: BALANCE, TRANSFER, DEPOSIT, WITHDRAW,
FISH catch, DECREE rank-up (the last two were themed Go-side since v3 but the
engine never sent the player's style).

### 9.3 Renderer bug found by visual QA: sticky clip mask

gg v1.3.0's Pop() deliberately keeps the post-Clip mask (`dc.mask =
before.mask`), so Push/Clip/Pop leaves the clip sticky. The Rune Monolith
painters (combat style09.go, econStyle09, the new money painters) draw their
registers inside the stele, so anything drawn afterwards was silently
clipped away. Symptom: S09 money cards rendered ONE stele and nothing else.
Fix: `dc.ResetClip()` after every Pop that follows a Clip (style09.go base,
econStyle09, econ_style_money.go).

### 9.4 VERIFIED INVENTORY CHECKLIST (final, evidence-based)

Every line below was rendered and LOOKED at (QA matrix 9 styles x 18 kinds =
162 renders, 3 visual rounds) and the marked commands were additionally
exercised live through the real handlers with a mock sock against production
Mongo (e2e_cardcmds.js / e2e_cardcmds2.js).

| # | Card | Command | 10-style support | Verified |
|---|------|---------|------------------|----------|
| 1 | PROFILE character sheet | .char/.profile + previews | real per-style designs (bg_1..10 + layouts) | ✅ visual (10/10 renders) |
| 2 | Style picker sheet | .cardstyle | auto from profile designs | ✅ rendered |
| 3 | RANK | .rank | 9 rebuilt + decree baked | ✅ visual sheet |
| 4 | ALLOCATE | .allocate | 9 rebuilt + decree | ✅ visual sheet |
| 5 | SKILLUP | .skill up | 9 rebuilt + decree | ✅ visual sheet |
| 6 | ABILITIES | .abilities | 9 rebuilt + decree | ✅ visual sheet + ✅ LIVE (pages 1/2, no tofu) |
| 7 | SKILLTREE | .skill tree/.st | 9 rebuilt + decree | ✅ visual sheet + ✅ LIVE (style 9 pillars) |
| 8 | EQUIP | .equipment/.gear/.equip | 9 rebuilt + decree | ✅ visual sheet + ✅ LIVE (style 9 armory) |
| 9 | GUILDINFO | .guild info | 9 rebuilt + decree | ✅ visual sheet |
| 10 | SHOP | (kind ready, no live caller) | 9 rebuilt + decree | ✅ visual sheet |
| 11 | BALANCE | .balance/.bal | 9 rebuilt + Kenney base | ✅ visual sheet + ✅ LIVE (styles 1/6/9/10) |
| 12 | CRAFT result | .craft | 9 rebuilt + decree | ✅ visual sheet |
| 13 | BREW result | .brew | 9 rebuilt + decree | ✅ visual sheet |
| 14 | COOK result | .cook | 9 rebuilt + decree | ✅ visual sheet |
| 15 | FORGE result | .forge | 9 rebuilt + decree | ✅ visual sheet |
| 16 | FISH catch | fishing result | 9 rebuilt + decree (Node pass added in v4) | ✅ visual sheet |
| 17 | DECREE rank-up | rank-up ceremony | 9 rebuilt + decree (Node pass added in v4) | ✅ visual sheet |
| 18 | TRANSFER | .transfer | 9 rebuilt + Kenney base (NEW v4) | ✅ visual sheet |
| 19 | DEPOSIT | .deposit | 9 rebuilt + Kenney base (NEW v4) | ✅ visual sheet |
| 20 | WITHDRAW | .withdraw | 9 rebuilt + Kenney base (NEW v4) | ✅ visual sheet |
| 21 | Summon roster + detail | .summons | own animated identity (NOT decree-derived; sprite GIF compositor - left as designed) | documented decision |
| 22 | TCG grids/decks/eshop | card-game commands | out of scope (separate TCG product surface) | documented decision |
| 23 | Ludo/TTT/Chess boards | game commands | out of scope (games with own identities) | documented decision |
| 24 | DUEL / QUEST / TRIAL / ABYSS_ENTRY+RESULT | battle results | EXCLUDED (battle-active) | owner rule |
| 25 | QUESTSTART / RAID | battle starter screen | EXCLUDED (battle-active) | owner rule |
| 26 | HUNT / BOSS splash / VICTORY / DEFEAT / EndScreen | encounters + combat end | EXCLUDED (battle-active) | owner rule |

Live command verification (real handlers, production Mongo, style 9 + 10
players): .abilities pages 1/2 -> styled codex image; .skill tree -> styled
pillar card; .equipment -> styled armory card; .equip <item> -> equips +
confirms; .equip (bare) -> styled armory card; unequip -> restores. Services
restarted on both boxes; /health 200; pm2 all online.
## 10. THE ROYAL DECREE REUSE PATTERN (documented) + HOW EVERY THEME MIRRORS IT

Owner directive: document every instance where Royal Decree (the default)
reuses one of its own designs with slight modifications, then use that as
the design pattern for the other themes - each theme gets ORIGINAL base
designs per command/card, and may reuse ITS OWN designs with modifications
where that makes sense. Coherent language per theme; intentional reuse and
variation within it; themes fundamentally distinct from each other.

### 10.1 Where Royal Decree reuses its own designs (code-documented)

| Base design | Reused for | Modification per reuse |
|---|---|---|
| 600x1000 lamoot portrait bake (leather name plate (60,132)-(330,186), main panel (55,208)-(545,832), dividers y266/y492) | DUEL, QUEST, TRIAL, RANK, ALLOCATE (bg_DUEL/QUEST/TRIAL/RANK/ALLOCATE.png share the geometry) | banner text ("DUEL RESOLVED" / "QUEST COMPLETE" / "EVOLUTION" / "ADVENTURER"), panel labels ("THE TALLY" / "THE ASCENSION" / "THE PATH AHEAD"), row layout (stat rows vs party rows vs progress bars), scene window only on DUEL |
| QUEST render path | TRIAL | literally the same stat-row code path, different labels + seal |
| QUESTSTART renderer | RAID | one function `renderQuestStartCard(c, req, raid bool)`; raid flag swaps scene palette/label |
| 1000x600 craft bake (workbench parchment) | CRAFT, BREW, COOK, FORGE, FISH | type title ("CRAFTED"/"BREWED"/"COOKED"/"FORGED"/"CATCH OF THE DAY"), accent colour, item + caption |
| craft bake + bg_DECREE.png | DECREE rank-up | same leather plate + Cinzel family, banner becomes "RANK UP", wax seal carries the rank letter, ledger old->new |
| EndCard shell | VICTORY / DEFEAT | outcome word, palette accent, reward ledger sign |
| Kenney money base (drawBase + drawHead) | BALANCE, TRANSFER, DEPOSIT, WITHDRAW | headline (TOTAL WEALTH vs kind), FROM/TO panels, accent set per kind |

That is the house pattern: ONE strong base per family, then per-kind
modifications of header, labels, accents and data layout - never a new
unrelated canvas per kind, never one canvas for everything.

### 10.2 Each theme's base designs and their reuses (current implementation)

| Theme | Family bases (original per theme) | Reuse with modification |
|---|---|---|
| 1 STONEKEEP | (a) riveted granite plaque set (s01Base/s01IronPlate/s01Slab); (b) THE VAULT wall face (s01VaultBase) | plaque set underlies RANK/ALLOCATE/SKILLUP/ABILITIES/GUILDINFO/SHOP/EQUIP; vault face = BALANCE (three slabs + meter) and money flow (same slabs, FROM/TO tags + carved arrow + torchlit amount); craft family = anvil plaque with type titles |
| 2 GOLDEN ARCANUM | (a) indigo ritual field + hairline frames + starfield; (b) the transmutation circle (arcaneCircle) | circle = ABILITIES seal, econ item sigil, BALANCE great total circle; money flow = TWO circles joined by a gold arc with a travelling diamond; skilltree = radial constellation of the same circles |
| 3 RETRO COURT | (a) sepia halftone page + double rules + fleuron (s03ParlourBase/parlourRule) | page underlies all portrait kinds; craft = apprenticeship certificate; BALANCE = STATEMENT OF ACCOUNT (dot-leader ledger rows); money flow = promissory note (sum in the middle, FROM/TO dotted lines) |
| 4 WOODMERE | (a) oak planks + hanging shingle + stitched vellum panel | craft = workbench plaque; SKILLTREE = literal branching tree; BALANCE = THE COIN TILL (burned ledger rows + notch meter); money flow = two trays + carved groove with a rolling coin |
| 5 EMBLEM NOIR | (a) black field, registration marks, ziggurat crown, chartered band, wax seal | craft = operation report; BALANCE = HOUSE ACCOUNT (band holds TOTAL, register rows right); money flow = same frame, band holds the AMOUNT, register becomes FROM/TO with deco chevrons; seal anchors every kind |
| 6 SOUL FORGE | (a) night sky + gold hairline frame + centre diamonds + dotted leaders + gold pill CTA (owner's Allocate anchor) | ALLOCATE is the canonical composition; abilities/econ reframe the diamond geometry; BALANCE = ASTRAL EXCHEQUER shelves (diamond bullets, cyan numerals, pill CTA); money flow = two diamond nodes on a dotted gold thread with the amount glowing above |
| 7 ROYAL DECREE | baked default (see 10.1) | unchanged |
| 8 NEON ARCADE | (a) navy grid + scanlines + bracket panels + PS2P marquee | craft = crafted toast; BALANCE = CREDIT TERMINAL (marquee, glowing total, slot panels + seg bars); money flow = FROM/TO slot panels + chunky pixel arrow + score-popup amount; skilltree = circuit grid |
| 9 RUNE MONOLITH | (a) standing stele silhouette (s09Stele) + glyph bands + ember glows | stele underlies RANK/ALLOCATE/SKILLUP/ABILITIES/GUILDINFO/SHOP/EQUIP; skilltree = pillar columns; BALANCE = THE COUNTING STONE (one wide stele, ember total); money flow = TWO steles + carved channel + ember spark, arrow direction by kind |
| 10 CRIMSON COURT | (a) damask field + gold hairline frames + cartouches + shields + wax seal | craft = commission shield; BALANCE = THE TREASURY (three stacked cartouches); money flow = twin shields + gold filigree arrow; skilltree = lineage tree of shields |

Within every theme the bases share that theme's palette roles, corner
language, texture and typography; across themes nothing transfers - a
Stonekeep vault, an Arcanum circle pair, a Noir chartered band and a
Monolith stele count money in four different structural ways.

### 10.3 Files carried by this pass

- Go: pkg/economy/econ_style_money.go (NEW - 18 painters + dispatch + QA hook),
  pkg/economy/econ_style_craft.go (money routing + ResetClip), pkg/economy/renderer.go
  (EconomyCardRequest.Style + dispatch), pkg/cardstyle/cardstyle.go (Sanitize
  drops emoji codepoints), pkg/combat/style09.go (ResetClip).
- Node: core/commands/skillCommands.js (pageArg, abilityEffectText, effectTags,
  SKILLTREE style pass), core/engine.js (bare .equip -> EQUIP card; style
  pass-throughs for DECREE/FISH/TRANSFER/DEPOSIT/WITHDRAW/BALANCE),
  core/commands/rpgCommands.js (single error prefix).
- QA: qa/styleqa/main.go extended to 18 kinds x 9 styles (+BALANCE) = 162 renders.
