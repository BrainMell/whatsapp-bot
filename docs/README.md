# WhatsApp Bot Developer Documentation Index

This directory contains technical documentation for all subsystems, architectures, and command-level execution flows in the WhatsApp bot codebase. The documentation is organized by the categories defined in the bot's command registry.

---

### 🎓 Beginner-Friendly "Noob Readthrough" Standard
To make this codebase accessible to developers of all skill levels, all command flow documentation in this directory follows our **Noob Readthrough** standard.

Every flow documentation page features:
1. **Modification Entry Point**: A quick note at the very top of the page pointing directly to where in the codebase you should go to modify the feature's logic or routing.
2. **Step-by-Step Code Walkthrough**: Real snippets from the source files traced sequentially.
3. **Noob Readthrough Section**: An educational breakdown at the bottom explaining every JavaScript concept in the code blocks (such as destructuring, async/await, database saves, etc.), how they function generally, why they are used here, and the consequences of modifying or deleting them.

If you are adding new features, please make sure to follow this structure when creating documentation.


---

## 📁 Documentation Folder Structure

All documentation files are categorized logically under their respective system folders:

### 🛡️ 1. Admin & Moderation (`docs/admin/`)
* [Security & Spam Controls](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/admin/security.md) — Anti-link, anti-spam, and group status protection scanner.
* [Commands & Moderation](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/admin/commands.md) — Developer, owner, and moderator command access.
* [Chat Settings](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/admin/chat_settings.md) — Welcome, goodbye, antilink/antispam toggles.
* [Message Actions](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/admin/message_actions.md) — Message pinning, deleting, and group tagging.
* [Member Management](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/admin/member_management.md) — Mute, unmute, warn, kick, promote, and demote.
* [Utility & Controls](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/admin/utility.md) — Bot toggles (`on`/`off`), memory resets, and broadcast updates.

### 🃏 2. Card Collectibles (`docs/cards/`)
* [Claim Cards](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/cards/claim.md) — Spawned cards claim logic.
* [Card Collection](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/cards/coll.md) — Collection search, listing, and sorting.
* [Deck Editor](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/cards/deck.md) — Deck setups, moves, and swaps.
* [Card Info Database](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/cards/info.md) — Card stats lookup and search.
* [Lock Cards](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/cards/lock.md) — Protect collectible cards from actions.
* [Sell Card Marketplace](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/cards/sc.md) — Auctions, bids, and e-shop market.

### 💰 3. Economy System (`docs/economy/`)
* [User Registration](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/register.md) — Entry point to economy and RPG.
* [Balance](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/balance.md) — Wallet and bank vault balance lookups.
* [Bank Deposits & Withdrawals](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/deposit.md) | [Withdrawals](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/withdraw.md) — Bank account mutations.
* [Transfers](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/transfer.md) — Peer-to-peer money transfers.
* [Daily Reward](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/daily.md) — Claiming daily check-ins.
* [Robbing](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/rob.md) — Stealing Zeni from other wallets.
* [Rich Leaderboard](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/rich.md) — Money and gamblers rank listings.
* [Loans](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/loan.md) — Peer-to-peer loan requests, wagers, and defaults.
* [Investments](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/invest.md) — Fixed deposits and payouts.
* [Stock Market](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/stocks.md) — Stock ticker trading and portfolios.
* [Transaction History](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/history.md) — Bank logs.
* [System Economy Statistics](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/economy/economy.md) — System metrics.

### 🎰 4. Gambling Minigames (`docs/gambling/`)
* [Blackjack](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/blackjack.md) | [Coinflip](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/coinflip.md) | [Crash](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/crash.md) | [Cups](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/cups.md) | [Dice](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/dice.md) | [Guess](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/guess.md) | [Higher-Lower](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/hl.md) | [Horse Race](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/horse.md) | [Lottery](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/lotto.md) | [Mines](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/mines.md) | [Penalty Goal](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/penalty.md) | [Plinko](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/plinko.md) | [Roulette](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/roulette.md) | [RPS](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/rps.md) | [Scratch Card](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/scratch.md) | [Slots](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/slots.md) | [Wheel of Fortune](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/gambling/wheel.md)

### 🎮 5. Group Games (`docs/games/`)
* [Chess](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/games/chess.md) — 1v1 Chess matches against friends or the bot.
* [Ludo](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/games/ludo.md) — Multiplayer Ludo boards.
* [Tic-Tac-Toe](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/games/tictactoe.md) — Grid tic-tac-toe (3x3, 8x8, 16x16).
* [Wordle](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/games/wordle.md) — Guess the 5-letter word game.
* [Debate](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/games/debate.md) — AI-judged group debates.

