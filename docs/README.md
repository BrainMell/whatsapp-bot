# Developer Documentation Map

Use this directory map to quickly find where subsystems and command execution paths are documented. Every document follows the 5-Section layout (Quick-Reference, Description, Code Snippet Execution Trees, Modification Guides, and JavaScript Noob breakdowns).

---

## 🗺️ Subsystem Documentation Index

### ⚙️ Core Engines & Architecture
If you want to understand how the bot starts, routes messages, uses AI, or talks to databases:
* [Baileys Event Loop & Engine Router](engine.md) — The process bootstrap, socket connections, packet parsing, and command execution.
* [Groq AI Engine & Context Memory](chat/context_engine.md) — Conversational circular buffers, chat summaries, and model query configurations.
* [Database Collection Schemas](database/schema.md) — MongoDB connections, Mongoose models, and key collections (Users, Guilds, Games).
* [Multi-Tenant Config Proxy](config/env.md) — Local environments, API keys, and thread-safe instance settings.
* [Integration APIs & Services](integrations/apis.md) — Go Image Service rendering parameters, news sites scraping, and API clients.

### ⚔️ RPG Engine & Progression (`docs/rpg/` and `docs/progression/`)
For modifying level scaling, boss fights, loot drops, professions, or duels:
* [Character Profiles & Base Stats](rpg/character.md) — Core attributes, profiles rendering, and class setups.
* [Dungeons, Quests & Boss Raids](rpg/quest.md) — Encounter generation, environments, and multi-phase boss mechanics.
* [Combat Board Rendering](rpg/combat.md) — Drawing combat states and layout grids.
* [Abilities & Skills Tree](rpg/abilities.md) — Nodes mapping, upgrades, and progression gates.
* [PvP Duels & Challenges](rpg/duel.md) — PvP damage reduction, energy mechanics, and flee penalties.
* [XP Scaling & Attribute Allocation](progression/progression.md) | [Level Tracker](progression/level.md) — The leveling curve formulas and stat allocation multiplier.
* [Item Loot Pools & Drops](rpg/loot.md) | [Item Sources Map](rpg/source.md) — Item categories, rarities, and drop sources.
* [Inventory Bag](rpg/bag.md) | [Inventory Slots Upgrades](rpg/upgrade_inv.md) — Storage capacity upgrades.
* [Crafting Stations](rpg/craft.md) | [blacksmithing Forge Upgrades](rpg/forge.md) | [Item Scrapping/Dismantling](rpg/dismantle.md) — Crafting recipes, success rates, and material recovery.
* [Alchemy & Brewing](rpg/alchemy.md) | [Brewing Commands](rpg/brew.md) — Recipes and potion setups.
* [Cooking](rpg/cook.md) — Meal stats.
* [Guild System](guilds/guilds.md) | [Daily Guild Boards](guilds/guild_board.md) — Guild creation, contributions, and daily hunting.
* [Social Relationships](rpg/social.md) | [Reset Sprite Index](rpg/reset_sprite.md) — Affection metrics and avatar rerolling.
* [Summon System](rpg/summon.md) — Eggs, fragments, deck/backlog, deploy, soul forge, market, summon PvP duels, summon AI.
* [Abyss System](rpg/abyss.md) — Endless dungeon, floor rewards, fragment drops, persistent HP, boss floors.
* [Rune System](rpg/runes.md) — Socketed runes, PvP effects, VOID_CONVERSION, silence, cooldown modifiers.
* [Raid System](rpg/raid.md) — Weekly raid bosses, reward tiers by damage ranking.
* [Bounty System](rpg/bounty.md) — Place/claim bounties, hunter fees, failed hunt penalties.
* [Stock Market & Loans](rpg/stocks_loans.md) — 5 stock symbols, price fluctuation, P2P loans, auto-repayment.
* [Mining](rpg/mine.md) — Mining locations, ore drops, lucky Zeni finds.

### 💰 Economy & Gambling (`docs/economy/` and `docs/gambling/`)
For adjusting Zeni payouts, fixed investments, loans, or casino minigames:
* [User Registration](economy/register.md) | [Wallet & Bank Balances](economy/balance.md) — Entry point to the virtual economy.
* [Bank Deposits](economy/deposit.md) | [Bank Withdrawals](economy/withdraw.md) | [P2P Money Transfers](economy/transfer.md) — Account transactions.
* [Daily Reward](economy/daily.md) | [Robbing Wallets](economy/rob.md) — Free Zeni collections and thief mechanics.
* [Wealth Leaderboards](economy/rich.md) — Ranks and status list.
* [P2P Loans System](economy/loan.md) — Loan requests, collateral, interest rates, and wagers.
* [Stock Market](economy/stocks.md) | [Fixed Investments](economy/invest.md) — Stock trading portfolios, volatile stock tickers, and fixed deposits.
* [Casino Games Index](gambling/cups.md) — Command files and layouts for Blackjack, Roulette, Coinflip, Cups, Crash, Dice, Slots, Plinko, Penalty, Wheel, Horse Racing, and Scratch Cards.
* **Gambling Anti-Abuse:** House edge (3-10% scaling), daily profit cap (2M Zeni), forced loss system (0-10% after 20 rounds), bet limits (50-500K). See [Economy Report PDF](../download/economy_report.pdf) for full details.

### 🎮 Group Games & Minigames (`docs/games/`)
* [Chess Matches](games/chess.md) — 1v1 chess against players or the bot.
* [Multiplayer Ludo Boards](games/ludo.md) — Board generation and moves validation.
* [Tic-Tac-Toe](games/tictactoe.md) — Custom grid sizing (3x3 up to 16x16).
* [Wordle](games/wordle.md) — Word lists and letter validations.
* [Group Debates](games/debate.md) — AI-judges scoring group arguments.

### 🎭 Fun, Interactions & Media (`docs/fun/`, `docs/interactions/`, `docs/search/`)
* [Fun Commands & Trivia](fun/fun_commands.md) — Ship compatibility, memes, weather, trivia, and crypto price fetching.
* [Coastal Fishing Minigame](fun/fish.md) | [Wilderness Hunting](fun/hunt.md) — Gathering materials and food.
* [SFW Anime Interactions](interactions/interactions.md) — Action commands (kiss, hug, pat, slap).
* [Anime Search (MAL)](search/anime_search.md) — Jikan API lookups and search caches.
* [Image & Video Scrapers](search/img.md) — Google Images and Klipy gif search.
* [Powerscaling (VS Battles)](search/powerscale.md) — Scraper rules.
* [NSFW / 18+ Scrapers](search/nsfw.md) — Rule34 and PornPics search routines.
* [Stickers & FFMPEG Engine](stickers/stickers.md) — Sticker formatting and GIF converters.
