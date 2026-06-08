# WhatsApp Bot Developer Documentation Index

This directory contains technical documentation for all subsystems in the WhatsApp bot codebase.

## Core Systems
* [Engine](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/engine.md) — Central orchestrator initializing Baileys, handling the message loop, raw event parsing, command dispatch, and multi-tenant instances.

## RPG Subsystems (`docs/rpg/`)
* [Alchemy](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/alchemy.md) — Item brewing and consumables creation system.
* [Fishing](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/fishing.md) — Scavenging command flow with fatigue checks and drop tables.
* [Crafting](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/crafting.md) — Recipe lookup, ingredient validation, space checking, and item creation.
* [Mining](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/mining.md) — Mining command flow with energy costs, locations configuration, and drop updates.
* [Quests](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/quests.md) — Group and solo adventure loop, dungeon choice voting, and phase managers.
* [PvP](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/pvp.md) — Challenger-target flow, duel stakes, turn resolution, and stat capping.
* [Raids](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/raids.md) — Dungeon boss mechanics, phase transitions, and loot distribution.
* [Economy](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/economy.md) — Balance management, daily claims, bank deposits, and transfers.
* [Profile](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/profile.md) — Character sheets, statistical cards rendering, and profile helper integrations.
* [Abilities](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/abilities.md) — Skill upgrades, tree nodes, point distribution, class evolutions, and passive skills.
* [Progression](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/progression.md) — Leveling multipliers, XP calculation, rank scaling, and manual stat allocation.
* [Inventory](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/inventory.md) — User inventory maps, storage upgrades, slots usage, and equipment slots.
* [Guilds](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/guilds.md) — Faction creation, bank contribution, daily board tracking, and stats upgrades.
* [Loot](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/loot.md) — Item configs, drop tables, item categories, and salvage rates.
* [Gambling](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/gambling.md) — Casino minigames: roulette, blackjack, coinflip, slots, and session limits.
* [Investments](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/investments.md) — Fixed deposits, stock market portfolios, and peer-to-peer loan setups.
* [Minigames](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/minigames.md) — Multiplayer chess, ludo, tictactoe, wordle, and AI debate modules.
* [Cards](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/cards.md) — Collectible card spawning, card claims, custom decks, and trade markets.
* [Combat](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/combat.md) — Visual combat board frame creators, turn loops, and enemy actions AI.
* [Social Graph](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/social.md) — Symmetrical relationship updates and dynamic text formatting for context generation.

## Chat & Summarizer Subsystems (`docs/chat/`)
* [AI Context Engine](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/chat/context_engine.md) — Message buffers, topic segmentations, memory triggers, and AI summaries.

## Admin & Moderation (`docs/admin/`)
* [Commands](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/admin/commands.md) — Developer and owner debugging tools, user warning management, resets, and chat locks.
* [Security](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/admin/security.md) — Group antilink scanner, anti-spam blocklist, and status mention interceptors.

## Media Subsystems (`docs/media/`)
* [Stickers](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/media/stickers.md) — FFmpeg media sticker converters and waifu.pics/nekos.best GIF API fetchers.

## Integrations (`docs/integrations/`)
* [APIs](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/integrations/apis.md) — Go Image Service rendering, Groq client context-aware chatbot memory, and news scraping.
* [Powerscale](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/integrations/powerscale.md) — Search and profile scraper fetching vsbattles wiki character statistics.

## Scrapers (`docs/scrapers/`)
* [Media Scrapers](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/scrapers/media_scrapers.md) — Shoob card scraper and Pinterest memes Puppeteer scraper.

## Database & Configuration (`docs/database/` and `docs/config/`)
* [Schema](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/database/schema.md) — MongoDB connections, Mongoose models, and fields schemas.
* [Config](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/config/env.md) — Tenant configs, environment variables, and AsyncLocalStorage thread states.
