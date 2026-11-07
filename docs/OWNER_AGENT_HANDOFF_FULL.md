# Full handoff for the owner's computer agent — finish Go + remaining work (2026-11-07)

Branch: `audit/fix-pass-1` (pull, never force-push, `git pull --rebase` before push). Latest work is Node-only and was verified only on a fake preview stage; the boxes are the source of truth. The Go repo copy on the sandbox was stale/uncompilable, so **nothing Go-side was touched or tested**.

## 0. What shipped (Node) — verify first
| Feature | Files | Kill switch |
|---|---|---|
| Parchment banner behind HP/mana hub | `core/rpg/systems/shared/parchment.js`, `combat/combatHud.js` (`drawHubBanner`, `drawPlayerHud` opts `{flip,banner}`) | — |
| PvP Node card: no rank banner, P1 hub bottom-left, P2 hub top-right mirrored | `combat/combatCardNode.js` `renderNodePvpCard`, gate in `combatImageGenerator.js` | `PVP_HUD_NODE=0`, `COMBAT_HUD_NODE=0` |
| Redesigned summon cards (metal rarity frames, arched art, wax cost seal, flavour text, element sigils) | `summonCards/cardRenderer.js` (`FLAVOR` map) | — |
| In-scene card flight MP4 (slot or "+N" pile -> caster -> effect) | `summonCards/cardPlayScene.js`, `combatHud.deckLayout`, hook in `adventures/guildAdventure.js` summon branch | `CARD_SCENE_ANIM=0` |

Smoke test after restart: `node scripts/qa_summon_cards.js` (expects PASS), then in a real PvE fight play a card from slot 1, a middle slot, and (needs more cards than fit) a card in the "+N" pile; confirm the reply arrives as an auto-playing video (mp4 + gifPlayback), not a document. Watch logs for `[CardScene]`, `[CombatHud] node PvP card`, and fallback warnings.

## 1. Go tasks (priority order)
1. **PvP layers contract.** `renderNodePvpCard` calls `generateCombatLayers(players=[p1,p2], enemies=[], {combatType:'PVP', hud:'none-clean'})` and expects `bg`, `sprites`, `cuts[]` and `anchors[]` with `side:'player'`, `index:0|1`, fields `x, feetY, w, h`. Check the Go layered endpoint actually returns both duelists (index 1 = P2) in PVP mode, with Go's legacy nameplates/HP bars stripped under `none-clean`. If P2 is placed on the enemy side or anchors are missing, Node returns null and the old Go card is used (safe, but the new layout won't show).
2. **Sprite placement for the mirrored layout.** P2's hub is top-right; make sure the P2 sprite isn't covered by it (hub occupies roughly x 690-1010, y 12-110 in the 1024x687 space). Nudge P2 down/left in Go if overlap.
3. **Card-play GIFs.** Go only renders ifrit/leviathan/shiva (`generateSummonCardGIF`). The new Node MP4 now runs first for all 25 cards, so Go is just the fallback. Optional: leave as is, or add a generic Go card GIF endpoint for the other 22 cards. No rush.
4. **Remaining Go-rendered cards.** Encounters (`options.encounter`), ruins and abyss still use the Go card (excluded from the Node gate). Port or route them through `renderNodeCard` once Go layers work for those scenes: remove the `!options.encounter` clause in `combatImageGenerator.js` and test.
5. **Go HUD parity (low priority).** Go's own HUD (used on fallback) has the old plate. If you want fallbacks to look consistent, replicate the parchment ribbon + plate; geometry is in `combatHud.js` (`drawHubBanner`, `drawPlayerHud`, design space 1024x687, plate 330x~100).

## 2. Non-Go finishing touches
- **Art swap:** drop `core/rpgasset/summoncards/<cardId>.png` (transparent, 256px+). Auto-used by cards, hand tray and the flight animation. Current art = legacy sparklinlabs sprites.
- **Mini-cards in the hand tray** (`drawMiniCard` in `combatHud.js`) still use `hud_card_frame.png` (gold). Replace the asset with a parchment/metal-style 200x272 frame (art window ~x14-185, y14-163) so the small cards match the big redesign.
- **Flavour text:** edit the `FLAVOR` map in `cardRenderer.js` freely.
- **Animation tuning:** constants at top of `cardPlayScene.js` (`FPS`, `N`, `OUT_W`) and phase timings inside the frame loop (`kLift`, `kFx`, `kOut`). Render takes ~1.6s on the sandbox; check on the box and lower `N`/`OUT_W` if slow.
- **Death clips / HUD video (`ultimateFx.drawVideoHud`)** use `drawPlayerHud`, which now draws the banner by default; pass `{banner:false}` there if you want the old look in clips.
- **Docs to update:** `docs/HUD_V4_DESIGN.md` limitations list (PvP no longer Go-only; cards redesigned).

## 3. Known caveats
- Everything above was only rendered on a placeholder stage (blue/purple blocks); judge real sprites/backdrops on the boxes.
- The animation's hand erase relies on `deckLayout` matching the tray; if you change tray geometry, change it in `deckLayout` only.
- Summon art in the animation is drawn large above the card; very tall art may clip the ability ribbon.
