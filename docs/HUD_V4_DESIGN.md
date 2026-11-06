# Combat HUD v4 — design brief & handoff (owner 2026-11-06)

Owner asked for the in-combat UI to be rebuilt: flat-pixel rank banner top-left, the boxed
player panel replaced by a compact round-portrait plate (same spot, less space), and a long
summon-card deck tray that only exists when the player actually owns summons. Implemented in
commit `0f0496ada` (branch `audit/fix-pass-1`), live on wa-joker / wa-jake / wa-subaru.

## What exists now

| Piece | Where | Notes |
| --- | --- | --- |
| HUD painters (all card + video HUD art) | `core/rpg/systems/combat/combatHud.js` | pure canvas, 1024×687 design space, scale factor `s` |
| Node battle-card compositor | `core/rpg/systems/combat/combatCardNode.js` | Go supplies HUD-less layers (`hud:"none"`), Node paints HUD on top |
| Routing + fallback | `core/rpg/systems/combat/combatImageGenerator.js` | `hud:'v2'` + non-PvP + no `encounter` → Node card; **6s race**, any failure → old Go card |
| Call sites | `core/rpg/systems/combat/combatIntegration.js:39,81` | `renderCombatStart` and `renderCombatTurn` both pass `hud:'v2'`, `bypassQueue:true` |
| Ultimate/skill videos | `core/rpg/systems/combat/ultimateFx.js` (`drawVideoHud` ~L720) | same plate painters drawn over video frames |
| Deck tray data | `core/rpg/systems/summonCards/system.js` (`handEntries`) | tray renders only when the player's owned-card list is non-empty |

Kill switch: `COMBAT_HUD_NODE=0` env → everything falls back to the Go card. No restart of
the Go service is involved; the Node path is inside the bot process.

## Visual identity (keep future passes consistent)

- **Palette**: dark navy stage (`#141a2b → #0a0e1a` gradients), gold trim `#d4a017`/`#ffd666`
  for ready/active states, rank colours `RANK_COLOR` in `combatHud.js`
  (F grey → S `#c98a00`, SS `#d4a017`, SSS `#e0562b`).
- **Fonts**: `dogicapixelbold.otf` (pixel labels: RANK, SUMMONS, EN costs) +
  `Cinzel-Variable.ttf` (names/titles). Registered as `HudPixel` / `HudCinzel`.
- **Assets** in `core/rpgasset/ui/`: `UI_Flat_Banner02a` (rank ribbon base), `heart.png`,
  `mana.png`. Portraits are cut from the player sprite (Go layers `cuts`), never square-boxed.
- **Shapes**: capsule bars with dark outline + shadow text; round portrait medallion with gold
  ring and level pip; plate ≈290×80 (old box panel was 262×118 — the box itself is gone).

## Known limitations (owner test list, 2026-11-06)

1. **PvP cards** still render through the old Go renderer (explicit exclusion in the v2 gate).
2. **Ruins / encounter cards** (`options.encounter` set — square-map scenes) still Go-rendered.
3. **Abyss** cards still Go-rendered (same family as encounter scenes).
4. Any Node-path failure (layers unavailable, canvas error, >6s) silently falls back to the Go
   card — logs `[CombatHud] node card failed, using Go card:` on error, `[CombatHud] node card
   NB in Xms` on success. Warm renders ≈50–70ms; cold (first card after boot) ≈1.5–2s
   (font/asset preload + Go layers call).
5. The deck tray needs the player's `jid` to own summon cards; otherwise it is omitted by
   design (not a bug).

## Queued next passes

- Deck-tray / card art upgrade from open CC0 sources (Dark RPG GUI Kit — itch.io;
  Moon Tribe Studio Fantasy RPG UI Pack; GitHub CC0 kits): owner wants richer, non-chibi,
  "identity + confidence" styling.
- Rank-coloured banner variants (asset already has 02a/03a/04a in `core/rpgasset/ui/`).
- Match Ruins / abyss / PvP cards to the new HUD once owner signs off on the PvE look.
- Heart/mana icons are code-drawn fallbacks today (PNG transparency issues); vector-polish pass
  if owner wants crisper glyphs.
