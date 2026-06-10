# WhatsApp Bot Developer Documentation Index

This directory contains technical documentation for all subsystems, architectures, and command-level execution flows in the WhatsApp bot codebase. The documentation is organized by the categories defined in the bot's command registry.

---

## 📁 Documentation Folder Structure

All documentation files are categorized logically under their respective system folders:

### 🛡️ 1. Admin & Moderation (`docs/admin/`)
* [Security & Spam Controls](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/admin/security.md) — Anti-link, anti-spam, and group status protection scanner.
* [Commands & Moderation](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/admin/commands.md) — Developer, owner, and moderator command access.
* [Chat Settings](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/admin/chat_settings.md) — Welcome, goodbye, antilink/antispam toggles.
* [Message Actions](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/admin/message_actions.md) — Message pinning, deleting, and group tagging.
* [Member Management](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/admin/member_management.md) — Mute, unmute, warn, kick, promote, and demote.
* [Utility & Controls](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/admin/utility.md) — Bot toggles (`on`/`off`), memory resets, and broadcast updates.

### 🃏 2. Card Collectibles (`docs/cards/`)
* [Claim Cards](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/cards/claim.md) — Spawned cards claim logic.
* [Card Collection](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/cards/coll.md) — Collection search, listing, and sorting.
* [Deck Editor](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/cards/deck.md) — Deck setups, moves, and swaps.
* [Card Info Database](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/cards/info.md) — Card stats lookup and search.
* [Lock Cards](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/cards/lock.md) — Protect collectible cards from actions.
* [Sell Card Marketplace](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/cards/sc.md) — Auctions, bids, and e-shop market.

### 💰 3. Economy System (`docs/economy/`)
* [User Registration](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/register.md) — Entry point to economy and RPG.
* [Balance](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/balance.md) — Wallet and bank vault balance lookups.
* [Bank Deposits & Withdrawals](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/deposit.md) | [Withdrawals](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/withdraw.md) — Bank account mutations.
* [Transfers](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/transfer.md) — Peer-to-peer money transfers.
* [Daily Reward](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/daily.md) — Claiming daily check-ins.
* [Robbing](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/rob.md) — Stealing Zeni from other wallets.
* [Rich Leaderboard](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/rich.md) — Money and gamblers rank listings.
* [Loans](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/loan.md) — Peer-to-peer loan requests, wagers, and defaults.
* [Investments](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/invest.md) — Fixed deposits and payouts.
* [Stock Market](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/stocks.md) — Stock ticker trading and portfolios.
* [Transaction History](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/history.md) — Bank logs.
* [System Economy Statistics](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/economy/economy.md) — System metrics.

### 🎰 4. Gambling Minigames (`docs/gambling/`)
* [Blackjack](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/blackjack.md) | [Coinflip](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/coinflip.md) | [Crash](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/crash.md) | [Cups](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/cups.md) | [Dice](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/dice.md) | [Guess](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/guess.md) | [Higher-Lower](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/hl.md) | [Horse Race](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/horse.md) | [Lottery](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/lotto.md) | [Mines](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/mines.md) | [Penalty Goal](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/penalty.md) | [Plinko](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/plinko.md) | [Roulette](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/roulette.md) | [RPS](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/rps.md) | [Scratch Card](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/scratch.md) | [Slots](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/slots.md) | [Wheel of Fortune](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/gambling/wheel.md)

### 🎮 5. Group Games (`docs/games/`)
* [Chess](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/games/chess.md) — 1v1 Chess matches against friends or the bot.
* [Ludo](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/games/ludo.md) — Multiplayer Ludo boards.
* [Tic-Tac-Toe](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/games/tictactoe.md) — Grid tic-tac-toe (3x3, 8x8, 16x16).
* [Wordle](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/games/wordle.md) — Guess the 5-letter word game.
* [Debate](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/games/debate.md) — AI-judged group debates.

