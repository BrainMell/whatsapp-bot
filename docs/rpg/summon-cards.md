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
- .j summon / .j summoncards lists owned cards.

Future acquisition adapters are reserved, but automatic acquisition is disabled. No drops, shop, trading, or event acquisition are wired.

## Combat

The active PvE turn prompt displays every owned card in a compact horizontal tray with READY or remaining turn cooldown. Use .j combat summon <card> <enemy#> to activate one.

Activation validates ownership, PvE combat, active turn, living enemy target, energy, and per-card cooldown. A successful activation consumes the normal action and energy. Cooldowns are keyed by player and card in the active combat session; a new battle starts fresh.

Gameplay resolution is in Node through guildAdventure.js and existing damage/status helpers. Summon-card actions do not call weapon durability wear. PvP is explicitly rejected and remains a later integration.

## GIF pipeline

Node calls POST /api/combat/summon-card in BrainMell/Bot_genaration. Go renders the live combat roster and card-specific VFX into a multi-frame GIF using the existing combat animator. Node validates the GIF signature and sends untouched bytes as image/gif; no ffmpeg or MP4 conversion is involved.

## QA

Run node scripts/qa_summon_cards.js for ownership, acquisition gating, target/turn/energy/cooldown validation, independent cooldowns, effects, and no-weapon-wear checks.