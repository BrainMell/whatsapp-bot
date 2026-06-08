# 🤖 WhatsApp Bot Engine & RPG Subsystem

A multi-tenant, high-performance turn-based RPG, utility, and moderation bot for WhatsApp group chats, powered by **Baileys WebSockets**, **MongoDB**, and the **Go Image Service**.

---

## 🌟 Key Features

* **🎭 Multi-Tenant Architecture:** Runs multiple isolated bot profiles concurrently using `AsyncLocalStorage` context namespaces.
* **⚔️ Rich Visual RPG Engine:** Complete turn-based dungeon combat, quests, leveling, abilities, and PvP duels rendered into dynamic image overlays via a Go microservice.
* **📈 Dynamic Stocks & Investments:** Realistic stock ticker market updates, volatile growth funds, and P2P loan systems.
* **🛡️ Security & Auto-Mod:** Advanced anti-spam triggers, link scanners, status mention blocks, and warning strike systems.
* **🧠 Context-Aware AI:** Groq-powered chat logs, automatic topic segmentation, and smart group summaries.
* **🖼️ Media Engine:** FFmpeg-powered sticker/GIF converter and scraping integration.

---

## 📂 Project Directory Structure

```bash
whatsapp-bot/
├── core/                # Core engine code modules
│   ├── models/          # MongoDB Mongoose schemas
│   ├── classSystem.js   # RPG classes and statistics
│   ├── pvpSystem.js     # 1v1 PvP turn state machine
│   ├── guildAdventure.js# Quests, raids, and turn queues
│   └── ...              # Other core modules
├── docs/                # Comprehensive Developer Documentation
│   ├── admin/           # Moderation and security rules
│   ├── chat/            # AI context and chat triggers
│   ├── config/          # Environment variables catalog
│   ├── database/        # Mongoose database schema definitions
│   ├── integrations/    # VSBattles scrapers and Go service APIs
│   ├── media/           # Stickers and reaction converters
│   ├── rpg/             # Game features (fishing, guilds, combat)
│   └── scrapers/        # Pinterest and Shoob card scrapers
├── instances/           # Auth credentials and assets per instance
├── reactions/           # Message reaction listeners
├── index.js             # Entry point bootstrap script
├── db.js                # Mongoose connector
├── botConfig.js         # Multi-tenant config proxy resolver
└── package.json         # Package configuration
```

---

## 📖 Developer Documentation Index

All modules, APIs, and systems are documented with code snippets, line references, and modification guides.

### ⚙️ Core Systems
* [Central Bot Engine](docs/engine.md) — Event loops, raw packet parser, command routers, and multi-tenant loading.
* [Environment Configuration](docs/config/env.md) — Thread-safe multi-tenant config proxy, environment catalog.

### 🎮 RPG Subsystems
* [Combat & Battle Engine](docs/rpg/combat.md) — Visual combat board generation, turn loop tickers, and enemy AI.
* [Raids & Boss Battles](docs/rpg/raids.md) — Dungeon lobby gathering, HP phase transitions, and boss mechanics.
* [Player vs Player (PvP)](docs/rpg/pvp.md) — Stakes escrow, basic attacks variance, evasion/crit modifiers.
* [Quests & Dungeon Loops](docs/rpg/quests.md) — Dungeon voting, solo/group travel, item shop generation.
* [Investments & Loans](docs/rpg/investments.md) — Fixed deposits, stock market volatility trend updates, and P2P loan debt defaults.
* [Character Progression](docs/rpg/progression.md) — XP calculations, milestone levels, and attribute points allocation.
* [Abilities & Skill Trees](docs/rpg/abilities.md) — Skill points upgrades, lineages, class evolution requirements.
* [Economy & Shops](docs/rpg/economy.md) — Balance management, daily claims, and shop purchase flows.
* [Inventory & Equipment](docs/rpg/inventory.md) — Item slots mapping, equipment boost logic, and map sizes.
* [Factions & Guilds](docs/rpg/guilds.md) — Guild creation, treasury contributions, daily upgrades board.
* [Loot Tables](docs/rpg/loot.md) — Item categories, drop weight calculations, salvage rates.
* [Casino & Gambling](docs/rpg/gambling.md) — Roulette, blackjack, slots, daily limits, and coinflips.
* [Cards & Gacha](docs/rpg/cards.md) — Card spawning triggers, deck collection, trade markets.
* [Fishing System](docs/rpg/fishing.md) — Fatigue scaling, drop pools, and rods upgrades.
* [Profile Sheets](docs/rpg/profile.md) — User profile maps and dynamic image rendering calls.
* [Alchemy & Brewing](docs/rpg/alchemy.md) — Consumables recipes, item creations, and cauldron loops.
* [Crafting System](docs/rpg/crafting.md) — Recipe verification, space validation, and component extraction.
* [Social Graph](docs/rpg/social.md) — Relationships reciprocal tier increments and AI prompts injection.

### 🛡️ Administration & Moderation
* [Admin & Commands](docs/admin/commands.md) — Dev/Owner commands, warnings resets, group locks, and wipes.
* [Security & Spam](docs/admin/security.md) — Link scanner, anti-spam blocklists, and status mentions blocks.

### 🔗 Integrations & Scrapers
* [AI Context Engine](docs/chat/context_engine.md) — Memory retrieval, summaries, and topic segments.
* [Media & Stickers](docs/media/stickers.md) — FFmpeg sticker creations, animated conversions, GIFs endpoints.
* [External APIs & Go Service](docs/integrations/apis.md) — Groq key-rotation, Go Service image payloads, news fetching.
* [Powerscaling Wiki](docs/integrations/powerscale.md) — VS Battles scrapers, selection triggers, HTML parsers.
* [Media Scrapers](docs/scrapers/media_scrapers.md) — Shoob card Puppeteer crawler and Pinterest reaction crawlers.
* [Database Schema](docs/database/schema.md) — MongoDB connections, Mongoose models, and fields catalogs.

---

## 🚀 Getting Started

### Prerequisites
* Node.js v18+
* MongoDB database instance
* Running Go Image Service (optional, required for RPG card and profile rendering)

### Installation
1. Clone the repository and navigate into the `whatsapp-bot` folder:
   ```bash
   npm install
   ```
2. Set up your `.env` file based on [docs/config/env.md](docs/config/env.md).
3. Start the bot engine:
   ```bash
   node index.js
   ```

---

## 🛠️ Development & Contribution

Please refer to the specific module docs under the `docs/` folder before changing formulas, DB collections, or command hooks. All documentation follows a 4-section standard (**What it is**, **How it works**, **How to modify it**, **Common tasks**) to ensure developer efficiency.
