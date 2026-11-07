# Owner-agent brief — HUD banner, PvP card, summon cards, card-flight animation (2026-11-07)

Branch `audit/fix-pass-1`. Everything below is Node-side and was only verified on the preview stage here (no Go build, no live boxes).

## Deploy / verify
1. `git pull` on the box, restart the `wa-*` apps. No new npm deps (uses `canvas` + `ffmpeg`, both already required).
2. Battle card (PvE): hub plate now sits on a torn-parchment banner (`shared/parchment.js` → `combatHud.drawHubBanner`).
3. PvP duel card: no rank banner; P1 hub bottom-left, P2 hub top-right, **mirrored** (portrait right, bars drain right→left). Falls back to the Go card on any error. Kill switches: `COMBAT_HUD_NODE=0` (all Node cards) or `PVP_HUD_NODE=0` (PvP only).
4. `.j summons` / hand / collection images use the redesigned parchment card (`summonCards/cardRenderer.js`; flavour lines live in its `FLAVOR` map).
5. `.j combat summon <#|name>`: sends an MP4 (`summonCards/cardPlayScene.js`) — card leaves its own hand slot (or pops out of the `+N` chip when it is in the overflow pile), arcs to the caster, hovers with the ability ribbon, summon art rises, projectile/rings + impact + number. Failure or >12s falls back to Go (ifrit/leviathan/shiva) then the generic Node GIF. Kill switch: `CARD_SCENE_ANIM=0`.

## Things only you can do / finishing touches
- **Go renderer parity**: Go still draws ruins/abyss/PvP fallback cards with the old HUD; the Node cards are the source of truth. If you want Go to match, port `deckLayout` + hub banner geometry (see `combatHud.js`).
- **Art swap**: drop `core/rpgasset/summoncards/<cardId>.png` (transparent PNG, ~256px+) — picked up automatically by cards, hand tray and animation. Placeholder art is the legacy sparklinlabs sprites.
- **Hand mini-cards** (`drawMiniCard` in combatHud) still use `hud_card_frame.png`; replace that asset with a parchment/metal frame for full consistency.
- **Spot-check on a real PvE fight**: play a card from slot 1, a middle slot and a card beyond the visible hand (needs > ~9 cards) and confirm the origin looks right; check mp4 delivery as `gifPlayback`.