### ⚔️ 6. Role Playing Game (RPG) Subsystems (`docs/rpg/`)
* [Character Profiles](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/character.md) — Class tree, base stat allocations.
* [Abilities & Skills](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/abilities.md) — Ability tree nodes and points upgrade.
* [Dungeons & Quests](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/quest.md) — Crossroads votes, solo / party quest lines, and Boss Raids.
* [PvP Duels](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/duel.md) — Challenge fights and basic attacks.
* [Alchemy & Brewing](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/alchemy.md) | [Brew Potion](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/brew.md) — Brewing item setups.
* [Cooking](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/cook.md) — Preparing foods.
* [Crafting](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/craft.md) — Recipes and crafting station gear.
* [Dismantling](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/dismantle.md) — Scrapping gear for materials.
* [Equip Items](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/equip.md) — Slot gear mutations.
* [Forge Upgrades](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/forge.md) — Improving items stats.
* [Leaderboard](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/leaderboard.md) — Level rank list.
* [Inventory Bag](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/bag.md) — Viewing inventory slots.
* [Item Loot Drops](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/loot.md) — Item properties.
* [Item Sources](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/source.md) — Search item drop locations.
* [Shop](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/shop.md) — Browse and buy items.
* [Stat Allocation](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/allocate.md) — Point assignments.
* [Inventory Upgrades](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/upgrade_inv.md) — Expand slots capacity.
* [RPG Guide](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/guide.md) — Quick starts and handbooks.
* [Combat Board Rendering](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/combat.md) — Visual combat layout setup.
* [Social Relationships](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/social.md) — Relationship maps.
* [Reset Sprite](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/rpg/reset_sprite.md) — Reroll avatar.

### 🎭 7. Fun & Interactions (`docs/fun/` and `docs/interactions/`)
* [Fun Commands](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/fun/fun_commands.md) — Jokes, Truth/Dare, motivate, ship, memes, weather, crypto, trivia, and QR codes.
* [Scavenging Fish](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/fun/fish.md) — Coastal fishing.
* [Scavenging Hunt](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/fun/hunt.md) — Wilderness hunting.
* [Anime Reactions](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/interactions/interactions.md) — Kiss, hug, pat, wink, slap, cry, dance, smug, etc.

### 👑 8. Factions & Guilds (`docs/guilds/`)
* [Guild System](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/guilds/guilds.md) — Creation, ranks, list, Motto, and points.
* [Guild Hunting Board](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/guilds/guild_board.md) — Daily hunting boards.

###📈 9. Progression System (`docs/progression/`)
* [Character Progression](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/progression/progression.md) — XP calculations, attribute point allocation, and stat resets.
* [Level Command](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/progression/level.md) — Experience progress lookup.

### 🔍 10. Search & Media Scrapers (`docs/search/` and `docs/scrapers/`)
* [Anime Search](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/search/anime_search.md) — Jikan MAL search and caches.
* [Image Search](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/search/img.md) — Google/Klipy searches.
* [Powerscaling Search](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/search/powerscale.md) — VS Battles character details scraper.
* [NSFW / 18+ Search](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/search/nsfw.md) — Rule34 and PornPics scrapers.
* [Media Scrapers Overview](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/scrapers/media_scrapers.md) — Pinterest and Shoob card scrapers.

### 👤 11. User Profile & AI Memory (`docs/user-info/`)
* [Profiles & Whois](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/user-info/profile.md) — Profile sheets and stat sheets.
* [AI Memory & Nicknames](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/user-info/memory.md) — Nickname, notes, likes, dislikes, hobbies, and group memories.

---

## ⚙️ Core Engines & Configuration

* [Baileys Event Loop & Engine](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/engine.md) — Main orchestrator loop, commands routing, multi-tenant instance threads, and event upserts.
* [Context-Aware AI Engine](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/chat/context_engine.md) — Groq memories, topic segmentation, LLM summaries, and circular buffer managers.
* [Integration APIs](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/integrations/apis.md) — Go Image Service rendering, news scraping, and AI clients.
* [Database Schema](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/database/schema.md) — MongoDB schemas and Mongoose models.
* [Environment Configuration](https://github.com/BrainMell/whatsapp-bot/blob/main/docs/config/env.md) — Multi-tenant flags and environmental keys.
