# Summon Cards

Summon Cards are a new owned-card combat mechanic. They are not companion entities and do not use legacy summon collection, deployment, AI, egg, fragment, or UserCard collectible economy.

## Initial catalog

| Card | Signature ability | Energy | Independent cooldown | Effect |
|---|---|---:|---:|---|
| Ifrit | Inferno Rend | 30 | 3 turns | Fire damage + burn |
| Leviathan | Tidal Prison | 36 | 4 turns | Water damage + slow |
| Shiva | Absolute Zero | 42 | 5 turns | Ice damage + freeze |

The catalog is data-driven in core/rpg/systems/summonCards/index.js.

## Ownership and acquisition

Ownership is stored in User.summonCards, separate from UserCard. Only moderators can grant or revoke cards:

- .j mod grantsummoncard @user ifrit
- .j mod revokesummoncard @user leviathan
- .j mod revokesummoncard @user all

Future acquisition adapters are reserved, but automatic acquisition is disabled. No drops, shop, trading, or event acquisition are wired.

## Combat

The active PvE turn prompt displays every owned card in a compact horizontal tray with READY or remaining turn cooldown. Use .j combat summon <card> <enemy#> to activate one.

Activation validates ownership, PvE combat, active turn, living enemy target, energy, and per-card cooldown. A successful activation consumes the normal action and energy. Cooldowns are keyed by player and card in the active combat session; a new battle starts fresh.

Gameplay resolution is in Node through guildAdventure.js and existing damage/status helpers. Summon-card actions do not call weapon durability wear. PvP is explicitly rejected and remains a later integration.

## GIF pipeline

Node calls POST /api/combat/summon-card.gif in BrainMell/Bot_genaration. Go renders the live combat roster and card-specific VFX into a multi-frame GIF using the existing combat animator. Node validates the GIF signature and sends untouched bytes as image/gif; no ffmpeg or MP4 conversion is involved.

## QA

Run node scripts/qa_summon_cards.js for ownership, acquisition gating, target/turn/energy/cooldown validation, independent cooldowns, effects, and no-weapon-wear checks. Run the Go package tests in pkg/combat for GIF encoding and card-to-VFX mapping.
## Deck-builder layer (2026-11-06)
- Catalog: `core/rpg/systems/summonCards/catalog.js` - 25 data-driven cards (ATTACK/SKILL/POWER; COMMON..LEGENDARY; targets enemy/all/self/party; effects damage/status/drain/shield/heal/buff/taunt/energy). Add a card = add an entry.
- Cards are numbered by hand order (rarity desc, then name). Play: `.j combat summon <#|name> [enemy#]` (enemy# optional - defaults to first living enemy; AoE/self/party cards ignore it).
- Visuals: `cardRenderer.js` draws Slay-the-Spire style cards + fanned hand (sent as the image of the turn prompt) + collection (`.j summon`). Art swap: drop `core/rpgasset/summoncards/<cardId>.png` (see README there); falls back to the legacy sprite, then a glyph.
- Animation: `cardPlayGif.js` renders a real GIF for every card in Node (Go is still tried first for ifrit/leviathan/shiva).
- Mods: `.j mod grantsummoncard <@user> <card|all|list>`.