### ⚔️ 6. Role Playing Game (RPG) Subsystems (`docs/rpg/`)
* [Character Profiles](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/character.md) — Class tree, base stat allocations.
* [Abilities & Skills](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/abilities.md) — Ability tree nodes and points upgrade.
* [Dungeons & Quests](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/quest.md) — Crossroads votes, solo / party quest lines, and Boss Raids.
* [PvP Duels](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/duel.md) — Challenge fights and basic attacks.
* [Alchemy & Brewing](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/alchemy.md) | [Brew Potion](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/brew.md) — Brewing item setups.
* [Cooking](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/cook.md) — Preparing foods.
* [Crafting](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/craft.md) — Recipes and crafting station gear.
* [Dismantling](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/dismantle.md) — Scrapping gear for materials.
* [Equip Items](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/equip.md) — Slot gear mutations.
* [Forge Upgrades](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/forge.md) — Improving items stats.
* [Leaderboard](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/leaderboard.md) — Level rank list.
* [Inventory Bag](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/bag.md) — Viewing inventory slots.
* [Item Loot Drops](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/loot.md) — Item properties.
* [Item Sources](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/source.md) — Search item drop locations.
* [Shop](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/shop.md) — Browse and buy items.
* [Stat Allocation](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/allocate.md) — Point assignments.
* [Inventory Upgrades](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/upgrade_inv.md) — Expand slots capacity.
* [RPG Guide](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/guide.md) — Quick starts and handbooks.
* [Combat Board Rendering](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/combat.md) — Visual combat layout setup.
* [Social Relationships](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/social.md) — Relationship maps.
* [Reset Sprite](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/rpg/reset_sprite.md) — Reroll avatar.

### 🎭 7. Fun & Interactions (`docs/fun/` and `docs/interactions/`)
* [Fun Commands](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/fun/fun_commands.md) — Jokes, Truth/Dare, motivate, ship, memes, weather, crypto, trivia, and QR codes.
* [Scavenging Fish](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/fun/fish.md) — Coastal fishing.
* [Scavenging Hunt](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/fun/hunt.md) — Wilderness hunting.
* [Anime Reactions](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/interactions/interactions.md) — Kiss, hug, pat, wink, slap, cry, dance, smug, etc.

### 👑 8. Factions & Guilds (`docs/guilds/`)
* [Guild System](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/guilds/guilds.md) — Creation, ranks, list, Motto, and points.
* [Guild Hunting Board](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/guilds/guild_board.md) — Daily hunting boards.

###📈 9. Progression System (`docs/progression/`)
* [Character Progression](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/progression/progression.md) — XP calculations, attribute point allocation, and stat resets.
* [Level Command](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/progression/level.md) — Experience progress lookup.

### 🔍 10. Search & Media Scrapers (`docs/search/` and `docs/scrapers/`)
* [Anime Search](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/search/anime_search.md) — Jikan MAL search and caches.
* [Image Search](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/search/img.md) — Google/Klipy searches.
* [Powerscaling Search](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/search/powerscale.md) — VS Battles character details scraper.
* [NSFW / 18+ Search](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/search/nsfw.md) — Rule34 and PornPics scrapers.
* [Media Scrapers Overview](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/scrapers/media_scrapers.md) — Pinterest and Shoob card scrapers.

### 👤 11. User Profile & AI Memory (`docs/user-info/`)
* [Profiles & Whois](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/user-info/profile.md) — Profile sheets and stat sheets.
* [AI Memory & Nicknames](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/user-info/memory.md) — Nickname, notes, likes, dislikes, hobbies, and group memories.

---

## ⚙️ Core Engines & Configuration

* [Baileys Event Loop & Engine](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/engine.md) — Main orchestrator loop, commands routing, multi-tenant instance threads, and event upserts.
* [Context-Aware AI Engine](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/chat/context_engine.md) — Groq memories, topic segmentation, LLM summaries, and circular buffer managers.
* [Integration APIs](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/integrations/apis.md) — Go Image Service rendering, news scraping, and AI clients.
* [Database Schema](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/database/schema.md) — MongoDB schemas and Mongoose models.
* [Environment Configuration](file:///home/mellow/Desktop/Joker/whatsapp-bot/docs/config/env.md) — Multi-tenant flags and environmental keys.
