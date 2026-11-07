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
| Routing + fallback | `core/rpg/systems/combat/combatImageGenerator.js` | `hud:'v2'` + no `encounter` → Node card (PvE **and** PvP since 2026-11-07; PvP = `renderNodePvpCard` mirrored layout); **6s race**, any failure → old Go card |
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

1. **PvP cards** are Node-composed now (`renderNodePvpCard`: P1 hub bottom-left, P2 top-right
   mirrored, no rank banner). Verified live 2026-11-07: Go's layers endpoint returns BOTH
   duelists (`side:'player'`, index 0/1) with aligned per-fighter cuts under `hud:none-clean`,
   and the P2 sprite (top ≈ y295) clears the top-right hub (y ≤ 110) — no Go change needed.
2. **Ruins / encounter cards** (`options.encounter` set — square-map room scenes) are still
   Go-rendered. Porting them to the Node card first needs the Go ENCOUNTER scene composer to
   route its sprites through `drawCombatant` (layers anchors + per-combatant cuts) and honour
   `none-clean` — today only the classic battlefield paths do. Until then the v2 gate keeps
   them on the Go card BY DESIGN (renderNodeCard would draw zero unit bars with empty anchors).
3. **Abyss** turn cards are NOT Go-rendered — they flow through the Node-side
   `abyssScene.renderAbyssCombat` (frozen START layout, battleScene pattern). Only an
   abyss START/base that still calls `generateCombatImage` would hit the Go card.
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
- Match Ruins / encounter cards to the new HUD once the Go encounter composer emits layers
  (anchors + cuts + none-clean); abyss already paints Node-side.
- Mini hand cards now wear the parchment deck-builder frame (400×544 master in
  `core/rpgasset/ui/hud_card_frame.png`, transparent art window at the drawMiniCard ratios).
- Summon-card ART swap: drop `core/rpgasset/summoncards/<cardId>.png` (transparent, 256px+) —
  cards, hand tray and the flight animation pick it up automatically.
- Heart/mana icons are code-drawn fallbacks today (PNG transparency issues); vector-polish pass
  if owner wants crisper glyphs.
