# CARD SYSTEM - v3 (structure-first, visually verified per set and per style)

> 2026-09-16 v2: the card-style system was REBUILT as nine genuine design
> systems (the previous palette-swap pass was rejected by the owner).
> Canonical spec + card inventory: docs/CARD-REDESIGN-PLAN.md
> Style 6 is now SOUL FORGE (owner-provided Allocate card defines it).
> Battle-active cards keep the combat art family by owner rule. Royal
> Decree (style 7) stays the baked default. Go: pkg/cardstyle + style
> renderers in pkg/combat & pkg/economy. QA: bot_generation qa/styleqa.

# RPG CARD SYSTEM - Design Specification & Developer Guide

**Status:** canonical reference for all RPG image cards
**Established:** 2026-09-16 overnight session (theme system, abilities codex, Ludo redesign)
**Owner rule (never violates):** *A player's `.j cardstyle` is their whole RPG visual identity - not a single-card recolor.*

---

## 1. The one rule that governs everything

> **Every general RPG image card added in the future must be designed as part of the selected cardstyle system.**

A character is ONE character. If their `.j cardstyle 1` profile card is granite and iron,
their `.j rank`, `.j allocate`, `.j abilities` cards are granite and iron too. A pile of
unrelated but individually pretty cards is a failed design even when each card is good.

When you are asked to create a new RPG card, answer these **seven questions** in order:

1. **What information is this card presenting?** (If it's a decision the player makes, it is probably a *command*, not a card - see §8.)
2. **Does it need an image at all?** Text is not a failure state. Cards are for dense/visual/status information the player reads repeatedly.
3. **Which existing shared components can it reuse?** (bake geometry, shells, seals, pills, bars - see §4.)
4. **How does it appear in each of the 10 themes?** (Read §3, then use the theme roles - do NOT invent a palette.)
5. **What makes its layout appropriate for its specific purpose?** (Same universe, different purpose - see §2.)
6. **Does it remain visually consistent with the player's other cards?** (Frame construction, typography, seal treatment.)
7. **Does interaction belong in a command instead of the image?** (Buttons don't exist on WhatsApp images. Commands are the control surface.)

---

## 2. Same universe, different purpose

"Consistent" does **not** mean identical. Within one theme:

- **Shared:** palette roles, typography, frame construction, background treatment, motif language, seal treatment, lighting logic, mood.
- **Per-card-kind:** composition, orientation, information hierarchy, panel arrangement.

A RANK card (portrait, one big RECORD block + standing grid) and an ALLOCATE card
(portrait, POINTS block + 7 stat rows) in the same style are *siblings, not twins*.
If two kinds would render identically with different text, redesign one of them.

---

## 3. The ten card styles

Selection: `.j cardstyle <1-10>` (aliases: `decree`, `noir`, `arcanum`…). Stored on the
user document as `cardStyle` (number). Server default for style-0 players:
`_shared_default_card_style` (RPG mods via `.j setdefaultcard`). Style **7 (Royal Decree)
is the canonical default** and the baseline all others are measured against.

Legend for the role names used below: `BG` page base · `PANEL` information panel ·
`INK` primary text · `MUTED` secondary text · `SUB` positive/secondary accent text ·
`ACCENT` rules, dividers, bars · `SEAL` the round seal stamp.

| # | Name | One-line identity |
|---|------|-------------------|
| 1 | **Stonekeep** | Dwarven fortress - granite, iron rivets, cold silver |
| 2 | **Golden Arcanum** | Arcane athanæum - deep indigo, ritual gold circles |
| 3 | **Retro Court** | Victorian playbill - sepia halftone, burgundy rules |
| 4 | **Woodmere** | Tavern hearth - carved oak planks, warm amber |
| 5 | **Emblem Noir** | Secret society - matte black, gold mark, red wax |
| 6 | **Holo Gacha** | Collection vault - pastel holo, soft sparkles |
| 7 | **Royal Decree** | Canonical court decree - parchment, gilded frame, wax seal |
| 8 | **Neon Arcade** | Arcade cabinet - night grid, magenta/cyan glow |
| 9 | **Rune Monolith** | Ancient stone - basalt, carved glyphs, ember |
| 10 | **Crimson Court** | Vampire court - velvet damask, ornate gold |

### Per-theme specification (from the actual implementations)

Each theme below documents: identity, color philosophy, typography, frame, background,
motifs, icons/runes, lighting, mood, what belongs, what does NOT.

**#1 STONEKEEP** (`FrameStyle 1`)
- Identity: a dwarven keep's engraved ledger plate.
- Colors: BG granite `#54565C→#3A3C42`, PANEL steel-grey `#ACAEAе2`, INK near-black `#1C1E22`, MUTED slate `#42464E`, SUB cold green `#3C8260`, ACCENT iron `#787E8A`, bars fill silver.
- Typography: Cinzel (all caps) for headings/numbers; MedievalSharp for captions. No script faces - masons don't write cursive.
- Frame: beveled edges (light top-left, dark bottom-right) + **rivet heads** at all four corners.
- Background: block seams (large masonry grid) + highlight rivet dots.
- Motifs: rivets, seams. No filigree, no organic shapes.
- Icons/runes: none decorative; numbers are engraved-style.
- Lighting: flat overcast - no glow, no gradients inside panels.
- Mood: heavy, permanent, unimpressed.
- Belongs: gear/equipment, durability, blacksmith, ores, walls/defense.
- Does NOT belong: magical effects, pastel anything, romance/social cards.

**#2 GOLDEN ARCANUM** (`FrameStyle 2`)
- Identity: an arcane athanæum's catalog page.
- Colors: BG indigo `#16122C→#241C42`, PANEL `#282146`, INK pale gold `#F0E6BE`, MUTED `#BAAC84`, ACCENT ritual gold `#D4AF37`.
- Typography: Cinzel + MedievalSharp; gold-on-dark only, never pure white.
- Frame: **double gold hairline** + small diamonds at corners.
- Background: two large ritual circles + 12 orbiting diamonds, very low alpha.
- Motifs: circles, diamonds, stars. No rivets, no planks.
- Icons/runes: gold geometric glyphs allowed (✦ ◈ class of shapes).
- Lighting: candle-glow feel - accent warm, panels cool.
- Mood: studied, expensive, secretive.
- Belongs: skills/spells, magic damage, tomes, mana, crafting recipes for enchanted gear.
- Does NOT belong: industrial/tech, neon, agriculture, gambling.

**#3 RETRO COURT** (`FrameStyle 3`)
- Identity: a victorian playbill / society page.
- Colors: BG sepia `#CEBC98→#DECEAA`, PANEL cream `#EEE0BC`, INK umber `#3A2C20`, ACCENT burgundy `#7A2C3A`.
- Typography: tight Cinzel headings; burgundy small-caps; halftone-printed feel.
- Frame: **double burgundy rules** + dot rows along top/bottom edges.
- Background: fine halftone dot grid.
- Motifs: rules and dots; typographic ornament only.
- Icons/runes: avoid pictographic icons; use typographic markers (№, §).
- Lighting: flat print - zero glow.
- Mood: formal, printed, a little proud.
- Belongs: leaderboards, rankings, social standing, duels of honor, tournament results.
- Does NOT belong: sci-fi, demons, neon, fantasy glow.

**#4 WOODMERE** (`FrameStyle 9`)
- Identity: a tavern's carved oak notice board.
- Colors: BG oak `#58381F→#422A18`, PANEL warm parchment `#E2C08E`, INK dark oak `#342214`, ACCENT amber `#C48C3C`.
- Typography: Cinzel + MedievalSharp (the cozy pairing).
- Frame: **carved notch border** - dark inset line, light inner line, square corner notches.
- Background: horizontal plank seams + grain streaks.
- Motifs: wood grain, notches. No metal, no magic circles.
- Lighting: hearth-warm; amber accents.
- Mood: homely, sturdy, welcoming.
- Belongs: cooking, brewing, fishing, hunting, inn/social, daily rewards.
- Does NOT belong: cosmic horror, high-tech, royal ceremony.

**#5 EMBLEM NOIR** (`FrameStyle 4`)
- Identity: a secret society's dossier.
- Colors: BG matte black `#0E0E10→#18181C`, PANEL `#1E1E22`, INK bone-white `#EEECE6`, ACCENT gold `#C6A664`, SEAL dark red wax `#941E28`.
- Typography: high-contrast - big Cinzel headings, restrained muted body.
- Frame: **single inset gold line** + heavy corner ticks.
- Background: carbon crosshatch + one huge ghost emblem diamond behind the panel.
- Motifs: the emblem. One mark, repeated at most.
- Icons/runes: strictly limited - the gold mark is the only ornament.
- Lighting: single-source spotlight feel; strong dark surround.
- Mood: quiet, dangerous, exclusive.
- Belongs: assassins/rogues, bounties, PvP dossiers, underworld market, bans/warnings.
- Does NOT belong: cheerful events, pastel gacha, farming.

**#6 HOLO GACHA** (`FrameStyle 5`)
- Identity: a collection vault's holographic card page.
- Colors: BG pastel gradient `#BAE0DC→#DEC4EE`, PANEL near-white `#FAF7FC`, INK violet-grey `#4A405E`, ACCENT pink `#DE78A0`, SEAL pink.
- Typography: Cinzel stays (brand continuity) but headings can be lighter weight; body clean.
- Frame: **thick white rounded frame** + pink sparkle marks at corners.
- Background: floating 4-point sparkles, generous whitespace.
- Motifs: sparkles, rounded everything, small hearts/stars allowed.
- Icons/runes: cute glyphs allowed; keep set small.
- Lighting: bright, airy, no hard shadows.
- Mood: joyful, collectible, soft.
- Belongs: summons/eggs, collection, achievements, cosmetics, social/ship cards.
- Does NOT belong: death/abyss content, brutal combat results, gritty horror.

**#7 ROYAL DECREE** (baked-art baseline)
- Identity: the crown's decree on parchment.
- Colors: BG dark wood `#181010`, PANEL parchment `#E9D7AB`, INK dark brown `#342010`, ACCENT gilded `#AA823C`, SEAL wax red `#801C28`.
- Typography: Cinzel + CinzelDecBold + MedievalSharp - the house standard.
- Frame: gilded hairline rounded rectangle inside panel edges.
- Background: real baked wood+gold art (`bg_*.png` per kind).
- Motifs: wax seal, ribbon banners, lamoot wood family.
- Lighting: warm candlelit parchment.
- Mood: royal, official, timeless.
- Belongs: everything (it is the default).
- Does NOT belong: nothing - but it is not a license to make every card identical.

**#8 NEON ARCADE** (`FrameStyle 6`)
- Identity: an arcade cabinet's attract screen.
- Colors: BG night navy `#0A0C1C→#121630`, PANEL `#101430`, INK ice-white `#E0F2FF`, ACCENT magenta `#FF40A0` + cyan `#40E0FF`.
- Typography: Cinzel headings read as "vector cabinet type"; captions can be tighter.
- Frame: **glow stack** - wide soft magenta stroke, solid magenta stroke, inner cyan hairline.
- Background: perspective horizon grid + scanlines, very low alpha.
- Motifs: grids, glow, scanlines.
- Icons/runes: pixel-era shapes allowed (▲ ▼ ✦).
- Lighting: emissive - the only theme where text itself may glow (use sparingly).
- Mood: electric, competitive, nocturnal.
- Belongs: arcade games (slots/crash/dice), PvP ladders, combo/score cards.
- Does NOT belong: medieval ceremony, nature, pastoral crafting.

**#9 RUNE MONOLITH** (`FrameStyle 7`)
- Identity: a carved monolith in a shrine clearing.
- Colors: BG basalt `#2C322E→#1E2220`, PANEL mossy stone `#424A44`, INK bone `#E0E6D6`, ACCENT ember `#E88C40`, SEAL ember.
- Typography: Cinzel caps; wide letter spacing reads as carved.
- Frame: **carved double grooves** (dark+light offset) + diagonal tick marks along edges.
- Background: columns of carved glyph marks (angled strokes), chisel texture.
- Motifs: glyph strokes, grooves. Never curves or filigree.
- Icons/runes: angular marks only.
- Lighting: ember-lit - warm accent against cold stone.
- Mood: ancient, solemn, awake.
- Belongs: runes, runesmithing, Abyss-adjacent lore, trials, ancient unlocks.
- Does NOT belong: cute/soft content, casino, romance.

**#10 CRIMSON COURT** (`FrameStyle 8`)
- Identity: the vampire court's invitation.
- Colors: BG velvet `#420C16→#2C0810`, PANEL wine `#601622`, INK warm ivory `#F4E2CE`, ACCENT antique gold `#D4A856`, SEAL blood red.
- Typography: Cinzel + generous spacing; italic MedievalSharp for whispers.
- Frame: **ornate gold double frame** + layered diamonds at corners.
- Background: damask diamond lattice, low alpha.
- Motifs: damask, diamonds, seals.
- Lighting: candlelit velvet - deep shadows, gold highlights.
- Mood: aristocratic, predatory, elegant.
- Belongs: blood/vengeance themes, crimson abyss, dramatic duels, coronations.
- Does NOT belong: farming/cooking, gacha cuteness, arcade.

### Palette role contract (engineering)

Every theme sets ALL roles; renderers must never hardcode a color that has a role:

`Bg Bg2 Panel PanelEd Plate PlateTx Banner BannerTx BannerEdge Ink Muted Sub Gold PillBg PillTx Track Fill FillHi Done Seal SealTx Caption FrameStyle`

If you need a new role, add it to `decreeTheme()` first (that documents the default), then to all ten themes.

---

## 4. Technical architecture

### Where things live

| Layer | File(s) | Notes |
|---|---|---|
| Style selection + aliases | `core/commands/rpgCommands.js` → `handleCardStyle` | `CARD_STYLE_NAMES`, `CARD_STYLE_ALIASES` |
| Style storage | user document `cardStyle` (number 1-10) via `economy` | server default: system key `_shared_default_card_style` |
| Character card renderer (Node/jimp, 10 styles) | `core/rpg/profileCardRenderer.js` + `core/rpgasset/ui/styles/{bg_1..10.png, layouts.json, extra/}` | op-based layout DSL per style |
| Go portrait family | Box2/Box1 `bot_generation/pkg/combat/portrait.go` (DUEL/QUEST/TRIAL/RANK/ALLOCATE/ABYSS 600×1000), `r6_cards.go` (SKILLTREE/SKILLUP/EQUIP/ABILITIES), `eventcards.go` (QUESTSTART/RAID/GUILDINFO/SHOP) | kind switch on POST `/api/cards/portrait` |
| Theme engine (Go) | `pkg/combat/theme.go` | `cardTheme`, `cardThemes`, `resolveTheme`, `drawPortraitShell`, `drawThemeFrame`, `drawThemeMotif`, `drawThemedSeal/Caption` |
| Node → Go call | `core/utils/goImageService.js` → `generatePortraitCard(payload)` | payload carries `style` |
| Effect runes | `core/commands/skillCommands.js` `effectRunes()` + `RUNE_MAP` → Go draws them with **DejaVuSans** (`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`) | Cinzel/MedievalSharp have NO symbol/emoji coverage |

### How style flows through a card render

```
player runs .j rank
  → engine dispatch (primaryCmd === 'rank')
  → progressionCommands.handleRankCommand
      style = user.cardStyle || 0            ← read from economy user doc
  → goService.generatePortraitCard({ kind:'RANK', style, ...payload })
      POST http://127.0.0.1:7860/api/cards/portrait
  → Go GeneratePortraitCard:
      themed := resolveTheme(style)          ← nil for 0 and 7
      if themed != nil && kind in THEMED_KINDS:
            drawPortraitShell(dc, themed, kind)   ← programmatic identity
      else:
            load baked bg_<KIND>.png               ← Royal Decree baseline
      ink := themed ?? decreeTheme()         ← palette roles; decree = exact legacy values
      ... kind-specific composition draws with ink roles ...
```

**THEMED_KINDS today:** `RANK`, `ALLOCATE` (portrait shell); `ABILITIES`
(theme palette + frame swap in `renderAbilitiesCard`). `SKILLUP`/`EQUIP`/`SHOP`
accept and ignore `style` - **roadmap:** move them onto `drawPortraitShell` /
theme palette (their ink literals are the same roles; the work is mechanical).
DUEL / QUEST / TRIAL / ABYSS family and combat-end cards are battle cards:
they intentionally keep the baked Royal Decree art for combat-legibility
(owner decision, phase 9) - do not "fix" them into themes without asking.

### Fallback behavior (do not break these)

1. `style` missing/0/invalid/7 → baked Decree art. Never render a half-themed card.
2. Go service unreachable → every Node card call has a TEXT fallback path (captions/panels). Cards may never dead-end a command.
3. Theme render failure inside Go (future edit) → kind still renders with decree palette (resolveTheme nil-safety).
4. `bg_*.png` missing → dark base fill + full ink render (already in code).
5. Runes: only DejaVu-verified glyphs. The verified set (see §6) is the whitelist.

### Naming conventions

- Go: one `render<CardKind>Card(c, req)` per kind, registered in `GeneratePortraitCard`'s switch (or eventcards handlers). Payload fields live on `portraitRequest` with explicit `json:"camelCase"` tags.
- Node: one thin wrapper per command in `core/commands/*Commands.js`; always via `goService.generatePortraitCard`, never raw axios.
- Assets: `assets/rpgasset/ui/craft/bg_<KIND>.png` (Box2/Box1 synced), fonts in `assets/rpgasset/fonts/` (Cinzel, CinzelDecBold, MedievalSharp).

### How to add a NEW card kind (checklist)

1. Define the payload struct fields on `portraitRequest` (+ json tags).
2. Write `renderYourCardCard` - pick a canvas size that fits the information
   (600×1000 portrait / 1000×600 landscape / 800×800 square / 1200×800 wide).
   Reuse `portraitSanitize`, `portraitFitText`, `portraitPillCentred`, `r6diamond`,
   `sealAt`/`drawThemedSeal`.
3. Register the kind in the switch. If it should be themed (general RPG card):
   call `resolveTheme` + use the shell/roles. If it is a battle card: baked bg + decree inks.
4. Add the TEXT fallback in the Node command (always).
5. Node wrapper: read `user.cardStyle`, pass `style`.
6. Test: render the kind at styles 0, 7, 1, 2, 5, 8, 9, 10 minimum; check text fit at
   long names (`portraitFitText` shrinks - verify minSize is readable), check empty payload.
7. Add the command to `core/utils/commandRegistry.js` (menus read from it).

### How to add EXISTING kind to all 10 styles (roadmap item)

1. Replace hardcoded ink literals with `_th.<Role>` (decree values = byte-identical output).
2. Route the kind through `drawPortraitShell` when `_useShell` (add kind to the guard in `GeneratePortraitCard`).
3. If the kind has its own canvas (not 600×1000), mirror the shell logic for that canvas in `theme.go` (see how `renderAbilitiesCard` consumes roles directly).
4. Visual QA the full style set (script: curl loop against `:7899` test port like `scripts/` QA flows; inspect with the pixel-probe technique - see worklog 2026-09-16 for the `alphaColor` lesson).

### Pagination convention (established with `.j abilities`)

- Flatten the data, slice client-side (Node), render ONE page per image.
- `PAGE_SIZE = 12` rows for abilities-scale rows; global numbering preserved across pages
  (page 2 starts at #13 - combat commands take the global number: pass `startNumber` to Go).
- Page label rendered top-right (`pageLabel`), nav hint in the caption:
  ```.j abilities <next>```.
- Single page (≤ PAGE_SIZE) renders with NO page chrome.

### Testing cards (minimum bar)

- `node --check` after every Node edit; `go build ./pkg/combat/` after every Go edit.
- Render matrix via curl against a test port (PORT=7899 MODE=synchronous ./bot-generation).
- Pixel-probe colors when a render looks wrong - the Ludo "mismatched colors" bug was
  an illegal **alpha-premultiplied** `color.RGBA` (R>A) garbled by the compositor.
  Translucent fills must use `color.NRGBA` (see `translucent()` in `pkg/ludo/renderer.go`).

---

## 5. Character profile card (the 10-style Node renderer)

`core/rpg/profileCardRenderer.js` drives the CHARACTER card with per-style **op layouts**
(`layouts.json`): ops like `text`, `seal`, `statvals`, `coinzeni`, `join` composite the
card over `bg_<style>.png`. The SAME 10-style duty applies here - a new profile feature
(unallocated-points notice, summon line, etc.) must be laid out in every style's ops
(verify with `.j cardstyle 1..10` + `.j profile.char`).

`.j profile.char` shows the unallocated-points notice ONLY when `statPoints > 0`
(`⚡ You have N unallocated stat points! → use .j allocate`). Keep it conditional.

`.j allocate` (no args) renders the ALLOCATE card (themed) with per-stat command hints;
`.j allocate <stat> <n>` stays a plain text confirmation (interaction = command).

---

## 6. Effect runes (the icon language)

Runes communicate mechanics, never decoration. They are derived **only** from the real
skill schema (`effect.cc/dot/buffType/type` + structured `effects{}` object) - a card may
never claim an effect the engine will not apply.

Whitelist (DejaVu-verified on the render hosts - do not add glyphs without probing):

| Rune | Effect | | Rune | Effect |
|---|---|---|---|---|
| ✦ | stun | | ▲ | buff |
| ✺ | slow | | ▼ | debuff |
| ❄ | freeze | | ◈ | shield |
| ♨ | burn | | ✷ | aoe |
| ⚔ | bleed | | ⚡ | execute |
| ☠ | poison | | ❖ | passive |
| ✥ | dot | | ⨀ | drain |
| ✚ | heal | | ⚑ | summon |

Cap: 4 runes per ability, deduplicated, drawn on the cost/CD line in ACCENT color.
Probing new glyphs: `gg.LoadFontFace(DejaVuSans, 40) + DrawString` render, then inspect
for `.notdef` boxes (see worklog 2026-09-16 probe; ⌛ ⛨ ⛓ are known tofu).

---

## 7. Abilities codex (class identity)

The ABILITIES card title + quote come from the player's **BEGINNER class**
(`lineage[lineage.length-1]`):

| Beginner class | Doc title | Quote |
|---|---|---|
| ⚔️ FIGHTER | COMBAT CODEX | "Every scar is a lesson. Every battle, a page." |
| 🗡️ SCOUT | HUNTER'S LEDGER | "The prey is already dead. It simply hasn't realized it yet." |
| 🔮 APPRENTICE | ABILITY GRIMOIRE | "Every spell is a question the world must answer." |
| ✨ ACOLYTE | PRACTITIONER'S CODEX | "Faith is the first armor. Devotion is the blade." |

Advanced classes evolve the *lineage* shown on the card (HERITAGE ribbons) but never
rename the codex - the codex is the character's origin story. Unknown classes fall back
to ABILITY GRIMOIRE + a neutral quote. Titles are payload fields (`docTitle`, `docQuote`),
not hardcoded in Go.

---

## 8. Cards = presentation, commands = interaction

- **Cards present:** profiles, character sheets, abilities, allocation overview, rank,
  equipment, shop inventory, guild info, skill trees, results/receipts.
- **Commands decide:** allocate/select/buy/equip/use/equip/claim/attack/nav.
- Never bury a command reference inside a decorative image; a concise caption hint
  (`forge your build · .allocate <stat> <n>`) is the ceiling.
- Every card command keeps a text fallback with the same information (capped to
  WhatsApp's 1024-char caption when riding along).

---

## 9. Games visuals (established with the Ludo redesign)

`pkg/ludo/renderer.go` - the board is part of the RPG's visual universe:
parchment field, heraldic per-color identity (quadrant + home column + base ring +
pieces share ONE color), player plates (pfp + name + HOME n/4), gold turn glow,
rounded dice chip. **Translucency rule:** `color.NRGBA` everywhere (see §4 note -
the original mismatched-colors bug was illegal premultiplied RGBA).

Abandonment = **forfeit** (all paths): `.ludo leave`, `.ludo end` by a player, group
departure/kick (`handleParticipantLeave` hook), and the 30-min inactivity dissolution
(no contest, no rewards). Win-by-forfeit pays the same +500 and announces who won.

---

## 10. Change log (card system)

- 2026-09-16 - theme engine (10 identities) for RANK/ALLOCATE/ABILITIES; abilities codex
  identity + effect runes + pagination; Ludo board redesign + forfeit system; audio clip
  command (`.clip`); trivia fixes; powerscale rewritten on the MediaWiki API (Cloudflare).
- Earlier - see `git log` and `docs/UI-INVENTORY.md` for the full UI census.
